import React from 'react';
import { StyleSheet, View } from 'react-native';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export interface AppFrameProps {
  children: React.ReactNode;
  /**
   * Test seam only: production resolves the insets from the safe-area context.
   * Lets the layout pin assert real (non-zero) system-bar padding without
   * fighting the global zero-inset jest mock.
   */
  insets?: EdgeInsets;
}

/**
 * F2: the app runs edge-to-edge, but *content* must never sit under the Android
 * status bar (top) or the system navigation bar (bottom). One frame around the
 * navigation tree applies both insets; the frame itself keeps the app background
 * so the bar areas stay edge-to-edge visually instead of showing through.
 */
export function AppFrame({ children, insets: insetsOverride }: AppFrameProps) {
  const liveInsets = useSafeAreaInsets();
  const insets = insetsOverride ?? liveInsets;

  return (
    <View
      testID="app-frame"
      style={[
        styles.frame,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.background,
  },
});