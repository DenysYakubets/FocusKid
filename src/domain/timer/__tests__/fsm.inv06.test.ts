import { transition } from '../fsm';
import { TimerEvent, TimerState } from '../types';

describe('INV-06: Verified state is immutable', () => {
  const verifiedState: TimerState = {
    kind: 'Verified',
    targetMs: 60000,
    addedMs: 0,
    runAccumMs: 60000,
    pausedTotalMs: 0,
    pauseCount: 0,
  };

  const allEvents: TimerEvent[] = [
    { type: 'START', now: 1000, targetMs: 60000 },
    { type: 'TICK', now: 1000 },
    { type: 'PAUSE', now: 1000 },
    { type: 'RESUME', now: 1000 },
    { type: 'ADD_TIME', now: 1000, ms: 300000 },
    { type: 'COMPLETE', now: 1000 },
    { type: 'VERIFY', now: 1000, parentAuthorized: true },
    { type: 'VERIFY', now: 1000, parentAuthorized: false },
    { type: 'PARENT_ABANDON', now: 1000, parentAuthorized: true },
    { type: 'PARENT_ABANDON', now: 1000, parentAuthorized: false },
  ];

  it('every event type sent to Verified returns VERIFIED_IMMUTABLE with identical state', () => {
    for (const ev of allEvents) {
      const res = transition(verifiedState, ev);
      expect(res).toEqual({
        ok: false,
        state: verifiedState,
        error: 'VERIFIED_IMMUTABLE',
      });
    }
  });
});
