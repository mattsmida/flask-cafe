import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { loadSession, subscribeCouple } from './src/lib/couple';
import { syncPushSubscription } from './src/lib/push';
import { isSupabaseConfigured } from './src/lib/supabase';
import type { Session } from './src/lib/types';
import { CheckinScreen } from './src/screens/CheckinScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LettersScreen } from './src/screens/LettersScreen';
import { QuestionScreen } from './src/screens/QuestionScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { UsScreen } from './src/screens/UsScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { colors } from './src/theme';

type Tab = 'today' | 'checkin' | 'question' | 'letters' | 'us';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'today', icon: '🔥', label: 'Today' },
  { key: 'checkin', icon: '🌡️', label: 'Check-in' },
  { key: 'question', icon: '💬', label: 'Question' },
  { key: 'letters', icon: '✉️', label: 'Letters' },
  { key: 'us', icon: '🫶', label: 'Us' },
];

export default function App() {
  const configured = isSupabaseConfigured();
  const [booting, setBooting] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    if (!configured) return;
    loadSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setBooting(false));
  }, [configured]);

  // Keep couple metadata live (partner joining, names changing).
  const coupleId = session?.coupleId;
  const uid = session?.uid;
  useEffect(() => {
    if (!coupleId) return;
    return subscribeCouple(coupleId, (couple) => {
      setSession((prev) => (prev ? { ...prev, couple } : prev));
    });
  }, [coupleId]);

  // Push endpoints rotate; keep the stored subscription fresh (web no-ops
  // unless notifications were already enabled).
  useEffect(() => {
    if (coupleId && uid) syncPushSubscription(coupleId, uid);
  }, [coupleId, uid]);

  let body: React.ReactNode;
  if (!configured) {
    body = <SetupScreen />;
  } else if (booting) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ember} size="large" />
      </View>
    );
  } else if (!session) {
    body = <WelcomeScreen onSession={setSession} />;
  } else {
    body = (
      <View style={styles.appWrap}>
        <View style={styles.screenWrap}>
          {tab === 'today' && <HomeScreen session={session} />}
          {tab === 'checkin' && <CheckinScreen session={session} />}
          {tab === 'question' && <QuestionScreen session={session} />}
          {tab === 'letters' && <LettersScreen session={session} />}
          {tab === 'us' && (
            <UsScreen
              session={session}
              onLeft={() => {
                setSession(null);
                setTab('today');
              }}
            />
          )}
        </View>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabIcon, !active && styles.tabIconInactive]}>
                  {t.icon}
                </Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.shell}>{body}</View>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // On desktop browsers the app lives in a centered phone-width column;
  // on actual phones maxWidth never bites.
  shell: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appWrap: { flex: 1 },
  screenWrap: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20 },
  tabIconInactive: { opacity: 0.4 },
  tabLabel: { fontSize: 10, color: colors.muted },
  tabLabelActive: { color: colors.ember, fontWeight: '700' },
});
