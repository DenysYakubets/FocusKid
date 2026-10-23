import {
  ADD_TIME_STEP_MS,
  MAX_ADDED_MS,
  MAX_TARGET_MS,
  MIN_TARGET_MS,
  PAUSE_BUDGET_MS,
} from './constants';
import { pauseBudgetLeft, pausedElapsed, remaining, runElapsed } from './elapsed';
import { TimerEvent, TimerState, TransitionResult } from './types';

function assertNever(x: never): never {
  throw new Error(`Exhaustive check failed: ${JSON.stringify(x)}`);
}

export function transition(state: TimerState, event: TimerEvent): TransitionResult {
  switch (state.kind) {
    case 'Idle': {
      if (event.type === 'START') {
        if (event.targetMs >= MIN_TARGET_MS && event.targetMs <= MAX_TARGET_MS) {
          return {
            ok: true,
            state: {
              kind: 'Running',
              targetMs: event.targetMs,
              addedMs: 0,
              runAccumMs: 0,
              runSince: event.now,
              pausedTotalMs: 0,
              pauseCount: 0,
            },
            effects: [],
          };
        }
        return { ok: false, state, error: 'INVALID_TARGET' };
      }
      return { ok: false, state, error: 'INVALID_TRANSITION' };
    }

    case 'Running': {
      if (event.type === 'TICK') {
        if (remaining(state, event.now) === 0) {
          return {
            ok: true,
            state: {
              kind: 'Completed',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: state.targetMs + state.addedMs,
              pausedTotalMs: state.pausedTotalMs,
              pauseCount: state.pauseCount,
            },
            effects: ['COMPLETED'],
          };
        }
        return { ok: true, state, effects: [] };
      }

      if (event.type === 'COMPLETE') {
        if (remaining(state, event.now) === 0) {
          return {
            ok: true,
            state: {
              kind: 'Completed',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: state.targetMs + state.addedMs,
              pausedTotalMs: state.pausedTotalMs,
              pauseCount: state.pauseCount,
            },
            effects: ['COMPLETED'],
          };
        }
        return { ok: false, state, error: 'EARLY_TERMINATION_FORBIDDEN' };
      }

      if (event.type === 'VERIFY') {
        return { ok: false, state, error: 'NOT_COMPLETED' };
      }

      if (event.type === 'PAUSE') {
        if (pauseBudgetLeft(state, event.now) > 0) {
          return {
            ok: true,
            state: {
              kind: 'Paused',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: runElapsed(state, event.now),
              pausedSince: event.now,
              pausedTotalMs: state.pausedTotalMs,
              pauseCount: state.pauseCount + 1,
            },
            effects: [],
          };
        }
        return { ok: false, state, error: 'PAUSE_BUDGET_EXHAUSTED' };
      }

      if (event.type === 'ADD_TIME') {
        if (event.ms === ADD_TIME_STEP_MS && state.addedMs + event.ms <= MAX_ADDED_MS) {
          return {
            ok: true,
            state: {
              ...state,
              addedMs: state.addedMs + event.ms,
            },
            effects: [],
          };
        }
        return { ok: false, state, error: 'ADD_TIME_LIMIT' };
      }

      if (event.type === 'PARENT_ABANDON') {
        if (event.parentAuthorized) {
          return {
            ok: true,
            state: { kind: 'Idle' },
            effects: ['ABANDONED'],
          };
        }
        return { ok: false, state, error: 'PARENT_AUTH_REQUIRED' };
      }

      if (event.type === 'START') {
        return { ok: false, state, error: 'INVALID_TRANSITION' };
      }

      if (event.type === 'RESUME') {
        return { ok: false, state, error: 'INVALID_TRANSITION' };
      }

      return { ok: false, state, error: 'INVALID_TRANSITION' };
    }

    case 'Paused': {
      if (event.type === 'TICK') {
        if (pausedElapsed(state, event.now) < PAUSE_BUDGET_MS) {
          return { ok: true, state, effects: [] };
        }
        // T14 auto-resume
        const pausedTotalMsBefore = state.pausedTotalMs;
        const budgetExhaustionMoment = state.pausedSince + (PAUSE_BUDGET_MS - pausedTotalMsBefore);
        const runningState: TimerState = {
          kind: 'Running',
          targetMs: state.targetMs,
          addedMs: state.addedMs,
          runAccumMs: state.runAccumMs,
          runSince: budgetExhaustionMoment,
          pausedTotalMs: PAUSE_BUDGET_MS,
          pauseCount: state.pauseCount,
        };

        if (remaining(runningState, event.now) === 0) {
          return {
            ok: true,
            state: {
              kind: 'Completed',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: state.targetMs + state.addedMs,
              pausedTotalMs: PAUSE_BUDGET_MS,
              pauseCount: state.pauseCount,
            },
            effects: ['AUTO_RESUMED', 'COMPLETED'],
          };
        }
        return { ok: true, state: runningState, effects: ['AUTO_RESUMED'] };
      }

      if (event.type === 'RESUME') {
        const pElapsed = Math.min(PAUSE_BUDGET_MS, pausedElapsed(state, event.now));
        const runSince =
          pausedElapsed(state, event.now) >= PAUSE_BUDGET_MS
            ? state.pausedSince + (PAUSE_BUDGET_MS - state.pausedTotalMs)
            : event.now;

        const runningState: TimerState = {
          kind: 'Running',
          targetMs: state.targetMs,
          addedMs: state.addedMs,
          runAccumMs: state.runAccumMs,
          runSince,
          pausedTotalMs: pElapsed,
          pauseCount: state.pauseCount,
        };

        if (remaining(runningState, event.now) === 0) {
          return {
            ok: true,
            state: {
              kind: 'Completed',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: state.targetMs + state.addedMs,
              pausedTotalMs: pElapsed,
              pauseCount: state.pauseCount,
            },
            effects: ['COMPLETED'],
          };
        }
        return { ok: true, state: runningState, effects: [] };
      }

      if (event.type === 'ADD_TIME') {
        if (event.ms === ADD_TIME_STEP_MS && state.addedMs + event.ms <= MAX_ADDED_MS) {
          return {
            ok: true,
            state: {
              ...state,
              addedMs: state.addedMs + event.ms,
            },
            effects: [],
          };
        }
        return { ok: false, state, error: 'ADD_TIME_LIMIT' };
      }

      if (event.type === 'COMPLETE') {
        return { ok: false, state, error: 'EARLY_TERMINATION_FORBIDDEN' };
      }

      if (event.type === 'VERIFY') {
        return { ok: false, state, error: 'NOT_COMPLETED' };
      }

      if (event.type === 'PARENT_ABANDON') {
        if (event.parentAuthorized) {
          return {
            ok: true,
            state: { kind: 'Idle' },
            effects: ['ABANDONED'],
          };
        }
        return { ok: false, state, error: 'PARENT_AUTH_REQUIRED' };
      }

      if (event.type === 'START') {
        return { ok: false, state, error: 'INVALID_TRANSITION' };
      }

      if (event.type === 'PAUSE') {
        return { ok: false, state, error: 'INVALID_TRANSITION' };
      }

      return { ok: false, state, error: 'INVALID_TRANSITION' };
    }

    case 'Completed': {
      if (event.type === 'VERIFY') {
        if (event.parentAuthorized) {
          return {
            ok: true,
            state: {
              kind: 'Verified',
              targetMs: state.targetMs,
              addedMs: state.addedMs,
              runAccumMs: state.runAccumMs,
              pausedTotalMs: state.pausedTotalMs,
              pauseCount: state.pauseCount,
            },
            effects: ['VERIFIED'],
          };
        }
        return { ok: false, state, error: 'PARENT_AUTH_REQUIRED' };
      }

      if (event.type === 'TICK') {
        return { ok: true, state, effects: [] };
      }

      if (event.type === 'PARENT_ABANDON') {
        if (event.parentAuthorized) {
          return {
            ok: true,
            state: { kind: 'Idle' },
            effects: ['ABANDONED'],
          };
        }
        return { ok: false, state, error: 'PARENT_AUTH_REQUIRED' };
      }

      if (event.type === 'START') {
        return { ok: false, state, error: 'INVALID_TRANSITION' };
      }

      return { ok: false, state, error: 'INVALID_TRANSITION' };
    }

    case 'Verified': {
      return { ok: false, state, error: 'VERIFIED_IMMUTABLE' };
    }

    default:
      return assertNever(state);
  }
}
