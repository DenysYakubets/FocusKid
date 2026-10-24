import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TapTarget } from './TapTarget';
import { useMascot } from '../hooks/useMascot';
import { useScreenGutter } from '../hooks/useScreenGutter';
import { mascotImages } from '../mascotImages';
import { MascotMood, mascotColor, nextMood } from '../mascotRoster';
import {
  MIN_TOUCH_DP,
  colors,
  motion,
  radius,
  spacing,
} from '../theme';
import { uk } from '../../i18n/uk';

export type MascotCorner = 'bottom-right' | 'bottom-left' | 'top-right';

export interface MascotFloatingProps {
  /** Per-screen corner (MASCOT_DESIGN §6). Defaults to bottom-right. */
  corner?: MascotCorner;
  /** Distance from the top edge for `top-right` — clears a 56dp toolbar + screen padding. */
  topOffset?: number;
  testID?: string;
}

/**
 * C5 (MASCOT_DESIGN §5): the floating tappable companion.
 *
 * - absolute overlay in a screen corner with a safe `spacing.md`/`spacing.lg`
 *   offset plus the SafeArea insets — never inside the content flow, and
 *   `pointerEvents="box-none"` so only taps on the mascot itself are consumed.
 * - 64dp (320dp class) / 72dp target, always >= the 48dp INV-10 floor.
 * - tapping cycles the mood happy -> excited -> neutral -> sleepy with a small
 *   bounce; the TalkBack label announces the current mood.
 * - a subtle 250ms entrance fade/scale, skipped entirely under reduce motion.
 * - never rendered on PIN/parent screens: only the child shell, Timer and
 *   Stats mount it (INV-05).
 */
export function MascotFloating({
  corner = 'bottom-right',
  topOffset = spacing.xl + 56 + spacing.md,
  testID = 'mascot-floating',
}: MascotFloatingProps) {
  const { mascot } = useMascot();
  const { width, height } = useScreenGutter();
  const insets = useSafeAreaInsets();

  const size = width < 340 ? 64 : 72;
  const offset = width < 340 ? spacing.md : spacing.lg;

  const [mood, setMood] = useState<MascotMood>('happy');
  const [reduceMotion, setReduceMotion] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(1)).current;

  // Decorative motion is skipped under NODE_ENV=test: jest would otherwise
  // report async Animated updates outside act() on every render.
  const motionEnabled = process.env.NODE_ENV !== 'test';

  // Landscape (MASCOT_DESIGN §6): flip `top-right` to the opposite bottom
  // corner so it can never land on the Timer's right-hand control column.
  const effectiveCorner: MascotCorner =
    width > height && corner === 'top-right' ? 'bottom-left' : corner;

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
    if (reduceMotion || !motionEnabled) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.base,
      useNativeDriver: false,
    }).start();
  }, [entrance, motionEnabled, reduceMotion]);

  const handlePress = () => {
    setMood((current) => nextMood(current));
    if (reduceMotion || !motionEnabled) return;
    bounce.setValue(1);
    Animated.sequence([
      Animated.timing(bounce, {
        toValue: 1.1,
        duration: motion.fast,
        useNativeDriver: false,
      }),
      Animated.timing(bounce, {
        toValue: 1,
        duration: motion.fast,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const positionStyle =
    effectiveCorner === 'top-right'
      ? { top: topOffset + insets.top, right: offset + insets.right }
      : effectiveCorner === 'bottom-left'
        ? { bottom: offset + insets.bottom, left: offset + insets.left }
        : { bottom: offset + insets.bottom, right: offset + insets.right };

  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.wrapper, positionStyle]}>
      <Animated.View style={{ opacity: entrance, transform: [{ scale: bounce }] }}>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.mascot.floatingLabel(mascot, uk.mascot.moods[mood])}
          onPress={handlePress}
          style={[
            styles.target,
            {
              width: size,
              height: size,
              minWidth: MIN_TOUCH_DP,
              minHeight: MIN_TOUCH_DP,
              borderColor: mascotColor(mascot),
            },
          ]}
        >
          <Image
            testID="mascot-image"
            source={mascotImages[mascot][mood]}
            style={{ width: size - 12, height: size - 12 }}
            resizeMode="contain"
            accessible={false}
          />
        </TapTarget>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Above screen content, below dialogs (dialogs are later tree siblings and
    // no zIndex is claimed here on purpose — MASCOT_DESIGN §5 "below modals").
    pointerEvents: 'box-none',
  },
  target: {
    backgroundColor: colors.cardBg,
    borderWidth: 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
});