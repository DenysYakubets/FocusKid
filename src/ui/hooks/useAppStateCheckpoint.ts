import { useEffect } from 'react';
import { AppState } from 'react-native';
import { CHECKPOINT_INTERVAL_MS } from '../../domain/timer/constants';
import { useServices } from '../../state/appServices';

export function useAppStateCheckpoint(onBackground?: () => void): void {
  const { timerService } = useServices();

  useEffect(() => {
    const interval = setInterval(() => {
      void timerService.checkpoint();
    }, CHECKPOINT_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        void timerService.checkpoint();
        onBackground?.();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [timerService, onBackground]);
}
