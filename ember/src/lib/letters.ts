/**
 * The Future Question: once a month each partner writes to your future
 * selves; letters unseal three months after they're written. Since phase 2
 * the sealing is enforced by the server: locked letters come back as
 * metadata only (via the letter_meta view), with no text even for the author.
 */
import { monthKey } from './dates';
import { getSupabase, watchTable } from './supabase';
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
  uid: string,
  text: string,
): Promise<void> {
  const month = monthKey();
  const { error } = await getSupabase().from('letters').insert({
    couple_id: coupleId,
    uid,
    month,
    prompt: promptForMonth(month),
    text,
    unlock_at: new Date(Date.now() + SEAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
}

export function subscribeLetters(
  coupleId: string,
  onChange: (letters: Letter[]) => void,
): () => void {
  const refetch = async () => {
    const sb = getSupabase();
    // Metadata for every letter (locked ones included)…
    const { data: meta } = await sb
      .from('letter_meta')
      .select('uid, month, writtenAt:written_at, unlockAt:unlock_at')
      .eq('couple_id', coupleId)
      .order('month', { ascending: false });
    if (!meta) return;
    // …and full rows for whatever the server considers unlocked.
    const { data: open } = await sb
      .from('letters')
      .select('uid, month, prompt, text')
      .eq('couple_id', coupleId);
    const openByKey = new Map(
      (open ?? []).map((l) => [`${l.month}_${l.uid}`, l as { prompt: string; text: string }]),
    );
    onChange(
      (meta as Omit<Letter, 'locked'>[]).map((m) => {
        const full = openByKey.get(`${m.month}_${m.uid}`);
        return { ...m, locked: !full, prompt: full?.prompt, text: full?.text };
      }),
    );
  };
  // A partner's still-locked letter emits no RLS-visible event, and unlocking
  // is pure time passing — the interval covers both.
  return watchTable('letters', coupleId, refetch, 60_000);
}

export function isUnlocked(letter: Letter): boolean {
  return !letter.locked;
}

export function daysUntilUnlock(letter: Letter): number {
  return Math.max(
    0,
    Math.ceil((Date.parse(letter.unlockAt) - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}
