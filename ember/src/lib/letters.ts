/**
 * The Future Question: once a month each partner writes to your future
 * selves; letters unseal three months after they're written.
 */
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { monthKey } from './dates';
import { getDb } from './firebase';
import { LETTER_PROMPTS } from './questionBank';
import type { Letter } from './types';

export const SEAL_DAYS = 90;

/** The shared prompt for a YYYY-MM month — same for both partners. */
export function promptForMonth(month: string = monthKey()): string {
  const [y, m] = month.split('-').map(Number);
  return LETTER_PROMPTS[(y * 12 + (m - 1)) % LETTER_PROMPTS.length];
}

export function writeLetter(
  coupleId: string,
  uid: string,
  text: string,
): Promise<void> {
  const month = monthKey();
  const ref = doc(getDb(), 'couples', coupleId, 'letters', `${month}_${uid}`);
  const unlockAt = Timestamp.fromMillis(Date.now() + SEAL_DAYS * 24 * 60 * 60 * 1000);
  return setDoc(ref, {
    uid,
    month,
    prompt: promptForMonth(month),
    text,
    writtenAt: serverTimestamp(),
    unlockAt,
  });
}

export function subscribeLetters(
  coupleId: string,
  onChange: (letters: Letter[]) => void,
): () => void {
  const q = query(
    collection(getDb(), 'couples', coupleId, 'letters'),
    orderBy('month', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => d.data() as Letter));
  });
}

export function isUnlocked(letter: Letter): boolean {
  return letter.unlockAt.toMillis() <= Date.now();
}

export function daysUntilUnlock(letter: Letter): number {
  return Math.max(
    0,
    Math.ceil((letter.unlockAt.toMillis() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}
