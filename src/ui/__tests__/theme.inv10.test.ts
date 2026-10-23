import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { MIN_TOUCH_DP, fontScaleMax, statusColors, typography } from '../theme';
import { TapTarget } from '../components/TapTarget';
import { AppText } from '../components/AppText';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16) / 255,
    parseInt(clean.substring(2, 4), 16) / 255,
    parseInt(clean.substring(4, 6), 16) / 255,
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('INV-10 Theme & Typography', () => {
  it('MIN_TOUCH_DP stays 48 and body text can reach the old 48sp need via font scaling', () => {
    expect(MIN_TOUCH_DP).toBeGreaterThanOrEqual(48);
    expect(typography.body).toBe(16);
    expect(fontScaleMax.text * typography.body).toBeGreaterThanOrEqual(48); // 16 × 3.0 = 48
  });

  it('typography tokens follow the amended INV-10 scale (body 16, titles 20-24, timer 64-72, all 12..72)', () => {
    expect(typography.body).toBe(16);
    expect(typography.title).toBeGreaterThanOrEqual(20);
    expect(typography.title).toBeLessThanOrEqual(24);
    expect(typography.timer).toBeGreaterThanOrEqual(64);
    expect(typography.timer).toBeLessThanOrEqual(72);
    for (const [, size] of Object.entries(typography)) {
      expect(size).toBeGreaterThanOrEqual(12);
      expect(size).toBeLessThanOrEqual(72);
    }
  });

  it('every status color text-on-bg pair meets WCAG AA 4.5:1', () => {
    for (const [, pair] of Object.entries(statusColors)) {
      const ratio = contrastRatio(pair.bg, pair.text);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('TapTarget renders with a flattened style enforcing minWidth and minHeight >= 48', async () => {
    const { getByRole } = await render(
      React.createElement(
        TapTarget,
        { accessibilityRole: 'button', accessibilityLabel: 'Test Target' },
        React.createElement(AppText, { variant: 'body' }, 'Click')
      )
    );

    const button = getByRole('button');
    const flatStyle = StyleSheet.flatten(button.props.style);

    expect(flatStyle.minWidth).toBeGreaterThanOrEqual(48);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(48);
  });
});