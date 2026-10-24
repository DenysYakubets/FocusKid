import { create } from 'zustand';
import { AppServices } from './appServices';
import {
  DEFAULT_JINGLE_ENABLED,
  DEFAULT_JINGLE_VOLUME,
  JINGLE_ENABLED_KEY,
  JINGLE_VOLUME_KEY,
  LEGACY_JINGLE_VOLUME_KEY,
  parseJingleVolume,
} from '../audio/celebrationSound';

export { JINGLE_ENABLED_KEY, JINGLE_VOLUME_KEY, DEFAULT_JINGLE_VOLUME, DEFAULT_JINGLE_ENABLED };

/**
 * C8 (JINGLE_DESIGN §3.3): the jingle volume/enabled preferences.
 *
 * Same shape as `mascotStore`: SQLite `settings` key/value rows (INV-07), an
 * optimistic in-memory value with rollback when the write fails. Volume is
 * stored as `"0.0".."1.0"` (V6 seeds `0.5`) and rounded to 2 decimals so a
 * 10% stepper never persists floating point noise like `0.30000000000000004`.
 */
export interface JingleStoreState {
  /** 0.0 .. 1.0 (10% stepper steps in the UI). */
  volume: number;
  /** `jingle_enabled` — when false nothing ever plays. */
  enabled: boolean;
  hydrated: boolean;
  hydrate: (services: AppServices) => Promise<void>;
  setVolume: (value: number, services: AppServices) => Promise<void>;
  setEnabled: (value: boolean, services: AppServices) => Promise<void>;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_JINGLE_VOLUME;
  return Math.min(1, Math.max(0, value));
}

/** Round to 2 decimals (10% steps land exactly) before persisting. */
function roundVolume(value: number): number {
  return Math.round(clampVolume(value) * 100) / 100;
}

function parseEnabled(raw: string | null): boolean {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_JINGLE_ENABLED;
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return DEFAULT_JINGLE_ENABLED;
}

export const useJingleStore = create<JingleStoreState>((set, get) => ({
  volume: DEFAULT_JINGLE_VOLUME,
  enabled: DEFAULT_JINGLE_ENABLED,
  hydrated: false,

  hydrate: async (services: AppServices): Promise<void> => {
    if (get().hydrated) return;
    try {
      // Same precedence as getJingleVolume(): legacy C6 row, then the V6 key.
      const legacy = await services.settingsRepo.get(LEGACY_JINGLE_VOLUME_KEY);
      const raw =
        legacy !== null && legacy !== ''
          ? legacy
          : await services.settingsRepo.get(JINGLE_VOLUME_KEY);
      const enabledRaw = await services.settingsRepo.get(JINGLE_ENABLED_KEY);
      set({
        volume: parseJingleVolume(raw) ?? DEFAULT_JINGLE_VOLUME,
        enabled: parseEnabled(enabledRaw),
        hydrated: true,
      });
    } catch {
      // A missing/corrupt row must never block a child screen: keep defaults.
      set({ hydrated: true });
    }
  },

  setVolume: async (value: number, services: AppServices): Promise<void> => {
    const previous = get().volume;
    const next = roundVolume(value);
    set({ volume: next, hydrated: true });
    try {
      await services.settingsRepo.set(JINGLE_VOLUME_KEY, String(next));
    } catch {
      // Persistence failed — roll back instead of showing a value we didn't store.
      set({ volume: previous });
      throw new Error('jingle volume persistence failed');
    }
  },

  setEnabled: async (value: boolean, services: AppServices): Promise<void> => {
    const previous = get().enabled;
    set({ enabled: value, hydrated: true });
    try {
      await services.settingsRepo.set(JINGLE_ENABLED_KEY, value ? 'true' : 'false');
    } catch {
      set({ enabled: previous });
      throw new Error('jingle enabled persistence failed');
    }
  },
}));