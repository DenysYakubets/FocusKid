/**
 * C6/C8: pluggable timer-complete celebration jingle hook + real playback
 * (docs/JINGLE_DESIGN.md §3.2 — the WAV assets and this integration landed
 * together, so the C6 stub below is now the real player).
 *
 * - `getJingleVolume(settings)` reads the jingle volume from the SQLite
 *   `settings` table (INV-07) with default **0.5** when the row is absent or
 *   malformed, clamped to `[0, 1]`.
 * - `onTimerComplete(cb)` subscribes to the single timer-complete emission
 *   fired by `timerStore` when the FSM reaches `Completed` (exactly once per
 *   completion). Returns an unsubscribe function.
 * - `playJingle(mascot, volume)` loads the mascot's WAV through `expo-audio`
 *   from the static `jingleSources` map, sets the volume, plays once and
 *   unloads the native player when playback finishes. Every failure path is
 *   guarded: a missing module / broken player degrades to silence, never a
 *   crash (INV-04).
 * - `playCompletionJingle(settings, mascot)` reads `jingle_enabled` +
 *   `jingle_volume` first, so a disabled jingle (or volume 0) is silent.
 */
import { jingleSources } from '../ui/jingleSources';
import { isMascotName } from '../ui/mascotRoster';

/** Settings keys (JINGLE_DESIGN §3.1) — rows of the V4 `settings` table. */
export const JINGLE_VOLUME_KEY = '@focuskid/jingle_volume';
export const JINGLE_ENABLED_KEY = '@focuskid/jingle_enabled';
/** C6 stub key: kept readable so anything written against it still applies. */
export const LEGACY_JINGLE_VOLUME_KEY = 'jingle_volume';
export const DEFAULT_JINGLE_VOLUME = 0.5;
export const DEFAULT_JINGLE_ENABLED = true;
/** Longest jingle is 1.2s (JINGLE_DESIGN §6) — fallback unload guard. */
const JINGLE_UNLOAD_FALLBACK_MS = 4000;

export type SettingsReader = {
  get(key: string): Promise<string | null>;
};

export type CelebrationListener = (payload: {
  sessionId: number | null;
  taskId: number | null;
}) => void;

const listeners = new Set<CelebrationListener>();

/** Parse a stored volume row; `null` = absent/invalid (caller applies default). */
export function parseJingleVolume(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return parsed;
}

/**
 * Read the jingle volume; default 0.5 when nothing valid is stored.
 *
 * Precedence: a non-empty legacy `jingle_volume` row (the C6 stub key) wins so
 * it is never silently ignored; otherwise the V6 key
 * `@focuskid/jingle_volume` (seeded to `0.5` by migration V6). The app only
 * writes the V6 key from now on.
 */
export async function getJingleVolume(settings: SettingsReader): Promise<number> {
  try {
    const legacy = parseJingleVolume(
      await settings.get(LEGACY_JINGLE_VOLUME_KEY)
    );
    if (legacy !== null) return legacy;
    return parseJingleVolume(await settings.get(JINGLE_VOLUME_KEY)) ?? DEFAULT_JINGLE_VOLUME;
  } catch {
    // A missing/corrupt row must never block a child screen: use the default.
    return DEFAULT_JINGLE_VOLUME;
  }
}

/** Read `jingle_enabled`; default `true` when the row is absent or malformed. */
export async function getJingleEnabled(settings: SettingsReader): Promise<boolean> {
  try {
    const raw = await settings.get(JINGLE_ENABLED_KEY);
    if (raw === null || raw === undefined || raw === '') return DEFAULT_JINGLE_ENABLED;
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return DEFAULT_JINGLE_ENABLED;
  } catch {
    return DEFAULT_JINGLE_ENABLED;
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

/** Minimal structural view of the expo-audio objects we touch. */
interface JinglePlayer {
  volume: number;
  play(): void;
  remove(): void;
  addListener?(
    event: string,
    callback: (status: unknown) => void
  ): { remove(): void } | null | undefined;
}

interface ExpoAudioModule {
  createAudioPlayer?(source: number): JinglePlayer;
  setAudioModeAsync?(mode: Record<string, unknown>): unknown;
}

let audioModeRequested = false;

/** One-time audio session setup: play even on the iOS silent switch. */
function ensureAudioMode(audio: ExpoAudioModule): void {
  if (audioModeRequested || typeof audio.setAudioModeAsync !== 'function') return;
  audioModeRequested = true;
  try {
    void Promise.resolve(
      audio.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false })
    ).catch(() => {
      audioModeRequested = false;
    });
  } catch {
    audioModeRequested = false;
  }
}

/**
 * Real playback (JINGLE_DESIGN §3.2): load the mascot's WAV, set the chosen
 * volume, play once, unload the native player after `didJustFinish` (with a
 * fallback timer in case the status event never lands). Silent on any failure
 * and on volume 0.
 */
export function playJingle(mascot: string, volume: number): void {
  try {
    if (!isMascotName(mascot)) return;
    const source = jingleSources[mascot];
    const level = Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : DEFAULT_JINGLE_VOLUME;
    if (!source || level <= 0) return;

    // Dynamic require: a missing/broken audio module is a silent no-op.
    const audio = require('expo-audio') as ExpoAudioModule | null | undefined;
    if (!audio || typeof audio.createAudioPlayer !== 'function') return;
    ensureAudioMode(audio);

    const player = audio.createAudioPlayer(source);
    player.volume = level;

    let disposed = false;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let statusSub: { remove(): void } | null = null;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      if (fallback !== null) clearTimeout(fallback);
      try {
        statusSub?.remove();
      } catch {
        // Listener teardown is best-effort.
      }
      try {
        player.remove();
      } catch {
        // Freeing the player is best-effort — never crash (INV-04).
      }
    };

    try {
      statusSub =
        player.addListener?.('playbackStatusUpdate', (status) => {
          const state = status as { didJustFinish?: boolean } | null | undefined;
          if (state && state.didJustFinish === true) dispose();
        }) ?? null;
    } catch {
      statusSub = null;
    }

    // Safety net: free the native player even if the finish event never lands.
    fallback = setTimeout(dispose, JINGLE_UNLOAD_FALLBACK_MS);
    // Node/Jest only (RN timers are plain numbers): never let the safety-net
    // timer hold the process open after the test run finished.
    const unref = (fallback as unknown as { unref?: () => void }).unref;
    if (typeof unref === 'function') unref.call(fallback);

    try {
      player.play();
    } catch {
      dispose();
    }
  } catch {
    // INV-04: audio must never break the completion path.
  }
}

/** C6 name kept — now the real expo-audio player. */
export const playCelebrationSound: PlayCelebrationSound = playJingle;

/**
 * Timer-completion entry point (child TimerScreen only): honours
 * `jingle_enabled` and the persisted volume, then plays the mascot's jingle.
 * Returns whether playback was attempted.
 */
export async function playCompletionJingle(
  settings: SettingsReader,
  mascot: string
): Promise<boolean> {
  try {
    if (!(await getJingleEnabled(settings))) return false;
    const level = await getJingleVolume(settings);
    if (level <= 0) return false;
    playJingle(mascot, level);
    return true;
  } catch {
    return false;
  }
}