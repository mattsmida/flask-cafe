/**
 * Paste your Supabase project's values here (Supabase dashboard → Project
 * Settings → API): the project URL and the `anon` `public` API key.
 *
 * vapidPublicKey is for push notifications — the public half of the VAPID
 * key pair you generate with `npx web-push generate-vapid-keys` (see
 * ember/README.md). Until it's set the app simply hides the
 * "Enable notifications" button; everything else works.
 *
 * See ember/README.md for the full setup walkthrough. Until real values are
 * in place the app shows a setup screen instead of crashing.
 */
export const supabaseConfig = {
  url: 'PASTE_ME', // e.g. https://abcdefgh.supabase.co
  anonKey: 'PASTE_ME',
  vapidPublicKey: 'PASTE_ME',
};

export const isSupabaseConfigured = () =>
  !supabaseConfig.url.includes('PASTE_ME') &&
  !supabaseConfig.anonKey.includes('PASTE_ME');

export const isPushConfigured = () =>
  isSupabaseConfigured() && !supabaseConfig.vapidPublicKey.includes('PASTE_ME');
