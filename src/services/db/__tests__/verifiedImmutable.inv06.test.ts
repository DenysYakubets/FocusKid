/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../migrations';

describe('INV-06 & Database triggers for FSM defence in depth', () => {
  let db = createNodeDb();

  beforeEach(async () => {
    db = createNodeDb();
    await migrate(db);
    // Create a base task
    await db.run(
      `INSERT INTO tasks (title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES ('Task 1', '📖', 15, 127, 0, 0, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
  });

  it('enforces that sessions must start in running state on INSERT', async () => {
    await expect(
      db.run(
        `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
         VALUES (1, '2026-10-23', 'completed', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
      )
    ).rejects.toThrow(/FSM: sessions must start in running/);
  });

  it('throws INV-03 when attempting to UPDATE status to verified from running', async () => {
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
    const sessionId = res.lastInsertRowId;

    await expect(
      db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [sessionId])
    ).rejects.toThrow(/INV-03/);
  });

  it('allows UPDATE to verified from completed', async () => {
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
    const sessionId = res.lastInsertRowId;

    await db.run(`UPDATE sessions SET status = 'completed' WHERE id = ?;`, [sessionId]);
    await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [sessionId]);

    const session = await db.get<{ status: string }>(`SELECT status FROM sessions WHERE id = ?;`, [
      sessionId,
    ]);
    expect(session?.status).toBe('verified');
  });

  it('throws INV-06 when attempting to UPDATE a verified session', async () => {
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
    const sessionId = res.lastInsertRowId;

    await db.run(`UPDATE sessions SET status = 'completed' WHERE id = ?;`, [sessionId]);
    await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [sessionId]);

    await expect(
      db.run(`UPDATE sessions SET elapsed_run_ms = 9999 WHERE id = ?;`, [sessionId])
    ).rejects.toThrow(/INV-06/);
  });

  it('throws INV-06 when attempting to DELETE a verified session', async () => {
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
    const sessionId = res.lastInsertRowId;

    await db.run(`UPDATE sessions SET status = 'completed' WHERE id = ?;`, [sessionId]);
    await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [sessionId]);

    await expect(db.run(`DELETE FROM sessions WHERE id = ?;`, [sessionId])).rejects.toThrow(
      /INV-06/
    );
  });

  it('enforces that session_events is append-only (no UPDATE or DELETE)', async () => {
    const sRes = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 60000, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z');`
    );
    const sessionId = sRes.lastInsertRowId;

    const eRes = await db.run(
      `INSERT INTO session_events (session_id, event, from_state, to_state, run_ms, created_at)
       VALUES (?, 'START', 'Idle', 'running', 0, '2026-10-23T00:00:00Z');`,
      [sessionId]
    );
    const eventId = eRes.lastInsertRowId;

    await expect(
      db.run(`UPDATE session_events SET event = 'HACK' WHERE id = ?;`, [eventId])
    ).rejects.toThrow(/session_events is append-only/);

    await expect(db.run(`DELETE FROM session_events WHERE id = ?;`, [eventId])).rejects.toThrow(
      /session_events is append-only/
    );
  });
});
