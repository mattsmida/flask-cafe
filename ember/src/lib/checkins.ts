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

interface CheckinRow {
  person_id: string;
  date: string;
  energy: number;
  heart: number;
  connection: number;
  word: string;
  at: string;
}

function toCheckin(row: CheckinRow): Checkin {
  return {
    personId: row.person_id,
    date: row.date,
    energy: row.energy,
    heart: row.heart,
    connection: row.connection,
    word: row.word,
    at: row.at,
  };
}

/** One check-in per person per local day (any of their devices can write
 * it); re-saving the same day overwrites. */
export async function saveCheckin(
  coupleId: string,
  personId: string,
  date: string,
  draft: CheckinDraft,
): Promise<void> {
  const { error } = await getClient().from('checkins').upsert(
    {
      couple_id: coupleId,
      person_id: personId,
      date,
      ...draft,
      at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,person_id,date' },
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
        .select('person_id, date, energy, heart, connection, word, at')
        .eq('couple_id', coupleId)
        .gte('date', start)
        .order('date');
      if (!cancelled) onChange(((data ?? []) as CheckinRow[]).map(toCheckin));
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
