import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { colors, typography } from '../theme';

export interface AppTextProps extends TextProps {
  variant?: keyof typeof typography;
  children: React.ReactNode;
}

export function AppText({
  variant = 'body',
  style,
  children,
  allowFontScaling = true,
  ...rest
}: AppTextProps) {
  const dynamicStyle: TextStyle = {
    fontSize: typography[variant],
    color: colors.text,
  };

  return (
    <Text
      allowFontScaling={allowFontScaling}
      style={[dynamicStyle, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
