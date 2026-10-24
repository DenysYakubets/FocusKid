import { useEffect } from 'react';
import { useServices } from '../../state/appServices';
import { useJingleStore } from '../../state/jingleStore';

export interface UseJingleResult {
  /** 0.0 .. 1.0 */
  volume: number;
  enabled: boolean;
  hydrated: boolean;
  /** Persist the volume (0..1, rounded to 2 decimals) and update consumers. */
  setVolume: (value: number) => Promise<void>;
  setEnabled: (value: boolean) => Promise<void>;
}

/**
 * C8 (JINGLE_DESIGN §3.3): single accessor for the jingle preferences.
 * Mirrors `useMascot` — hydrates from the settings store on first mount
 * (no-op after app bootstrap), so a screen never has to know where the
 * preference lives.
 */
export function useJingle(): UseJingleResult {
  const services = useServices();
  const volume = useJingleStore((state) => state.volume);
  const enabled = useJingleStore((state) => state.enabled);
  const hydrated = useJingleStore((state) => state.hydrated);
  const hydrate = useJingleStore((state) => state.hydrate);
  const persistVolume = useJingleStore((state) => state.setVolume);
  const persistEnabled = useJingleStore((state) => state.setEnabled);

  useEffect(() => {
    if (!hydrated) {
      void hydrate(services);
    }
  }, [hydrated, hydrate, services]);

  return {
    volume,
    enabled,
    hydrated,
    setVolume: (value: number) => persistVolume(value, services),
    setEnabled: (value: boolean) => persistEnabled(value, services),
  };
}