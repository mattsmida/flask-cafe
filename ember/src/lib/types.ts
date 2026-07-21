export type Weather = 'sunny' | 'cloudy' | 'stormy';

export interface Couple {
  id: string;
  code: string;
  members: string[]; // uids, max 2
  names: Record<string, string>; // uid -> display name
}

/** One row per member in `statuses`: weather of the heart + push subscription. */
export interface MemberStatus {
  weather?: Weather | null;
  weatherAt?: string | null; // ISO timestamp
}

/** One per person per local day in `checkins`. Sliders are 0–100. */
export interface Checkin {
  uid: string;
  date: string; // YYYY-MM-DD
  energy: number;
  heart: number;
  connection: number;
  word: string;
  at: string; // ISO timestamp
}

/** In `answers`; the server reveals the partner's row only once yours exists. */
export interface Answer {
  uid: string;
  date: string;
  text: string;
  at: string;
}

/**
 * From `letters` + the `letter_meta` view. While locked, the server never
 * sends prompt/text — the row carries only metadata for the countdown.
 */
export interface Letter {
  uid: string;
  month: string; // YYYY-MM
  writtenAt: string;
  unlockAt: string;
  locked: boolean;
  prompt?: string;
  text?: string;
}

export interface Session {
  uid: string;
  coupleId: string;
  couple: Couple;
}
