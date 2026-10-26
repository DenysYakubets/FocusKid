import { create } from 'zustand';
import { AppServices } from './appServices';
import { DEFAULT_MASCOT } from '../ui/theme';
import { MascotName, isMascotName } from '../ui/mascotRoster';

/** Settings key (MASCOT_DESIGN §4) — stored in the SQLite `settings` table. */
export const MASCOT_SETTING_KEY = '@focuskid/mascot';

interface StoredMascot {
  mascot: MascotName;
  selectedAt: string;
}

export interface MascotPosition {
  x: number;
  y: number;
}

export interface MascotStoreState {
  /** Screen (window) coordinates of the last drag — shared by every screen for this session. */
  position: MascotPosition | null;
  /** Persist a clamped drag position so the companion restores on any screen mount. */
  setPosition: (x: number, y: number) => void;
  /** Currently selected companion; defaults until `hydrate()` reads the store. */
  mascot: MascotName;
  hydrated: boolean;
  /** Read the persisted choice once (app bootstrap / first consumer mount). */
  hydrate: (services: AppServices) => Promise<void>;
  /** Pick a companion: optimistic state now, persisted value right after. */
  select: (name: MascotName, services: AppServices) => Promise<void>;
}

function parseStored(raw: string | null): MascotName {
  if (!raw) return DEFAULT_MASCOT;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredMascot>;
    return isMascotName(parsed.mascot) ? parsed.mascot : DEFAULT_MASCOT;
  } catch {
    return DEFAULT_MASCOT;
  }
}

export const useMascotStore = create<MascotStoreState>((set, get) => ({
  position: null,
  setPosition: (x, y) => set({ position: { x, y } }),
  mascot: DEFAULT_MASCOT,
  hydrated: false,

  hydrate: async (services: AppServices): Promise<void> => {
    if (get().hydrated) return;
    try {
      const raw = await services.settingsRepo.get(MASCOT_SETTING_KEY);
      set({ mascot: parseStored(raw), hydrated: true });
    } catch {
      // A missing/corrupt row must never block a child screen: use the default.
      set({ hydrated: true });
    }
  },

  select: async (name: MascotName, services: AppServices): Promise<void> => {
    const previous = get().mascot;
    set({ mascot: name, hydrated: true });
    try {
      const payload: StoredMascot = {
        mascot: name,
        selectedAt: services.wall.nowIso(),
      };
      await services.settingsRepo.set(MASCOT_SETTING_KEY, JSON.stringify(payload));
    } catch {
      // Persistence failed — roll the visible choice back instead of lying.
      set({ mascot: previous });
      throw new Error('mascot persistence failed');
    }
  },
}));
