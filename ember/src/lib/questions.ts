/**
 * The blind daily question. Both devices derive the same question from the
 * date + couple id; each answer is stored separately, and since phase 2 the
 * server (RLS) — not the UI — keeps the partner's words hidden until yours
 * are in.
 */
import { stableHash } from './dates';
import { sendPush } from './push';
import { getSupabase, watchTable } from './supabase';
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
  const { error } = await getSupabase().from('answers').insert({
    couple_id: coupleId,
    uid,
    date,
    text,
  });
  if (error) throw new Error(error.message);
  sendPush(coupleId, 'answer');
}

/**
 * Both answers (0–2 rows) for one day, live. While you haven't answered,
 * the partner's row is invisible to you — including its realtime event —
 * so a slow safety-net refetch keeps the reveal from ever getting stuck.
 */
export function subscribeAnswers(
  coupleId: string,
  date: string,
  onChange: (answers: Answer[]) => void,
): () => void {
  const refetch = async () => {
    const { data } = await getSupabase()
      .from('answers')
      .select('uid, date, text, at')
      .eq('couple_id', coupleId)
      .eq('date', date);
    if (data) onChange(data as Answer[]);
  };
  return watchTable('answers', coupleId, refetch, 20_000);
}
