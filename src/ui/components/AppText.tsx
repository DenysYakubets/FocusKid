import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { colors, typography } from '../theme';

export interface AppTextProps extends TextProps {
  variant?: keyof typeof typography;
  children?: React.ReactNode;
}

export function AppText({
  variant = 'body',
  style,
  children,
  allowFontScaling = true,
  accessibilityRole,
  accessibilityLiveRegion,
  ...rest
}: AppTextProps) {
  const dynamicStyle: TextStyle = {
    fontSize: typography[variant],
    color: colors.text,
  };

  return (
    <Text
      allowFontScaling={allowFontScaling}
      accessibilityRole={accessibilityRole}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={[dynamicStyle, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
