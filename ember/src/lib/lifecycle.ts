import { AppState } from 'react-native';

/**
 * Runs cb whenever the app returns to the foreground (on web: the tab
 * becomes visible again). Used to refetch live data after time away, so a
 * missed realtime event never leaves a screen stale.
 */
export function onAppActive(cb: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') cb();
  });
  return () => sub.remove();
}
