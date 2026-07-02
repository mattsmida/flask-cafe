/**
 * The hot little status doc each member keeps: heartbeat (presence),
 * weather of the heart, and the last spark. One doc per person so the
 * partner can watch it with a single listener.
 */
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { MemberStatus, Weather } from './types';

/** Partner counts as "here now" if their heartbeat is younger than this. */
export const PRESENCE_WINDOW_MS = 45_000;
/** How often we refresh our own heartbeat while the app is foregrounded. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

function statusRef(coupleId: string, uid: string) {
  return doc(getDb(), 'couples', coupleId, 'status', uid);
}

export function beatHeart(coupleId: string, uid: string): Promise<void> {
  return setDoc(
    statusRef(coupleId, uid),
    { lastActiveAt: serverTimestamp() },
    { merge: true },
  );
}

export function setWeather(
  coupleId: string,
  uid: string,
  weather: Weather,
): Promise<void> {
  return setDoc(
    statusRef(coupleId, uid),
    { weather, weatherAt: serverTimestamp() },
    { merge: true },
  );
}

export function sendSpark(coupleId: string, uid: string): Promise<void> {
  return setDoc(
    statusRef(coupleId, uid),
    { sparkAt: serverTimestamp() },
    { merge: true },
  );
}

export function savePushToken(
  coupleId: string,
  uid: string,
  pushToken: string,
): Promise<void> {
  return setDoc(statusRef(coupleId, uid), { pushToken }, { merge: true });
}

export function subscribeStatus(
  coupleId: string,
  uid: string,
  onChange: (status: MemberStatus | null) => void,
): () => void {
  return onSnapshot(statusRef(coupleId, uid), (snap) => {
    onChange(snap.exists() ? (snap.data() as MemberStatus) : null);
  });
}
