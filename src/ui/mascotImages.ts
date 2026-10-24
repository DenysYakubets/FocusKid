import { MascotMood, MascotName } from './mascotRoster';

/**
 * Static `require` map for the 28 mascot PNGs (MASCOT_DESIGN §8).
 * Metro only bundles literal `require()` calls, so every mood of every
 * roster member is listed explicitly — no dynamic require, no runtime fs.
 * Generated from `assets/mascots/INDEX.json`.
 */
export const mascotImages: Record<MascotName, Record<MascotMood, number>> = {
  Bubblo: {
    happy: require('../../assets/mascots/Bubblo/happy.png'),
    neutral: require('../../assets/mascots/Bubblo/neutral.png'),
    excited: require('../../assets/mascots/Bubblo/excited.png'),
    sleepy: require('../../assets/mascots/Bubblo/sleepy.png'),
  },
  Stella: {
    happy: require('../../assets/mascots/Stella/happy.png'),
    neutral: require('../../assets/mascots/Stella/neutral.png'),
    excited: require('../../assets/mascots/Stella/excited.png'),
    sleepy: require('../../assets/mascots/Stella/sleepy.png'),
  },
  Wobble: {
    happy: require('../../assets/mascots/Wobble/happy.png'),
    neutral: require('../../assets/mascots/Wobble/neutral.png'),
    excited: require('../../assets/mascots/Wobble/excited.png'),
    sleepy: require('../../assets/mascots/Wobble/sleepy.png'),
  },
  Aqua: {
    happy: require('../../assets/mascots/Aqua/happy.png'),
    neutral: require('../../assets/mascots/Aqua/neutral.png'),
    excited: require('../../assets/mascots/Aqua/excited.png'),
    sleepy: require('../../assets/mascots/Aqua/sleepy.png'),
  },
  Bud: {
    happy: require('../../assets/mascots/Bud/happy.png'),
    neutral: require('../../assets/mascots/Bud/neutral.png'),
    excited: require('../../assets/mascots/Bud/excited.png'),
    sleepy: require('../../assets/mascots/Bud/sleepy.png'),
  },
  Glow: {
    happy: require('../../assets/mascots/Glow/happy.png'),
    neutral: require('../../assets/mascots/Glow/neutral.png'),
    excited: require('../../assets/mascots/Glow/excited.png'),
    sleepy: require('../../assets/mascots/Glow/sleepy.png'),
  },
  Spark: {
    happy: require('../../assets/mascots/Spark/happy.png'),
    neutral: require('../../assets/mascots/Spark/neutral.png'),
    excited: require('../../assets/mascots/Spark/excited.png'),
    sleepy: require('../../assets/mascots/Spark/sleepy.png'),
  },
};
