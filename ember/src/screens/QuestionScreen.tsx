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
import { partnerUid } from '../lib/couple';
import { todayKey } from '../lib/dates';
import { questionForDate, submitAnswer, subscribeAnswers } from '../lib/questions';
import type { Answer, Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
}

export function QuestionScreen({ session }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);
  const today = todayKey();
  const question = questionForDate(coupleId, today);

  const [answers, setAnswers] = useState<Answer[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(
    () => subscribeAnswers(coupleId, today, setAnswers),
    [coupleId, today],
  );

  const mine = answers.find((a) => a.uid === uid);
  const theirs = answers.find((a) => a.uid !== uid);
  const partnerName = (pUid && couple.names[pUid]) || 'Them';
  const bothIn = !!mine && !!theirs;

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await submitAnswer(coupleId, uid, today, draft.trim());
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Daily question</Text>
        <Text style={[type.dim, styles.lede]}>
          You both answer blind — nothing is revealed until both answers are in.
        </Text>

        <Card>
          <Text style={styles.question}>{question}</Text>
        </Card>

        {!mine ? (
          <Card title="Your answer">
            <TextInput
              style={styles.answerInput}
              placeholder="Write it the way you’d say it…"
              placeholderTextColor={colors.muted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={600}
            />
            <Button
              label="Seal my answer"
              onPress={send}
              busy={busy}
              disabled={!draft.trim()}
            />
            <Text style={[type.small, styles.sealHint]}>
              Once sealed it can’t be edited — that’s the game.
            </Text>
          </Card>
        ) : (
          <>
            <Card title="You wrote">
              <Text style={type.body}>{mine.text}</Text>
            </Card>
            {bothIn ? (
              <Card title={`${partnerName} wrote`}>
                <Text style={type.body}>{theirs!.text}</Text>
              </Card>
            ) : (
              <Card>
                <View style={styles.waiting}>
                  <Text style={styles.waitingIcon}>🕯️</Text>
                  <Text style={[type.dim, styles.waitingText]}>
                    Sealed. You’ll both see each other’s answers the moment{' '}
                    {partnerName} answers too.
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  lede: { marginTop: spacing.xs, marginBottom: spacing.md },
  question: { ...type.heading, lineHeight: 27 },
  answerInput: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  sealHint: { marginTop: spacing.sm, textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waitingIcon: { fontSize: 26 },
  waitingText: { flex: 1 },
});
