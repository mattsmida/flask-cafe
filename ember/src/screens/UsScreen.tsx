import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { fetchMyDeviceCode, leaveLocally, partnerPersonId, rotateDeviceCode } from '../lib/couple';
import { confirmAsync, shareInvite } from '../lib/platform';
import {
  enablePush,
  getPushAvailability,
  hasPushSubscription,
  type PushAvailability,
} from '../lib/push';
import type { Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
  onLeft: () => void;
}

const PUSH_EXPLANATIONS: Record<Exclude<PushAvailability, 'ready'>, string> = {
  enabled: 'Notifications are on for this device. Sparks land even when Ember is closed.',
  'needs-install':
    'On iPhone, notifications need Ember installed first: open this page in Safari, tap Share → Add to Home Screen, then come back here from the home-screen app.',
  denied:
    'Notifications are blocked for Ember in this browser. Allow them in the browser’s site settings, then try again.',
  unsupported:
    'This app can’t receive push here — use Ember in a browser (or installed to a home screen) for notifications.',
  unconfigured:
    'Push isn’t set up yet: add your VAPID public key in src/config/supabaseConfig.ts (see the README).',
};

export function UsScreen({ session, onLeft }: Props) {
  const { personId, couple } = session;
  const pId = partnerPersonId(session);

  // Synchronous first guess so the card never flashes the wrong state; the
  // effect only upgrades 'ready' → 'enabled' once the subscription is found.
  const [availability, setAvailability] = useState<PushAvailability>(getPushAvailability);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [shared, setShared] = useState<'copied' | null>(null);

  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceCodeBusy, setDeviceCodeBusy] = useState(false);
  const [deviceCodeShared, setDeviceCodeShared] = useState<'copied' | null>(null);

  useEffect(() => {
    if (getPushAvailability() === 'ready') {
      hasPushSubscription().then((has) => {
        if (has) setAvailability('enabled');
      });
    }
  }, []);

  useEffect(() => {
    fetchMyDeviceCode().then(setDeviceCode).catch(() => {});
  }, [personId]);

  const onEnablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      await enablePush();
      setAvailability('enabled');
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Could not enable notifications.');
      setAvailability(getPushAvailability());
    } finally {
      setPushBusy(false);
    }
  };

  const shareCode = async () => {
    const outcome = await shareInvite(couple.code);
    if (outcome === 'copied') {
      setShared('copied');
      setTimeout(() => setShared(null), 2500);
    }
  };

  const shareDeviceCode = async () => {
    if (!deviceCode) return;
    const outcome = await shareInvite(deviceCode);
    if (outcome === 'copied') {
      setDeviceCodeShared('copied');
      setTimeout(() => setDeviceCodeShared(null), 2500);
    }
  };

  const onRotateDeviceCode = async () => {
    const yes = await confirmAsync(
      'Get a new device code?',
      'Your old code stops working. Any device you haven’t linked yet will need the new one.',
      'Get new code',
    );
    if (!yes) return;
    setDeviceCodeBusy(true);
    try {
      setDeviceCode(await rotateDeviceCode());
    } catch {
      // leave the old code showing
    } finally {
      setDeviceCodeBusy(false);
    }
  };

  const confirmLeave = async () => {
    const yes = await confirmAsync(
      'Sign out on this device?',
      'Nothing is deleted — your shared space stays intact, and you can rejoin anytime with your invite code.',
      'Sign out',
    );
    if (yes) {
      await leaveLocally();
      onLeft();
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.title}>Us</Text>

      <Card title="This space">
        <View style={styles.memberRow}>
          <Text style={styles.memberDotSelf}>●</Text>
          <Text style={type.body}>{couple.names[personId] ?? 'You'} (you)</Text>
        </View>
        <View style={styles.memberRow}>
          <Text style={styles.memberDotPartner}>●</Text>
          <Text style={type.body}>
            {pId ? couple.names[pId] : 'Waiting for your person…'}
          </Text>
        </View>
      </Card>

      <Card title="Notifications">
        {availability === 'ready' ? (
          <>
            <Text style={[type.dim, styles.pushLede]}>
              Turn these on so sparks reach you even when Ember is closed.
            </Text>
            <Button label="Enable notifications" onPress={onEnablePush} busy={pushBusy} />
          </>
        ) : (
          <Text style={type.dim}>{PUSH_EXPLANATIONS[availability]}</Text>
        )}
        {pushError && <Text style={styles.pushError}>{pushError}</Text>}
      </Card>

      <Card title="Your device code">
        <Text style={[type.dim, styles.cardLede]}>
          Using Ember on your phone and your desktop? Open this app on the
          other device and enter this code there — it links as another
          device for you, not a new person. Keep it private: anyone with it
          can add a device as you.
        </Text>
        {deviceCode ? (
          <Pressable onPress={shareDeviceCode} style={styles.codeBox}>
            <Text style={styles.code}>{deviceCode}</Text>
            <Text style={type.small}>
              {deviceCodeShared === 'copied' ? 'copied!' : 'tap to share'}
            </Text>
          </Pressable>
        ) : (
          <Text style={type.dim}>Loading…</Text>
        )}
        <View style={styles.rotateRow}>
          <Button
            label="Get a new code"
            variant="ghost"
            onPress={onRotateDeviceCode}
            busy={deviceCodeBusy}
          />
        </View>
      </Card>

      <Card title="Invite code">
        <Pressable onPress={shareCode} style={styles.codeBox}>
          <Text style={styles.code}>{couple.code}</Text>
          <Text style={type.small}>{shared === 'copied' ? 'copied!' : 'tap to share'}</Text>
        </Pressable>
        <Text style={[type.small, styles.codeHint]}>
          This is for your person to join the space for the first time. If
          you’re adding another one of your own devices, use your device
          code above instead.
        </Text>
      </Card>

      <Card title="About Ember">
        <Text style={type.dim}>
          A small warm place for two people across a distance: presence, sparks,
          the weather of your hearts, one blind question a day, and letters your
          future selves will open.
        </Text>
      </Card>

      <Button label="Sign out on this device" variant="ghost" onPress={confirmLeave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  memberDotSelf: { color: colors.ember, fontSize: 14 },
  memberDotPartner: { color: colors.violet, fontSize: 14 },
  pushLede: { marginBottom: spacing.md },
  pushError: { color: colors.danger, marginTop: spacing.sm, fontSize: 14 },
  cardLede: { marginBottom: spacing.md },
  codeBox: {
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  code: { color: colors.ember, fontSize: 30, fontWeight: '800', letterSpacing: 8 },
  codeHint: { marginTop: spacing.sm },
  rotateRow: { marginTop: spacing.md },
});
