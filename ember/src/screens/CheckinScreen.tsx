import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CheckinSlider } from '../components/CheckinSlider';
import { TrendStrips } from '../components/TrendStrips';
import { saveCheckin, subscribeRecentCheckins } from '../lib/checkins';
import { partnerUid } from '../lib/couple';
import { todayKey } from '../lib/dates';
import { notifyPartner } from '../lib/push';
import type { Checkin, Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
}

export function CheckinScreen({ session }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);
  const today = todayKey();

  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [energy, setEnergy] = useState(50);
  const [heart, setHeart] = useState(50);
  const [connection, setConnection] = useState(50);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedToday, setSavedToday] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(
    () => subscribeRecentCheckins(coupleId, setCheckins),
    [coupleId],
  );

  // Reflect an existing check-in for today (e.g. reopening the app).
  useEffect(() => {
    const mine = checkins.find((c) => c.uid === uid && c.date === today);
    if (mine && !editing) {
      setEnergy(mine.energy);
      setHeart(mine.heart);
      setConnection(mine.connection);
      setWord(mine.word);
      setSavedToday(true);
    }
  }, [checkins, uid, today, editing]);

  const partnerToday = pUid
    ? checkins.find((c) => c.uid === pUid && c.date === today)
    : undefined;

  const save = async () => {
    setBusy(true);
    try {
      await saveCheckin(coupleId, uid, today, {
        energy,
        heart,
        connection,
        word: word.trim(),
      });
      // Only the first save of the day pings the partner — edits stay quiet.
      if (!savedToday) notifyPartner(coupleId, 'checkin');
      setSavedToday(true);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const selfName = couple.names[uid] ?? 'You';
  const partnerName = (pUid && couple.names[pUid]) || 'Them';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Check-in</Text>
        <Text style={[type.dim, styles.lede]}>
          Ten seconds of honesty. Three sliders, one word.
        </Text>

        <Card>
          {savedToday && !editing ? (
            <View>
              <Text style={styles.doneTitle}>Today is in ✓</Text>
              <Text style={type.dim}>
                Energy {energy} · Heart {heart} · Connection {connection}
                {word ? ` · “${word}”` : ''}
              </Text>
              <View style={styles.editRow}>
                <Button label="Edit" variant="ghost" onPress={() => setEditing(true)} />
              </View>
            </View>
          ) : (
            <View>
              <CheckinSlider
                label="Energy"
                lowHint="drained"
                highHint="charged"
                value={energy}
                onChange={setEnergy}
              />
              <CheckinSlider
                label="Heart"
                lowHint="heavy"
                highHint="light"
                value={heart}
                onChange={setHeart}
              />
              <CheckinSlider
                label="Connection"
                lowHint="far away"
                highHint="close"
                value={connection}
                onChange={setConnection}
              />
              <TextInput
                style={styles.wordInput}
                placeholder="One word for today"
                placeholderTextColor={colors.muted}
                value={word}
                onChangeText={setWord}
                maxLength={24}
              />
              <Button label="Save today’s check-in" onPress={save} busy={busy} />
            </View>
          )}
        </Card>

        {partnerToday ? (
          <Card title={`${partnerName} today`}>
            <Text style={type.dim}>
              Energy {partnerToday.energy} · Heart {partnerToday.heart} · Connection{' '}
              {partnerToday.connection}
              {partnerToday.word ? ` · “${partnerToday.word}”` : ''}
            </Text>
          </Card>
        ) : pUid ? (
          <Card>
            <Text style={type.dim}>{partnerName} hasn’t checked in yet today.</Text>
          </Card>
        ) : null}

        <Card title="The last two weeks">
          <TrendStrips
            checkins={checkins}
            selfUid={uid}
            selfName={selfName}
            partnerName={partnerName}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  lede: { marginTop: spacing.xs, marginBottom: spacing.md },
  doneTitle: { ...type.heading, color: colors.ember, marginBottom: spacing.sm },
  editRow: { marginTop: spacing.md },
  wordInput: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.md,
  },
});
