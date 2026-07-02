import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Weather } from '../lib/types';
import { colors, radius, spacing } from '../theme';

export const WEATHER_META: Record<Weather, { icon: string; label: string }> = {
  sunny: { icon: '☀️', label: 'Sunny' },
  cloudy: { icon: '☁️', label: 'Cloudy' },
  stormy: { icon: '⛈️', label: 'Stormy' },
};

const OPTIONS: Weather[] = ['sunny', 'cloudy', 'stormy'];

interface Props {
  value?: Weather;
  onSelect: (w: Weather) => void;
}

export function WeatherPicker({ value, onSelect }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((w) => {
        const selected = value === w;
        return (
          <Pressable
            key={w}
            onPress={() => onSelect(w)}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <Text style={styles.icon}>{WEATHER_META[w].icon}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {WEATHER_META[w].label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: colors.ember,
    backgroundColor: colors.emberSoft,
  },
  icon: { fontSize: 28, marginBottom: 4 },
  label: { color: colors.textDim, fontSize: 13 },
  labelSelected: { color: colors.text, fontWeight: '600' },
});
