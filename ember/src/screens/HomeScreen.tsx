import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Card } from '../components/Card';
import { GlowOrb } from '../components/GlowOrb';
import { WEATHER_META, WeatherPicker } from '../components/WeatherPicker';
import { partnerUid } from '../lib/couple';
import { sendPush } from '../lib/push';
import {
  connectLive,
  setWeather,
  subscribeStatus,
  type LiveConnection,
} from '../lib/status';
import type { MemberStatus, Session, Weather } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
}

export function HomeScreen({ session }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);
  const partnerName = pUid ? couple.names[pUid] ?? 'Your person' : null;

  const [myStatus, setMyStatus] = useState<MemberStatus | null>(null);
  const [partnerStatus, setPartnerStatus] = useState<MemberStatus | null>(null);
  const [partnerHere, setPartnerHere] = useState(false);
  const [sparkPulse, setSparkPulse] = useState(0);
  const connRef = useRef<LiveConnection | null>(null);

  // The live channel: our presence (tracked while foregrounded), the
  // partner's presence, and incoming sparks.
  useEffect(() => {
    const conn = connectLive(coupleId, uid, {
      onPartnerPresence: setPartnerHere,
      onSpark: () => {
        setSparkPulse((p) => p + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
    });
    connRef.current = conn;
    const sub = AppState.addEventListener('change', (state) => {
      conn.setActive(state === 'active');
    });
    return () => {
      sub.remove();
      connRef.current = null;
      conn.close();
    };
  }, [coupleId, uid]);

  useEffect(() => subscribeStatus(coupleId, uid, setMyStatus), [coupleId, uid]);
  useEffect(() => {
    if (!pUid) return;
    return subscribeStatus(coupleId, pUid, setPartnerStatus);
  }, [coupleId, pUid]);

  const onSpark = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    connRef.current?.sendSpark(); // lands live if their app is open…
    sendPush(coupleId, 'spark'); // …and as a notification if it isn't.
  };

  const onWeather = (w: Weather) => {
    setWeather(coupleId, uid, w).catch(() => {});
  };

  const shareCode = () => {
    Share.share({
      message: `Join me on Ember — our own little space. Code: ${couple.code}`,
    }).catch(() => {
      // No share sheet (desktop browser): copy instead.
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(couple.code).catch(() => {});
      }
    });
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
            <Text style={type.small}>tap to share</Text>
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
            <WeatherPicker value={myStatus?.weather ?? undefined} onSelect={onWeather} />
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
