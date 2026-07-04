/**
 * The `statuses` row each member keeps: weather of the heart, plus the Web
 * Push subscription the send-push Edge Function delivers to. Presence and
 * sparks are NOT here — they're ephemeral, and live on the realtime channel
 * (see realtime.ts).
 */
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
import type { MemberStatus, Weather } from './types';

export type StatusMap = Record<string, MemberStatus>;

interface StatusRow {
  uid: string;
  weather: Weather | null;
  weather_at: string | null;
}

async function fetchStatuses(coupleId: string): Promise<StatusMap> {
  const { data } = await getClient()
    .from('statuses')
    .select('uid, weather, weather_at')
    .eq('couple_id', coupleId);
  const map: StatusMap = {};
  for (const row of (data ?? []) as StatusRow[]) {
    map[row.uid] = {
      weather: row.weather ?? undefined,
      weatherAt: row.weather_at ?? undefined,
    };
  }
  return map;
}

/** Both members' statuses, live. */
export function subscribeStatuses(
  coupleId: string,
  onChange: (statuses: StatusMap) => void,
): () => void {
  let cancelled = false;
  const refetch = () => {
    fetchStatuses(coupleId)
      .then((map) => {
        if (!cancelled) onChange(map);
      })
      .catch(() => {});
  };
  refetch();
  const offEvents = onCoupleTableChange('statuses', 'statuses', coupleId, refetch);
  const offActive = onAppActive(refetch);
  return () => {
    cancelled = true;
    offEvents();
    offActive();
  };
}

export async function setWeather(
  coupleId: string,
  uid: string,
  weather: Weather,
): Promise<void> {
  const { error } = await getClient().from('statuses').upsert(
    {
      couple_id: coupleId,
      uid,
      weather,
      weather_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,uid' },
  );
  if (error) throw new Error(error.message);
}

export async function savePushSubscription(
  coupleId: string,
  uid: string,
  subscription: unknown | null,
): Promise<void> {
  const { error } = await getClient().from('statuses').upsert(
    { couple_id: coupleId, uid, push_subscription: subscription },
    { onConflict: 'couple_id,uid' },
  );
  if (error) throw new Error(error.message);
}
