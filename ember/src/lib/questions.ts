/**
 * The blind daily question. Both devices derive the same question from the
 * date + couple id; each answer is stored separately per PERSON (not
 * device — either of your devices can answer, and either sees the reveal).
 * The reveal is enforced by the server: the answers RLS policy hides your
 * partner's row until your own answer for that date exists.
 */
import { dateKey, stableHash } from './dates';
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
import { DAILY_QUESTIONS } from './questionBank';
import type { Answer } from './types';

export function questionForDate(coupleId: string, date: string): string {
  return DAILY_QUESTIONS[stableHash(`${coupleId}:${date}`) % DAILY_QUESTIONS.length];
}

export async function submitAnswer(
  coupleId: string,
  personId: string,
  date: string,
  text: string,
): Promise<void> {
  const { error } = await getClient().from('answers').insert({
    couple_id: coupleId,
    person_id: personId,
    date,
    text,
  });
  if (error) throw new Error(error.message);
}

interface AnswerRow {
  person_id: string;
  date: string;
  text: string;
  at: string;
}

function toAnswer(row: AnswerRow): Answer {
  return { personId: row.person_id, date: row.date, text: row.text, at: row.at };
}

export interface AnswerHistoryPage {
  answers: Answer[];
  /** Pass back as `before` for the next page; null once history runs out. */
  nextBefore: string | null;
}

function dayAfter(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + 1));
}

/**
 * One-shot page of past days' answers, newest first, strictly before
 * `before`. The blind reveal carries over for free: on a day you never
 * answered the server returns nothing at all, so every day that shows up
 * here includes your own answer — a lone row can only be yours. Because
 * the row limit can split a day in half, the cursor backs up to
 * re-include the oldest day it saw; pages may therefore overlap by one
 * day, and callers dedupe by (person, date).
 */
export async function fetchAnswerHistory(
  coupleId: string,
  before: string,
  limit = 120,
): Promise<AnswerHistoryPage> {
  const { data, error } = await getClient()
    .from('answers')
    .select('person_id, date, text, at')
    .eq('couple_id', coupleId)
    .lt('date', before)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const answers = ((data ?? []) as AnswerRow[]).map(toAnswer);
  const full = answers.length === limit;
  return {
    answers,
    nextBefore: full ? dayAfter(answers[answers.length - 1].date) : null,
  };
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
        .select('person_id, date, text, at')
        .eq('couple_id', coupleId)
        .eq('date', date);
      if (!cancelled) onChange(((data ?? []) as AnswerRow[]).map(toAnswer));
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
