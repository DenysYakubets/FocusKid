import { PAUSE_BUDGET_MS } from '../constants';
import { runElapsed } from '../elapsed';
import { transition } from '../fsm';
import { TimerState } from '../types';

describe('INV-04: Cumulative Pause Budget (300,000 ms) and Auto-Resume', () => {
  it('pauses for 10 min, then TICK yields Running with pausedTotalMs = 300000, AUTO_RESUMED, and exact run time from budget exhaustion', () => {
    // Session target = 15 min (900,000 ms), started at 0
    const startRes = transition({ kind: 'Idle' }, { type: 'START', now: 0, targetMs: 900000 });
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;

    // Run for 1 minute (60,000 ms), then pause at 60,000 ms
    const pauseRes = transition(startRes.state, { type: 'PAUSE', now: 60000 });
    expect(pauseRes.ok).toBe(true);
    if (!pauseRes.ok) return;
    expect(pauseRes.state.kind).toBe('Paused');

    // 10 minutes pass in paused state: now = 60000 + 600000 = 660,000 ms
    // Budget is 300,000 ms (5 min). Budget runs out at 60,000 + 300,000 = 360,000 ms.
    // So from 360,000 ms to 660,000 ms (300,000 ms = 5 min), the timer was running!
    const tickRes = transition(pauseRes.state, { type: 'TICK', now: 660000 });
    expect(tickRes.ok).toBe(true);
    if (!tickRes.ok) return;

    expect(tickRes.effects).toEqual(['AUTO_RESUMED']);
    expect(tickRes.state.kind).toBe('Running');
    if (tickRes.state.kind !== 'Running') return;

    expect(tickRes.state.pausedTotalMs).toBe(PAUSE_BUDGET_MS);
    expect(tickRes.state.runSince).toBe(360000); // exact budget exhaustion moment!

    // Total run elapsed should be 60,000 (initial) + (660,000 - 360,000) = 360,000 ms
    expect(runElapsed(tickRes.state, 660000)).toBe(360000);

    // Further PAUSE is rejected with PAUSE_BUDGET_EXHAUSTED
    const secondPauseRes = transition(tickRes.state, { type: 'PAUSE', now: 660000 });
    expect(secondPauseRes).toEqual({
      ok: false,
      state: tickRes.state,
      error: 'PAUSE_BUDGET_EXHAUSTED',
    });
  });

  it('behaves the same way across several short pauses totaling 5 min', () => {
    let state: TimerState = { kind: 'Idle' };
    const startRes = transition(state, { type: 'START', now: 0, targetMs: 900000 });
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;
    state = startRes.state;

    // Pause 1: 2 minutes (120,000 ms)
    let now = 10000; // run for 10s
    let res = transition(state, { type: 'PAUSE', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;

    now += 120000; // paused 2 min
    res = transition(state, { type: 'RESUME', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;
    expect(state.kind === 'Running' && state.pausedTotalMs).toBe(120000);

    // Pause 2: 2 minutes (120,000 ms) -> cumulative 240,000 ms
    now += 5000;
    res = transition(state, { type: 'PAUSE', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;

    now += 120000;
    res = transition(state, { type: 'RESUME', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;
    expect(state.kind === 'Running' && state.pausedTotalMs).toBe(240000);

    // Pause 3: 2 minutes attempted, but only 60,000 ms left in budget!
    now += 5000;
    const pause3Start = now;
    res = transition(state, { type: 'PAUSE', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;

    // Now advance 120,000 ms (2 minutes). The budget runs out after 60,000 ms.
    now += 120000;
    const tickRes = transition(state, { type: 'TICK', now });
    expect(tickRes.ok).toBe(true);
    if (!tickRes.ok) return;
    expect(tickRes.effects).toEqual(['AUTO_RESUMED']);
    expect(tickRes.state.kind).toBe('Running');
    if (tickRes.state.kind !== 'Running') return;

    expect(tickRes.state.pausedTotalMs).toBe(PAUSE_BUDGET_MS);
    expect(tickRes.state.runSince).toBe(pause3Start + 60000); // exhausted after 60s

    // Further PAUSE is rejected
    const finalPause = transition(tickRes.state, { type: 'PAUSE', now });
    expect(finalPause).toEqual({
      ok: false,
      state: tickRes.state,
      error: 'PAUSE_BUDGET_EXHAUSTED',
    });
  });
});
