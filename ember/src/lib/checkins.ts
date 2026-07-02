import {
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  doc,
} from 'firebase/firestore';
import { daysAgoKey } from './dates';
import { getDb } from './firebase';
import type { Checkin } from './types';

export const HISTORY_DAYS = 14;

export interface CheckinDraft {
  energy: number;
  heart: number;
  connection: number;
  word: string;
}

/** One check-in per person per local day; re-saving the same day overwrites. */
export function saveCheckin(
  coupleId: string,
  uid: string,
  date: string,
  draft: CheckinDraft,
): Promise<void> {
  const ref = doc(getDb(), 'couples', coupleId, 'checkins', `${date}_${uid}`);
  return setDoc(ref, { uid, date, ...draft, at: serverTimestamp() });
}

/** Live window of both partners' check-ins for the last HISTORY_DAYS days. */
export function subscribeRecentCheckins(
  coupleId: string,
  onChange: (checkins: Checkin[]) => void,
): () => void {
  const start = daysAgoKey(HISTORY_DAYS - 1);
  const q = query(
    collection(getDb(), 'couples', coupleId, 'checkins'),
    where('date', '>=', start),
    orderBy('date'),
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => d.data() as Checkin));
  });
}
