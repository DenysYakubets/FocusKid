import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { MIN_TOUCH_DP } from '../theme';

export interface TapTargetProps
  extends Omit<PressableProps, 'accessibilityRole' | 'accessibilityLabel'> {
  accessibilityLabel: string;
  accessibilityRole: 'button' | 'link' | 'tab';
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  disabled?: boolean;
}

export function TapTarget({
  accessibilityLabel,
  accessibilityRole,
  disabled = false,
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

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={mergedAccessibilityState}
      disabled={disabled}
      hitSlop={hitSlop}
      style={(state) => {
        const userStyle = typeof style === 'function' ? style(state) : style;
        return [styles.base, userStyle];
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
