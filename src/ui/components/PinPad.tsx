import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, spacing } from '../theme';
import { uk } from '../../i18n/uk';

export interface PinPadProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  value?: string;
  onChange?: (pin: string) => void;
}

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
      <View style={styles.grid}>
        <View style={styles.row}>
          {[1, 2, 3].map((d) => (
            <TapTarget
              key={d}
              accessibilityRole="button"
              accessibilityLabel={uk.pin.digit(d)}
              disabled={disabled}
              onPress={() => handleDigit(String(d))}
              style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
            >
              <AppText variant="title" style={styles.keyText}>
                {String(d)}
              </AppText>
            </TapTarget>
          ))}
        </View>

        <View style={styles.row}>
          {[4, 5, 6].map((d) => (
            <TapTarget
              key={d}
              accessibilityRole="button"
              accessibilityLabel={uk.pin.digit(d)}
              disabled={disabled}
              onPress={() => handleDigit(String(d))}
              style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
            >
              <AppText variant="title" style={styles.keyText}>
                {String(d)}
              </AppText>
            </TapTarget>
          ))}
        </View>

        <View style={styles.row}>
          {[7, 8, 9].map((d) => (
            <TapTarget
              key={d}
              accessibilityRole="button"
              accessibilityLabel={uk.pin.digit(d)}
              disabled={disabled}
              onPress={() => handleDigit(String(d))}
              style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
            >
              <AppText variant="title" style={styles.keyText}>
                {String(d)}
              </AppText>
            </TapTarget>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.keyPlaceholder} />

          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.pin.digit(0)}
            disabled={disabled}
            onPress={() => handleDigit('0')}
            style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
          >
            <AppText variant="title" style={styles.keyText}>
              0
            </AppText>
          </TapTarget>

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
            <AppText variant="title" style={styles.keyText}>
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
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.lg,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    maxWidth: 360,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  keyButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyButtonDisabled: {
    opacity: 0.4,
  },
  keyPlaceholder: {
    width: 72,
    height: 72,
  },
  keyText: {
    color: colors.text,
  },
});
