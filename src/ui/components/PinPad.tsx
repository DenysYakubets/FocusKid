import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { useScreenGutter } from '../hooks/useScreenGutter';
import { MIN_TOUCH_DP, colors, radius, shadows, spacing } from '../theme';
import { uk } from '../../i18n/uk';

export interface PinPadProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  value?: string;
  onChange?: (pin: string) => void;
}

/**
 * C1 (PIN_KEYPAD_SPEC §2-§6): a tight, calculator-like cluster instead of the
 * old spread layout.
 *
 * - 3x4 grid, 10 digits + backspace + an empty bottom-left cell.
 * - Responsive via `useScreenGutter()` (which wraps `useWindowDimensions`):
 *   key 56/64/72dp and gap 8/10/12dp below/at/above the 340/400dp breakpoints
 *   — the SAME gap on both axes, never wider than 12dp.
 * - Every key keeps the 48dp INV-10 floor (`minWidth`/`minHeight`) and the
 *   cluster (keys + `spacing.md`/`spacing.lg` padding) always fits the window.
 * - The cluster is centered horizontally and vertically; the grid still grows
 *   (`flex: 1`, pinned by layoutResponsive.test) so it stays centered.
 */
export function PinPad({
  onComplete,
  disabled = false,
  value,
  onChange,
}: PinPadProps) {
  const { width } = useScreenGutter();
  const [internalPin, setInternalPin] = useState('');
  const currentPin = value !== undefined ? value : internalPin;

  // PIN_KEYPAD_SPEC §2 responsive table.
  const compact = width < 340;
  const wide = width >= 400;
  const keySize = compact ? 56 : wide ? 72 : 64;
  const gap = compact ? 8 : wide ? 12 : 10;
  const clusterPadding = wide ? spacing.lg : spacing.md;

  const handleDigit = (digit: string) => {
    if (disabled || currentPin.length >= 4) return;
    const nextPin = currentPin + digit;
    if (value === undefined) {
      setInternalPin(nextPin);
    }
    onChange?.(nextPin);
    if (nextPin.length === 4) {
      onComplete(nextPin);
    }
  };

  const handleBackspace = () => {
    if (disabled || currentPin.length === 0) return;
    const nextPin = currentPin.slice(0, -1);
    if (value === undefined) {
      setInternalPin(nextPin);
    }
    onChange?.(nextPin);
  };

  const keyStyle = {
    width: keySize,
    height: keySize,
    minWidth: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
  };

  const renderDigit = (d: number) => (
    <TapTarget
      key={d}
      accessibilityRole="button"
      accessibilityLabel={uk.pin.digit(d)}
      disabled={disabled}
      onPress={() => handleDigit(String(d))}
      style={(state) => [
        styles.keyButton,
        keyStyle,
        state.pressed && styles.keyPressed,
        disabled && styles.keyButtonDisabled,
      ]}
    >
      <AppText variant="heading" style={styles.keyText}>
        {String(d)}
      </AppText>
    </TapTarget>
  );

  return (
    <View style={styles.container}>
      {/* 4 dots indicator */}
      <View
        accessible={true}
        accessibilityLabel={uk.pin.digitsEntered(currentPin.length)}
        style={styles.dotsContainer}
      >
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = idx < currentPin.length;
          return (
            <View
              key={idx}
              style={[styles.dot, isFilled ? styles.dotFilled : styles.dotEmpty]}
            />
          );
        })}
      </View>

      {/* Compact calculator cluster (spec §3): card surface, tight gap. */}
      <View testID="pinpad-grid" style={styles.grid}>
        <View
          style={[
            styles.cluster,
            { gap, padding: clusterPadding },
          ]}
        >
          <View style={[styles.row, { gap }]}>{[1, 2, 3].map(renderDigit)}</View>
          <View style={[styles.row, { gap }]}>{[4, 5, 6].map(renderDigit)}</View>
          <View style={[styles.row, { gap }]}>{[7, 8, 9].map(renderDigit)}</View>

          <View style={[styles.row, { gap }]}>
            <View style={[styles.keyPlaceholder, keyStyle]} />
            {renderDigit(0)}
            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.pin.backspace}
              disabled={disabled || currentPin.length === 0}
              onPress={handleBackspace}
              style={(state) => [
                styles.keyButton,
                styles.backspaceButton,
                keyStyle,
                state.pressed && styles.keyPressed,
                (disabled || currentPin.length === 0) && styles.keyButtonDisabled,
              ]}
            >
              <AppText variant="heading" style={styles.backspaceText}>
                ⌫
              </AppText>
            </TapTarget>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dotEmpty: {
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  grid: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cluster: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  keyButton: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backspaceButton: {
    backgroundColor: colors.surfaceAlt,
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyButtonDisabled: {
    opacity: 0.4,
  },
  keyPlaceholder: {
    backgroundColor: 'transparent',
  },
  keyText: {
    color: colors.text,
  },
  backspaceText: {
    color: colors.textSecondary,
  },
});