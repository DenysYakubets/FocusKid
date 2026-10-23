import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface ProgressBarProps {
  total: number;
  elapsed: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ total, elapsed, style }: ProgressBarProps) {
  const safeTotal = Math.max(0, total);
  const safeElapsed = Math.min(Math.max(0, elapsed), safeTotal);
  const percent = safeTotal > 0 ? (safeElapsed / safeTotal) * 100 : 0;

  return (
    <View
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: safeTotal,
        now: safeElapsed,
      }}
      style={[styles.container, style]}
    >
      <View style={[styles.bar, { width: `${percent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: spacing.md,
    width: '100%',
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
});