/**
 * send-push: notifies the caller's partner via Web Push.
 *
 * POST { couple_id: string, type: 'spark' | 'answer' | 'checkin' }
 * with the caller's Supabase JWT in the Authorization header.
 *
 * The function verifies the caller is a member of the couple, looks up the
 * partner's stored PushSubscription, and delivers through the standard Web
 * Push protocol (VAPID) — Apple's relay for installed iPhone web apps,
 * Mozilla/Google for other browsers. Dead subscriptions are cleared.
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

  // Membership check + partner lookup in one query.
  const membersRes = await rest(
    `members?couple_id=eq.${encodeURIComponent(coupleId)}&select=uid,name`,
  );
  if (!membersRes.ok) return json(500, { error: 'members lookup failed' });
  const members = (await membersRes.json()) as { uid: string; name: string }[];
  const me = members.find((m) => m.uid === uid);
  if (!me) return json(403, { error: 'not a member of this couple' });
  const partner = members.find((m) => m.uid !== uid);
  if (!partner) return json(200, { sent: false, reason: 'no partner yet' });

  const statusRes = await rest(
    `statuses?couple_id=eq.${encodeURIComponent(coupleId)}&uid=eq.${partner.uid}&select=push_subscription`,
  );
  const statusRows = statusRes.ok
    ? ((await statusRes.json()) as { push_subscription: PushSubscriptionJson | null }[])
    : [];
  const subscription = statusRows[0]?.push_subscription;
  if (!subscription?.endpoint || !subscription.keys?.p256dh) {
    return json(200, { sent: false, reason: 'partner has no push subscription' });
  }
  if (!VAPID.publicKey || !VAPID.privateKey) {
    return json(500, { error: 'VAPID keys are not configured' });
  }

  const message = MESSAGES[type](me.name || 'Your person');
  const pushRes = await sendWebPush(
    subscription,
    JSON.stringify({ ...message, tag: `ember-${type}` }),
    VAPID,
  );

  if (pushRes.status === 404 || pushRes.status === 410) {
    // The subscription is dead (uninstalled / permissions revoked) — forget it.
    await rest(
      `statuses?couple_id=eq.${encodeURIComponent(coupleId)}&uid=eq.${partner.uid}`,
      { method: 'PATCH', body: JSON.stringify({ push_subscription: null }) },
    );
    return json(200, { sent: false, reason: 'subscription expired' });
  }
  if (!pushRes.ok) {
    return json(502, { sent: false, reason: `push service replied ${pushRes.status}` });
  }
  return json(200, { sent: true });
});
