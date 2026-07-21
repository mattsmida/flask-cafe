import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { leaveLocally, partnerUid } from '../lib/couple';
import { enablePush, getPushState, type PushState } from '../lib/push';
import type { Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
  onLeft: () => void;
}

export function UsScreen({ session, onLeft }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);

  const [pushState, setPushState] = useState<PushState>(() => getPushState());
  const [pushBusy, setPushBusy] = useState(false);

  const shareCode = () => {
    Share.share({
      message: `Join me on Ember — our own little space. Code: ${couple.code}`,
    }).catch(() => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(couple.code).catch(() => {});
      }
    });
  };

  const onEnablePush = async () => {
    setPushBusy(true);
    try {
      setPushState(await enablePush(coupleId, uid));
    } finally {
      setPushBusy(false);
    }
  };

  const confirmLeave = () => {
    const message =
      'Nothing is deleted — your shared space stays intact, and you can rejoin anytime with your invite code.';
    if (Platform.OS === 'web') {
      // Alert.alert can't show buttons on web.
      if (typeof window !== 'undefined' && window.confirm(`Sign out on this device?\n\n${message}`)) {
        leaveLocally().then(onLeft);
      }
      return;
    }
    Alert.alert('Sign out on this phone?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await leaveLocally();
          onLeft();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.title}>Us</Text>

      <Card title="This space">
        <View style={styles.memberRow}>
          <Text style={styles.memberDotSelf}>●</Text>
          <Text style={type.body}>{couple.names[uid] ?? 'You'} (you)</Text>
        </View>
        <View style={styles.memberRow}>
          <Text style={styles.memberDotPartner}>●</Text>
          <Text style={type.body}>
            {pUid ? couple.names[pUid] : 'Waiting for your person…'}
          </Text>
        </View>
      </Card>

      {pushState !== 'unsupported' && (
        <Card title="Notifications">
          {pushState === 'enabled' ? (
            <Text style={type.dim}>
              Notifications are on — sparks, check-ins, and sealed answers will
              reach this device even when Ember is closed.
            </Text>
          ) : pushState === 'need-install' ? (
            <Text style={type.dim}>
              To get notifications on an iPhone, first add Ember to your Home
              Screen: tap the Share button in Safari, choose “Add to Home
              Screen”, then open Ember from there and come back to this tab.
            </Text>
          ) : pushState === 'denied' ? (
            <Text style={type.dim}>
              Notifications were declined for Ember on this device. To change
              your mind, allow them again in your browser or system settings,
              then reopen the app.
            </Text>
          ) : (
            <>
              <Text style={[type.dim, styles.pushLede]}>
                Get a gentle nudge when {pUid ? couple.names[pUid] : 'your person'} sends
                a spark, checks in, or seals an answer — even when Ember is closed.
              </Text>
              <Button label="Enable notifications" onPress={onEnablePush} busy={pushBusy} />
            </>
          )}
        </Card>
      )}

      <Card title="Invite code">
        <Pressable onPress={shareCode} style={styles.codeBox}>
          <Text style={styles.code}>{couple.code}</Text>
          <Text style={type.small}>tap to share</Text>
        </Pressable>
        <Text style={[type.small, styles.codeHint]}>
          Keep this handy — it’s also how you rejoin if you ever reinstall the app.
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
  codeBox: {
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  code: { color: colors.ember, fontSize: 30, fontWeight: '800', letterSpacing: 8 },
  codeHint: { marginTop: spacing.sm },
});
