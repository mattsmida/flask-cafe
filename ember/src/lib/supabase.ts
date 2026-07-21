import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from '../config/supabaseConfig';

let client: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      // AsyncStorage is localStorage-backed on web, so one storage works everywhere.
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/** Supabase handle; only call after isSupabaseConfigured() has been checked. */
export function getSupabase(): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/**
 * Resolves the signed-in anonymous user's uid, signing in on first launch.
 * The anonymous uid is this device's identity within the couple.
 */
export async function ensureSignedIn(): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error || !signed.user) {
    throw error ?? new Error('Could not sign in.');
  }
  return signed.user.id;
}

/**
 * Refetch-on-event subscription to one table's rows for this couple.
 * postgres_changes events are RLS-checked per subscriber, so some events
 * legitimately never arrive (e.g. the partner's still-blind answer) — pass
 * intervalMs to add a slow safety-net refetch for state that must converge
 * without an event.
 */
let watchSeq = 0;

export function watchTable(
  table: string,
  coupleId: string,
  refetch: () => void,
  intervalMs?: number,
): () => void {
  const sb = getSupabase();
  // The suffix keeps each subscription on its own channel — supabase-js
  // reuses channels by topic, and a reused channel can't take new listeners.
  const channel = sb
    .channel(`db-${table}-${coupleId}-${++watchSeq}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` },
      refetch,
    )
    .subscribe();
  const timer = intervalMs ? setInterval(refetch, intervalMs) : null;
  refetch();
  return () => {
    if (timer) clearInterval(timer);
    sb.removeChannel(channel);
  };
}

export { isSupabaseConfigured };
