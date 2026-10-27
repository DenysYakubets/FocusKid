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

const wall: WallClock = { ...systemWallClock, todayLocalDate: () => '2026-10-23', nowIso: () => '2026-10-23T10:00:00.000Z' };

describe('PIN authorized timer controls', () => {
  async function setup() {
    const db = createNodeDb(); await migrate(db); await seedIfEmpty(db, wall);
    const clock = createFakeClock(1000); const sessionsRepo = createSessionsRepo(db);
    let valid = true;
    const service = createTimerService({ db, clock, wall, sessionsRepo, tasksRepo: createTasksRepo(db), consumeToken: token => { if (token !== 'parent-token' || !valid) return false; valid = false; return true; } });
    return { db, clock, service, sessionsRepo };
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

  it('edits the assigned target in persisted session data', async () => {
    const { service, sessionsRepo } = await setup();
    await service.start(1); const id = service.getSnapshot().sessionId!;
    expect((await service.parentEditDuration(1200000, 'parent-token')).ok).toBe(true);
    expect((await sessionsRepo.get(id))?.targetMs).toBe(1200000);
    expect((await service.parentEditDuration(900000)).ok).toBe(false);
  });
});
