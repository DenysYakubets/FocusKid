import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing, statusColors } from '../theme';
import { uk } from '../../i18n/uk';

export interface StatusChipProps {
  status: 'idle' | 'active' | 'awaiting' | 'verified';
  /** Defaults to the existing uk string for the status. */
  label?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const defaultLabels: Record<StatusChipProps['status'], string> = {
  idle: uk.status.idle,
  active: uk.today.active,
  awaiting: uk.timer.awaiting,
  verified: uk.status.verified,
};

/** `statusColors` pill — never color alone: the label always renders inside. */
export function StatusChip({ status, label, size = 'sm', style }: StatusChipProps) {
  const chipColors = statusColors[status];

  return (
    // Plain (non-accessible) pill: the label text inside is what TalkBack
    // reads, and the parent control (e.g. TaskCard) owns the composite label.
    <View
      style={[
        styles.chip,
        size === 'md' ? styles.chipMd : styles.chipSm,
        { backgroundColor: chipColors.bg },
        style,
      ]}
    >
      <AppText
        variant="body"
        style={[styles.label, { color: chipColors.text }]}
      >
        {label ?? defaultLabels[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipMd: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});