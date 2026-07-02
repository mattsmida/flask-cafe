import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { ensureSignedIn, getDb } from './firebase';
import type { Couple, Session } from './types';

const COUPLE_ID_KEY = 'ember.coupleId';

/** Codes avoid lookalike characters (0/O, 1/I/L) so they survive being read over a call. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function loadSession(): Promise<Session | null> {
  const user = await ensureSignedIn();
  const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
  if (!coupleId) return null;
  const snap = await getDoc(doc(getDb(), 'couples', coupleId));
  const couple = snap.data() as Couple | undefined;
  if (!couple || !couple.members.includes(user.uid)) {
    await AsyncStorage.removeItem(COUPLE_ID_KEY);
    return null;
  }
  return { uid: user.uid, coupleId, couple };
}

export async function createCouple(name: string): Promise<Session> {
  const user = await ensureSignedIn();
  const db = getDb();
  const code = makeCode();
  const coupleRef = doc(collection(db, 'couples'));
  const couple: Omit<Couple, 'createdAt'> = {
    code,
    members: [user.uid],
    names: { [user.uid]: name },
  };
  await setDoc(coupleRef, { ...couple, createdAt: serverTimestamp() });
  // Code -> couple lookup, so joining only requires knowing the code.
  await setDoc(doc(db, 'inviteCodes', code), { coupleId: coupleRef.id });
  await setDoc(doc(db, 'couples', coupleRef.id, 'status', user.uid), {
    name,
    lastActiveAt: serverTimestamp(),
  });
  await AsyncStorage.setItem(COUPLE_ID_KEY, coupleRef.id);
  const snap = await getDoc(coupleRef);
  return { uid: user.uid, coupleId: coupleRef.id, couple: snap.data() as Couple };
}

export async function joinCouple(rawCode: string, name: string): Promise<Session> {
  const user = await ensureSignedIn();
  const db = getDb();
  const code = rawCode.trim().toUpperCase();
  const inviteSnap = await getDoc(doc(db, 'inviteCodes', code));
  if (!inviteSnap.exists()) {
    throw new Error('That code doesn’t match any space. Check it and try again.');
  }
  const coupleId = (inviteSnap.data() as { coupleId: string }).coupleId;
  const coupleRef = doc(db, 'couples', coupleId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(coupleRef);
    const couple = snap.data() as Couple | undefined;
    if (!couple) throw new Error('That space no longer exists.');
    if (couple.members.includes(user.uid)) return; // already in — rejoining
    if (couple.members.length >= 2) {
      throw new Error('That space already has two people in it.');
    }
    tx.update(coupleRef, {
      members: arrayUnion(user.uid),
      [`names.${user.uid}`]: name,
    });
  });

  await setDoc(
    doc(db, 'couples', coupleId, 'status', user.uid),
    { name, lastActiveAt: serverTimestamp() },
    { merge: true },
  );
  await AsyncStorage.setItem(COUPLE_ID_KEY, coupleId);
  const snap = await getDoc(coupleRef);
  return { uid: user.uid, coupleId, couple: snap.data() as Couple };
}

/** Keeps couple metadata (partner joining, names) live after startup. */
export function subscribeCouple(
  coupleId: string,
  onChange: (couple: Couple) => void,
): () => void {
  return onSnapshot(doc(getDb(), 'couples', coupleId), (snap) => {
    if (snap.exists()) onChange(snap.data() as Couple);
  });
}

export function partnerUid(session: Session): string | null {
  return session.couple.members.find((m) => m !== session.uid) ?? null;
}

/** Local sign-out only: forgets the space on this phone, deletes nothing. */
export async function leaveLocally(): Promise<void> {
  await AsyncStorage.removeItem(COUPLE_ID_KEY);
}
