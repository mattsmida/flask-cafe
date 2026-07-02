/**
 * The blind daily question. Both phones derive the same question from the
 * date + couple id; each answer is stored separately and the UI reveals the
 * partner's words only once yours are in.
 */
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { stableHash } from './dates';
import { getDb } from './firebase';
import { DAILY_QUESTIONS } from './questionBank';
import type { Answer } from './types';

export function questionForDate(coupleId: string, date: string): string {
  return DAILY_QUESTIONS[stableHash(`${coupleId}:${date}`) % DAILY_QUESTIONS.length];
}

export function submitAnswer(
  coupleId: string,
  uid: string,
  date: string,
  text: string,
): Promise<void> {
  const ref = doc(getDb(), 'couples', coupleId, 'answers', `${date}_${uid}`);
  return setDoc(ref, { uid, date, text, at: serverTimestamp() });
}

/** Both answers (0–2 docs) for one day, live. */
export function subscribeAnswers(
  coupleId: string,
  date: string,
  onChange: (answers: Answer[]) => void,
): () => void {
  const q = query(
    collection(getDb(), 'couples', coupleId, 'answers'),
    where('date', '==', date),
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => d.data() as Answer));
  });
}
