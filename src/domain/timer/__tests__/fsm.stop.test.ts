import { transition } from '../fsm';
import { TimerState } from '../types';

const running: TimerState = {
  kind: 'Running',
  targetMs: 60_000,
  addedMs: 0,
  runAccumMs: 0,
  runSince: 1000,
  pausedTotalMs: 0,
  pauseCount: 0,
};

const paused: TimerState = {
  kind: 'Paused',
  targetMs: 60_000,
  addedMs: 0,
  runAccumMs: 5_000,
  pausedSince: 2_000,
  pausedTotalMs: 0,
  pauseCount: 1,
};

describe('F3 - child-initiated STOP transition', () => {
  it('Running -> Idle on STOP with the ABANDONED effect', () => {
    const res = transition(running, { type: 'STOP', now: 5_000 });
    expect(res).toEqual({ ok: true, state: { kind: 'Idle' }, effects: ['ABANDONED'] });
  });

  it('Paused -> Idle on STOP with the ABANDONED effect', () => {
    const res = transition(paused, { type: 'STOP', now: 5_000 });
    expect(res).toEqual({ ok: true, state: { kind: 'Idle' }, effects: ['ABANDONED'] });
  });

  it('STOP is rejected in Idle and in Completed (nothing to stop / already awaiting parent)', () => {
    expect(transition({ kind: 'Idle' }, { type: 'STOP', now: 5_000 })).toEqual({
      ok: false,
      state: { kind: 'Idle' },
      error: 'INVALID_TRANSITION',
    });

    const completed: TimerState = {
      kind: 'Completed',
      targetMs: 60_000,
      addedMs: 0,
      runAccumMs: 60_000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    expect(transition(completed, { type: 'STOP', now: 61_000 })).toEqual({
      ok: false,
      state: completed,
      error: 'INVALID_TRANSITION',
    });
  });

  it('STOP cannot touch a Verified session (INV-06)', () => {
    const verified: TimerState = {
      kind: 'Verified',
      targetMs: 60_000,
      addedMs: 0,
      runAccumMs: 60_000,
      pausedTotalMs: 0,
      pauseCount: 0,
    };
    expect(transition(verified, { type: 'STOP', now: 70_000 })).toEqual({
      ok: false,
      state: verified,
      error: 'VERIFIED_IMMUTABLE',
    });
  });

  it('STOP never reaches Completed/Verified from Running (INV-03 stays green)', () => {
    const res = transition(running, { type: 'STOP', now: 5_000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.kind).not.toBe('Completed');
      expect(res.state.kind).not.toBe('Verified');
    }
  });
});