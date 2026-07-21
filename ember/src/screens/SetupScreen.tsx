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
        Ember needs a (free) Supabase project to sync between your two devices.
        One of you does this once — it takes about five minutes.
      </Text>
      <Card>
        <Text style={type.body}>
          1. Go to supabase.com, sign up, and create a new project (pick a
          region close to the two of you).
        </Text>
        <Text style={styles.step}>
          2. Open the SQL Editor, paste the whole of ember/supabase/schema.sql,
          and Run it.
        </Text>
        <Text style={styles.step}>
          3. In Project Settings → API, copy the Project URL and the anon
          public key into ember/src/config/supabaseConfig.ts.
        </Text>
        <Text style={styles.step}>
          4. Restart the app. (Push notifications need one more step — see the
          README when you’re ready.)
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
