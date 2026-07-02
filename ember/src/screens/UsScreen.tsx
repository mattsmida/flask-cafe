import React from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { leaveLocally, partnerUid } from '../lib/couple';
import type { Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
  onLeft: () => void;
}

export function UsScreen({ session, onLeft }: Props) {
  const { uid, couple } = session;
  const pUid = partnerUid(session);

  const shareCode = () => {
    Share.share({
      message: `Join me on Ember — our own little space. Code: ${couple.code}`,
    }).catch(() => {});
  };

  const confirmLeave = () => {
    Alert.alert(
      'Sign out on this phone?',
      'Nothing is deleted — your shared space stays intact, and you can rejoin anytime with your invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await leaveLocally();
            onLeft();
          },
        },
      ],
    );
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

      <Button label="Sign out on this phone" variant="ghost" onPress={confirmLeave} />
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
  codeBox: {
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  code: { color: colors.ember, fontSize: 30, fontWeight: '800', letterSpacing: 8 },
  codeHint: { marginTop: spacing.sm },
});
