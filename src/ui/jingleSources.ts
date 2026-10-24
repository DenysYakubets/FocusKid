import { MascotName } from './mascotRoster';

/**
 * C8 (JINGLE_DESIGN §3.3): static `require` map for the 7 completion WAVs.
 *
 * Metro only bundles literal `require()` calls, so every roster member's jingle
 * is listed explicitly — no dynamic require, no runtime fs. Mirrors the
 * `mascotImages.ts` pattern; the file names come from `sfx/jingles/INDEX.json`
 * (`<Mascot>-complete.wav`), 44.1 kHz / 16-bit / mono / peak <= 0.5.
 */
export const jingleSources: Record<MascotName, number> = {
  Bubblo: require('../../sfx/jingles/Bubblo-complete.wav'),
  Stella: require('../../sfx/jingles/Stella-complete.wav'),
  Wobble: require('../../sfx/jingles/Wobble-complete.wav'),
  Aqua: require('../../sfx/jingles/Aqua-complete.wav'),
  Bud: require('../../sfx/jingles/Bud-complete.wav'),
  Glow: require('../../sfx/jingles/Glow-complete.wav'),
  Spark: require('../../sfx/jingles/Spark-complete.wav'),
};