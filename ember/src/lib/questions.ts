/**
 * The blind daily question. Both devices derive the same question from the
 * date + couple id; each answer is stored separately. The reveal is enforced
 * by the server: the answers RLS policy hides your partner's row until your
 * own answer for that date exists.
 */
import { stableHash } from './dates';
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
import { DAILY_QUESTIONS } from './questionBank';
import type { Answer } from './types';

export function questionForDate(coupleId: string, date: string): string {
  return DAILY_QUESTIONS[stableHash(`${coupleId}:${date}`) % DAILY_QUESTIONS.length];
}

export async function submitAnswer(
  coupleId: string,
  uid: string,
  date: string,
  text: string,
): Promise<void> {
  const { error } = await getClient().from('answers').insert({
    couple_id: coupleId,
    uid,
    date,
    text,
  });
  if (error) throw new Error(error.message);
}

/**
 * Both answers for one day, live. Until you've answered, the server only
 * ever returns your side (or nothing) — so this naturally flips from 0–1 to
 * 2 rows the moment the reveal condition is met.
 */
export function subscribeAnswers(
  coupleId: string,
  date: string,
  onChange: (answers: Answer[]) => void,
): () => void {
  let cancelled = false;
  const refetch = async () => {
    try {
      const { data } = await getClient()
        .from('answers')
        .select('uid, date, text, at')
        .eq('couple_id', coupleId)
        .eq('date', date);
      if (!cancelled) onChange((data ?? []) as Answer[]);
    } catch {
      // keep last known state
    }
  };
  void refetch();
  const offEvents = onCoupleTableChange('answers', 'answers', coupleId, () => {
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
