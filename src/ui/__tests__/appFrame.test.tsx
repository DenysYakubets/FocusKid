/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AppFrame } from '../components/AppFrame';
import { AppText } from '../components/AppText';

describe('F2 - AppFrame keeps content clear of the system bars', () => {
  it('pads the top (status bar) and bottom (system nav bar) with the safe-area insets', async () => {
    const screen = await render(
      <AppFrame insets={{ top: 44, bottom: 34, left: 0, right: 0 }}>
        <AppText testID="child" variant="body">
          content
        </AppText>
      </AppFrame>
    );

    const frame = screen.getByTestId('app-frame');
    const style = StyleSheet.flatten(frame.props.style);
    expect(style.paddingTop).toBe(44);
    expect(style.paddingBottom).toBe(34);
    expect(style.backgroundColor).toBeDefined();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('renders with zero insets too (edge-to-edge devices without cutouts)', async () => {
    const screen = await render(
      <AppFrame>
        <AppText testID="child" variant="body">
          content
        </AppText>
      </AppFrame>
    );
    const style = StyleSheet.flatten(screen.getByTestId('app-frame').props.style);
    expect(style.paddingTop).toBe(0);
    expect(style.paddingBottom).toBe(0);
  });
});