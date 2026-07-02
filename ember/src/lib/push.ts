/**
 * Best-effort push for sparks, via Expo's push service — the sender's phone
 * calls the Expo push API directly, so no server is needed.
 *
 * Note: Expo Go (SDK 53+) no longer supports receiving remote pushes; in Expo
 * Go, sparks still arrive live whenever the app is open (Firestore listener).
 * Build a development build or TestFlight build to get real notifications.
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export async function registerForPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    // Expo Go can't register for remote push — quietly fall back to in-app sparks.
    return null;
  }
}

export async function sendSparkPush(
  pushToken: string,
  fromName: string,
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: '✨ A spark',
        body: `${fromName} is thinking of you.`,
        sound: 'default',
      }),
    });
  } catch {
    // The spark still lands via Firestore; push is a bonus.
  }
}
