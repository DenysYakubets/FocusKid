import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme';

export interface StatBarProps {
  label: string; // e.g. 'Пн' or 'Понеділок'
  fullDayName: string; // e.g. 'Понеділок'
  verifiedCount: number;
  minutes: number;
  maxMinutes?: number;
  testID?: string;
  accessibilityLabel?: string;
}

export function formatTasksUk(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} завдань`;
  }
  if (mod10 === 1) {
    return `${count} завдання`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} завдання`;
  }
  return `${count} завдань`;
}

export function formatMinutesWordUk(minutes: number): string {
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${minutes} хвилин`;
  }
  if (mod10 === 1) {
    return `${minutes} хвилина`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${minutes} хвилини`;
  }
  return `${minutes} хвилин`;
}

export function StatBar({
  label,
  fullDayName,
  verifiedCount,
  minutes,
  maxMinutes = 60,
  testID,
  accessibilityLabel,
}: StatBarProps) {
  const defaultA11yLabel = `${fullDayName}: ${formatTasksUk(verifiedCount)}, ${formatMinutesWordUk(minutes)}`;
  const a11yLabel = accessibilityLabel ?? defaultA11yLabel;

  const effectiveMax = Math.max(maxMinutes, 1);
  const ratio = Math.min(1, Math.max(0, minutes / effectiveMax));
  const percentWidth = `${Math.round(ratio * 100)}%` as const;

  return (
    <View
      accessible={true}
      accessibilityLabel={a11yLabel}
      testID={testID}
      style={styles.container}
    >
      <View style={styles.labelRow}>
        <AppText variant="body" style={styles.dayLabel}>
          {label}
        </AppText>
        <AppText variant="body" style={styles.valueText}>
          {`${minutes} хв (${verifiedCount})`}
        </AppText>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: percentWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dayLabel: {
    color: colors.text,
  },
  valueText: {
    color: colors.textSecondary,
  },
  track: {
    height: 16,
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.verified,
    borderRadius: 7,
    minWidth: 4,
  },
});
