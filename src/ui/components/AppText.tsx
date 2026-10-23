import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import {
  colors,
  fontScaleMax,
  typography,
  typographyScaleRole,
  typographyWeights,
} from '../theme';

export interface AppTextProps extends TextProps {
  variant?: keyof typeof typography;
  children?: React.ReactNode;
}

/**
 * The only text primitive in the app (amended INV-10):
 * - `allowFontScaling` defaults to true and is never disabled app-wide;
 * - each role gets a per-role `maxFontSizeMultiplier` (text roles reach the
 *   legacy 48sp need at 16 x 3.0, chrome caps at 2.0 so headers stay <= 2 lines).
 */
export function AppText({
  variant = 'body',
  style,
  children,
  allowFontScaling = true,
  maxFontSizeMultiplier,
  accessibilityRole,
  accessibilityLiveRegion,
  ...rest
}: AppTextProps) {
  const dynamicStyle: TextStyle = {
    fontSize: typography[variant],
    fontWeight: typographyWeights[variant],
    color: colors.text,
  };

  const resolvedMaxScale =
    maxFontSizeMultiplier ?? fontScaleMax[typographyScaleRole[variant]];

  return (
    <Text
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={resolvedMaxScale}
      accessibilityRole={accessibilityRole}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={[dynamicStyle, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}