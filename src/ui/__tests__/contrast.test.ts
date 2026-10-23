import { colors, statusColors } from '../theme';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('INV-10 / WCAG AA Color Contrast', () => {
  const pairs: Array<{ name: string; foreground: string; background: string }> = [
    {
      name: 'Primary text on background',
      foreground: colors.text,
      background: colors.background,
    },
    {
      name: 'Secondary text on background',
      foreground: colors.textSecondary,
      background: colors.background,
    },
    {
      name: 'Primary button text on primary background',
      foreground: colors.white,
      background: colors.primary,
    },
    {
      name: 'Primary colored element on background',
      foreground: colors.primary,
      background: colors.background,
    },
    {
      name: 'Status idle text on status idle bg',
      foreground: statusColors.idle.text,
      background: statusColors.idle.bg,
    },
    {
      name: 'Status active text on status active bg',
      foreground: statusColors.active.text,
      background: statusColors.active.bg,
    },
    {
      name: 'Status awaiting text on status awaiting bg',
      foreground: statusColors.awaiting.text,
      background: statusColors.awaiting.bg,
    },
    {
      name: 'Status verified text on status verified bg',
      foreground: statusColors.verified.text,
      background: statusColors.verified.bg,
    },
    {
      name: 'Abandoned text on white background',
      foreground: colors.abandoned,
      background: colors.white,
    },
  ];

  pairs.forEach(({ name, foreground, background }) => {
    it(`asserts contrast ratio for "${name}" is at least 4.5:1`, () => {
      const ratio = contrastRatio(foreground, background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
