/**
 * The couple's live channel: presence (is my person in the app right now?)
 * and sparks (a broadcast "thinking of you" — ephemeral, nothing stored).
 * One channel per couple, joined for as long as a session is on screen.
 *
 * Presence and broadcasts are keyed by PERSON id, not device id — if
 * someone has Ember open on both their phone and their desktop, Realtime
 * Presence naturally coalesces multiple devices tracking under the same
 * key into one "this person is here" entry, and a spark they send from one
 * device correctly doesn't also flare on their own other device.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { getClient } from './supabase';

export interface CoupleChannel {
  /** Broadcasts a spark to the partner (does not notify offline devices —
   * pair it with push.notifyPartner for that). */
  sendSpark: () => void;
  close: () => void;
}

export function joinCoupleChannel(
  coupleId: string,
  personId: string,
  handlers: {
    onPresence: (presentPersonIds: string[]) => void;
    onSpark: () => void;
  },
): CoupleChannel {
  const supabase = getClient();
  const channel: RealtimeChannel = supabase.channel(`couple:${coupleId}`, {
    config: { presence: { key: personId }, broadcast: { self: false } },
  });

  const track = () => {
    void channel.track({ at: new Date().toISOString() });
  };

  channel
    .on('presence', { event: 'sync' }, () => {
      handlers.onPresence(Object.keys(channel.presenceState()));
    })
    .on('broadcast', { event: 'spark' }, (msg) => {
      const from = (msg.payload as { from?: string } | undefined)?.from;
      if (from !== personId) handlers.onSpark();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') track();
    });

  // Presence should mean "the app is open in front of them": untrack when
  // backgrounded, re-track on return.
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') track();
    else void channel.untrack();
  });

  return {
    sendSpark: () => {
      void channel.send({
        type: 'broadcast',
        event: 'spark',
        payload: { from: personId },
      });
    },
    close: () => {
      appState.remove();
      void supabase.removeChannel(channel);
    },
  };
}
