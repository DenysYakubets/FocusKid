/**
 * C6: pluggable timer-complete celebration jingle hook.
 *
 * - `getJingleVolume(settingsRepo)` reads the `jingle_volume` settings key
 *   (SQLite `settings` table, INV-07) with default **0.5** when absent.
 * - `onTimerComplete(cb)` subscribes to the single timer-complete emission
 *   fired by `timerStore` when the FSM reaches `Completed` (exactly once per
 *   completion). Returns an unsubscribe function.
 * - `playCelebrationSound(mascot, volume)` is the pluggable player: the
 *   default implementation is a guarded dynamic require of `expo-audio` (or
 *   `expo-av`) behind try/catch so the app NEVER crashes if neither module is
 *   installed. The follow-up commit drops in WAV assets per
 *   `docs/JINGLE_DESIGN.md` (absent on this branch) and swaps this impl.
 */

export type SettingsReader = {
  get(key: string): Promise<string | null>;
};

export type CelebrationListener = (payload: {
  sessionId: number | null;
  taskId: number | null;
}) => void;

const listeners = new Set<CelebrationListener>();

/** Read `jingle_volume` from settings; default 0.5 when the row is absent. */
export async function getJingleVolume(settings: SettingsReader): Promise<number> {
  try {
    const raw = await settings.get('jingle_volume');
    if (raw === null || raw === undefined || raw === '') return 0.5;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0.5;
    return parsed;
  } catch {
    // A missing/corrupt row must never block a child screen: use the default.
    return 0.5;
  }
}

/** Subscribe to the one-shot timer-complete emission. */
export function onTimerComplete(listener: CelebrationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fire the timer-complete emission exactly once per Completed transition. */
export function emitTimerComplete(payload: {
  sessionId: number | null;
  taskId: number | null;
}): void {
  // Copy before iterating so a listener unsubscribing mid-dispatch is safe.
  for (const listener of Array.from(listeners)) {
    try {
      listener(payload);
    } catch {
      // A broken listener must never break the completion path (INV-04).
    }
  }
}

export type PlayCelebrationSound = (mascot: string, volume: number) => void;

/**
 * Default pluggable player. Zero new deps: dynamically requires whichever
 * expo audio module is present (`expo-audio` then `expo-av`), guarded so a
 * missing module is a silent no-op instead of a crash.
 */
const defaultPlay: PlayCelebrationSound = (mascot: string, volume: number) => {
  void mascot;
  void volume;
  try {
    // Dynamic require keeps this out of the static graph (Metro only bundles
    // literal requires for assets; module resolution failures land in catch).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const audio = require('expo-audio');
    if (audio && typeof audio.setAudioModeAsync === 'function') {
      void audio.setAudioModeAsync({ playsInSilentMode: true });
    }
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const av = require('expo-av');
      void av?.Audio?.setAudioModeAsync?.({ playsInSilentMode: true });
    } catch {
      // No audio module installed — celebration is silent (never crashes).
    }
  }
};

/** The pluggable player — swap this (or pass your own) in the WAV commit. */
export const playCelebrationSound: PlayCelebrationSound = defaultPlay;