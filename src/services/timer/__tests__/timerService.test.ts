/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { ADD_TIME_STEP_MS } from '../../../domain/timer/constants';
import { remaining } from '../../../domain/timer/elapsed';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { seedIfEmpty } from '../../db/seed';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createTasksRepo } from '../../repos/tasksRepo';
import { createTimerService } from '../timerService';

describe('TimerService', () => {
  let db = createNodeDb();
  let fakeWall: WallClock;

  beforeEach(async () => {
    db = createNodeDb();
    await migrate(db);

    let currentDate = '2026-10-23';
    let currentIso = '2026-10-23T10:00:00Z';

    fakeWall = {
      todayLocalDate: () => currentDate,
      weekdayIndex: () => 4, // Friday
      addDays: (d, n) => d,
      nowIso: () => currentIso,
    };

    await seedIfEmpty(db, fakeWall);
  });

  it('runs complete lifecycle: start -> pause -> resume -> addTime -> tick -> complete -> verify', async () => {
    const clock = createFakeClock(1000);
    const sessionsRepo = createSessionsRepo(db);
    const tasksRepo = createTasksRepo(db);

    // Mock parent token consumer
    const tokens = new Set(['valid-token']);
    const consumeToken = (token: unknown) => {
      if (typeof token === 'string' && tokens.has(token)) {
        tokens.delete(token);
        return true;
      }
      return false;
    };

    const service = createTimerService({
      db,
      clock,
      wall: fakeWall,
      sessionsRepo,
      tasksRepo,
      consumeToken,
    });

    // Task 1: 15 min (900,000 ms)
    const startRes = await service.start(1);
    expect(startRes.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Running');

    // Advance 5 s and Pause
    clock.advance(5000);
    const pauseRes = await service.pause();
    expect(pauseRes.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Paused');

    // Advance 10 s and Resume
    clock.advance(10000);
    const resumeRes = await service.resume();
    expect(resumeRes.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Running');

    // Add time (+5 min = 300,000 ms)
    const addRes = await service.addTime(ADD_TIME_STEP_MS);
    expect(addRes.ok).toBe(true);
    const snapshot = service.getSnapshot();
    if (snapshot.state.kind === 'Running') {
      expect(snapshot.state.addedMs).toBe(ADD_TIME_STEP_MS);
    }

    // Advance to completion: total target = 900,000 + 300,000 = 1,200,000 ms.
    // Run elapsed so far: 5,000 ms. Remaining: 1,195,000 ms.
    clock.advance(1195000);
    const tickRes = await service.tick();
    expect(tickRes.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Completed');

    // Verify with invalid token is rejected
    const badVerify = await service.verify(service.getSnapshot().sessionId!, 'bad-token');
    expect(badVerify).toEqual({ ok: false, error: 'PARENT_AUTH_REQUIRED' });
    expect(service.getSnapshot().state.kind).toBe('Completed');

    // Verify with valid token
    const goodVerify = await service.verify(service.getSnapshot().sessionId!, 'valid-token');
    expect(goodVerify.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Verified');
  });

  it('Acceptance Criterion 6 (Hydration): restores running state and completes after exactly target - elapsed ms', async () => {
    // 1. Create a 1-minute task (target 60,000 ms)
    const tasksRepo = createTasksRepo(db);
    const testTask = await tasksRepo.create(
      { title: 'Хвилинка', targetMinutes: 1, daysMask: 127 },
      fakeWall.nowIso()
    );

    const clock1 = createFakeClock(1000);
    const sessionsRepo1 = createSessionsRepo(db);
    const service1 = createTimerService({
      db,
      clock: clock1,
      wall: fakeWall,
      sessionsRepo: sessionsRepo1,
      tasksRepo,
    });

    // Start session
    const startRes = await service1.start(testTask.id);
    expect(startRes.ok).toBe(true);

    // Advance 7 seconds (7,000 ms) and checkpoint
    clock1.advance(7000);
    await service1.checkpoint();

    // 2. Simulate process death: create a NEW service instance on the same DB with a fresh fake clock starting at 0
    const clock2 = createFakeClock(0);
    const sessionsRepo2 = createSessionsRepo(db);
    const service2 = createTimerService({
      db,
      clock: clock2,
      wall: fakeWall,
      sessionsRepo: sessionsRepo2,
      tasksRepo,
    });

    // Hydrate
    const hydrated = await service2.hydrate();
    expect(hydrated.state.kind).toBe('Running');
    if (hydrated.state.kind !== 'Running') return;

    expect(hydrated.state.runAccumMs).toBe(7000);

    // Remaining time should be 60,000 - 7,000 = 53,000 ms
    expect(remaining(hydrated.state, clock2.now())).toBe(53000);

    // Advance 52,999 ms -> remaining = 1 ms, still Running
    clock2.advance(52999);
    const tickBefore = await service2.tick();
    expect(tickBefore.ok).toBe(true);
    expect(service2.getSnapshot().state.kind).toBe('Running');

    // Advance 1 more ms (total exactly 53,000 ms) -> transitions to Completed!
    clock2.advance(1);
    const tickAfter = await service2.tick();
    expect(tickAfter.ok).toBe(true);
    expect(service2.getSnapshot().state.kind).toBe('Completed');
  });

  it('Acceptance Criterion 7 (Single active and one-per-day rules)', async () => {
    const clock = createFakeClock(1000);
    const sessionsRepo = createSessionsRepo(db);
    const tasksRepo = createTasksRepo(db);

    const service = createTimerService({
      db,
      clock,
      wall: fakeWall,
      sessionsRepo,
      tasksRepo,
      consumeToken: () => true,
    });

    // 1. Start task 1
    const res1 = await service.start(1);
    expect(res1.ok).toBe(true);

    // Attempt second start while task 1 is Running -> rejected with ACTIVE_SESSION_EXISTS (AS-05)
    const res2 = await service.start(2);
    expect(res2).toEqual({ ok: false, error: 'ACTIVE_SESSION_EXISTS' });

    // Complete task 1
    clock.advance(900000); // 15 min
    await service.tick();
    expect(service.getSnapshot().state.kind).toBe('Completed');

    // Attempt second start of task 1 on the same date -> rejected with SESSION_ALREADY_EXISTS_TODAY (AS-04)
    const resSameDay = await service.start(1);
    expect(resSameDay).toEqual({ ok: false, error: 'SESSION_ALREADY_EXISTS_TODAY' });

    // Parent abandons task 1
    const abandonRes = await service.abandon(service.getSnapshot().sessionId!, 'token');
    expect(abandonRes.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Idle');

    // Now starting task 1 again on the same day is allowed!
    const resAfterAbandon = await service.start(1);
    expect(resAfterAbandon.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Running');
  });
});
