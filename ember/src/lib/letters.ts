/**
 * The Future Question: once a month each person writes to your future
 * selves; letters unseal three months after they're written.
 *
 * Sealing is enforced by the server: the letters SELECT policy returns a
 * row only once unlock_at has passed (not even the author can read it
 * early, from any of their devices), while the letter_vault view lists
 * sealed letters' metadata so the vault can show countdowns.
 */
import { monthKey } from './dates';
import { onAppActive } from './lifecycle';
import { getClient, onCoupleTableChange } from './supabase';
import { LETTER_PROMPTS } from './questionBank';
import type { Letter } from './types';

export const SEAL_DAYS = 90;

/** The shared prompt for a YYYY-MM month — same for both partners. */
export function promptForMonth(month: string = monthKey()): string {
  const [y, m] = month.split('-').map(Number);
  return LETTER_PROMPTS[(y * 12 + (m - 1)) % LETTER_PROMPTS.length];
}

export async function writeLetter(
  coupleId: string,
  personId: string,
  text: string,
): Promise<void> {
  const month = monthKey();
  const unlockAt = new Date(
    Date.now() + SEAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await getClient().from('letters').insert({
    couple_id: coupleId,
    person_id: personId,
    month,
    prompt: promptForMonth(month),
    text,
    unlock_at: unlockAt,
  });
  if (error) throw new Error(error.message);
}

interface VaultRow {
  person_id: string;
  month: string;
  written_at: string;
  unlock_at: string;
}

interface LetterRow extends VaultRow {
  prompt: string;
  text: string;
}

async function fetchLetters(coupleId: string): Promise<Letter[]> {
  const supabase = getClient();
  // The vault view lists every letter (metadata only); the letters table
  // returns full rows only for letters the server has unlocked.
  const [vaultRes, openRes] = await Promise.all([
    supabase
      .from('letter_vault')
      .select('person_id, month, written_at, unlock_at')
      .eq('couple_id', coupleId)
      .order('month', { ascending: false }),
    supabase
      .from('letters')
      .select('person_id, month, prompt, text, written_at, unlock_at')
      .eq('couple_id', coupleId),
  ]);
  const open = new Map(
    ((openRes.data ?? []) as LetterRow[]).map((l) => [`${l.month}_${l.person_id}`, l]),
  );
  return ((vaultRes.data ?? []) as VaultRow[]).map((v) => {
    const full = open.get(`${v.month}_${v.person_id}`);
    return {
      personId: v.person_id,
      month: v.month,
      writtenAt: v.written_at,
      unlockAt: v.unlock_at,
      unlocked: !!full,
      prompt: full?.prompt,
      text: full?.text,
    };
  });
}

export function subscribeLetters(
  coupleId: string,
  onChange: (letters: Letter[]) => void,
): () => void {
  let cancelled = false;
  const refetch = () => {
    fetchLetters(coupleId)
      .then((letters) => {
        if (!cancelled) onChange(letters);
      })
      .catch(() => {});
  };
  refetch();
  const offEvents = onCoupleTableChange('letters', 'letters', coupleId, refetch);
  const offActive = onAppActive(refetch);
  return () => {
    cancelled = true;
    offEvents();
    offActive();
  };
}

export function isUnlocked(letter: Letter): boolean {
  return letter.unlocked;
}

export function daysUntilUnlock(letter: Letter): number {
  return Math.max(
    0,
    Math.ceil((Date.parse(letter.unlockAt) - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}
