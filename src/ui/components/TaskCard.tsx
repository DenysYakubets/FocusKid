import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TodayTaskView } from '../../domain/tasks/types';
import { uk } from '../../i18n/uk';
import { colors, spacing, statusColors } from '../theme';
import { AppText } from './AppText';
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

export function TaskCard({ task, onPress, disabled }: TaskCardProps) {
  const statusLabel = uk.status[task.status] ?? uk.status.idle;
  const minutesLabel = formatMinutesUk(task.targetMinutes);
  const a11yLabel = `${task.title}, ${minutesLabel}, ${statusLabel}`;

  const currentStatusColor = statusColors[getStatusThemeKey(task.status)];

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
            <AppText variant="title" style={styles.emoji}>
              {task.emoji}
            </AppText>
          ) : null}
          <AppText variant="title" style={styles.title}>
            {task.title}
          </AppText>
        </View>

        <View style={styles.footerRow}>
          <AppText variant="body" style={styles.duration}>
            {`${task.targetMinutes} хв`}
          </AppText>

          <View style={[styles.statusPill, { backgroundColor: currentStatusColor.bg }]}>
            <AppText variant="body" style={[styles.statusText, { color: currentStatusColor.text }]}>
              {statusLabel}
            </AppText>
          </View>
        </View>
      </View>
    </TapTarget>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  cardInner: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emoji: {
    marginRight: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  duration: {
    color: colors.textSecondary,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
  },
  statusText: {
    fontWeight: '600',
  },
});
