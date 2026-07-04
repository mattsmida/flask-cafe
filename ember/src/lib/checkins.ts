import { daysAgoKey } from './dates';
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
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
  const { error } = await getClient().from('checkins').upsert(
    {
      couple_id: coupleId,
      uid,
      date,
      ...draft,
      at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,uid,date' },
  );
  if (error) throw new Error(error.message);
}

/** Live window of both partners' check-ins for the last HISTORY_DAYS days. */
export function subscribeRecentCheckins(
  coupleId: string,
  onChange: (checkins: Checkin[]) => void,
): () => void {
  let cancelled = false;
  const refetch = async () => {
    try {
      const start = daysAgoKey(HISTORY_DAYS - 1);
      const { data } = await getClient()
        .from('checkins')
        .select('uid, date, energy, heart, connection, word, at')
        .eq('couple_id', coupleId)
        .gte('date', start)
        .order('date');
      if (!cancelled) onChange((data ?? []) as Checkin[]);
    } catch {
      // keep whatever we showed last
    }
  };
  void refetch();
  const offEvents = onCoupleTableChange('checkins', 'checkins', coupleId, () => {
    void refetch();
  });
  const offActive = onAppActive(() => {
    void refetch();
  });
  return () => {
    cancelled = true;
    offEvents();
    offActive();
  };
}
