/**
 * send-push: notifies the caller's partner via Web Push.
 *
 * POST { couple_id: string, type: 'spark' | 'answer' | 'checkin' }
 * with the caller's Supabase JWT in the Authorization header.
 *
 * The function verifies the caller's device belongs to the couple, looks
 * up every device the partner PERSON has registered (they may have more
 * than one — phone, desktop, ...), and delivers through the standard Web
 * Push protocol (VAPID) to each — Apple's relay for installed iPhone web
 * apps, Mozilla/Google for other browsers. Dead subscriptions are cleared
 * per-device.
 *
 * Secrets (supabase secrets set):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — npx web-push generate-vapid-keys
 *   VAPID_SUBJECT                        — mailto:you@example.com
 */
import { sendWebPush, type PushSubscriptionJson } from './webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ember@example.com',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** PostgREST call with the service role (bypasses RLS — used after the
 * caller's membership has been verified). */
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

const MESSAGES: Record<string, (name: string) => { title: string; body: string }> = {
  spark: (name) => ({ title: '✨ A spark', body: `${name} is thinking of you.` }),
  answer: (name) => ({
    title: '💬 Today’s question',
    body: `${name} answered. Yours might be waiting to be revealed.`,
  }),
  checkin: (name) => ({ title: '🌡️ Check-in', body: `${name} just checked in.` }),
};

interface PersonRow {
  id: string;
  name: string;
}
interface DeviceRow {
  uid: string;
  push_subscription: PushSubscriptionJson | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  // Who is calling? (The gateway has already verified the JWT signature.)
  const authHeader = req.headers.get('Authorization') ?? '';
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return json(401, { error: 'not signed in' });
  const uid = ((await userRes.json()) as { id?: string }).id;
  if (!uid) return json(401, { error: 'not signed in' });

  let body: { couple_id?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const coupleId = body.couple_id;
  const type = body.type ?? 'spark';
  if (!coupleId || !MESSAGES[type]) return json(400, { error: 'bad couple_id or type' });

  // My device -> my person, and confirm it's actually in this couple.
  const myDeviceRes = await rest(
    `devices?uid=eq.${encodeURIComponent(uid)}&select=person_id,couple_id`,
  );
  if (!myDeviceRes.ok) return json(500, { error: 'device lookup failed' });
  const myDevices = (await myDeviceRes.json()) as { person_id: string; couple_id: string }[];
  const myDevice = myDevices.find((d) => d.couple_id === coupleId);
  if (!myDevice) return json(403, { error: 'not a member of this couple' });

  const personsRes = await rest(
    `persons?couple_id=eq.${encodeURIComponent(coupleId)}&select=id,name`,
  );
  if (!personsRes.ok) return json(500, { error: 'persons lookup failed' });
  const persons = (await personsRes.json()) as PersonRow[];
  const me = persons.find((p) => p.id === myDevice.person_id);
  const partner = persons.find((p) => p.id !== myDevice.person_id);
  if (!partner) return json(200, { sent: false, reason: 'no partner yet' });

  const devicesRes = await rest(
    `devices?couple_id=eq.${encodeURIComponent(coupleId)}&person_id=eq.${partner.id}&select=uid,push_subscription`,
  );
  const partnerDevices = devicesRes.ok ? ((await devicesRes.json()) as DeviceRow[]) : [];
  const subscribed = partnerDevices.filter(
    (d): d is DeviceRow & { push_subscription: PushSubscriptionJson } =>
      !!d.push_subscription?.endpoint && !!d.push_subscription.keys?.p256dh,
  );
  if (subscribed.length === 0) {
    return json(200, { sent: false, reason: 'partner has no registered devices' });
  }
  if (!VAPID.publicKey || !VAPID.privateKey) {
    return json(500, { error: 'VAPID keys are not configured' });
  }

  const message = MESSAGES[type](me?.name || 'Your person');
  const payload = JSON.stringify({ ...message, tag: `ember-${type}` });

  const results = await Promise.allSettled(
    subscribed.map(async (device) => {
      const res = await sendWebPush(device.push_subscription, payload, VAPID);
      if (res.status === 404 || res.status === 410) {
        // This device's subscription is dead (uninstalled / permissions
        // revoked) — forget it, but other devices may still succeed.
        await rest(`devices?uid=eq.${encodeURIComponent(device.uid)}`, {
          method: 'PATCH',
          body: JSON.stringify({ push_subscription: null }),
        });
        return { uid: device.uid, ok: false, reason: 'expired' };
      }
      return { uid: device.uid, ok: res.ok, reason: res.ok ? undefined : `status ${res.status}` };
    }),
  );

  const outcomes = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { ok: false, reason: r.reason?.message ?? 'error' },
  );
  const sentCount = outcomes.filter((o) => o.ok).length;
  return json(200, { sent: sentCount > 0, sentCount, of: subscribed.length, outcomes });
});
