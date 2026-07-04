import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card } from '../components/Card';
import { colors, spacing, type } from '../theme';

/** Shown when supabaseConfig.ts still has placeholder values. */
export function SetupScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.logo}>🔥</Text>
      <Text style={type.title}>Almost there</Text>
      <Text style={[type.dim, styles.lede]}>
        Ember needs a (free) Supabase project to sync between the two of you.
        One of you does this once — it takes about five minutes.
      </Text>
      <Card>
        <Text style={type.body}>
          1. Go to supabase.com, create a project (pick a region close to you
          two).
        </Text>
        <Text style={styles.step}>
          2. Authentication → Sign In / Providers → enable “Anonymous
          sign-ins”.
        </Text>
        <Text style={styles.step}>
          3. SQL Editor → paste all of ember/supabase/schema.sql → Run.
        </Text>
        <Text style={styles.step}>
          4. Project Settings → API → copy the Project URL and anon public key
          into ember/src/config/supabaseConfig.ts.
        </Text>
        <Text style={styles.step}>
          5. Rebuild / reload the app. (Push notifications are a separate,
          optional step — see the README.)
        </Text>
      </Card>
      <Text style={type.small}>The full walkthrough is in ember/README.md.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 80 },
  logo: { fontSize: 48, marginBottom: spacing.md },
  lede: { marginTop: spacing.sm, marginBottom: spacing.lg },
  step: { ...type.body, marginTop: spacing.sm },
});
