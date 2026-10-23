/** @jest-environment node */
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { migrate } from '../../services/db/migrations';
import { seedIfEmpty } from '../../services/db/seed';
import { createAppServices } from '../appServices';
import { timerStore } from '../timerStore';

describe('timerStore', () => {
  let db = createNodeDb();
  let clock = createFakeClock(1000);
  let wall = systemWallClock;

  beforeEach(async () => {
    db = createNodeDb();
    clock = createFakeClock(1000);
    await migrate(db);
    await seedIfEmpty(db, wall);

    const services = createAppServices({ db, clock, wall });
    timerStore.setService(services.timerService);
    await timerStore.hydrate();
  });

  it('starts a task, sets snapshot to Running, and updates lastError', async () => {
    const ok = await timerStore.start(1);
    expect(ok).toBe(true);

    const snap = timerStore.getSnapshot();
    expect(snap.state.kind).toBe('Running');
    expect(snap.taskId).toBe(1);
    expect(snap.sessionId).not.toBeNull();
    expect(timerStore.getState().lastError).toBeNull();
  });

  it('pauses and resumes a running session', async () => {
    await timerStore.start(1);
    clock.advance(5000);

    const pauseOk = await timerStore.pause();
    expect(pauseOk).toBe(true);
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');

    clock.advance(2000);

    const resumeOk = await timerStore.resume();
    expect(resumeOk).toBe(true);
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
  });

  it('addTime increments addedMs and is capped', async () => {
    await timerStore.start(1);

    for (let i = 0; i < 12; i++) {
      const ok = await timerStore.addTime();
      expect(ok).toBe(true);
    }

    const state = timerStore.getSnapshot().state;
    if (state.kind === 'Running') {
      expect(state.addedMs).toBe(3_600_000);
    }

    // 13th attempt should fail
    const overLimitOk = await timerStore.addTime();
    expect(overLimitOk).toBe(false);
    expect(timerStore.getState().lastError).toBe('ADD_TIME_LIMIT');
  });

  it('tick advances the session and triggers completion at target time', async () => {
    await timerStore.start(1); // task 1 target: 15 min = 900_000 ms
    clock.advance(900_000);
    await timerStore.tick();

    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
  });

  it('Criterion 7: restart restores the Running screen / state on new services instance', async () => {
    // 1. Start task 1
    await timerStore.start(1);
    clock.advance(30_000);
    await timerStore.tick();

    const preRestartSnap = timerStore.getSnapshot();
    expect(preRestartSnap.state.kind).toBe('Running');
    const sessionId = preRestartSnap.sessionId;

    // 2. Simulate app restart: create brand-new services on the exact same DB
    const newClock = createFakeClock(clock.now());
    const newServices = createAppServices({
      db,
      clock: newClock,
      wall,
    });

    // 3. Hydrate timerStore with new services
    timerStore.setService(newServices.timerService);
    const restoredSnap = await timerStore.hydrate();

    expect(restoredSnap.state.kind).toBe('Running');
    expect(restoredSnap.sessionId).toBe(sessionId);
    expect(restoredSnap.taskId).toBe(1);
  });
});
