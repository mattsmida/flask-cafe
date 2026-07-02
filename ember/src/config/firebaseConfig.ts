/**
 * Paste your Firebase web-app config here (Firebase console → Project
 * settings → Your apps → SDK setup and configuration → Config).
 *
 * See ember/README.md for the full 5-minute setup walkthrough.
 * Until real values are in place the app shows a setup screen instead of
 * crashing.
 */
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'PASTE_ME.firebaseapp.com',
  projectId: 'PASTE_ME',
  storageBucket: 'PASTE_ME.firebasestorage.app',
  messagingSenderId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

export const isFirebaseConfigured = () =>
  !Object.values(firebaseConfig).some((v) => v.includes('PASTE_ME'));
