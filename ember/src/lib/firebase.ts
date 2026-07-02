import AsyncStorage from '@react-native-async-storage/async-storage';
// Auth comes from @firebase/auth (not the firebase/auth wrapper): only the
// scoped package declares a react-native entry in its export map, which both
// Metro and TypeScript need to pick the build with getReactNativePersistence.
import {
  getReactNativePersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type User,
} from '@firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from '../config/firebaseConfig';

let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured()) {
  const app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  db = getFirestore(app);
}

/** Firestore handle; only call after isFirebaseConfigured() has been checked. */
export function getDb(): Firestore {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

/**
 * Resolves the signed-in anonymous user, signing in on first launch.
 * The anonymous uid is this phone's identity within the couple.
 */
export function ensureSignedIn(): Promise<User> {
  if (!auth) return Promise.reject(new Error('Firebase is not configured'));
  const a = auth;
  return new Promise((resolve, reject) => {
    const unsubscribe = a.onAuthStateChanged((user) => {
      if (user) {
        unsubscribe();
        resolve(user);
      } else {
        signInAnonymously(a).catch((err) => {
          unsubscribe();
          reject(err);
        });
      }
    });
  });
}

export { isFirebaseConfigured };
