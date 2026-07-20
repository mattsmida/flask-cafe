import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnswerHistory } from '../components/AnswerHistory';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { partnerPersonId } from '../lib/couple';
import { todayKey } from '../lib/dates';
import { notifyPartner } from '../lib/push';
import { questionForDate, submitAnswer, subscribeAnswers } from '../lib/questions';
import type { Answer, Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
}

export function QuestionScreen({ session }: Props) {
  const { personId, coupleId, couple } = session;
  const pId = partnerPersonId(session);
  const today = todayKey();
  const question = questionForDate(coupleId, today);

  const [answers, setAnswers] = useState<Answer[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(
    () => subscribeAnswers(coupleId, today, setAnswers),
    [coupleId, today],
  );

  const mine = answers.find((a) => a.personId === personId);
  const theirs = answers.find((a) => a.personId !== personId);
  const partnerName = (pId && couple.names[pId]) || 'Them';
  const bothIn = !!mine && !!theirs;

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await submitAnswer(coupleId, personId, today, draft.trim());
      notifyPartner(coupleId, 'answer');
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

        {/* The look-back lives below the fold and loads nothing until
            opened — today's blind answer flow above is untouched by it. */}
        <View style={styles.lookBack}>
          {showHistory ? (
            <>
              <View style={styles.lookBackHeader}>
                <Text style={type.heading}>Past questions</Text>
                <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
                  <Text style={styles.hideLink}>Hide</Text>
                </Pressable>
              </View>
              <AnswerHistory session={session} />
            </>
          ) : (
            <Button
              variant="ghost"
              label="Look back at past questions"
              onPress={() => setShowHistory(true)}
            />
          )}
        </View>
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
  lookBack: { marginTop: spacing.lg },
  lookBackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  hideLink: { ...type.small, color: colors.textDim },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waitingIcon: { fontSize: 26 },
  waitingText: { flex: 1 },
});
