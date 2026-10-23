import * as ReactNative from 'react-native';

export type Orientation = 'portrait' | 'landscape';

export function useOrientation(): Orientation {
  const { width, height } = ReactNative.useWindowDimensions();
  return width > height ? 'landscape' : 'portrait';
}
