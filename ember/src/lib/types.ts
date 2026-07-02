import type { Timestamp } from 'firebase/firestore';

export type Weather = 'sunny' | 'cloudy' | 'stormy';

export interface Couple {
  code: string;
  members: string[]; // uids, max 2
  names: Record<string, string>; // uid -> display name
  createdAt: Timestamp;
}

/** One per member, at couples/{id}/status/{uid}. Small and hot: heartbeats, weather, sparks. */
export interface MemberStatus {
  name: string;
  lastActiveAt?: Timestamp;
  weather?: Weather;
  weatherAt?: Timestamp;
  sparkAt?: Timestamp;
  pushToken?: string;
}

/** At couples/{id}/checkins/{date}_{uid}. Sliders are 0–100. */
export interface Checkin {
  uid: string;
  date: string; // YYYY-MM-DD
  energy: number;
  heart: number;
  connection: number;
  word: string;
  at: Timestamp;
}

/** At couples/{id}/answers/{date}_{uid}. Revealed in the UI only once both exist. */
export interface Answer {
  uid: string;
  date: string;
  text: string;
  at: Timestamp;
}

/** At couples/{id}/letters/{month}_{uid}. Hidden from everyone until unlockAt. */
export interface Letter {
  uid: string;
  month: string; // YYYY-MM
  prompt: string;
  text: string;
  writtenAt: Timestamp;
  unlockAt: Timestamp;
}

export interface Session {
  uid: string;
  coupleId: string;
  couple: Couple;
}
