import { useEffect } from 'react';
import { TICK_INTERVAL_MS } from '../../domain/timer/constants';
import { useTimerStore } from '../../state/timerStore';

export function useTicker(): void {
  const kind = useTimerStore((s) => s.snapshot.state.kind);
  const tick = useTimerStore((s) => s.tick);

  useEffect(() => {
    if (kind !== 'Running') {
      return;
    }

    const interval = setInterval(() => {
      void tick();
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [kind, tick]);
}
