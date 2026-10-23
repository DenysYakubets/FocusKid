import { useEffect } from 'react';
import { useAppStateCheckpoint } from '../ui/hooks/useAppStateCheckpoint';
import { useTicker } from '../ui/hooks/useTicker';
import { useTimerStore } from './timerStore';
import { tasksStore } from './tasksStore';

export function AppLifecycle(): null {
  useAppStateCheckpoint();
  useTicker();

  const kind = useTimerStore((s) => s.snapshot.state.kind);

  useEffect(() => {
    void tasksStore.refreshToday();
  }, [kind]);

  return null;
}
