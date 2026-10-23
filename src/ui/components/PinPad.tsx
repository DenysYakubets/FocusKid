import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, radius, spacing } from '../theme';
import { uk } from '../../i18n/uk';

export interface PinPadProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  value?: string;
  onChange?: (pin: string) => void;
}

/**
 * 4-dot indicator + 3x4 keypad (spec §4.1). Keys are `flex: 1` with no
 * maxWidth cap, `minHeight: 56`, `radius.lg` and a `borderStrong` outline, so
 * all 10 digits + ⌫ fit at 320dp without scrolling; the grid keeps `flex: 1`
 * (pinned by layoutResponsive.test) and the screen behind it scrolls instead.
 */
export function PinPad({
  onComplete,
  disabled = false,
  value,
  onChange,
}: PinPadProps) {
  const [internalPin, setInternalPin] = useState('');
  const currentPin = value !== undefined ? value : internalPin;

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

  const renderDigit = (d: number) => (
    <TapTarget
      key={d}
      accessibilityRole="button"
      accessibilityLabel={uk.pin.digit(d)}
      disabled={disabled}
      onPress={() => handleDigit(String(d))}
      style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
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

      {/* Digits pad */}
      <View testID="pinpad-grid" style={styles.grid}>
        <View style={styles.row}>{[1, 2, 3].map(renderDigit)}</View>
        <View style={styles.row}>{[4, 5, 6].map(renderDigit)}</View>
        <View style={styles.row}>{[7, 8, 9].map(renderDigit)}</View>

        <View style={styles.row}>
          <View style={styles.keyPlaceholder} />
          {renderDigit(0)}
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.pin.backspace}
            disabled={disabled || currentPin.length === 0}
            onPress={handleBackspace}
            style={[
              styles.keyButton,
              (disabled || currentPin.length === 0) && styles.keyButtonDisabled,
            ]}
          >
            <AppText variant="heading" style={styles.keyText}>
              ⌫
            </AppText>
          </TapTarget>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
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
    width: '100%',
    flex: 1,
    justifyContent: 'space-evenly',
    gap: spacing.s12,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s12,
    alignItems: 'stretch',
  },
  keyButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyButtonDisabled: {
    opacity: 0.4,
  },
  keyPlaceholder: {
    flex: 1,
    minHeight: 56,
  },
  keyText: {
    color: colors.text,
  },
});