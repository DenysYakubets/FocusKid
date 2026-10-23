export type TimerStateKind = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Verified';

interface Base {
  targetMs: number;
  addedMs: number;
  runAccumMs: number;
  pausedTotalMs: number;
  pauseCount: number;
}

export type TimerState =
  | { kind: 'Idle' }
  | (Base & { kind: 'Running'; runSince: number })
  | (Base & { kind: 'Paused'; pausedSince: number })
  | (Base & { kind: 'Completed' })
  | (Base & { kind: 'Verified' });

export type TimerEvent =
  | { type: 'START'; now: number; targetMs: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ADD_TIME'; now: number; ms: number }
  | { type: 'COMPLETE'; now: number } // child "I'm done" request
  | { type: 'VERIFY'; now: number; parentAuthorized: boolean }
  | { type: 'PARENT_ABANDON'; now: number; parentAuthorized: boolean };

export type TimerError =
  | 'INVALID_TRANSITION'
  | 'EARLY_TERMINATION_FORBIDDEN'
  | 'NOT_COMPLETED'
  | 'PAUSE_BUDGET_EXHAUSTED'
  | 'ADD_TIME_LIMIT'
  | 'INVALID_TARGET'
  | 'PARENT_AUTH_REQUIRED'
  | 'VERIFIED_IMMUTABLE';

export type TimerEffect = 'COMPLETED' | 'AUTO_RESUMED' | 'VERIFIED' | 'ABANDONED';

export type TransitionResult =
  | { ok: true; state: TimerState; effects: TimerEffect[] }
  | { ok: false; state: TimerState; error: TimerError }; // state is returned unchanged
