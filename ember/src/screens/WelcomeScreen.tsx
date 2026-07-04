import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { createCouple, joinCouple } from '../lib/couple';
import type { Session } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  onSession: (session: Session) => void;
}

export function WelcomeScreen({ onSession }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'create' | 'join') => {
    if (!name.trim()) {
      setError('Tell the app your name first.');
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      const session =
        kind === 'create'
          ? await createCouple(name.trim())
          : await joinCouple(code, name.trim());
      onSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>🔥</Text>
        <Text style={type.title}>Ember</Text>
        <Text style={[type.dim, styles.lede]}>
          A small warm place for the two of you, across any distance.
        </Text>

        <Card title="Who are you?">
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </Card>

        <Card title="Start your space">
          <Text style={[type.dim, styles.cardText]}>
            Create the space and you’ll get a code to send to your person.
          </Text>
          <Button
            label="Create our space"
            onPress={() => run('create')}
            busy={busy === 'create'}
            disabled={busy !== null}
          />
        </Card>

        <Card title="Or join theirs">
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="ABC123"
            placeholderTextColor={colors.muted}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          <Button
            label="Join with code"
            variant="ghost"
            onPress={() => run('join')}
            busy={busy === 'join'}
            disabled={busy !== null || code.trim().length < 6}
          />
        </Card>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 72, paddingBottom: 48 },
  logo: { fontSize: 44 },
  lede: { marginTop: spacing.xs, marginBottom: spacing.lg },
  cardText: { marginBottom: spacing.md },
  input: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  codeInput: {
    letterSpacing: 6,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: { color: colors.danger, marginTop: spacing.sm, fontSize: 15 },
});
