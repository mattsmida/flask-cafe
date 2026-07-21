/**
 * Real push notifications, no Apple Developer Program: the app runs as an
 * installed web app (Add to Home Screen) and uses standard Web Push — which
 * iOS supports since 16.4 for installed home-screen apps.
 *
 * The browser's PushSubscription is stored in statuses.push_subscription;
 * sending happens in the `send-push` Supabase Edge Function (it looks up the
 * partner's subscription server-side, so clients never see each other's).
 */
import { Platform } from 'react-native';
import { isPushConfigured, supabaseConfig } from '../config/supabaseConfig';
import { savePushSubscription } from './status';
import { getSupabase } from './supabase';

export type PushState =
  | 'unsupported' // native app, old browser, or push not configured
  | 'need-install' // iOS Safari tab: must Add to Home Screen first
  | 'denied' // permission was refused; only browser settings can undo that
  | 'ready' // supported, waiting for the user to enable
  | 'enabled';

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function getPushState(): PushState {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  if (!isPushConfigured()) return 'unsupported';
  const supported =
    'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  if (!supported) {
    // iOS Safari only exposes the push API to installed home-screen apps.
    return isIos() && !isInstalled() ? 'need-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'enabled';
  return 'ready';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Ask for permission and store this device's subscription.
 * Must be called from a user gesture (iOS enforces this).
 */
export async function enablePush(coupleId: string, uid: string): Promise<PushState> {
  const state = getPushState();
  if (state !== 'ready' && state !== 'enabled') return state;
  try {
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return getPushState();
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(supabaseConfig.vapidPublicKey),
      }));
    await savePushSubscription(coupleId, uid, subscription.toJSON());
    return 'enabled';
  } catch {
    return getPushState();
  }
}

/**
 * If permission is already granted, quietly make sure the stored
 * subscription is current (endpoints rotate). Call on app start.
 */
export async function syncPushSubscription(coupleId: string, uid: string): Promise<void> {
  if (getPushState() !== 'enabled') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await savePushSubscription(coupleId, uid, subscription.toJSON());
  } catch {
    // Push stays best-effort.
  }
}

export type PushKind = 'spark' | 'checkin' | 'answer';

/**
 * Fire-and-forget: ask the edge function to notify the partner. Everything
 * still lands live via Realtime; push is for when their app is closed.
 */
export function sendPush(coupleId: string, type: PushKind): void {
  try {
    getSupabase()
      .functions.invoke('send-push', { body: { couple_id: coupleId, type } })
      .catch(() => {});
  } catch {
    // Not configured — nothing to do.
  }
}
