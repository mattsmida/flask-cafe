import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAppActive } from './lifecycle';
import { ensureSignedIn, getClient, onCoupleTableChange } from './supabase';
import type { Couple, Session } from './types';

const COUPLE_ID_KEY = 'ember.coupleId';
const PERSON_ID_KEY = 'ember.personId';

interface PersonRow {
  id: string;
  name: string;
  created_at: string;
}

/** Turns the RPC/Postgres error codes into words a human can act on. */
function friendlyError(error: { message: string }): Error {
  if (error.message.includes('NO_SUCH_CODE')) {
    return new Error('That code doesn’t match any space. Check it and try again.');
  }
  if (error.message.includes('COUPLE_FULL')) {
    return new Error('That space already has two people in it.');
  }
  if (error.message.includes('NO_SUCH_DEVICE_CODE')) {
    return new Error('That device code doesn’t match anyone. Check it and try again.');
  }
  return new Error(error.message);
}

async function fetchCouple(coupleId: string): Promise<Couple | null> {
  const supabase = getClient();
  const [coupleRes, personsRes] = await Promise.all([
    supabase.from('couples').select('id, code').eq('id', coupleId).maybeSingle(),
    supabase
      .from('persons')
      .select('id, name, created_at')
      .eq('couple_id', coupleId)
      .order('created_at'),
  ]);
  if (coupleRes.error || !coupleRes.data) return null;
  const persons = (personsRes.data ?? []) as PersonRow[];
  return {
    id: coupleRes.data.id as string,
    code: coupleRes.data.code as string,
    members: persons.map((p) => p.id),
    names: Object.fromEntries(persons.map((p) => [p.id, p.name])),
  };
}

async function storeSession(coupleId: string, personId: string): Promise<void> {
  await AsyncStorage.multiSet([
    [COUPLE_ID_KEY, coupleId],
    [PERSON_ID_KEY, personId],
  ]);
}

export async function loadSession(): Promise<Session | null> {
  await ensureSignedIn();
  const [[, coupleId], [, personId]] = await AsyncStorage.multiGet([
    COUPLE_ID_KEY,
    PERSON_ID_KEY,
  ]);
  if (!coupleId || !personId) return null;
  const couple = await fetchCouple(coupleId);
  if (!couple || !couple.members.includes(personId)) {
    await AsyncStorage.multiRemove([COUPLE_ID_KEY, PERSON_ID_KEY]);
    return null;
  }
  return { personId, coupleId, couple };
}

export async function createCouple(name: string): Promise<Session> {
  await ensureSignedIn();
  const { data, error } = await getClient().rpc('create_couple', { p_name: name });
  if (error) throw friendlyError(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    out_couple_id: string;
    out_code: string;
    out_person_id: string;
  };
  await storeSession(row.out_couple_id, row.out_person_id);
  const couple = await fetchCouple(row.out_couple_id);
  if (!couple) throw new Error('Could not load the new space. Try again.');
  return { personId: row.out_person_id, coupleId: row.out_couple_id, couple };
}

export async function joinCouple(rawCode: string, name: string): Promise<Session> {
  await ensureSignedIn();
  const { data, error } = await getClient().rpc('join_couple', {
    p_code: rawCode.trim().toUpperCase(),
    p_name: name,
  });
  if (error) throw friendlyError(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    out_couple_id: string;
    out_person_id: string;
  };
  await storeSession(row.out_couple_id, row.out_person_id);
  const couple = await fetchCouple(row.out_couple_id);
  if (!couple) throw new Error('Could not load that space. Try again.');
  return { personId: row.out_person_id, coupleId: row.out_couple_id, couple };
}

/**
 * Attaches THIS device to an existing person via their private device-link
 * code — how the same person adds their phone and their desktop as one
 * identity. See UsScreen (shows your own code) and WelcomeScreen (where a
 * fresh device enters someone else's code).
 */
export async function linkDevice(rawDeviceCode: string): Promise<Session> {
  await ensureSignedIn();
  const { data, error } = await getClient().rpc('link_device', {
    p_device_code: rawDeviceCode.trim().toUpperCase(),
  });
  if (error) throw friendlyError(error);
  const row = (Array.isArray(data) ? data[0] : data) as {
    out_couple_id: string;
    out_person_id: string;
  };
  await storeSession(row.out_couple_id, row.out_person_id);
  const couple = await fetchCouple(row.out_couple_id);
  if (!couple) throw new Error('Could not load that space. Try again.');
  return { personId: row.out_person_id, coupleId: row.out_couple_id, couple };
}

/** This person's private code for linking more devices (Us tab). Read
 * fresh each time rather than cached, so a rotation is never stale. */
export async function fetchMyDeviceCode(): Promise<string | null> {
  const { data } = await getClient().from('device_link_codes').select('code').maybeSingle();
  return (data?.code as string | undefined) ?? null;
}

/** Invalidates the current device code and returns the new one. */
export async function rotateDeviceCode(): Promise<string> {
  const { data, error } = await getClient().rpc('rotate_device_code');
  if (error) throw new Error(error.message);
  return data as string;
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
  const offEvents = onCoupleTableChange('couple-meta', 'persons', coupleId, refetch);
  const offActive = onAppActive(refetch);
  return () => {
    cancelled = true;
    offEvents();
    offActive();
  };
}

export function partnerPersonId(session: Session): string | null {
  return session.couple.members.find((m) => m !== session.personId) ?? null;
}

/** Local sign-out only: forgets the space on this device, deletes nothing. */
export async function leaveLocally(): Promise<void> {
  await AsyncStorage.multiRemove([COUPLE_ID_KEY, PERSON_ID_KEY]);
}
