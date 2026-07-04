/**
 * The couple's live channel: presence (is my person in the app right now?)
 * and sparks (a broadcast "thinking of you" — ephemeral, nothing stored).
 * One channel per couple, joined for as long as a session is on screen.
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
  uid: string,
  handlers: {
    onPresence: (presentUids: string[]) => void;
    onSpark: () => void;
  },
): CoupleChannel {
  const supabase = getClient();
  const channel: RealtimeChannel = supabase.channel(`couple:${coupleId}`, {
    config: { presence: { key: uid }, broadcast: { self: false } },
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
      if (from !== uid) handlers.onSpark();
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
        payload: { from: uid },
      });
    },
    close: () => {
      appState.remove();
      void supabase.removeChannel(channel);
    },
  };
}
