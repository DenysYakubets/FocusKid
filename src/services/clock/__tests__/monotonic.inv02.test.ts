/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { remaining } from '../../../domain/timer/elapsed';
import { migrate } from '../../db/migrations';
import { seedIfEmpty } from '../../db/seed';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createTasksRepo } from '../../repos/tasksRepo';
import { createTimerService } from '../../timer/timerService';
import { systemWallClock } from '../wallClock';

describe('INV-02: Monotonic clock immunity against wall clock changes', () => {
  let dateNowSpy: jest.SpyInstance;
  const RealDate = global.Date;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    global.Date = RealDate;
  });

  it('drives TimerService with fake monotonic clock while Date.now and Date constructor jump ±24h', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, systemWallClock);

    const clock = createFakeClock(1000);
    const sessionsRepo = createSessionsRepo(db);
    const tasksRepo = createTasksRepo(db);

    const timerService = createTimerService({
      db,
      clock,
      wall: systemWallClock,
      sessionsRepo,
      tasksRepo,
    });

    // Start task 1 (15 min = 900,000 ms)
    const startRes = await timerService.start(1);
    expect(startRes.ok).toBe(true);

    const snapshot1 = timerService.getSnapshot();
    expect(remaining(snapshot1.state, clock.now())).toBe(900000);

    // Wall clock jumps forward +24 hours via Date.now and Date constructor
    const baseTime = 1700000000000;
    const futureTime = baseTime + 24 * 60 * 60 * 1000;
    dateNowSpy.mockReturnValue(futureTime);

    // Mock Date constructor jumping forward +24h
    class MockedDateForward extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(futureTime);
        } else {
          // @ts-expect-error pass through args
          super(...args);
        }
      }
    }
    // @ts-expect-error mock Date
    global.Date = MockedDateForward;

    // Advance monotonic clock by 10 seconds
    clock.advance(10000);
    await timerService.tick();

    const snapshot2 = timerService.getSnapshot();
    // Remaining time depends ONLY on monotonic clock (890,000 ms)
    expect(remaining(snapshot2.state, clock.now())).toBe(890000);

    // Wall clock jumps backwards 48 hours (-24h from original base)
    const pastTime = baseTime - 24 * 60 * 60 * 1000;
    dateNowSpy.mockReturnValue(pastTime);

    class MockedDateBackward extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(pastTime);
        } else {
          // @ts-expect-error pass through args
          super(...args);
        }
      }
    }
    // @ts-expect-error mock Date
    global.Date = MockedDateBackward;

    // Advance monotonic clock by another 5 seconds
    clock.advance(5000);
    await timerService.tick();

    const snapshot3 = timerService.getSnapshot();
    // monontonically elapsed 15,000 ms: remaining = 900,000 - 15,000 = 885,000 ms
    expect(remaining(snapshot3.state, clock.now())).toBe(885000);

    // Backwards monotonic step (defense in depth):
    // When now steps backwards before runSince, delta clamps to 0:
    if (snapshot3.state.kind === 'Running') {
      const remainingAtRunSince = remaining(snapshot3.state, snapshot3.state.runSince);
      const remainingBackwards = remaining(snapshot3.state, snapshot3.state.runSince - 5000);
      // Timer clamps delta to 0, so remaining time NEVER gains time (exceeds initial remaining)
      expect(remainingBackwards).toBe(remainingAtRunSince);
    }
  });
});
