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
  url: 'https://yhzuzohdpbtghcwwpljj.supabase.co', // e.g. https://abcdefgh.supabase.co
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloenV6b2hkcGJ0Z2hjd3dwbGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzczOTMsImV4cCI6MjA5ODc1MzM5M30.5YceYE87JnHJX5uKt85UHd8IcDmNR7wzllXHeojqWnc',
  vapidPublicKey: 'BNxPYG19XQYOkLkMwdImXdxBu8jg_Naefm9ErrCV3CHV5GB-hMgYAivTJl1kc5p2bHsVyN06co7SBIAStifYc9o', // push stays off until this is set
};

export const isSupabaseConfigured = () =>
  !supabaseConfig.url.includes('PASTE_ME') &&
  !supabaseConfig.anonKey.includes('PASTE_ME');

export const isPushConfigured = () =>
isSupabaseConfigured() && !supabaseConfig.vapidPublicKey.includes('PASTE_ME');
