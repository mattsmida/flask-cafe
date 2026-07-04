import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { GlowOrb } from '../components/GlowOrb';
import { WEATHER_META, WeatherPicker } from '../components/WeatherPicker';
import { partnerUid } from '../lib/couple';
import { shareInvite } from '../lib/platform';
import { notifyPartner } from '../lib/push';
import { setWeather, subscribeStatuses, type StatusMap } from '../lib/status';
import type { Session, Weather } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
  /** From the couple's realtime presence channel (owned by App). */
  partnerHere: boolean;
  /** Increments once per incoming spark. */
  sparkPulse: number;
  onSendSpark: () => void;
}

export function HomeScreen({ session, partnerHere, sparkPulse, onSendSpark }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);
  const partnerName = pUid ? couple.names[pUid] ?? 'Your person' : null;

  const [statuses, setStatuses] = useState<StatusMap>({});
  const [shared, setShared] = useState<'copied' | null>(null);
  const lastPulseRef = useRef(sparkPulse);

  useEffect(() => subscribeStatuses(coupleId, setStatuses), [coupleId]);

  // Incoming spark: the orb flare is driven by sparkPulse; add the buzz.
  useEffect(() => {
    if (sparkPulse > lastPulseRef.current) {
      lastPulseRef.current = sparkPulse;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [sparkPulse]);

  const myStatus = statuses[uid];
  const partnerStatus = pUid ? statuses[pUid] : undefined;

  const onSpark = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSendSpark(); // live, via the realtime channel
    notifyPartner(coupleId, 'spark'); // push, for when their app is closed
  };

  const onWeather = (w: Weather) => {
    setWeather(coupleId, uid, w).catch(() => {});
  };

  const shareCode = async () => {
    const outcome = await shareInvite(couple.code);
    if (outcome === 'copied') {
      setShared('copied');
      setTimeout(() => setShared(null), 2500);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.title}>Today</Text>

      {!pUid ? (
        <Card title="Waiting for your person">
          <Text style={[type.dim, styles.inviteText]}>
            Send them this code — when they join, this screen comes alive.
          </Text>
          <Pressable onPress={shareCode} style={styles.codeBox}>
            <Text style={styles.code}>{couple.code}</Text>
            <Text style={type.small}>
              {shared === 'copied' ? 'copied!' : 'tap to share'}
            </Text>
          </Pressable>
        </Card>
      ) : (
        <>
          <GlowOrb
            presence={partnerHere}
            sparkPulse={sparkPulse}
            caption={
              partnerHere
                ? `${partnerName} is here right now`
                : `${partnerName} isn’t in the app right now`
            }
          />

          <Pressable
            onPress={onSpark}
            style={({ pressed }) => [styles.sparkButton, pressed && styles.sparkPressed]}
          >
            <Text style={styles.sparkIcon}>✨</Text>
            <View style={styles.sparkTextWrap}>
              <Text style={styles.sparkTitle}>Send a spark</Text>
              <Text style={type.small}>one tap: “thinking of you”</Text>
            </View>
          </Pressable>

          <Card title="Weather of the heart">
            <WeatherPicker value={myStatus?.weather} onSelect={onWeather} />
            <View style={styles.partnerWeather}>
              <Text style={type.dim}>
                {partnerStatus?.weather
                  ? `${partnerName}: ${WEATHER_META[partnerStatus.weather].icon} ${
                      WEATHER_META[partnerStatus.weather].label
                    }`
                  : `${partnerName} hasn’t set their weather yet`}
              </Text>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  inviteText: { marginBottom: spacing.md },
  codeBox: {
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  code: {
    color: colors.ember,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 8,
  },
  sparkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.emberSoft,
    borderColor: colors.ember,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sparkPressed: { opacity: 0.75 },
  sparkIcon: { fontSize: 30 },
  sparkTextWrap: { flex: 1 },
  sparkTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  partnerWeather: { marginTop: spacing.md },
});
