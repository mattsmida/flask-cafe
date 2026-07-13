/**
 * 14-day check-in history: three small multiples (energy / heart /
 * connection), two series — you (ember) and your partner (violet).
 *
 * Chart rules followed here: color identifies the person and never changes;
 * one shared 0–100 scale per strip; thin baseline-anchored bars with rounded
 * ends and a surface gap between the pair; a legend for the two series; and a
 * tap-to-read layer (tap a day to see exact values and words) standing in for
 * hover tooltips on touch screens.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HISTORY_DAYS } from '../lib/checkins';
import { lastNDayKeys, shortDayLabel } from '../lib/dates';
import type { Checkin } from '../lib/types';
import { colors, radius, spacing } from '../theme';

type MetricKey = 'energy' | 'heart' | 'connection';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'energy', label: 'Energy' },
  { key: 'heart', label: 'Heart' },
  { key: 'connection', label: 'Connection' },
];

const BAR_MAX = 30;

interface Props {
  checkins: Checkin[];
  selfPersonId: string;
  selfName: string;
  partnerName: string;
}

export function TrendStrips({ checkins, selfPersonId, selfName, partnerName }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const days = useMemo(() => lastNDayKeys(HISTORY_DAYS), []);

  const byDay = useMemo(() => {
    const map = new Map<string, { self?: Checkin; partner?: Checkin }>();
    for (const day of days) map.set(day, {});
    for (const c of checkins) {
      const slot = map.get(c.date);
      if (!slot) continue;
      if (c.personId === selfPersonId) slot.self = c;
      else slot.partner = c;
    }
    return map;
  }, [checkins, days, selfPersonId]);

  const selected = selectedDay ? byDay.get(selectedDay) : undefined;

  return (
    <View>
      <View style={styles.legend}>
        <LegendChip color={colors.ember} label={selfName} />
        <LegendChip color={colors.violet} label={partnerName} />
      </View>

      {METRICS.map((metric) => (
        <View key={metric.key} style={styles.strip}>
          <Text style={styles.stripLabel}>{metric.label}</Text>
          <View style={styles.barRow}>
            {days.map((day) => {
              const slot = byDay.get(day)!;
              const isSelected = selectedDay === day;
              return (
                <Pressable
                  key={day}
                  style={[styles.daySlot, isSelected && styles.daySelected]}
                  onPress={() => setSelectedDay(isSelected ? null : day)}
                >
                  <Bar value={slot.self?.[metric.key]} color={colors.ember} />
                  <Bar value={slot.partner?.[metric.key]} color={colors.violet} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.baseline} />
        </View>
      ))}

      <View style={styles.axisRow}>
        <Text style={styles.axisText}>{shortDayLabel(days[0])}</Text>
        <Text style={styles.axisText}>today</Text>
      </View>

      {selectedDay && (
        <View style={styles.readout}>
          <Text style={styles.readoutTitle}>{shortDayLabel(selectedDay)}</Text>
          <ReadoutLine
            name={selfName}
            color={colors.ember}
            checkin={selected?.self}
          />
          <ReadoutLine
            name={partnerName}
            color={colors.violet}
            checkin={selected?.partner}
          />
        </View>
      )}
    </View>
  );
}

function Bar({ value, color }: { value?: number; color: string }) {
  if (value === undefined) {
    return <View style={styles.barEmpty} />;
  }
  const h = Math.max(3, (value / 100) * BAR_MAX);
  return <View style={[styles.bar, { height: h, backgroundColor: color }]} />;
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendChip}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ReadoutLine({
  name,
  color,
  checkin,
}: {
  name: string;
  color: string;
  checkin?: Checkin;
}) {
  return (
    <View style={styles.readoutLine}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.readoutText}>
        {checkin
          ? `${name}: energy ${checkin.energy} · heart ${checkin.heart} · connection ${checkin.connection}` +
            (checkin.word ? ` · “${checkin.word}”` : '')
          : `${name}: no check-in`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textDim, fontSize: 13 },

  strip: { marginBottom: spacing.sm },
  stripLabel: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX + 6,
    gap: 3,
  },
  daySlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2, // surface gap between the two people's bars
    paddingTop: 6,
    borderRadius: 4,
  },
  daySelected: { backgroundColor: colors.cardRaised },
  bar: {
    width: 5,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  barEmpty: {
    width: 5,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.hairline,
  },
  baseline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },

  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  axisText: { color: colors.muted, fontSize: 11 },

  readout: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.cardRaised,
    gap: 4,
  },
  readoutTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  readoutLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readoutText: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
});
