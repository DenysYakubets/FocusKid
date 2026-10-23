import { PAUSE_BUDGET_MS } from './constants';
import { TimerState } from './types';

export function runElapsed(s: TimerState, now: number): number {
  if (s.kind === 'Idle') {
    return 0;
  }
  const currentRun = s.kind === 'Running' ? Math.max(0, now - s.runSince) : 0;
  return s.runAccumMs + currentRun;
}

export function pausedElapsed(s: TimerState, now: number): number {
  if (s.kind === 'Idle') {
    return 0;
  }
  const currentPaused = s.kind === 'Paused' ? Math.max(0, now - s.pausedSince) : 0;
  return s.pausedTotalMs + currentPaused;
}

export function remaining(s: TimerState, now: number): number {
  if (s.kind === 'Idle') {
    return 0;
  }
  return Math.max(0, s.targetMs + s.addedMs - runElapsed(s, now));
}

export function pauseBudgetLeft(s: TimerState, now: number): number {
  if (s.kind === 'Idle') {
    return PAUSE_BUDGET_MS;
  }
  return Math.max(0, PAUSE_BUDGET_MS - pausedElapsed(s, now));
}
