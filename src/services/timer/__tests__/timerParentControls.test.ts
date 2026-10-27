/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { seedIfEmpty } from '../../db/seed';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createTasksRepo } from '../../repos/tasksRepo';
import { createStatsService } from '../../stats/statsService';
import { createTimerService } from '../timerService';
import { remaining } from '../../../domain/timer/elapsed';

const wall: WallClock = { ...systemWallClock, todayLocalDate: () => '2026-10-23', nowIso: () => '2026-10-23T10:00:00.000Z' };

describe('PIN authorized timer controls', () => {
  async function setup() {
    const db = createNodeDb(); await migrate(db); await seedIfEmpty(db, wall);
    const clock = createFakeClock(1000); const sessionsRepo = createSessionsRepo(db);
    let valid = true;
    const tasksRepo = createTasksRepo(db);
    const service = createTimerService({ db, clock, wall, sessionsRepo, tasksRepo, consumeToken: token => { if (token !== 'parent-token' || !valid) return false; valid = false; return true; } });
    return { db, clock, service, sessionsRepo, tasksRepo };
  }

  it('denies early completion without a fresh parent token and credits target duration in stats', async () => {
    const { db, clock, service, sessionsRepo } = await setup();
    await service.start(1); const id = service.getSnapshot().sessionId!; clock.advance(180000);
    expect((await service.parentCompleteEarly()).ok).toBe(false);
    expect((await sessionsRepo.get(id))?.status).toBe('running');
    expect((await service.parentCompleteEarly('parent-token')).ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Completed');
    const row = await sessionsRepo.get(id); expect(row?.elapsedRunMs).toBe(row?.targetMs);
    const stats = createStatsService({ db, wall, sessionsRepo });
    expect((await stats.daySessions('2026-10-23')).find(s => s.taskId === 1)?.minutes).toBe(15);
  });

  it('indefinite pause does not auto resume on tick and resumes manually', async () => {
    const { clock, service } = await setup();
    await service.start(1); expect((await service.parentPauseIndefinitely('parent-token')).ok).toBe(true);
    clock.advance(900000); await service.tick();
    expect(service.getSnapshot().state.kind).toBe('Paused');
    expect((await service.resume()).ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Running');
  });

  it('child pause freezes remaining time across ticks and only manual resume restarts it', async () => {
    const { db, clock, service, sessionsRepo } = await setup();
    await service.start(1);
    clock.advance(30_000);
    expect((await service.pause()).ok).toBe(true);
    const id = service.getSnapshot().sessionId!;
    const paused = service.getSnapshot().state;
    if (paused.kind !== 'Paused') throw new Error('expected Paused');
    const remainingAtPause = remaining(paused, clock.now());

    clock.advance(10 * 60_000);
    await service.tick();
    const afterTick = service.getSnapshot().state;
    expect(afterTick.kind).toBe('Paused');
    expect(remaining(afterTick, clock.now())).toBe(remainingAtPause);
    expect((await sessionsRepo.get(id))?.indefinitePause).toBe(true);
    const events = await db.all<{ event: string }>(
      'SELECT event FROM session_events WHERE session_id = ? ORDER BY id ASC;', [id]
    );
    expect(events.map(event => event.event)).not.toContain('AUTO_RESUMED');

    expect((await service.resume()).ok).toBe(true);
    clock.advance(5_000);
    const resumed = service.getSnapshot().state;
    expect(remaining(resumed, clock.now())).toBe(remainingAtPause - 5_000);
  });

  it('sets remaining time without changing the assigned target and clamps to task duration', async () => {
    const { service, clock, sessionsRepo, tasksRepo } = await setup();
    const task = await tasksRepo.get(1);
    expect(task).toBeTruthy();
    await tasksRepo.update(1, { targetMinutes: 20 }, wall.nowIso());
    await service.start(1); const id = service.getSnapshot().sessionId!;
    clock.advance(15 * 60_000);
    expect((await service.parentEditDuration(19 * 60_000, 'parent-token')).ok).toBe(true);
    expect((await sessionsRepo.get(id))?.targetMs).toBe(20 * 60_000);
    expect((await sessionsRepo.get(id))?.elapsedRunMs).toBe(1 * 60_000);
    expect(remaining(service.getSnapshot().state, clock.now())).toBe(19 * 60_000);

    const clamped = await setup();
    await createTasksRepo(clamped.db).update(1, { targetMinutes: 20 }, wall.nowIso());
    await clamped.service.start(1);
    expect((await clamped.service.parentEditDuration(25 * 60_000, 'parent-token')).ok).toBe(true);
    expect(remaining(clamped.service.getSnapshot().state, clamped.clock.now())).toBe(20 * 60_000);
    expect((await clamped.sessionsRepo.get(clamped.service.getSnapshot().sessionId!))?.targetMs).toBe(20 * 60_000);
  });
});
