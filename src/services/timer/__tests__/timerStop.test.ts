/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { seedIfEmpty } from '../../db/seed';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createTasksRepo } from '../../repos/tasksRepo';
import { createTimerService } from '../timerService';

const fakeWall: WallClock = {
  ...systemWallClock,
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

describe('F3 - TimerService.stop() (child-initiated, no parent token)', () => {
  jest.setTimeout(30000);

  async function buildService() {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, fakeWall);
    const clock = createFakeClock(1000);
    const sessionsRepo = createSessionsRepo(db);
    const tasksRepo = createTasksRepo(db);
    const service = createTimerService({
      db,
      clock,
      wall: fakeWall,
      sessionsRepo,
      tasksRepo,
      consumeToken: () => false, // deliberately: stop must not need a token
    });
    return { db, clock, service, sessionsRepo };
  }

  it('terminates a running session without any parent token', async () => {
    const { service, sessionsRepo } = await buildService();

    const started = await service.start(1);
    expect(started.ok).toBe(true);
    const sessionId = service.getSnapshot().sessionId!;
    expect(sessionId).toBeGreaterThan(0);

    // No token passed at all — this is the child-initiated path.
    const stopped = await service.stop();
    expect(stopped.ok).toBe(true);
    expect(stopped.ok && stopped.state.kind).toBe('Idle');

    const snapshot = service.getSnapshot();
    expect(snapshot.state.kind).toBe('Idle');
    expect(snapshot.sessionId).toBeNull();
    expect(snapshot.taskId).toBeNull();

    const row = await sessionsRepo.get(sessionId);
    expect(row?.status).toBe('abandoned');
    expect(row?.elapsedRunMs).toBeGreaterThanOrEqual(0);
  });

  it('terminates a paused session and appends a STOP audit event', async () => {
    const { db, clock, service, sessionsRepo } = await buildService();

    await service.start(1);
    const sessionId = service.getSnapshot().sessionId!;
    await service.pause();
    clock.advance(60_000);

    expect((await service.stop()).ok).toBe(true);
    expect(service.getSnapshot().state.kind).toBe('Idle');

    const row = await sessionsRepo.get(sessionId);
    expect(row?.status).toBe('abandoned');

    const events = await db.all<{ event: string; from_state: string; to_state: string }>(
      `SELECT event, from_state, to_state FROM session_events WHERE session_id = ? ORDER BY id ASC;`,
      [sessionId]
    );
    expect(events.map((e) => e.event)).toContain('STOP');
    const stopEvent = events.find((e) => e.event === 'STOP');
    expect(stopEvent?.from_state).toBe('paused');
    expect(stopEvent?.to_state).toBe('abandoned');
  });

  it('rejects stop() when no session is running', async () => {
    const { service } = await buildService();
    const res = await service.stop();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_TRANSITION');
  });

  it('an abandoned (stopped) session does not block starting the same task again', async () => {
    const { service } = await buildService();
    await service.start(1);
    expect((await service.stop()).ok).toBe(true);
    const restarted = await service.start(1);
    expect(restarted.ok).toBe(true);
  });
});