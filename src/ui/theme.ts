/**
 * FocusKid design tokens — the single source of truth for every visual value
 * (UI redesign spec §3). Screens/components import tokens, never redefine them.
 *
 * INV-10 (amended): there is NO minimum font size anymore. Text is scalable
 * (`allowFontScaling` + per-role `maxFontSizeMultiplier`), touch targets stay
 * >= 48x48dp (`MIN_TOUCH_DP`), TalkBack support is unchanged.
 */
export const MIN_TOUCH_DP = 48;

/** Per-role `maxFontSizeMultiplier` (amended INV-10). body 16 x 3.0 = 48sp. */
export const fontScaleMax = {
  text: 3.0,
  chrome: 2.0,
  display: 1.5,
  timer: 1.2,
} as const;

/** The amended INV-10 ramp: caption 12 … timer 72 (all within 12..72). */
export const typography = {
  caption: 12, // meta, units, stat captions
  body: 16, // default copy, field labels, button labels
  bodyLarge: 18, // emphasized body, primary button labels
  title: 20, // screen titles, card titles
  heading: 24, // section titles, keypad digits, countdown status
  display: 32, // stat totals, big numbers
  timer: 64, // countdown, portrait
  timerLandscape: 72, // countdown, landscape
} as const;

/** Weight per typography role (no bundled font files — fontWeight strings only). */
export const typographyWeights = {
  caption: '400',
  body: '400',
  bodyLarge: '600',
  title: '700',
  heading: '700',
  display: '800',
  timer: '700',
  timerLandscape: '700',
} as const satisfies Record<keyof typeof typography, '400' | '600' | '700' | '800'>;

/** Which max-scale role (text/chrome/display/timer) each typography role uses. */
export const typographyScaleRole = {
  caption: 'text',
  body: 'text',
  bodyLarge: 'text',
  title: 'chrome',
  heading: 'chrome',
  display: 'display',
  timer: 'timer',
  timerLandscape: 'timer',
} as const satisfies Record<keyof typeof typography, 'text' | 'chrome' | 'display' | 'timer'>;

export const colors = {
  background: '#FFFFFF',
  surface: '#F9FAFB',
  surfaceAlt: '#F3F4F6',
  cardBg: '#FFFFFF',
  text: '#111827',
  textSecondary: '#4B5563',
  white: '#FFFFFF',
  textOnAccent: '#FFFFFF',
  primary: '#2563EB',
  active: '#1D4ED8',
  verified: '#15803D',
  awaiting: '#92400E',
  abandoned: '#DC2626',
  idle: '#6B7280',
  border: '#E5E7EB',
  borderStrong: '#6B7280',
  divider: '#E5E7EB',
  dangerBg: '#FEE2E2',
  dangerText: '#991B1B',
  warningBg: '#FEF3C7',
  warningText: '#92400E',

  // Deprecated aliases (ui-designer §12 vocabulary) — same values, no renames.
  bg: '#FFFFFF',
  textPrimary: '#111827',
  textMuted: '#4B5563',
  accent: '#2563EB',
  accentText: '#FFFFFF',
  danger: '#DC2626',
  success: '#15803D',
  warning: '#92400E',
} as const;

export const statusColors = {
  idle: {
    bg: '#F3F4F6',
    text: '#1F2937',
  },
  active: {
    bg: '#1D4ED8',
    text: '#FFFFFF',
  },
  awaiting: {
    bg: '#92400E',
    text: '#FFFFFF',
  },
  verified: {
    bg: '#15803D',
    text: '#FFFFFF',
  },
} as const;

/** 4-point grid. `s12` is the documented in-between step (keypad/card rhythm). */
export const spacing = {
  xs: 4,
  sm: 8,
  s12: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

/** CSS `boxShadow` strings only — never legacy `shadow*` / `elevation` props. */
export const shadows = {
  card: '0 1px 2px rgba(0, 0, 0, 0.05)',
  raised: '0 4px 12px rgba(0, 0, 0, 0.10)',
  overlay: '0 8px 24px rgba(0, 0, 0, 0.18)',
} as const;

/** Durations in ms: press feedback 150, state swaps 250, large surfaces 400. */
export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;