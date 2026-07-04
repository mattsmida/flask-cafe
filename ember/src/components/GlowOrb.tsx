/**
 * The quiet heart of the home screen: an orb that breathes softly when the
 * partner is present, flares when a spark arrives, and rests dim otherwise.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  presence: boolean;
  /** Bump this number to trigger a one-shot spark flare. */
  sparkPulse: number;
  caption: string;
}

export function GlowOrb({ presence, sparkPulse, caption }: Props) {
  const breath = useRef(new Animated.Value(0)).current;
  const flare = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!presence) {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [presence, breath]);

  useEffect(() => {
    if (sparkPulse === 0) return;
    flare.setValue(1);
    Animated.timing(flare, {
      toValue: 0,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [sparkPulse, flare]);

  const haloScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const haloOpacity = presence
    ? breath.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] })
    : 0.08;
  const flareScale = flare.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });

  return (
    <View style={styles.wrap}>
      <View style={styles.stack}>
        <Animated.View
          style={[
            styles.halo,
            { opacity: haloOpacity, transform: [{ scale: haloScale }] },
          ]}
        />
        <Animated.View
          style={[styles.flare, { opacity: flare, transform: [{ scale: flareScale }] }]}
        />
        <View style={[styles.core, presence && styles.corePresent]}>
          <Text style={styles.coreIcon}>{presence ? '🔥' : '🕯️'}</Text>
        </View>
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const ORB = 96;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  stack: {
    width: ORB * 1.9,
    height: ORB * 1.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: ORB * 1.7,
    height: ORB * 1.7,
    borderRadius: ORB,
    backgroundColor: colors.glow,
  },
  flare: {
    position: 'absolute',
    width: ORB * 1.4,
    height: ORB * 1.4,
    borderRadius: ORB,
    backgroundColor: colors.ember,
  },
  core: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corePresent: { borderColor: colors.glow },
  coreIcon: { fontSize: 36 },
  caption: { color: colors.textDim, fontSize: 14, marginTop: 4 },
});
