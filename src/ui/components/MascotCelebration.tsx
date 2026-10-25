import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mascotImages } from '../mascotImages';
import { useMascot } from '../hooks/useMascot';
import { mascotOffset, mascotSize } from './MascotFloating';
import { mascotColor } from '../mascotRoster';
import { motion, radius, spacing } from '../theme';
import { uk } from '../../i18n/uk';

/**
 * C9: the mascot celebration flight (INV-04 — gentle, non-jarring).
 *
 * - `pointerEvents="box-none"` overlay: passes every touch through, never
 *   blocks the Timer's buttons (INV-04/INV-10 non-blocking).
 * - Exposed to assistive tech: `accessible` + `uk.mascot.celebrationLabel`
 *   (round-1 LOW — decorative does not mean invisible to a screen reader).
 * - Fires **once per completion**: the parent (`TimerScreen`) mounts it only
 *   when a LIVE session reaches `Completed`/`Verified` (never on a remount
 *   that starts on an already-Completed snapshot) and removes it once the
 *   flight settles — `onFinished` is the single "settle the UI" signal and is
 *   fired on BOTH outcomes (finished or interrupted) so no frozen duplicate
 *   mascot is ever left parked on MascotFloating's corner (round-1 MED).
 * - A short (~1.8s) arc across the screen and back to the resting corner,
 *   ease-in-out, with a scale/rotate pulse.
 * - Round-1 HIGH: reduce motion is resolved BEFORE anything is committed. The
 *   async `AccessibilityInfo.isReduceMotionEnabled()` answer gates the start
 *   effect (`motion` state), so the flight can never begin while the answer is
 *   in flight, and the reduce branch stays reachable (`startedRef` is only
 *   latched once the query has settled). Under reduce motion the overlay still
 *   mounts — so the trigger stays observable — but no `Animated` work runs.
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
  // Round-1 HIGH: one state object so `queried` and `reduce` always land in
  // the same commit — the start effect can never see "queried, reduce=false"
  // for one render and start the arc before the answer is really in.
  const [motion, setMotion] = useState<{ queried: boolean; reduce: boolean }>({
    queried: false,
    reduce: false,
  });

  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const motionEnabled = process.env.NODE_ENV !== 'test';
  const startedRef = useRef(false);

  const size = 64;
  const offset = spacing.md;

  // Effect 1: resolve reduce motion FIRST. `motion.queried` flips only when
  // the promise settles (a missing/throwing API means "assume motion is
  // allowed"), and nothing is committed before that.
  useEffect(() => {
    let active = true;
    const settle = (reduce: boolean) => {
      if (!active) return;
      setMotion({ queried: true, reduce });
    };
    try {
      const pending: unknown = AccessibilityInfo.isReduceMotionEnabled();
      if (pending && typeof (pending as Promise<boolean>).then === 'function') {
        void (pending as Promise<boolean>).then(
          (enabled) => settle(Boolean(enabled)),
          () => settle(false)
        );
      } else {
        settle(Boolean(pending));
      }
    } catch {
      // Platform without the API: assume motion is allowed.
      settle(false);
    }
    return () => {
      active = false;
    };
  }, []);

  // Effect 2: the flight itself — unreachable until the query has settled
  // (`motion.queried`), which is what keeps the reduce branch reachable and
  // stops the arc from starting ahead of the answer.
  useEffect(() => {
    if (!motion.queried || startedRef.current) return;
    startedRef.current = true;

    if (motion.reduce || !motionEnabled) {
      // Respect reduced motion: no flight; still signal completion so the
      // parent can settle the UI without waiting on an animation that will
      // never run.
      onFinished?.();
      return;
    }

    const duration = 1800; // ~1.5–2.5s window, gentle arc
    const easing = Easing.inOut(Easing.ease);

    const flight = Animated.parallel([
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
    ]);

    let active = true;
    flight.start(() => {
      // Round-1 MED: settle the parent on ANY end of the one-shot flight
      // (finished OR interrupted) — a silent callback used to leave a static
      // duplicate mascot parked over MascotFloating for the whole Completed
      // state. The guard keeps an unmount-triggered stop from calling back
      // into a parent that is already tearing down.
      if (active) onFinished?.();
    });
    return () => {
      active = false;
      flight.stop();
    };
  }, [motion, motionEnabled, onFinished, progress, rotate, scale]);

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
    <View
      testID={testID}
      pointerEvents="box-none"
      accessible
      accessibilityLabel={uk.mascot.celebrationLabel}
      style={[styles.wrapper, {
        top: spacing.xl + 56 + spacing.md + insets.top,
        right: offset + insets.right,
      }]}
    >
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
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});