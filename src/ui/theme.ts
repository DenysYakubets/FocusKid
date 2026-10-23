export const MIN_FONT_SP = 48;
export const MIN_TOUCH_DP = 48;

export const typography = {
  body: 48,
  title: 56,
  timer: 120,
  timerLandscape: 160,
} as const;

export const colors = {
  background: '#FFFFFF',
  text: '#111827',
  textSecondary: '#4B5563',
  primary: '#2563EB',
  border: '#E5E7EB',
  idle: '#6B7280',
  active: '#1D4ED8',
  awaiting: '#92400E',
  verified: '#15803D',
  abandoned: '#DC2626',
  white: '#FFFFFF',
  cardBg: '#FFFFFF',
  surface: '#F9FAFB',
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
