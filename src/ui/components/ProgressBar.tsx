import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

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
    height: 16,
    width: '100%',
    backgroundColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
});
