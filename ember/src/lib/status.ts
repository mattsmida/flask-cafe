/**
 * The `statuses` row each person keeps: weather of the heart. Shared across
 * all of that person's devices. Push subscriptions are NOT here — they're
 * per-device, in `devices` (see push.ts, which routes through an RPC since
 * that table is closed to direct client access). Presence and sparks are
 * NOT here either — they're ephemeral, and live on the realtime channel
 * (see realtime.ts).
 */
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
import type { MemberStatus, Weather } from './types';

export type StatusMap = Record<string, MemberStatus>;

interface StatusRow {
  person_id: string;
  weather: Weather | null;
  weather_at: string | null;
}

async function fetchStatuses(coupleId: string): Promise<StatusMap> {
  const { data } = await getClient()
    .from('statuses')
    .select('person_id, weather, weather_at')
    .eq('couple_id', coupleId);
  const map: StatusMap = {};
  for (const row of (data ?? []) as StatusRow[]) {
    map[row.person_id] = {
      weather: row.weather ?? undefined,
      weatherAt: row.weather_at ?? undefined,
    };
  }
  return map;
}

/** Both people's statuses, live. */
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
  personId: string,
  weather: Weather,
): Promise<void> {
  const { error } = await getClient().from('statuses').upsert(
    {
      couple_id: coupleId,
      person_id: personId,
      weather,
      weather_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,person_id' },
  );
  if (error) throw new Error(error.message);
}
