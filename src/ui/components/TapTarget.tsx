import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { MIN_TOUCH_DP } from '../theme';

/** sm = 48dp floor, md = 56dp, lg = 64dp (spec §5.1). */
const SIZE_MIN_HEIGHT = {
  sm: MIN_TOUCH_DP,
  md: 56,
  lg: 64,
} as const;

export interface TapTargetProps
  extends Omit<PressableProps, 'accessibilityRole' | 'accessibilityLabel'> {
  accessibilityLabel: string;
  accessibilityRole: 'button' | 'link' | 'tab';
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Visual size; the 48x48dp floor (INV-10) always applies. */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function TapTarget({
  accessibilityLabel,
  accessibilityRole,
  disabled = false,
  size,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  children,
  accessibilityState,
  ...rest
}: TapTargetProps) {
  const mergedAccessibilityState = {
    ...accessibilityState,
    disabled: Boolean(disabled),
  };

  const sizeStyle: ViewStyle | undefined = size
    ? { minHeight: SIZE_MIN_HEIGHT[size] }
    : undefined;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={mergedAccessibilityState}
      disabled={disabled}
      hitSlop={hitSlop}
      style={(state) => {
        const userStyle = typeof style === 'function' ? style(state) : style;
        return [styles.base, sizeStyle, userStyle];
      }}
      {...rest}
    >
      {typeof children === 'function' ? children : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
    justifyContent: 'center',
    alignItems: 'center',
  },
});