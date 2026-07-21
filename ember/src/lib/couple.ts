import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureSignedIn, getSupabase, watchTable } from './supabase';
import type { Couple, Session } from './types';

const COUPLE_ID_KEY = 'ember.coupleId';

interface MemberRow {
  uid: string;
  name: string;
}

async function fetchCouple(coupleId: string): Promise<Couple | null> {
  const { data, error } = await getSupabase()
    .from('couples')
    .select('id, code, members (uid, name)')
    .eq('id', coupleId)
    .maybeSingle();
  if (error || !data) return null;
  const members = (data.members ?? []) as MemberRow[];
  return {
    id: data.id as string,
    code: data.code as string,
    members: members.map((m) => m.uid),
    names: Object.fromEntries(members.map((m) => [m.uid, m.name])),
  };
}

export async function loadSession(): Promise<Session | null> {
  const uid = await ensureSignedIn();
  const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
  if (!coupleId) return null;
  const couple = await fetchCouple(coupleId);
  if (!couple || !couple.members.includes(uid)) {
    await AsyncStorage.removeItem(COUPLE_ID_KEY);
    return null;
  }
  return { uid, coupleId, couple };
}

async function sessionFromRpc(
  rpc: 'create_couple' | 'join_couple',
  args: Record<string, string>,
): Promise<Session> {
  const uid = await ensureSignedIn();
  const { data, error } = await getSupabase().rpc(rpc, args);
  if (error) {
    // The RPCs raise exceptions with user-facing sentences; pass them through.
    throw new Error(error.message || 'Something went wrong. Try again.');
  }
  const coupleId = (data as { couple_id: string }).couple_id;
  const couple = await fetchCouple(coupleId);
  if (!couple) throw new Error('Could not load your space. Try again.');
  await AsyncStorage.setItem(COUPLE_ID_KEY, coupleId);
  return { uid, coupleId, couple };
}

export function createCouple(name: string): Promise<Session> {
  return sessionFromRpc('create_couple', { p_name: name });
}

export function joinCouple(rawCode: string, name: string): Promise<Session> {
  return sessionFromRpc('join_couple', {
    p_code: rawCode.trim().toUpperCase(),
    p_name: name,
  });
}

/**
 * Keeps couple metadata (partner joining, names) live after startup.
 * The interval refetch matters most while you're waiting for the partner
 * to join — their INSERT event can beat the realtime socket being ready.
 */
export function subscribeCouple(
  coupleId: string,
  onChange: (couple: Couple) => void,
): () => void {
  let memberCount = 2;
  const refetch = () => {
    fetchCouple(coupleId).then((couple) => {
      if (couple) {
        memberCount = couple.members.length;
        onChange(couple);
      }
    });
  };
  const stop = watchTable('members', coupleId, refetch);
  const timer = setInterval(() => {
    if (memberCount < 2) refetch();
  }, 15_000);
  return () => {
    clearInterval(timer);
    stop();
  };
}

export function partnerUid(session: Session): string | null {
  return session.couple.members.find((m) => m !== session.uid) ?? null;
}

/** Local sign-out only: forgets the space on this device, deletes nothing. */
export async function leaveLocally(): Promise<void> {
  await AsyncStorage.removeItem(COUPLE_ID_KEY);
}
