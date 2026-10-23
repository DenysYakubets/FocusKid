import {
  ADD_TIME_STEP_MS,
  MAX_ADDED_MS,
  MAX_TARGET_MS,
  MIN_TARGET_MS,
  PAUSE_BUDGET_MS,
} from '../constants';
import { pausedElapsed, remaining, runElapsed } from '../elapsed';
import { transition } from '../fsm';
import { TimerEvent, TimerState } from '../types';

describe('FSM Transitions (T01 - T22)', () => {
  it('T01: Idle -> Running on valid START', () => {
    const state: TimerState = { kind: 'Idle' };
    const res = transition(state, { type: 'START', now: 1000, targetMs: 60000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual({
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    });
    expect(res.effects).toEqual([]);
  });

  it('T02: Idle -> Idle with INVALID_TARGET when target is out of range', () => {
    const state: TimerState = { kind: 'Idle' };
    const low = transition(state, { type: 'START', now: 1000, targetMs: MIN_TARGET_MS - 1 });
    expect(low).toEqual({ ok: false, state, error: 'INVALID_TARGET' });

    const high = transition(state, { type: 'START', now: 1000, targetMs: MAX_TARGET_MS + 1 });
    expect(high).toEqual({ ok: false, state, error: 'INVALID_TARGET' });
  });

  it('T03: Running -> Running on TICK when remaining > 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'TICK', now: 2000 });
    expect(res).toEqual({ ok: true, state, effects: [] });
  });

  it('T04: Running -> Completed on TICK when remaining = 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'TICK', now: 61000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual({
      kind: 'Completed',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 60000,
      pausedTotalMs: 0,
      pauseCount: 0,
    });
    expect(res.effects).toEqual(['COMPLETED']);
  });

  it('T05: Running -> Completed on COMPLETE when remaining = 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'COMPLETE', now: 61000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.kind).toBe('Completed');
    expect(res.effects).toEqual(['COMPLETED']);
  });

  it('T06: Running -> Running with EARLY_TERMINATION_FORBIDDEN on COMPLETE when remaining > 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'COMPLETE', now: 30000 });
    expect(res).toEqual({ ok: false, state, error: 'EARLY_TERMINATION_FORBIDDEN' });
  });

  it('T07: Running -> Running with NOT_COMPLETED on VERIFY', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'VERIFY', now: 2000, parentAuthorized: true });
    expect(res).toEqual({ ok: false, state, error: 'NOT_COMPLETED' });
  });

  it('T08: Running -> Paused on PAUSE when pauseBudgetLeft > 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'PAUSE', now: 5000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual({
      kind: 'Paused',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 4000,
      pausedSince: 5000,
      pausedTotalMs: 0,
      pauseCount: 1,
    });
  });

  it('T09: Running -> Running with PAUSE_BUDGET_EXHAUSTED when pauseBudgetLeft = 0', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: PAUSE_BUDGET_MS,
      pauseCount: 1,
    };
    const res = transition(state, { type: 'PAUSE', now: 2000 });
    expect(res).toEqual({ ok: false, state, error: 'PAUSE_BUDGET_EXHAUSTED' });
  });

  it('T10: Running/Paused -> same on ADD_TIME when ms = ADD_TIME_STEP_MS and limit not exceeded', () => {
    const running: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const resRunning = transition(running, { type: 'ADD_TIME', now: 2000, ms: ADD_TIME_STEP_MS });
    expect(resRunning.ok).toBe(true);
    if (!resRunning.ok || resRunning.state.kind === 'Idle') return;
    expect(resRunning.state.addedMs).toBe(ADD_TIME_STEP_MS);

    const paused: TimerState = {
      kind: 'Paused',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      pausedSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 1,
    };
    const resPaused = transition(paused, { type: 'ADD_TIME', now: 2000, ms: ADD_TIME_STEP_MS });
    expect(resPaused.ok).toBe(true);
    if (!resPaused.ok || resPaused.state.kind === 'Idle') return;
    expect(resPaused.state.addedMs).toBe(ADD_TIME_STEP_MS);
  });

  it('T11: Running/Paused -> same with ADD_TIME_LIMIT when step or limit is invalid', () => {
    const running: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: MAX_ADDED_MS,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const exceedLimit = transition(running, {
      type: 'ADD_TIME',
      now: 2000,
      ms: ADD_TIME_STEP_MS,
    });
    expect(exceedLimit).toEqual({ ok: false, state: running, error: 'ADD_TIME_LIMIT' });

    const wrongStep = transition(running, { type: 'ADD_TIME', now: 2000, ms: 12345 });
    expect(wrongStep).toEqual({ ok: false, state: running, error: 'ADD_TIME_LIMIT' });
  });

  it('T12: Paused -> Running on RESUME', () => {
    const state: TimerState = {
      kind: 'Paused',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 5000,
      pausedSince: 10000,
      pausedTotalMs: 0,
      pauseCount: 1,
    };
    const res = transition(state, { type: 'RESUME', now: 15000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual({
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 5000,
      runSince: 15000,
      pausedTotalMs: 5000,
      pauseCount: 1,
    });
  });

  it('T13: Paused -> Paused on TICK when pausedElapsed < PAUSE_BUDGET_MS', () => {
    const state: TimerState = {
      kind: 'Paused',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 5000,
      pausedSince: 10000,
      pausedTotalMs: 0,
      pauseCount: 1,
    };
    const res = transition(state, { type: 'TICK', now: 20000 });
    expect(res).toEqual({ ok: true, state, effects: [] });
  });

  it('T14: Paused -> Running (or Completed) on TICK with AUTO_RESUMED when pausedElapsed >= PAUSE_BUDGET_MS', () => {
    const state: TimerState = {
      kind: 'Paused',
      targetMs: 600000, // 10 min
      addedMs: 0,
      runAccumMs: 10000,
      pausedSince: 100000,
      pausedTotalMs: 100000, // 100s already paused
      pauseCount: 1,
    };
    // Budget left was 200s (200,000ms). Budget runs out at 100000 + 200000 = 300000.
    // Tick at 350000ms (50s after budget exhausted).
    const res = transition(state, { type: 'TICK', now: 350000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.effects).toEqual(['AUTO_RESUMED']);
    expect(res.state).toEqual({
      kind: 'Running',
      targetMs: 600000,
      addedMs: 0,
      runAccumMs: 10000,
      runSince: 300000, // exact exhaustion moment
      pausedTotalMs: PAUSE_BUDGET_MS,
      pauseCount: 1,
    });
  });

  it('T15: Paused -> Paused with error on COMPLETE or VERIFY', () => {
    const state: TimerState = {
      kind: 'Paused',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 5000,
      pausedSince: 10000,
      pausedTotalMs: 0,
      pauseCount: 1,
    };
    expect(transition(state, { type: 'COMPLETE', now: 15000 })).toEqual({
      ok: false,
      state,
      error: 'EARLY_TERMINATION_FORBIDDEN',
    });
    expect(transition(state, { type: 'VERIFY', now: 15000, parentAuthorized: true })).toEqual({
      ok: false,
      state,
      error: 'NOT_COMPLETED',
    });
  });

  it('T16: Completed -> Verified on VERIFY when parentAuthorized = true', () => {
    const state: TimerState = {
      kind: 'Completed',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 60000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'VERIFY', now: 62000, parentAuthorized: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.kind).toBe('Verified');
    expect(res.effects).toEqual(['VERIFIED']);
  });

  it('T17: Completed -> Completed with PARENT_AUTH_REQUIRED on VERIFY when parentAuthorized = false', () => {
    const state: TimerState = {
      kind: 'Completed',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 60000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'VERIFY', now: 62000, parentAuthorized: false });
    expect(res).toEqual({ ok: false, state, error: 'PARENT_AUTH_REQUIRED' });
  });

  it('T18: Completed -> Completed on TICK is a no-op ok: true', () => {
    const state: TimerState = {
      kind: 'Completed',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 60000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'TICK', now: 65000 });
    expect(res).toEqual({ ok: true, state, effects: [] });
  });

  it('T19: Running / Paused / Completed -> Idle on PARENT_ABANDON when parentAuthorized = true', () => {
    const states: TimerState[] = [
      {
        kind: 'Running',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 0,
        runSince: 1000,
        pausedTotalMs: 0,
        pauseCount: 0,
      },
      {
        kind: 'Paused',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 1000,
        pausedSince: 2000,
        pausedTotalMs: 0,
        pauseCount: 1,
      },
      {
        kind: 'Completed',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 60000,
        pausedTotalMs: 0,
        pauseCount: 0,
      },
    ];

    for (const s of states) {
      const res = transition(s, { type: 'PARENT_ABANDON', now: 5000, parentAuthorized: true });
      expect(res).toEqual({ ok: true, state: { kind: 'Idle' }, effects: ['ABANDONED'] });
    }
  });

  it('T20: Running / Paused / Completed -> same on PARENT_ABANDON when parentAuthorized = false', () => {
    const state: TimerState = {
      kind: 'Running',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 0,
      runSince: 1000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    const res = transition(state, { type: 'PARENT_ABANDON', now: 5000, parentAuthorized: false });
    expect(res).toEqual({ ok: false, state, error: 'PARENT_AUTH_REQUIRED' });
  });

  it('T21: Verified -> Verified with VERIFIED_IMMUTABLE on ANY event (including TICK)', () => {
    const state: TimerState = {
      kind: 'Verified',
      targetMs: 60000,
      addedMs: 0,
      runAccumMs: 60000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };

    const events: TimerEvent[] = [
      { type: 'TICK', now: 10000 },
      { type: 'START', now: 10000, targetMs: 60000 },
      { type: 'PAUSE', now: 10000 },
      { type: 'RESUME', now: 10000 },
      { type: 'ADD_TIME', now: 10000, ms: 300000 },
      { type: 'COMPLETE', now: 10000 },
      { type: 'VERIFY', now: 10000, parentAuthorized: true },
      { type: 'PARENT_ABANDON', now: 10000, parentAuthorized: true },
    ];

    for (const ev of events) {
      const res = transition(state, ev);
      expect(res).toEqual({ ok: false, state, error: 'VERIFIED_IMMUTABLE' });
    }
  });

  it('T22: Running / Paused / Completed -> same with INVALID_TRANSITION on START', () => {
    const states: TimerState[] = [
      {
        kind: 'Running',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 0,
        runSince: 1000,
        pausedTotalMs: 0,
        pauseCount: 0,
      },
      {
        kind: 'Paused',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 1000,
        pausedSince: 2000,
        pausedTotalMs: 0,
        pauseCount: 1,
      },
      {
        kind: 'Completed',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 60000,
        pausedTotalMs: 0,
        pauseCount: 0,
      },
    ];

    for (const s of states) {
      const res = transition(s, { type: 'START', now: 5000, targetMs: 60000 });
      expect(res).toEqual({ ok: false, state: s, error: 'INVALID_TRANSITION' });
    }
  });

  describe('Property-based testing (Acceptance Criterion 1)', () => {
    it('runs 1,000 random event sequences, asserting purity, immutability, pause budget and run elapsed bounds', () => {
      const eventTypes = [
        'TICK',
        'PAUSE',
        'RESUME',
        'ADD_TIME',
        'COMPLETE',
        'VERIFY',
        'PARENT_ABANDON',
      ] as const;

      for (let run = 0; run < 1000; run++) {
        let state: TimerState = { kind: 'Idle' };
        let now = 1000;

        // Start
        const targetMs = 60000 + Math.floor(Math.random() * 10) * 60000;
        const startEv: TimerEvent = { type: 'START', now, targetMs };
        const startRes = transition(Object.freeze({ ...state }), startEv);
        expect(startRes.ok).toBe(true);
        if (startRes.ok) {
          state = startRes.state;
        }

        // Random sequence of 10-20 events
        const seqLength = 10 + Math.floor(Math.random() * 10);
        for (let i = 0; i < seqLength; i++) {
          now += Math.floor(Math.random() * 5000);
          const chosenType = eventTypes[Math.floor(Math.random() * eventTypes.length)]!;
          let event: TimerEvent;

          switch (chosenType) {
            case 'TICK':
              event = { type: 'TICK', now };
              break;
            case 'PAUSE':
              event = { type: 'PAUSE', now };
              break;
            case 'RESUME':
              event = { type: 'RESUME', now };
              break;
            case 'ADD_TIME':
              event = { type: 'ADD_TIME', now, ms: ADD_TIME_STEP_MS };
              break;
            case 'COMPLETE':
              event = { type: 'COMPLETE', now };
              break;
            case 'VERIFY':
              event = { type: 'VERIFY', now, parentAuthorized: Math.random() > 0.5 };
              break;
            case 'PARENT_ABANDON':
              event = { type: 'PARENT_ABANDON', now, parentAuthorized: Math.random() > 0.8 };
              break;
          }

          // Deep freeze input state to enforce purity and lack of mutation
          const frozenState = Object.freeze(JSON.parse(JSON.stringify(state)));
          const cloneBefore = JSON.parse(JSON.stringify(state));

          const res = transition(frozenState, event);

          // Purity: input state is unchanged
          expect(frozenState).toEqual(cloneBefore);

          // State bounds:
          if (res.state.kind !== 'Idle') {
            expect(res.state.pausedTotalMs).toBeLessThanOrEqual(PAUSE_BUDGET_MS);

            if (res.state.kind === 'Running') {
              const elapsed = runElapsed(res.state, now);
              expect(elapsed).toBeLessThanOrEqual(res.state.targetMs + res.state.addedMs);
            }
          }

          state = res.state;
        }
      }
    });
  });
});
