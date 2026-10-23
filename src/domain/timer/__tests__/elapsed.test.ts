import { PAUSE_BUDGET_MS } from '../constants';
import { pauseBudgetLeft, pausedElapsed, remaining, runElapsed } from '../elapsed';
import { TimerState } from '../types';

describe('elapsed derived calculations', () => {
  it('handles Idle state correctly', () => {
    const idle: TimerState = { kind: 'Idle' };
    expect(runElapsed(idle, 5000)).toBe(0);
    expect(pausedElapsed(idle, 5000)).toBe(0);
    expect(remaining(idle, 5000)).toBe(0);
    expect(pauseBudgetLeft(idle, 5000)).toBe(PAUSE_BUDGET_MS);
  });

  describe('runElapsed', () => {
    it('accumulates run time while Running and clamps backwards time to 0 delta', () => {
      const running: TimerState = {
        kind: 'Running',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 5000,
        runSince: 10000,
        pausedTotalMs: 0,
        pauseCount: 0,
      };

      expect(runElapsed(running, 12000)).toBe(7000);
      // Backwards monotonic step (defense in depth):
      expect(runElapsed(running, 8000)).toBe(5000);
    });

    it('returns runAccumMs when Paused, Completed, or Verified', () => {
      const paused: TimerState = {
        kind: 'Paused',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 5000,
        pausedSince: 10000,
        pausedTotalMs: 2000,
        pauseCount: 1,
      };
      expect(runElapsed(paused, 20000)).toBe(5000);

      const completed: TimerState = {
        kind: 'Completed',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 60000,
        pausedTotalMs: 2000,
        pauseCount: 1,
      };
      expect(runElapsed(completed, 20000)).toBe(60000);
    });
  });

  describe('pausedElapsed', () => {
    it('accumulates pause time while Paused and clamps backwards time', () => {
      const paused: TimerState = {
        kind: 'Paused',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 5000,
        pausedSince: 10000,
        pausedTotalMs: 3000,
        pauseCount: 1,
      };

      expect(pausedElapsed(paused, 15000)).toBe(8000);
      expect(pausedElapsed(paused, 8000)).toBe(3000);
    });

    it('returns pausedTotalMs when Running or Completed', () => {
      const running: TimerState = {
        kind: 'Running',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 0,
        runSince: 1000,
        pausedTotalMs: 4000,
        pauseCount: 1,
      };
      expect(pausedElapsed(running, 5000)).toBe(4000);
    });
  });

  describe('remaining', () => {
    it('calculates remaining time and clamps to 0 when target is reached', () => {
      const running: TimerState = {
        kind: 'Running',
        targetMs: 60000,
        addedMs: 300000, // 5 min added
        runAccumMs: 20000,
        runSince: 1000,
        pausedTotalMs: 0,
        pauseCount: 0,
      };

      // targetMs + addedMs = 360000. elapsed = 20000 + (11000 - 1000) = 30000. remaining = 330000.
      expect(remaining(running, 11000)).toBe(330000);
      // When elapsed exceeds total target
      expect(remaining(running, 500000)).toBe(0);
    });
  });

  describe('pauseBudgetLeft', () => {
    it('calculates remaining pause budget and clamps to 0 when budget is exhausted', () => {
      const paused: TimerState = {
        kind: 'Paused',
        targetMs: 60000,
        addedMs: 0,
        runAccumMs: 1000,
        pausedSince: 0,
        pausedTotalMs: 100000,
        pauseCount: 1,
      };

      // 300000 - (100000 + 50000) = 150000
      expect(pauseBudgetLeft(paused, 50000)).toBe(150000);
      // Beyond 300000 total pause
      expect(pauseBudgetLeft(paused, 250000)).toBe(0);
    });
  });
});
