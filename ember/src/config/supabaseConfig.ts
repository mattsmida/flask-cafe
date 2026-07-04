/**
 * Paste your Supabase project values here (Supabase dashboard → Project
 * Settings → API): the project URL and the `anon` public key.
 *
 * vapidPublicKey is for Web Push notifications — generate a key pair once
 * with `npx web-push generate-vapid-keys` and paste the public key here
 * (the private key goes into the send-push Edge Function's secrets).
 *
 * See ember/README.md for the full setup walkthrough. Until real values are
 * in place the app shows a setup screen instead of crashing.
 */
export const supabaseConfig = {
  url: 'PASTE_ME', // e.g. https://abcdefgh.supabase.co
  anonKey: 'PASTE_ME',
  vapidPublicKey: 'PASTE_ME', // push stays off until this is set
};

export const isSupabaseConfigured = () =>
  !supabaseConfig.url.includes('PASTE_ME') &&
  !supabaseConfig.anonKey.includes('PASTE_ME');

export const isPushConfigured = () =>
  isSupabaseConfigured() && !supabaseConfig.vapidPublicKey.includes('PASTE_ME');
