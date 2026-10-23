import * as ReactNative from 'react-native';
import { spacing } from '../theme';

/** Content max-widths from spec §3.6 (forms / lists / PIN column). */
export const CONTENT_MAX_WIDTH = {
  form: 560,
  list: 600,
  pin: 480,
} as const;

export interface ScreenGutter {
  width: number;
  height: number;
  isLandscape: boolean;
  /** Portrait < 360dp (the 320dp class). */
  isCompact: boolean;
  /** Screen edge padding: compact 16, regular/wide 24, landscape 32 (§3.6). */
  gutter: number;
}

/**
 * Responsive breakpoint hook (expo-native-ui: `useWindowDimensions`, never
 * `Dimensions.get`). Type sizes do NOT scale per density — density only
 * changes gutters, columns and split layouts.
 */
export function useScreenGutter(): ScreenGutter {
  const { width, height } = ReactNative.useWindowDimensions();
  const isLandscape = width > height;
  const isCompact = !isLandscape && width < 360;

  let gutter: number = spacing.lg;
  if (isLandscape) {
    gutter = spacing.xl;
  } else if (isCompact) {
    gutter = spacing.md;
  }

  return { width, height, isLandscape, isCompact, gutter };
}