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
import { registerForPush, sendSparkPush } from '../lib/push';
import {
  beatHeart,
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_WINDOW_MS,
  savePushToken,
  sendSpark,
  setWeather,
  subscribeStatus,
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
  const [now, setNow] = useState(Date.now());
  const [sparkPulse, setSparkPulse] = useState(0);
  const lastSeenSparkRef = useRef<number | null>(null);

  // Own heartbeat while the app is foregrounded — this is the presence signal.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      beatHeart(coupleId, uid).catch(() => {});
      if (!interval) {
        interval = setInterval(
          () => beatHeart(coupleId, uid).catch(() => {}),
          HEARTBEAT_INTERVAL_MS,
        );
      }
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [coupleId, uid]);

  // A slow tick so "present" fades out without any new snapshot arriving.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => subscribeStatus(coupleId, uid, setMyStatus), [coupleId, uid]);
  useEffect(() => {
    if (!pUid) return;
    return subscribeStatus(coupleId, pUid, setPartnerStatus);
  }, [coupleId, pUid]);

  // Register for push once we're in a couple (no-op inside Expo Go).
  useEffect(() => {
    registerForPush().then((token) => {
      if (token) savePushToken(coupleId, uid, token).catch(() => {});
    });
  }, [coupleId, uid]);

  // Incoming spark: flare the orb once per new sparkAt.
  useEffect(() => {
    const at = partnerStatus?.sparkAt?.toMillis?.();
    if (!at) return;
    if (lastSeenSparkRef.current === null) {
      // First snapshot after mount: only celebrate reasonably fresh sparks.
      lastSeenSparkRef.current = at;
      if (Date.now() - at < 60_000) {
        setSparkPulse((p) => p + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      return;
    }
    if (at > lastSeenSparkRef.current) {
      lastSeenSparkRef.current = at;
      setSparkPulse((p) => p + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [partnerStatus?.sparkAt]);

  const partnerHere =
    !!partnerStatus?.lastActiveAt &&
    now - partnerStatus.lastActiveAt.toMillis() < PRESENCE_WINDOW_MS;

  const onSpark = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await sendSpark(coupleId, uid).catch(() => {});
    if (partnerStatus?.pushToken) {
      sendSparkPush(partnerStatus.pushToken, couple.names[uid] ?? 'Someone');
    }
  };

  const onWeather = (w: Weather) => {
    setWeather(coupleId, uid, w).catch(() => {});
  };

  const shareCode = () => {
    Share.share({
      message: `Join me on Ember — our own little space. Code: ${couple.code}`,
    }).catch(() => {});
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
