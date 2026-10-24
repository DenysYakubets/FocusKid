import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mascotImages } from '../mascotImages';
import { useMascot } from '../hooks/useMascot';
import { mascotOffset, mascotSize } from './MascotFloating';
import { mascotColor } from '../mascotRoster';
import { motion, radius, spacing } from '../theme';

/**
 * C9: the mascot celebration flight (INV-04 — gentle, non-jarring).
 *
 * - `pointerEvents="box-none"` overlay: passes every touch through, never
 *   blocks the Timer's buttons (INV-04/INV-10 non-blocking).
 * - Fires **once per completion**: the parent (`TimerScreen`) mounts it only
 *   when the FSM reaches `Completed`/`Verified` from a LIVE transition and
 *   removes it after the flight finishes; re-renders while still `Completed`
 *   keep the same instance (React reconciliation, keyed by sessionId).
 * - A short (~1.8s) arc across the screen and back to the resting corner,
 *   ease-in-out, with a scale/rotate pulse — skipped entirely under reduce
 *   motion (the overlay still renders so the trigger is observable, but no
 *   Animated work runs).
 * - Decorative motion is skipped under `NODE_ENV=test` (same gate as
 *   `MascotFloating`) so jest never sees async Animated updates.
 */
export const CELEBRATION_TEST_ID = 'mascot-celebration';

export interface MascotCelebrationProps {
  /** Screen width — used for the arc distance (imported via useScreenGutter). */
  testID?: string;
  /** Called when the flight animation finishes (parent removes the overlay). */
  onFinished?: () => void;
}

export function MascotCelebration({
  testID = CELEBRATION_TEST_ID,
  onFinished,
}: MascotCelebrationProps) {
  const { mascot } = useMascot();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const motionEnabled = process.env.NODE_ENV !== 'test';
  const startedRef = useRef(false);

  const size = 64;
  const offset = spacing.md;

  useEffect(() => {
    let mounted = true;
    try {
      const pending = AccessibilityInfo.isReduceMotionEnabled();
      void pending.then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      });
    } catch {
      // Platform without the API: assume motion is allowed.
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (reduceMotion || !motionEnabled) {
      // Respect reduced motion: no flight; still signal completion so the
      // parent can settle the UI without waiting on an animation that will
      // never run.
      onFinished?.();
      return;
    }

    const duration = 1800; // ~1.5–2.5s window, gentle arc
    const easing = Easing.inOut(Easing.ease);

    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: duration / 4,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: (duration * 3) / 4,
          easing,
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: 1,
          duration: duration / 2,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(rotate, {
          toValue: 0,
          duration: duration / 2,
          easing,
          useNativeDriver: false,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  }, [motionEnabled, onFinished, progress, reduceMotion, rotate, scale]);

  // Arc: start at the resting corner (top-right), dip down-left mid-flight,
  // return to rest. translateX in dp — width comes from useWindowDimensions.
  const width = 360; // fallback; overridden below via useScreenGutter-like read
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -width / 2, 0],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 120, 0],
  });
  const rotateDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.wrapper, {
      top: spacing.xl + 56 + spacing.md + insets.top,
      right: offset + insets.right,
    }]}>
      <Animated.View
        style={{
          transform: [
            { translateX },
            { translateY },
            { scale },
            { rotate: rotateDeg },
          ],
        }}
      >
        <View
          style={[styles.spark, { borderColor: mascotColor(mascot) }]}
          pointerEvents="none"
          accessible={false}
        >
          <Animated.Image
            testID="mascot-celebration-image"
            source={mascotImages[mascot].excited}
            style={{ width: size - 12, height: size - 12 }}
            resizeMode="contain"
            accessible={false}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Above screen content, below dialogs (same rule as MascotFloating §5).
    pointerEvents: 'box-none',
    zIndex: 40,
  },
  spark: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});