/**
 * A dependency-free 0–100 slider: drag or tap anywhere on the track.
 */
import React, { useRef, useState } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  label: string;
  lowHint: string;
  highHint: string;
  value: number;
  onChange: (value: number) => void;
}

const THUMB = 28;

export function CheckinSlider({ label, lowHint, highHint, value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const trackRef = useRef<View>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Position math uses pageX against the track's measured window position:
  // works for touch AND mouse (locationX is unreliable on react-native-web,
  // where the event target can be a child of the track).
  const setFromPageX = (pageX: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const x = pageX - trackLeftRef.current;
    const next = Math.round(Math.min(100, Math.max(0, (x / w) * 100)));
    onChangeRef.current(next);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The surrounding ScrollView must not steal a drag mid-slide.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const pageX = evt.nativeEvent.pageX;
        // Re-measure on every grant: the screen may have scrolled since layout.
        trackRef.current?.measureInWindow((x, _y, width) => {
          trackLeftRef.current = x;
          if (width > 0) trackWidthRef.current = width;
          setFromPageX(pageX);
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        setFromPageX(evt.nativeEvent.pageX);
      },
    }),
  ).current;

  const fillPct = `${value}%` as const;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View
        ref={trackRef}
        style={styles.track}
        onLayout={(e) => {
          setTrackWidth(e.nativeEvent.layout.width);
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <View style={styles.trackBase} />
        <View style={[styles.fill, { width: fillPct }]} />
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: (value / 100) * trackWidth - THUMB / 2 },
            ]}
          />
        )}
      </View>
      <View style={styles.hintRow}>
        <Text style={styles.hint}>{lowHint}</Text>
        <Text style={styles.hint}>{highHint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  value: { color: colors.ember, fontSize: 16, fontWeight: '700' },
  track: {
    height: 34, // generous touch target; the visible bar is the fill inside
    justifyContent: 'center',
  },
  trackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.cardRaised,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.ember,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    borderWidth: 3,
    borderColor: colors.ember,
  },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { color: colors.muted, fontSize: 12 },
});
