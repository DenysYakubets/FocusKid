/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { pauseBudgetLeft, runElapsed } from '../../../domain/timer/elapsed';
import { ADD_TIME_STEP_MS } from '../../../domain/timer/constants';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { seedIfEmpty } from '../../db/seed';
import { createAppServices } from '../../../state/appServices';

describe('Checkpoint Lifecycle & Process Kill Survival', () => {
  let fakeWall: WallClock;

  beforeEach(() => {
    fakeWall = {
      todayLocalDate: () => '2026-10-23',
      weekdayIndex: () => 4,
      addDays: (d) => d,
      nowIso: () => '2026-10-23T10:00:00Z',
    };
  });

  it('survives MID-RUN process kill/restart after checkpoint', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, fakeWall);

    const clock = createFakeClock(1000);
    const servicesA = createAppServices({ db, clock, wall: fakeWall });

    // Start Task 1 (target 15 min = 900_000 ms)
    const startRes = await servicesA.timerService.start(1);
    expect(startRes.ok).toBe(true);
    expect(servicesA.timerService.getSnapshot().state.kind).toBe('Running');

    // Advance 10 minutes (600_000 ms) and checkpoint
    clock.advance(600_000);
    await servicesA.timerService.checkpoint();

    // Simulate process kill: create fresh services on the SAME db
    const freshClock = createFakeClock(clock.now());
    const servicesB = createAppServices({ db, clock: freshClock, wall: fakeWall });
    const snapshot = await servicesB.timerService.hydrate();

    expect(snapshot.state.kind).toBe('Running');
    expect(runElapsed(snapshot.state, freshClock.now())).toBe(600_000);
  });

  it('survives MID-PAUSE process kill/restart without consuming pause time', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, fakeWall);

    const clock = createFakeClock(1000);
    const servicesA = createAppServices({ db, clock, wall: fakeWall });

    // Start Task 1
    const startRes = await servicesA.timerService.start(1);
    expect(startRes.ok).toBe(true);

    // Advance 60s in running state, then pause
    clock.advance(60_000);
    const pauseRes = await servicesA.timerService.pause();
    expect(pauseRes.ok).toBe(true);
    expect(servicesA.timerService.getSnapshot().state.kind).toBe('Paused');

    // Advance 120s while paused, then checkpoint
    clock.advance(120_000);
    await servicesA.timerService.checkpoint();

    // Simulate process kill: fresh services on the SAME db
    const freshClock = createFakeClock(clock.now());
    const servicesB = createAppServices({ db, clock: freshClock, wall: fakeWall });
    const snapshot = await servicesB.timerService.hydrate();

    expect(snapshot.state.kind).toBe('Paused');
    // Full pauses do not consume pause budget while the child is away.
    expect(pauseBudgetLeft(snapshot.state, freshClock.now())).toBe(300_000);
  });

  it('persists run progress on resume() transition (defence in depth)', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, fakeWall);

    const clock = createFakeClock(1000);
    const servicesA = createAppServices({ db, clock, wall: fakeWall });

    // Start Task 1, run 60s, pause, wait 10s, resume
    await servicesA.timerService.start(1);
    clock.advance(60_000);
    await servicesA.timerService.pause();
    clock.advance(10_000);
    await servicesA.timerService.resume();

    // Kill immediately WITHOUT checkpoint()
    const freshClock = createFakeClock(clock.now());
    const servicesB = createAppServices({ db, clock: freshClock, wall: fakeWall });
    const snapshot = await servicesB.timerService.hydrate();

    expect(snapshot.state.kind).toBe('Running');
    expect(runElapsed(snapshot.state, freshClock.now())).toBe(60_000);
  });

  it('persists run progress on addTime() transition (defence in depth)', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, fakeWall);

    const clock = createFakeClock(1000);
    const servicesA = createAppServices({ db, clock, wall: fakeWall });

    // Start Task 1, run 45s, add time
    await servicesA.timerService.start(1);
    clock.advance(45_000);
    await servicesA.timerService.addTime(ADD_TIME_STEP_MS);

    // Kill immediately WITHOUT checkpoint()
    const freshClock = createFakeClock(clock.now());
    const servicesB = createAppServices({ db, clock: freshClock, wall: fakeWall });
    const snapshot = await servicesB.timerService.hydrate();

    expect(snapshot.state.kind).toBe('Running');
    expect(runElapsed(snapshot.state, freshClock.now())).toBe(45_000);
  });
});
