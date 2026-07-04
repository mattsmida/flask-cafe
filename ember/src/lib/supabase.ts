import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';
import {
  isSupabaseConfigured,
  supabaseConfig,
} from '../config/supabaseConfig';

// Hermes has no full URL implementation; supabase-js needs the polyfill on
// native. The web build uses the browser's own URL.
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

let client: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      // On web the default (localStorage) is right; native persists the
      // anonymous session — this phone's identity — in AsyncStorage.
      ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/** Supabase handle; only call after isSupabaseConfigured() has been checked. */
export function getClient(): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/**
 * Resolves the signed-in anonymous user, signing in on first launch.
 * The anonymous uid is this device's identity within the couple.
 */
export async function ensureSignedIn(): Promise<User> {
  const supabase = getClient();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.user) {
    throw error ?? new Error('Could not sign in.');
  }
  return signedIn.user;
}

/**
 * Live Postgres events for one couple's rows in a table. Events are
 * RLS-filtered server-side; callers should refetch on event rather than
 * patching state from the payload — simpler and always consistent.
 */
export function onCoupleTableChange(
  key: string,
  table: string,
  coupleId: string,
  onEvent: () => void,
): () => void {
  const supabase = getClient();
  const channel = supabase
    .channel(`${key}:${coupleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` },
      onEvent,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export { isSupabaseConfigured };
