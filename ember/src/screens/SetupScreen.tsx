import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card } from '../components/Card';
import { colors, spacing, type } from '../theme';

/** Shown when firebaseConfig.ts still has placeholder values. */
export function SetupScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.logo}>🔥</Text>
      <Text style={type.title}>Almost there</Text>
      <Text style={[type.dim, styles.lede]}>
        Ember needs a (free) Firebase project to sync between your two phones.
        One of you does this once — it takes about five minutes.
      </Text>
      <Card>
        <Text style={type.body}>1. Go to console.firebase.google.com and add a project.</Text>
        <Text style={styles.step}>2. Build → Authentication → enable “Anonymous”.</Text>
        <Text style={styles.step}>3. Build → Firestore Database → create database.</Text>
        <Text style={styles.step}>
          4. Project settings → Your apps → add a Web app, and copy the config
          values into ember/src/config/firebaseConfig.ts.
        </Text>
        <Text style={styles.step}>
          5. Paste the security rules from ember/firestore.rules into Firestore →
          Rules, then restart the app.
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
