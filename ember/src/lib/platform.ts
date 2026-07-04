/**
 * Small platform seams: things React Native does natively that need a
 * different shape in a desktop/mobile browser.
 */
import { Alert, Platform, Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** Shares the invite message; in a browser without a share sheet, copies it. */
export async function shareInvite(code: string): Promise<ShareOutcome> {
  const message = `Join me on Ember — our own little space. Code: ${code}`;
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & {
      share?: (data: { text: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ text: message });
        return 'shared';
      } catch {
        return 'shared'; // treat a cancelled sheet as done
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Alert.alert is a no-op on web; this confirms on both worlds. */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
