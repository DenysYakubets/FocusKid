import { useEffect } from 'react';
import { useServices } from '../../state/appServices';
import { useMascotStore } from '../../state/mascotStore';
import { MascotName } from '../mascotRoster';

export interface UseMascotResult {
  mascot: MascotName;
  hydrated: boolean;
  /** Persist the pick in the settings store and update every consumer. */
  select: (name: MascotName) => Promise<void>;
}

/**
 * C5 (MASCOT_DESIGN §4): single accessor for the selected companion. Hydrates
 * from the settings store on first mount (no-op after app bootstrap), so a
 * consumer never has to know where the choice lives.
 */
export function useMascot(): UseMascotResult {
  const services = useServices();
  const mascot = useMascotStore((state) => state.mascot);
  const hydrated = useMascotStore((state) => state.hydrated);
  const hydrate = useMascotStore((state) => state.hydrate);
  const selectOne = useMascotStore((state) => state.select);

  useEffect(() => {
    if (!hydrated) {
      void hydrate(services);
    }
  }, [hydrated, hydrate, services]);

  return {
    mascot,
    hydrated,
    select: (name: MascotName) => selectOne(name, services),
  };
}