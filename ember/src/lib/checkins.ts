import { daysAgoKey } from './dates';
import { sendPush } from './push';
import { getSupabase, watchTable } from './supabase';
import type { Checkin } from './types';

export const HISTORY_DAYS = 14;

export interface CheckinDraft {
  energy: number;
  heart: number;
  connection: number;
  word: string;
}

/** One check-in per person per local day; re-saving the same day overwrites. */
export async function saveCheckin(
  coupleId: string,
  uid: string,
  date: string,
  draft: CheckinDraft,
): Promise<void> {
  const { error } = await getSupabase().from('checkins').upsert({
    couple_id: coupleId,
    uid,
    date,
    ...draft,
    at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  sendPush(coupleId, 'checkin');
}

/** Live window of both partners' check-ins for the last HISTORY_DAYS days. */
export function subscribeRecentCheckins(
  coupleId: string,
  onChange: (checkins: Checkin[]) => void,
): () => void {
  const refetch = async () => {
    const { data } = await getSupabase()
      .from('checkins')
      .select('uid, date, energy, heart, connection, word, at')
      .eq('couple_id', coupleId)
      .gte('date', daysAgoKey(HISTORY_DAYS - 1))
      .order('date');
    if (data) onChange(data as Checkin[]);
  };
  return watchTable('checkins', coupleId, refetch, 60_000);
}
