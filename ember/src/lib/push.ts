/**
 * Web Push, the standard VAPID flow — no Firebase/FCM anywhere.
 *
 * On iOS this works for a web app that has been installed via Share →
 * Add to Home Screen (iOS 16.4+), and Notification.requestPermission()
 * must be called from a user gesture — so enablePush is wired to a button
 * on the Us tab, never called on load.
 *
 * Delivery goes: this device saves its PushSubscription onto its own
 * `devices` row (one person can have several — phone, desktop, ...; each
 * device holds its own subscription) → any action calls notifyPartner() →
 * the send-push Edge Function (which holds the VAPID private key) pushes
 * to every device the partner PERSON has registered.
 */
import { Platform } from 'react-native';
import { isPushConfigured, supabaseConfig } from '../config/supabaseConfig';
import { getClient } from './supabase';

export type PushAvailability =
  | 'ready' // supported here; just needs the user to enable it
  | 'enabled' // this browser already holds a subscription
  | 'needs-install' // iOS Safari, but not installed to the home screen yet
  | 'denied' // the user blocked notifications for this app
  | 'unsupported' // native app or a browser without Web Push
  | 'unconfigured'; // no VAPID public key pasted yet

function hasWebPushApis(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS masquerades as macOS but is touch-first.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** True when running as an installed (home-screen / standalone) web app. */
export function isInstalledPwa(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Registers the push service worker; call once at startup (web only). */
export async function registerServiceWorker(): Promise<void> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    // No service worker → no push, but the app itself is unaffected.
  }
}

export function getPushAvailability(): PushAvailability {
  if (Platform.OS !== 'web') return 'unsupported';
  if (!isPushConfigured()) return 'unconfigured';
  if (isIOS() && !isInstalledPwa()) return 'needs-install';
  if (!hasWebPushApis()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

/** Does this browser already hold a push subscription? */
export async function hasPushSubscription(): Promise<boolean> {
  if (getPushAvailability() !== 'ready') return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!(await registration?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks for notification permission, subscribes, and saves the subscription
 * on this device's own row (via RPC — `devices` is closed to direct client
 * access). Must run inside a user gesture.
 */
export async function enablePush(): Promise<void> {
  const availability = getPushAvailability();
  if (availability === 'needs-install') {
    throw new Error('Install Ember to your home screen first.');
  }
  if (availability !== 'ready') {
    throw new Error('Notifications aren’t available here.');
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('The service worker isn’t ready yet — reload and try again.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications weren’t allowed.');
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(supabaseConfig.vapidPublicKey),
  });
  const { error } = await getClient().rpc('save_push_subscription', {
    p_subscription: subscription.toJSON(),
  });
  if (error) throw new Error(error.message);
}

export type PushKind = 'spark' | 'answer' | 'checkin';

/**
 * Fire-and-forget: asks the send-push Edge Function to notify the partner's
 * device. Everything still syncs live without it — push is the bonus for
 * when the partner's app is closed.
 */
export function notifyPartner(coupleId: string, kind: PushKind): void {
  try {
    void getClient()
      .functions.invoke('send-push', {
        body: { couple_id: coupleId, type: kind },
      })
      .catch(() => {});
  } catch {
    // not configured — nothing to do
  }
}
