import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, PanResponder, StyleSheet, View } from 'react-native';
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
export const CHASE_TAU_MS = 500;
const TRAIL_LENGTH = 10;
export interface MascotBounds { width: number; height: number; insets: { top: number; bottom: number; left: number; right: number } }
export function clampMascotPosition(pos: { x: number; y: number }, bounds: MascotBounds, size: number): { x: number; y: number } {
  return { x: Math.max(bounds.insets.left, Math.min(pos.x, bounds.width - bounds.insets.right - size)), y: Math.max(bounds.insets.top, Math.min(pos.y, bounds.height - bounds.insets.bottom - size)) };
}
export function chaseStep(pos: { x: number; y: number }, target: { x: number; y: number }, dtMs: number, tauMs: number = CHASE_TAU_MS): { x: number; y: number } {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return { x: pos.x + (target.x - pos.x) * k, y: pos.y + (target.y - pos.y) * k };
}

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
  const bounds: MascotBounds = { width, height, insets };

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
  const clamp = (point: { x: number; y: number }) => clampMascotPosition(point, bounds, size);

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
  const chasingRef = useRef(false);
  const [chasing, setChasing] = useState(false);
  const target = useRef<MascotPosition>(initial);
  const visibleRef = useRef<MascotPosition>(initial);
  const raf = useRef<number | null>(null);
  const mounted = useRef(true);
  const trailDots = useRef(Array.from({ length: TRAIL_LENGTH }, () => ({ position: new Animated.ValueXY({ x: 0, y: 0 }), opacity: new Animated.Value(0) }))).current;
  const trailHistory = useRef<MascotPosition[]>([]);
  const frameCount = useRef(0);
  const hasDragged = useRef(Boolean(savedPosition));

  const stopLoop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const startLoop = () => {
    if (raf.current !== null) return;
    let lastTs = 0;
    const tick = (ts: number) => {
      if (!mounted.current) return;
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;
      const visible = visibleRef.current;
      const next = clamp(chaseStep(visible, target.current, dt));
      const speed = dt > 0 ? Math.hypot(next.x - visible.x, next.y - visible.y) * 1000 / dt : 0;
      drag.setValue(next);
      visibleRef.current = next;
      frameCount.current += 1;
      if (frameCount.current % 3 === 0) {
        trailHistory.current.push(next);
        if (trailHistory.current.length > TRAIL_LENGTH) trailHistory.current.shift();
      }
      const speedNorm = Math.max(0, Math.min(1, speed / 600));
      for (let k = 0; k < TRAIL_LENGTH; k += 1) {
        const sample = trailHistory.current[trailHistory.current.length - 1 - k];
        const dot = trailDots[k]!;
        if (sample) {
          dot.position.setValue({ x: sample.x - next.x, y: sample.y - next.y });
          dot.opacity.setValue(((TRAIL_LENGTH - k) / TRAIL_LENGTH) * speedNorm * 0.55);
        } else dot.opacity.setValue(0);
      }
      if (!dragging.current && Math.abs(next.x - target.current.x) < 0.5 && Math.abs(next.y - target.current.y) < 0.5) {
        drag.setValue(target.current);
        visibleRef.current = target.current;
        stopLoop();
        chasingRef.current = false;
        setChasing(false);
        trailHistory.current = [];
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { mounted.current = false; stopLoop(); }, []);

  // Follow external position changes (rotation, remount with a saved point).
  useEffect(() => {
    if (dragging.current || chasingRef.current) return;
    const point = savedPosition ? clamp(savedPosition) : { ...defaultAnchor };
    drag.setValue(point);
    visibleRef.current = point;
    origin.current = point;
    start.current = point;
    target.current = point;
    if (savedPosition && (savedPosition.x !== point.x || savedPosition.y !== point.y)) {
      setPosition(point.x, point.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPosition, width, height, size, insets.left, insets.right, insets.top, insets.bottom]);

  const finishDrag = () => {
    const point = clamp(origin.current);
    origin.current = point;
    target.current = point;
    setPosition(point.x, point.y);
    dragging.current = false;
    if (reduceMotion || !motionEnabled) {
      drag.setValue(point);
      visibleRef.current = point;
      return;
    }
    startLoop();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim only real movement so a tap still reaches the mood-cycle button.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > DRAG_START_THRESHOLD ||
        Math.abs(gesture.dy) > DRAG_START_THRESHOLD,
      onPanResponderGrant: () => {
        stopLoop();
        drag.stopAnimation();
        start.current = { x: origin.current.x, y: origin.current.y };
        dragging.current = true;
        hasDragged.current = true;
        if (!reduceMotion && motionEnabled) {
          chasingRef.current = true;
          setChasing(true);
          trailHistory.current = [];
          frameCount.current = 0;
          startLoop();
        }
      },
      onPanResponderMove: (_, gesture) => {
        const point = clampMascotPosition({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy }, bounds, size);
        origin.current = point;
        target.current = point;
        if (reduceMotion || !motionEnabled) {
          drag.setValue(point);
          visibleRef.current = point;
        }
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

  // Saved/dragged point renders as absolute left/top; native driver is unsupported for layout left/top.
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
      {chasing ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no" style={styles.trail}>
          {trailDots.map((dot, index) => (
            <Animated.View
              key={index}
              style={{
                position: 'absolute',
                left: dot.position.x,
                top: dot.position.y,
                width: 10,
                height: 10,
                borderRadius: radius.full,
                backgroundColor: mascotColor(mascot),
                opacity: dot.opacity,
              }}
            />
          ))}
        </View>
      ) : null}
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
  trail: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    overflow: 'visible',
  },
  target: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
});
