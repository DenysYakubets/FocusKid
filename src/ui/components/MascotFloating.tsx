import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, PanResponder, StyleSheet } from 'react-native';
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
import { MascotPosition, useMascotStore } from '../../state/mascotStore';
import { uk } from '../../i18n/uk';

export type MascotCorner = 'bottom-right' | 'bottom-left' | 'top-right';

/**
 * Round-1 MED: vertical clearance a primary CTA must keep from the companion.
 * The mascot is the last sibling of the child content area, so child
 * scrollables reserve their own bottom corner instead of letting the last row
 * (a TaskCard, a sheet button) render underneath it.
 */
export const MASCOT_CLEARANCE_DP = 48;

/**
 * Movement (dp) required before the PanResponder claims the gesture. PanResponder's
 * `dx/dy` are 0 until the native responder pipeline updates them, so a pure
 * config-level assertion must use a raw threshold: anything <= this value is treated
 * as a stationary tap (the TapTarget still cycles moods). Real drags exceed it.
 */
export const DRAG_START_THRESHOLD = 20;

/** Rendered target size: 64dp in the 320dp class, 72dp from 340dp up. */
export function mascotSize(width: number): number {
  return width < 340 ? 64 : 72;
}

/** Corner offset from the content edge (spacing.md compact, spacing.lg else). */
export function mascotOffset(width: number): number {
  return width < 340 ? spacing.md : spacing.lg;
}

/**
 * Bottom inset (dp) a child scrollable must add so its last row ends at least
 * MASCOT_CLEARANCE_DP above the companion's top edge:
 * corner offset + target height + clearance.
 */
export function mascotBottomInset(width: number): number {
  return mascotOffset(width) + mascotSize(width) + MASCOT_CLEARANCE_DP;
}

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
 * - draggable across the window: a PanResponder claims the gesture only after
 *   real movement (a plain tap still cycles the mood), clamps the target fully
 *   inside the window (safe-area aware, re-clamped on rotation), settles the
 *   release with an `Animated.spring`, and stores the point in the global
 *   mascotStore so the position survives navigation between screens.
 * - a subtle 250ms entrance fade/scale, skipped entirely under reduce motion.
 * - never rendered on PIN/parent screens: only the child shell (with its
 *   bottom content inset / hidden behind the Calendar day sheet) and the Timer
 *   mount it (INV-05 — Stats is parent-only and must NOT show it).
 */
export function MascotFloating({
  corner = 'bottom-right',
  topOffset = spacing.xl + 56 + spacing.md,
  testID = 'mascot-floating',
}: MascotFloatingProps) {
  const { mascot } = useMascot();
  const { width, height } = useScreenGutter();
  const insets = useSafeAreaInsets();

  const size = mascotSize(width);
  const offset = mascotOffset(width);

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

  const savedPosition = useMascotStore((state) => state.position);
  const setPosition = useMascotStore((state) => state.setPosition);

  /** Keep the whole target inside the window (safe area aware). */
  const clamp = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: Math.max(insets.left, Math.min(point.x, width - insets.right - size)),
    y: Math.max(insets.top, Math.min(point.y, height - insets.bottom - size)),
  });

  /** The default corner anchor (window coordinates) before any drag. */
  const defaultAnchor: MascotPosition = {
    x: effectiveCorner === 'bottom-left' ? offset + insets.left : width - offset - insets.right - size,
    y: effectiveCorner === 'top-right' ? topOffset + insets.top : height - offset - insets.bottom - size,
  };

  const initial = savedPosition ? clamp(savedPosition) : defaultAnchor;
  const drag = useRef(new Animated.ValueXY(initial)).current;
  const origin = useRef<MascotPosition>(initial);
  const start = useRef<MascotPosition>(initial);
  const dragging = useRef(false);
  const hasDragged = useRef(Boolean(savedPosition));

  // Follow external position changes (rotation, remount with a saved point).
  useEffect(() => {
    if (dragging.current) return;
    const point = savedPosition ? clamp(savedPosition) : { ...defaultAnchor };
    drag.setValue(point);
    origin.current = point;
    start.current = point;
    if (savedPosition && (savedPosition.x !== point.x || savedPosition.y !== point.y)) {
      setPosition(point.x, point.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPosition, width, height, size, insets.left, insets.right, insets.top, insets.bottom]);

  const finishDrag = () => {
    dragging.current = false;
    const point = clamp(origin.current);
    origin.current = point;
    setPosition(point.x, point.y);
    if (reduceMotion || !motionEnabled) {
      drag.setValue(point);
      return;
    }
    // Spring settle on release: smooth, no overshoot past the clamp.
    Animated.spring(drag, {
      toValue: point,
      velocity: { x: 0, y: 0 },
      tension: 120,
      friction: 20,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim only real movement so a tap still reaches the mood-cycle button.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > DRAG_START_THRESHOLD ||
        Math.abs(gesture.dy) > DRAG_START_THRESHOLD,
      onPanResponderGrant: () => {
        drag.stopAnimation();
        start.current = { x: origin.current.x, y: origin.current.y };
        dragging.current = true;
        hasDragged.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        const point = clamp({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy });
        origin.current = point;
        drag.setValue(point);
      },
      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
    })
  ).current;

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

  // Saved/dragged point renders as absolute left/top; otherwise the corner.
  const positionStyle = savedPosition || hasDragged.current
    ? { left: drag.x, top: drag.y }
    : effectiveCorner === 'top-right'
      ? { top: topOffset + insets.top, right: offset + insets.right }
      : effectiveCorner === 'bottom-left'
        ? { bottom: offset + insets.bottom, left: offset + insets.left }
        : { bottom: offset + insets.bottom, right: offset + insets.right };

  return (
    <Animated.View
      {...responder.panHandlers}
      testID={testID}
      pointerEvents="box-none"
      style={[styles.wrapper, positionStyle]}
    >
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
    </Animated.View>
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
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
});
