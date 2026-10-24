/** @jest-environment node */
/**
 * Round-1 HIGH (C4): `target_per_day` must be enforceable end to end.
 *
 * RED-first (pre-fix tree): the second non-abandoned session for the same
 * task/day is rejected twice over — AS-04 in `doStart` and the partial
 * `ux_sessions_task_day` UNIQUE index — so '2/3' can never advance. These
 * assertions fail until migration V5 drops that index and `doStart` enforces
 * the N-per-day rule with `SESSION_LIMIT_REACHED_TODAY`.
 *
 * AS-05 (one ACTIVE session, `ux_sessions_one_active`) is untouched and is
 * pinned here as a control.
 */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createTasksRepo, TasksRepo } from '../../repos/tasksRepo';
import { createTimerService, TimerService } from '../timerService';
import { FakeClock } from '../../../../test/helpers/fakeClock';

jest.setTimeout(30000);

const TODAY = '2026-10-23';

describe('C4: N non-abandoned sessions per task per day', () => {
  let db = createNodeDb();
  let fakeWall: WallClock;

  beforeEach(async () => {
    db = createNodeDb();
    await migrate(db);
    fakeWall = {
      todayLocalDate: () => TODAY,
      weekdayIndex: () => 4,
      addDays: (d) => d,
      nowIso: () => `${TODAY}T10:00:00Z`,
    };
  });

  function makeService(clock: FakeClock): TimerService {
    return createTimerService({
      db,
      clock,
      wall: fakeWall,
      sessionsRepo: createSessionsRepo(db),
      tasksRepo: createTasksRepo(db),
      consumeToken: () => true,
    });
  }

  /** Run one full session of `targetMs` to its Completed terminal state. */
  async function runToCompletion(service: TimerService, clock: FakeClock, targetMs: number) {
    clock.advance(targetMs);
    const tick = await service.tick();
    expect(tick.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Completed');
  }

  async function nonAbandonedToday(taskId: number): Promise<number> {
    const row = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions WHERE task_id = ? AND local_date = ? AND status <> 'abandoned';`,
      [taskId, TODAY]
    );
    return Number(row?.n ?? 0);
  }

  it('allows the 2nd session for the same task/day when target_per_day = 2 and counts it as completedToday', async () => {
    const clock = createFakeClock(1000);
    const service = makeService(clock);
    const tasksRepo: TasksRepo = createTasksRepo(db);
    const task = await tasksRepo.create(
      { title: 'Ранкова зарядка', targetMinutes: 1, daysMask: 127, targetPerDay: 2 },
      fakeWall.nowIso()
    );

    // 1st session of the day: runs to completion.
    expect((await service.start(task.id)).ok).toBe(true);
    await runToCompletion(service, clock, 60_000);

    // 2nd session of the same task/day: ALLOWED (RED on the pre-fix tree —
    // AS-04 / UNIQUE constraint failed: sessions.task_id, sessions.local_date).
    const second = await service.start(task.id);
    expect(second.ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Running');
    expect(await nonAbandonedToday(task.id)).toBe(2);

    await runToCompletion(service, clock, 60_000);

    // Today list now reports 2/2 — the '2/3' style counter can really advance.
    const today = await tasksRepo.listToday(TODAY, 4);
    const view = today.find((t) => t.id === task.id);
    expect(view?.completedToday).toBe(2);
    expect(view?.targetPerDay).toBe(2);
  });

  it('rejects the (target_per_day + 1)-th session with SESSION_LIMIT_REACHED_TODAY', async () => {
    const clock = createFakeClock(1000);
    const service = makeService(clock);
    const tasksRepo = createTasksRepo(db);
    const task = await tasksRepo.create(
      { title: 'Ранкова зарядка', targetMinutes: 1, daysMask: 127, targetPerDay: 2 },
      fakeWall.nowIso()
    );

    expect((await service.start(task.id)).ok).toBe(true);
    await runToCompletion(service, clock, 60_000);
    expect((await service.start(task.id)).ok).toBe(true);
    await runToCompletion(service, clock, 60_000);

    // 3rd > target 2 -> rejected with the new code, not SESSION_ALREADY_EXISTS_TODAY.
    expect(await service.start(task.id)).toEqual({
      ok: false,
      error: 'SESSION_LIMIT_REACHED_TODAY',
    });
    expect(await nonAbandonedToday(task.id)).toBe(2);
  });

  it('keeps the default target of 1: the 2nd session of the day is rejected', async () => {
    const clock = createFakeClock(1000);
    const service = makeService(clock);
    const tasksRepo = createTasksRepo(db);
    const task = await tasksRepo.create(
      { title: 'Читання', targetMinutes: 1, daysMask: 127 },
      fakeWall.nowIso()
    );

    expect((await service.start(task.id)).ok).toBe(true);
    await runToCompletion(service, clock, 60_000);

    expect(await service.start(task.id)).toEqual({
      ok: false,
      error: 'SESSION_LIMIT_REACHED_TODAY',
    });
    expect(await nonAbandonedToday(task.id)).toBe(1);
  });

  it('control (AS-05 untouched): a foreign active session still blocks a start', async () => {
    const clock = createFakeClock(1000);
    const service = makeService(clock);
    const tasksRepo = createTasksRepo(db);
    const taskA = await tasksRepo.create(
      { title: 'Читання', targetMinutes: 15, daysMask: 127, targetPerDay: 3 },
      fakeWall.nowIso()
    );
    const taskB = await tasksRepo.create(
      { title: 'Домашнє завдання', targetMinutes: 15, daysMask: 127, targetPerDay: 3 },
      fakeWall.nowIso()
    );

    expect((await service.start(taskA.id)).ok).toBe(true);
    expect(await service.start(taskB.id)).toEqual({ ok: false, error: 'ACTIVE_SESSION_EXISTS' });
  });
});