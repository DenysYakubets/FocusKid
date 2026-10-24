/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import * as ReactNative from 'react-native';
import { render } from '@testing-library/react-native';
import { PinPad } from '../components/PinPad';
import { MIN_TOUCH_DP, spacing } from '../theme';
import { uk } from '../../i18n/uk';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved =
    typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

/**
 * C1 (PIN_KEYPAD_SPEC §2-§6): the keypad is a tight calculator-like cluster —
 * responsive key size 56/64/72dp and an identical gap on BOTH axes
 * (8/10/12dp), every one of the 10 digits plus backspace visible and >= 48dp
 * (INV-10) at every breakpoint, cluster centered and never wider than the
 * window.
 */
describe('C1 - compact calculator PIN keypad (PIN_KEYPAD_SPEC)', () => {
  jest.setTimeout(30000);

  const BREAKPOINTS: ReadonlyArray<readonly [width: number, keySize: number, gap: number]> = [
    [320, 56, 8],
    [366, 64, 10],
    [413, 72, 12],
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  for (const [width, keySize, gap] of BREAKPOINTS) {
    it(`${width}dp: keys ${keySize}dp, gap ${gap}dp on both axes, 10 digits + backspace all >= 48dp`, async () => {
      const spy = jest
        .spyOn(ReactNative, 'useWindowDimensions')
        .mockImplementation(() => ({ width, height: 800, scale: 1, fontScale: 1 } as any));

      const screen = await render(
        <PinPad onComplete={jest.fn()} value="" onChange={jest.fn()} />
      );

      // All 10 digits are rendered at the breakpoint's key size, >= 48dp (INV-10).
      for (let d = 0; d <= 9; d++) {
        const key = flat(screen.getByLabelText(uk.pin.digit(d)));
        expect(key.width).toBe(keySize);
        expect(key.height).toBe(keySize);
        expect(key.minWidth ?? key.width).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
        expect(key.minHeight ?? key.height).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
      }

      // Backspace occupies the same square cell (bottom-right of the grid).
      const backspace = flat(screen.getByLabelText(uk.pin.backspace));
      expect(backspace.width).toBe(keySize);
      expect(backspace.height).toBe(keySize);

      // Tight cluster: identical gap on both axes, <= 12dp anywhere (§2).
      const grid: any = screen.getByTestId('pinpad-grid');
      const cluster: any = grid.children[0];
      const clusterStyle = flat(cluster);
      expect(clusterStyle.gap).toBe(gap);
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThanOrEqual(12);

      const rowStyle = flat(cluster.children[0]);
      expect(rowStyle.gap).toBe(gap);

      // The cluster (keys + padding) always fits the window width.
      const padding = width >= 400 ? spacing.lg : spacing.md;
      const clusterWidth = keySize * 3 + gap * 2 + padding * 2;
      expect(clusterWidth).toBeLessThanOrEqual(width);

      // Centered cluster, not spread across the screen (§4).
      expect(flat(grid).justifyContent).toBe('center');
      expect(flat(grid.parent).justifyContent).toBe('center');

      spy.mockRestore();
    });
  }

  it('keeps the grid growing (flex: 1) so the cluster stays vertically centered', async () => {
    const screen = await render(
      <PinPad onComplete={jest.fn()} value="" onChange={jest.fn()} />
    );
    expect(flat(screen.getByTestId('pinpad-grid')).flex).toBe(1);
  });
});