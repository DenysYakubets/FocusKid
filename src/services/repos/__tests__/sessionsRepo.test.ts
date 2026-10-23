/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../../db/migrations';
import { createSessionsRepo } from '../sessionsRepo';

describe('SessionsRepo', () => {
  let db = createNodeDb();
  let repo = createSessionsRepo(db);

  beforeEach(async () => {
    db = createNodeDb();
    await migrate(db);
    repo = createSessionsRepo(db);

    // Create a base task
    await db.run(
      `INSERT INTO tasks (title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES ('Task A', '⭐', 15, 127, 0, 0, '2026-10-23T10:00:00Z', '2026-10-23T10:00:00Z');`
    );
  });

  it('inserts a running session and retrieves it', async () => {
    const session = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    expect(session.id).toBeGreaterThan(0);
    expect(session.status).toBe('running');
    expect(session.targetMs).toBe(900000);
    expect(session.elapsedRunMs).toBe(0);

    const fetched = await repo.get(session.id);
    expect(fetched).toEqual(session);
  });

  it('updates checkpoint elapsed_run_ms and paused_total_ms', async () => {
    const session = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    await repo.checkpoint(session.id, 5000, 2000, '2026-10-23T10:00:05Z');
    const updated = await repo.get(session.id);
    expect(updated?.elapsedRunMs).toBe(5000);
    expect(updated?.pausedTotalMs).toBe(2000);
    expect(updated?.updatedAt).toBe('2026-10-23T10:00:05Z');
  });

  it('setStatus updates status and extra fields', async () => {
    const session = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    await repo.setStatus(session.id, 'paused', {
      pauseCount: 1,
      updatedAt: '2026-10-23T10:01:00Z',
    });
    const paused = await repo.get(session.id);
    expect(paused?.status).toBe('paused');
    expect(paused?.pauseCount).toBe(1);

    await repo.setStatus(session.id, 'completed', {
      completedAt: '2026-10-23T10:15:00Z',
      updatedAt: '2026-10-23T10:15:00Z',
    });
    const completed = await repo.get(session.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBe('2026-10-23T10:15:00Z');
  });

  it('getActive returns currently running or paused session', async () => {
    expect(await repo.getActive()).toBeNull();

    const s = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    const activeRunning = await repo.getActive();
    expect(activeRunning?.id).toBe(s.id);

    await repo.setStatus(s.id, 'paused', { updatedAt: '2026-10-23T10:01:00Z' });
    const activePaused = await repo.getActive();
    expect(activePaused?.id).toBe(s.id);

    await repo.setStatus(s.id, 'completed', { updatedAt: '2026-10-23T10:15:00Z' });
    expect(await repo.getActive()).toBeNull();
  });

  it('getTodayForTask returns today non-abandoned session', async () => {
    const s = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    const todaySession = await repo.getTodayForTask(1, '2026-10-23');
    expect(todaySession?.id).toBe(s.id);

    // Other date returns null
    expect(await repo.getTodayForTask(1, '2026-10-24')).toBeNull();

    // Abandoned session is ignored
    await repo.setStatus(s.id, 'abandoned', { updatedAt: '2026-10-23T10:05:00Z' });
    expect(await repo.getTodayForTask(1, '2026-10-23')).toBeNull();
  });

  it('listCompleted returns only completed sessions', async () => {
    const s1 = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 60000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });
    await repo.setStatus(s1.id, 'completed', { updatedAt: '2026-10-23T10:01:00Z' });

    const completed = await repo.listCompleted();
    expect(completed.length).toBe(1);
    expect(completed[0]?.id).toBe(s1.id);
  });

  it('appendEvent appends events to session_events', async () => {
    const s = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 60000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });

    await repo.appendEvent({
      sessionId: s.id,
      event: 'START',
      fromState: 'Idle',
      toState: 'running',
      runMs: 0,
      createdAt: '2026-10-23T10:00:00Z',
    });

    const events = await db.all<{ event: string; from_state: string }>(
      `SELECT event, from_state FROM session_events WHERE session_id = ?;`,
      [s.id]
    );
    expect(events).toEqual([{ event: 'START', from_state: 'Idle' }]);
  });

  it('rangeStats aggregates verified sessions count and run ms', async () => {
    const s = await repo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 60000,
      startedAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    });
    await repo.setStatus(s.id, 'completed', {
      elapsedRunMs: 60000,
      updatedAt: '2026-10-23T10:01:00Z',
    });
    await repo.setStatus(s.id, 'verified', { updatedAt: '2026-10-23T10:02:00Z' });

    const stats = await repo.rangeStats('2026-10-20', '2026-10-25');
    expect(stats).toEqual([{ localDate: '2026-10-23', verified: 1, runMs: 60000 }]);
  });
});
