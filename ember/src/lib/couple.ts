import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAppActive } from './lifecycle';
import { ensureSignedIn, getClient, onCoupleTableChange } from './supabase';
import type { Couple, Session } from './types';

const COUPLE_ID_KEY = 'ember.coupleId';

interface MemberRow {
  uid: string;
  name: string;
  joined_at: string;
}

/** Turns the RPC/Postgres error codes into words a human can act on. */
function friendlyError(error: { message: string }): Error {
  if (error.message.includes('NO_SUCH_CODE')) {
    return new Error('That code doesn’t match any space. Check it and try again.');
  }
  if (error.message.includes('COUPLE_FULL')) {
    return new Error('That space already has two people in it.');
  }
  return new Error(error.message);
}

async function fetchCouple(coupleId: string): Promise<Couple | null> {
  const supabase = getClient();
  const [coupleRes, membersRes] = await Promise.all([
    supabase.from('couples').select('id, code').eq('id', coupleId).maybeSingle(),
    supabase
      .from('members')
      .select('uid, name, joined_at')
      .eq('couple_id', coupleId)
      .order('joined_at'),
  ]);
  if (coupleRes.error || !coupleRes.data) return null;
  const members = (membersRes.data ?? []) as MemberRow[];
  return {
    id: coupleRes.data.id as string,
    code: coupleRes.data.code as string,
    members: members.map((m) => m.uid),
    names: Object.fromEntries(members.map((m) => [m.uid, m.name])),
  };
}

export async function loadSession(): Promise<Session | null> {
  const user = await ensureSignedIn();
  const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
  if (!coupleId) return null;
  const couple = await fetchCouple(coupleId);
  if (!couple || !couple.members.includes(user.id)) {
    await AsyncStorage.removeItem(COUPLE_ID_KEY);
    return null;
  }
  return { uid: user.id, coupleId, couple };
}

export async function createCouple(name: string): Promise<Session> {
  const user = await ensureSignedIn();
  const { data, error } = await getClient().rpc('create_couple', {
    p_name: name,
  });
  if (error) throw friendlyError(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    couple_id: string;
    code: string;
  };
  await AsyncStorage.setItem(COUPLE_ID_KEY, row.couple_id);
  const couple = await fetchCouple(row.couple_id);
  if (!couple) throw new Error('Could not load the new space. Try again.');
  return { uid: user.id, coupleId: row.couple_id, couple };
}

export async function joinCouple(rawCode: string, name: string): Promise<Session> {
  const user = await ensureSignedIn();
  const { data, error } = await getClient().rpc('join_couple', {
    p_code: rawCode.trim().toUpperCase(),
    p_name: name,
  });
  if (error) throw friendlyError(error);
  const coupleId = data as string;
  await AsyncStorage.setItem(COUPLE_ID_KEY, coupleId);
  const couple = await fetchCouple(coupleId);
  if (!couple) throw new Error('Could not load that space. Try again.');
  return { uid: user.id, coupleId, couple };
}

/** Keeps couple metadata (partner joining, names) live after startup. */
export function subscribeCouple(
  coupleId: string,
  onChange: (couple: Couple) => void,
): () => void {
  let cancelled = false;
  const refetch = () => {
    fetchCouple(coupleId)
      .then((couple) => {
        if (couple && !cancelled) onChange(couple);
      })
      .catch(() => {});
  };
  const offEvents = onCoupleTableChange('couple-meta', 'members', coupleId, refetch);
  const offActive = onAppActive(refetch);
  return () => {
    cancelled = true;
    offEvents();
    offActive();
  };
}

export function partnerUid(session: Session): string | null {
  return session.couple.members.find((m) => m !== session.uid) ?? null;
}

/** Local sign-out only: forgets the space on this device, deletes nothing. */
export async function leaveLocally(): Promise<void> {
  await AsyncStorage.removeItem(COUPLE_ID_KEY);
}
