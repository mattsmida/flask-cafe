// Supabase Edge Function: send a Web Push notification to the caller's
// partner. Deploy with:
//   npx supabase functions deploy send-push --project-ref <ref>
// and set the secrets (see ember/README.md):
//   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// The function verifies the caller's JWT and membership, looks up the
// partner's stored PushSubscription, and sends through the browser vendors'
// push services (Apple's relay for installed iOS web apps).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const MESSAGES: Record<string, (name: string) => { title: string; body: string }> = {
  spark: (name) => ({ title: '✨ A spark', body: `${name} is thinking of you.` }),
  checkin: (name) => ({ title: '🌡️ Check-in', body: `${name} just checked in.` }),
  answer: (name) => ({
    title: '💬 Daily question',
    body: `${name} sealed their answer to today's question.`,
  }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await service.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);
    const uid = userData.user.id;

    const { couple_id, type } = await req.json();
    const makeMessage = MESSAGES[type];
    if (typeof couple_id !== 'string' || !makeMessage) {
      return json({ error: 'Bad request' }, 400);
    }

    const { data: members } = await service
      .from('members')
      .select('uid, name')
      .eq('couple_id', couple_id);
    const me = members?.find((m) => m.uid === uid);
    const partner = members?.find((m) => m.uid !== uid);
    if (!me) return json({ error: 'Not a member of this couple' }, 403);
    if (!partner) return json({ sent: false, reason: 'no partner yet' });

    const { data: status } = await service
      .from('statuses')
      .select('push_subscription')
      .eq('couple_id', couple_id)
      .eq('uid', partner.uid)
      .maybeSingle();
    const subscription = status?.push_subscription;
    if (!subscription) return json({ sent: false, reason: 'partner has no subscription' });

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ember@example.invalid',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    try {
      await webpush.sendNotification(subscription, JSON.stringify(makeMessage(me.name || 'Your person')), {
        TTL: 60 * 60,
      });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        // Subscription expired or was revoked — forget it so the partner's
        // app can offer to re-enable.
        await service
          .from('statuses')
          .update({ push_subscription: null })
          .eq('couple_id', couple_id)
          .eq('uid', partner.uid);
        return json({ sent: false, reason: 'subscription expired' });
      }
      throw err;
    }
    return json({ sent: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
