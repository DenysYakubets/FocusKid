import { transition } from '../fsm';
import { TimerEvent, TimerState } from '../types';

describe('INV-03: Early termination is forbidden, timer honesty', () => {
  const targetMs = 60000;
  const runningState: TimerState = {
    kind: 'Running',
    targetMs,
    addedMs: 0,
    runAccumMs: 0,
    runSince: 1000,
    pausedTotalMs: 0,
    pauseCount: 0,
  };

  it('rejects COMPLETE at remaining = 1 ms with EARLY_TERMINATION_FORBIDDEN', () => {
    // 60000 ms target, started at 1000, so remaining = 1 ms at now = 1000 + 59999 = 60999
    const res = transition(runningState, { type: 'COMPLETE', now: 60999 });
    expect(res).toEqual({
      ok: false,
      state: runningState,
      error: 'EARLY_TERMINATION_FORBIDDEN',
    });
  });

  it('rejects VERIFY from Running with NOT_COMPLETED', () => {
    const resAuthorized = transition(runningState, {
      type: 'VERIFY',
      now: 30000,
      parentAuthorized: true,
    });
    expect(resAuthorized).toEqual({
      ok: false,
      state: runningState,
      error: 'NOT_COMPLETED',
    });

    const resUnauthorized = transition(runningState, {
      type: 'VERIFY',
      now: 30000,
      parentAuthorized: false,
    });
    expect(resUnauthorized).toEqual({
      ok: false,
      state: runningState,
      error: 'NOT_COMPLETED',
    });
  });

  it('rejects VERIFY from Paused with NOT_COMPLETED', () => {
    const pausedState: TimerState = {
      kind: 'Paused',
      targetMs,
      addedMs: 0,
      runAccumMs: 10000,
      pausedSince: 11000,
      pausedTotalMs: 0,
      pauseCount: 1,
    };

    const res = transition(pausedState, {
      type: 'VERIFY',
      now: 15000,
      parentAuthorized: true,
    });
    expect(res).toEqual({
      ok: false,
      state: pausedState,
      error: 'NOT_COMPLETED',
    });
  });

  it('allows reaching Completed ONLY via TICK or COMPLETE when remaining = 0', () => {
    // Exactly at remaining = 0: now = 1000 + 60000 = 61000
    const tickRes = transition(runningState, { type: 'TICK', now: 61000 });
    expect(tickRes.ok).toBe(true);
    if (!tickRes.ok) return;
    expect(tickRes.state.kind).toBe('Completed');
    expect(tickRes.effects).toContain('COMPLETED');

    const completeRes = transition(runningState, { type: 'COMPLETE', now: 61000 });
    expect(completeRes.ok).toBe(true);
    if (!completeRes.ok) return;
    expect(completeRes.state.kind).toBe('Completed');
    expect(completeRes.effects).toContain('COMPLETED');
  });

  it('ensures no child event moves a session out of Running without time elapsing', () => {
    // Child events available: TICK, PAUSE, ADD_TIME, COMPLETE
    // Before target has elapsed (e.g. now = 30000):
    const now = 30000;

    // TICK stays Running
    const tick = transition(runningState, { type: 'TICK', now });
    expect(tick.ok).toBe(true);
    if (tick.ok) expect(tick.state.kind).toBe('Running');

    // COMPLETE is rejected
    const complete = transition(runningState, { type: 'COMPLETE', now });
    expect(complete.ok).toBe(false);

    // ADD_TIME stays Running (and only increases total time)
    const addTime = transition(runningState, { type: 'ADD_TIME', now, ms: 300000 });
    expect(addTime.ok).toBe(true);
    if (addTime.ok) expect(addTime.state.kind).toBe('Running');

    // PAUSE moves to Paused, but Paused cannot be completed without resuming and elapsing
    const pause = transition(runningState, { type: 'PAUSE', now });
    expect(pause.ok).toBe(true);
    if (pause.ok) {
      expect(pause.state.kind).toBe('Paused');
      // From Paused, complete is forbidden
      const pausedComplete = transition(pause.state, { type: 'COMPLETE', now });
      expect(pausedComplete.ok).toBe(false);
    }
  });
});
