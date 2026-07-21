/**
 * The live layer for the Today screen.
 *
 * Presence and sparks are ephemeral: they ride a Supabase Realtime channel
 * (`couple:{id}`) using built-in Presence and Broadcast — nothing stored,
 * nothing to clean up. Weather of the heart and the web-push subscription
 * are the only per-member state that persists (the `statuses` table).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, watchTable } from './supabase';
import type { MemberStatus, Weather } from './types';

export async function setWeather(
  coupleId: string,
  uid: string,
  weather: Weather,
): Promise<void> {
  const { error } = await getSupabase().from('statuses').upsert({
    couple_id: coupleId,
    uid,
    weather,
    weather_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function savePushSubscription(
  coupleId: string,
  uid: string,
  subscription: unknown,
): Promise<void> {
  const { error } = await getSupabase().from('statuses').upsert({
    couple_id: coupleId,
    uid,
    push_subscription: subscription,
  });
  if (error) throw new Error(error.message);
}

export function subscribeStatus(
  coupleId: string,
  uid: string,
  onChange: (status: MemberStatus | null) => void,
): () => void {
  const refetch = async () => {
    const { data } = await getSupabase()
      .from('statuses')
      .select('weather, weatherAt:weather_at')
      .eq('couple_id', coupleId)
      .eq('uid', uid)
      .maybeSingle();
    onChange((data as MemberStatus | null) ?? null);
  };
  return watchTable('statuses', coupleId, refetch);
}

export interface LiveHandlers {
  onPartnerPresence: (present: boolean) => void;
  onSpark: () => void;
}

export interface LiveConnection {
  /** Broadcast a spark to the partner (they hear it only while connected). */
  sendSpark: () => void;
  /** Track/untrack presence as the app foregrounds/backgrounds. */
  setActive: (active: boolean) => void;
  close: () => void;
}

export function connectLive(
  coupleId: string,
  uid: string,
  handlers: LiveHandlers,
): LiveConnection {
  const sb = getSupabase();
  const channel: RealtimeChannel = sb.channel(`couple:${coupleId}`, {
    config: { presence: { key: uid }, broadcast: { self: false } },
  });
  let joined = false;
  let wantTracked = true;

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    handlers.onPartnerPresence(Object.keys(state).some((key) => key !== uid));
  });
  channel.on('broadcast', { event: 'spark' }, ({ payload }) => {
    if (payload?.from !== uid) handlers.onSpark();
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      joined = true;
      if (wantTracked) channel.track({ at: new Date().toISOString() });
    }
  });

  return {
    sendSpark: () => {
      channel.send({ type: 'broadcast', event: 'spark', payload: { from: uid } });
    },
    setActive: (active: boolean) => {
      wantTracked = active;
      if (!joined) return;
      if (active) channel.track({ at: new Date().toISOString() });
      else channel.untrack();
    },
    close: () => {
      sb.removeChannel(channel);
    },
  };
}
