export type Weather = 'sunny' | 'cloudy' | 'stormy';

/**
 * Assembled from the couples + persons tables. `members`/`names` are keyed
 * by person id — a person, not a device: the same person using their phone
 * and their desktop is one entry here.
 */
export interface Couple {
  id: string;
  code: string;
  members: string[]; // person ids, max 2, in join order
  names: Record<string, string>; // person id -> display name
}

/** One row per person in `statuses`: the weather of the heart. */
export interface MemberStatus {
  weather?: Weather;
  weatherAt?: string; // ISO timestamp
}

/** One row per (person, local day) in `checkins`. Sliders are 0–100. Any of
 * that person's devices can write or re-save it. */
export interface Checkin {
  personId: string;
  date: string; // YYYY-MM-DD
  energy: number;
  heart: number;
  connection: number;
  word: string;
  at: string;
}

/** One row per (person, day) in `answers`. The server reveals the partner's
 * row only once your own answer for that day exists. */
export interface Answer {
  personId: string;
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
  personId: string;
  month: string; // YYYY-MM
  writtenAt: string;
  unlockAt: string;
  unlocked: boolean;
  prompt?: string;
  text?: string;
}

/**
 * This device's session. `personId` is the identity that owns check-ins,
 * answers, letters, and weather — shared across every device that person
 * has linked (see couple.ts / lib/push.ts for the device-linking flow).
 */
export interface Session {
  personId: string;
  coupleId: string;
  couple: Couple;
}
