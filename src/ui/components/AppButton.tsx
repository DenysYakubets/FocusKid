import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, radius, shadows, spacing } from '../theme';

export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  label: string;
  variant?: AppButtonVariant;
  /** sm = 48dp, md = 56dp, lg = 64dp. */
  size?: AppButtonSize;
  onPress: () => void;
  disabled?: boolean;
  /** Spinner keeps the a11y label for TalkBack. */
  loading?: boolean;
  /** Default: true for md/lg (stacked layouts), false for sm chips. */
  fullWidth?: boolean;
  /** Merged last — layout overrides only (callers never change colors). */
  style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<AppButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  success: { backgroundColor: colors.verified },
};

const labelColors: Record<AppButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.text,
  ghost: colors.primary,
  danger: colors.abandoned,
  success: colors.white,
};

const sizeStyles: Record<AppButtonSize, ViewStyle> = {
  sm: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  md: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.s12,
  },
  lg: {
    minHeight: 64,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
};

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  fullWidth,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const resolvedFullWidth = fullWidth ?? size !== 'sm';

  return (
    <TapTarget
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={(state) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        resolvedFullWidth ? styles.fullWidth : null,
        state.pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator accessibilityRole="progressbar" color={labelColors[variant]} />
      ) : (
        <AppText
          variant="bodyLarge"
          style={[styles.label, { color: labelColors[variant] }]}
        >
          {label}
        </AppText>
      )}
    </TapTarget>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.85,
    boxShadow: shadows.raised,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    textAlign: 'center',
  },
});