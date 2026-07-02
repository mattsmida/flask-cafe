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
import { monthKey } from '../lib/dates';
import {
  daysUntilUnlock,
  isUnlocked,
  promptForMonth,
  subscribeLetters,
  writeLetter,
} from '../lib/letters';
import type { Letter, Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  session: Session;
}

export function LettersScreen({ session }: Props) {
  const { uid, coupleId, couple } = session;
  const pUid = partnerUid(session);
  const thisMonth = monthKey();

  const [letters, setLetters] = useState<Letter[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeLetters(coupleId, setLetters), [coupleId]);

  const mineThisMonth = letters.find((l) => l.uid === uid && l.month === thisMonth);
  const partnerName = (pUid && couple.names[pUid]) || 'Them';

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await writeLetter(coupleId, uid, draft.trim());
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (letterUid: string) =>
    letterUid === uid ? 'You' : couple.names[letterUid] ?? partnerName;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Future letters</Text>
        <Text style={[type.dim, styles.lede]}>
          Once a month, write to your future selves. Every letter stays sealed
          for three months — even from you.
        </Text>

        <Card title="This month’s prompt">
          <Text style={styles.prompt}>{promptForMonth(thisMonth)}</Text>
          {mineThisMonth ? (
            <View style={styles.sealedNote}>
              <Text style={styles.sealedIcon}>🔒</Text>
              <Text style={[type.dim, styles.sealedText]}>
                Yours is sealed. It unlocks in {daysUntilUnlock(mineThisMonth)} days.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.letterInput}
                placeholder="Dear us, three months from now…"
                placeholderTextColor={colors.muted}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
              />
              <Button
                label="Seal it for three months"
                onPress={send}
                busy={busy}
                disabled={!draft.trim()}
              />
            </>
          )}
        </Card>

        {letters.length > 0 && (
          <Text style={[type.heading, styles.archiveTitle]}>The vault</Text>
        )}
        {letters.map((letter) => {
          const unlocked = isUnlocked(letter);
          return (
            <Card key={`${letter.month}_${letter.uid}`}>
              <View style={styles.vaultHeader}>
                <Text style={styles.vaultMonth}>
                  {letter.month} · {nameOf(letter.uid)}
                </Text>
                <Text style={styles.vaultLock}>{unlocked ? '🔓' : '🔒'}</Text>
              </View>
              {unlocked ? (
                <>
                  <Text style={[type.small, styles.vaultPrompt]}>{letter.prompt}</Text>
                  <Text style={type.body}>{letter.text}</Text>
                </>
              ) : (
                <Text style={type.dim}>
                  Sealed — opens in {daysUntilUnlock(letter)} days.
                </Text>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  lede: { marginTop: spacing.xs, marginBottom: spacing.md },
  prompt: { ...type.body, fontStyle: 'italic', marginBottom: spacing.md },
  letterInput: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    minHeight: 140,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  sealedNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sealedIcon: { fontSize: 22 },
  sealedText: { flex: 1 },
  archiveTitle: { marginTop: spacing.sm, marginBottom: spacing.md },
  vaultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  vaultMonth: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  vaultLock: { fontSize: 16 },
  vaultPrompt: { marginBottom: spacing.sm, fontStyle: 'italic' },
});
