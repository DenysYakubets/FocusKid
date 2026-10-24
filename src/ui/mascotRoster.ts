/**
 * Mascot roster (MASCOT_DESIGN §2-§3): names, mood cycle and the semantic
 * color of each selectable companion. Artwork lives in `mascotImages.ts`
 * (static `require` map — Metro does not bundle dynamic requires).
 */
import { DEFAULT_MASCOT, mascotColors } from './theme';

export type MascotName =
  | 'Bubblo'
  | 'Stella'
  | 'Wobble'
  | 'Aqua'
  | 'Bud'
  | 'Glow'
  | 'Spark';

export type MascotMood = 'happy' | 'neutral' | 'excited' | 'sleepy';

/** Roster order = selection-grid order. */
export const MASCOTS: readonly MascotName[] = [
  'Bubblo',
  'Stella',
  'Wobble',
  'Aqua',
  'Bud',
  'Glow',
  'Spark',
];

/** C5 brief: tapping the companion cycles happy -> excited -> neutral -> sleepy. */
export const MASCOT_MOOD_CYCLE: readonly MascotMood[] = [
  'happy',
  'excited',
  'neutral',
  'sleepy',
];

export function isMascotName(value: unknown): value is MascotName {
  return (
    typeof value === 'string' && (MASCOTS as readonly string[]).includes(value)
  );
}

export function nextMood(mood: MascotMood): MascotMood {
  const index = MASCOT_MOOD_CYCLE.indexOf(mood);
  const next = MASCOT_MOOD_CYCLE[(index + 1) % MASCOT_MOOD_CYCLE.length];
  return next ?? 'happy';
}

const COLOR_BY_MASCOT: Record<MascotName, string> = {
  Bubblo: mascotColors.bubblo,
  Stella: mascotColors.stella,
  Wobble: mascotColors.wobble,
  Aqua: mascotColors.aqua,
  Bud: mascotColors.bud,
  Glow: mascotColors.glow,
  Spark: mascotColors.spark,
};

/** Selection highlight / accent for a roster member (theme token, never a raw hex). */
export function mascotColor(name: MascotName): string {
  return COLOR_BY_MASCOT[name];
}

export { DEFAULT_MASCOT };