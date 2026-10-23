import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TodayTaskView } from '../../domain/tasks/types';
import { uk } from '../../i18n/uk';
import { colors, radius, shadows, spacing, statusColors } from '../theme';
import { AppText } from './AppText';
import { StatusChip } from './StatusChip';
import { TapTarget } from './TapTarget';

export function formatMinutesUk(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${n} хвилин`;
  }
  if (mod10 === 1) {
    return `${n} хвилина`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${n} хвилини`;
  }
  return `${n} хвилин`;
}

function getStatusThemeKey(status: TodayTaskView['status']): keyof typeof statusColors {
  switch (status) {
    case 'running':
    case 'paused':
      return 'active';
    case 'completed':
      return 'awaiting';
    case 'verified':
      return 'verified';
    case 'idle':
    default:
      return 'idle';
  }
}

export interface TaskCardProps {
  task: TodayTaskView;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Pressed list card (spec §4.2): cardBg + hairline + shadows.card + radius.lg,
 * 2-line title, `StatusChip` state pill and a trailing `›` press affordance.
 * The whole card stays one TapTarget with the composite a11y label.
 */
export function TaskCard({ task, onPress, disabled }: TaskCardProps) {
  const statusLabel = uk.status[task.status] ?? uk.status.idle;
  const minutesLabel = formatMinutesUk(task.targetMinutes);
  const a11yLabel = `${task.title}, ${minutesLabel}, ${statusLabel}`;

  return (
    <TapTarget
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      disabled={disabled}
      style={styles.card}
    >
      <View style={styles.cardInner}>
        <View style={styles.headerRow}>
          {task.emoji ? (
            <AppText variant="body" style={styles.emoji}>
              {task.emoji}
            </AppText>
          ) : null}
          <AppText variant="title" numberOfLines={2} style={styles.title}>
            {task.title}
          </AppText>
        </View>

        <View style={styles.footerRow}>
          <AppText variant="body" style={styles.duration}>
            {`${task.targetMinutes} хв`}
          </AppText>

          <StatusChip status={getStatusThemeKey(task.status)} label={statusLabel} />

          <AppText variant="heading" style={styles.chevron}>
            ›
          </AppText>
        </View>
      </View>
    </TapTarget>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
    padding: spacing.md,
  },
  cardInner: {
    width: '100%',
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emoji: {
    color: colors.text,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: spacing.xs,
    columnGap: spacing.sm,
  },
  duration: {
    flexShrink: 1,
    color: colors.textSecondary,
  },
  chevron: {
    color: colors.textSecondary,
  },
});