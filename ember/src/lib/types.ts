export type Weather = 'sunny' | 'cloudy' | 'stormy';

/** Assembled from the couples + members tables. */
export interface Couple {
  id: string;
  code: string;
  members: string[]; // uids, max 2, in join order
  names: Record<string, string>; // uid -> display name
}

/** One row per member in `statuses`: the weather of the heart. */
export interface MemberStatus {
  weather?: Weather;
  weatherAt?: string; // ISO timestamp
}

/** One row per (member, local day) in `checkins`. Sliders are 0–100. */
export interface Checkin {
  uid: string;
  date: string; // YYYY-MM-DD
  energy: number;
  heart: number;
  connection: number;
  word: string;
  at: string;
}

/** One row per (member, day) in `answers`. The server reveals the partner's
 * row only once your own answer for that day exists. */
export interface Answer {
  uid: string;
  date: string;
  text: string;
  at: string;
}

/**
 * A vault entry. Sealed letters come from the letter_vault view as metadata
 * only; prompt/text are present exactly when the server has unlocked the
 * letter (unlock_at has passed).
 */
export interface Letter {
  uid: string;
  month: string; // YYYY-MM
  writtenAt: string;
  unlockAt: string;
  unlocked: boolean;
  prompt?: string;
  text?: string;
}

export interface Session {
  uid: string;
  coupleId: string;
  couple: Couple;
}
