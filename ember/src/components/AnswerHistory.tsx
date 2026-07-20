/**
 * The Question tab's look-back list: past days' questions with both sealed
 * answers, newest first. Mounts only when the user opens it and reads a
 * page at a time, so today's answer flow never waits on any of this.
 * Strictly read-only — sealed answers stay sealed, we're just rereading.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { partnerPersonId } from '../lib/couple';
import { daysAgoKey, prettyDayLabel, todayKey } from '../lib/dates';
import { fetchAnswerHistory, questionForDate } from '../lib/questions';
import type { Answer, Session } from '../lib/types';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';
import { Card } from './Card';

interface Props {
  session: Session;
}

interface HistoryDay {
  date: string;
  mine?: Answer;
  theirs?: Answer;
}

export function AnswerHistory({ session }: Props) {
  const { coupleId, personId, couple } = session;
  const pId = partnerPersonId(session);
  const partnerName = (pId && couple.names[pId]) || 'Them';

  const [answers, setAnswers] = useState<Answer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadPage = useCallback(
    async (before: string) => {
      setBusy(true);
      setFailed(false);
      try {
        const page = await fetchAnswerHistory(coupleId, before);
        setAnswers((prev) => {
          // Pages can overlap by one day (see fetchAnswerHistory).
          const seen = new Set(prev.map((a) => `${a.date}_${a.personId}`));
          return [
            ...prev,
            ...page.answers.filter((a) => !seen.has(`${a.date}_${a.personId}`)),
          ];
        });
        setCursor(page.nextBefore);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [coupleId],
  );

  useEffect(() => {
    setAnswers([]);
    setCursor(null);
    void loadPage(todayKey());
  }, [loadPage]);

  // Rows arrive newest-day-first, so insertion order here is already the
  // display order.
  const byDate = new Map<string, HistoryDay>();
  for (const a of answers) {
    let day = byDate.get(a.date);
    if (!day) {
      day = { date: a.date };
      byDate.set(a.date, day);
    }
    if (a.personId === personId) day.mine = a;
    else day.theirs = a;
  }
  const days = [...byDate.values()];
  const yesterday = daysAgoKey(1);

  if (busy && answers.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ember} />
      </View>
    );
  }

  if (failed && answers.length === 0) {
    return (
      <Card>
        <Text style={[type.dim, styles.notice]}>
          Couldn’t reach your history just now.
        </Text>
        <Button
          variant="ghost"
          label="Try again"
          onPress={() => void loadPage(todayKey())}
        />
      </Card>
    );
  }

  if (answers.length === 0) {
    return (
      <Card>
        <Text style={type.dim}>
          Nothing to look back on yet — once today becomes yesterday, the
          answers you’ve sealed start gathering here.
        </Text>
      </Card>
    );
  }

  return (
    <View>
      {days.map((day) => (
        <Card key={day.date}>
          <Text style={styles.dayLabel}>
            {day.date === yesterday ? 'Yesterday' : prettyDayLabel(day.date)}
          </Text>
          <Text style={styles.question}>{questionForDate(coupleId, day.date)}</Text>
          {day.mine && (
            <View style={styles.answer}>
              <Text style={[styles.speaker, styles.speakerYou]}>You</Text>
              <Text style={type.body}>{day.mine.text}</Text>
            </View>
          )}
          {day.theirs ? (
            <View style={styles.answer}>
              <Text style={[styles.speaker, styles.speakerThem]}>{partnerName}</Text>
              <Text style={type.body}>{day.theirs.text}</Text>
            </View>
          ) : (
            <Text style={[type.small, styles.noAnswer]}>
              {partnerName} didn’t answer this one.
            </Text>
          )}
        </Card>
      ))}
      {failed && (
        <Text style={[type.small, styles.notice]}>
          Couldn’t load more just now — give it another try.
        </Text>
      )}
      {cursor && (
        <Button
          variant="ghost"
          label="Show earlier days"
          busy={busy}
          onPress={() => void loadPage(cursor)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.lg, alignItems: 'center' },
  notice: { textAlign: 'center', marginBottom: spacing.sm },
  dayLabel: { color: colors.textDim, fontSize: 14, fontWeight: '600', marginBottom: spacing.xs },
  question: { ...type.dim, fontStyle: 'italic', marginBottom: spacing.md },
  answer: { marginBottom: spacing.sm },
  speaker: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  speakerYou: { color: colors.ember },
  speakerThem: { color: colors.violet },
  noAnswer: { fontStyle: 'italic' },
});
