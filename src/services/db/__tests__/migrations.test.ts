/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../migrations';
import { MIGRATIONS } from '../schema';

describe('Database migrations', () => {
  it('is idempotent and creates all tables, indexes, and triggers', async () => {
    const db = createNodeDb();

    // First migration
    await migrate(db);

    const versionRow1 = await db.get<{ user_version: number }>('PRAGMA user_version;');
    expect(versionRow1?.user_version).toBe(MIGRATIONS.length);

    // Second run (idempotent)
    await migrate(db);

    const versionRow2 = await db.get<{ user_version: number }>('PRAGMA user_version;');
    expect(versionRow2?.user_version).toBe(MIGRATIONS.length);

    // Check tables in sqlite_master
    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`
    );
    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ['parent_auth', 'session_events', 'sessions', 'settings', 'tasks'].sort()
    );

    // Check indexes
    const indexes = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';`
    );
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('ix_tasks_active');
    expect(indexNames).toContain('ix_sessions_date');
    // Round-1 HIGH: V5 drops the one-session-per-task-per-day UNIQUE index —
    // N per day cannot be expressed as UNIQUE — AS-05 must survive.
    expect(indexNames).not.toContain('ux_sessions_task_day');
    expect(indexNames).toContain('ux_sessions_one_active');
    expect(indexNames).toContain('ix_session_events_session');

    // Check triggers
    const triggers = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'trigger';`
    );
    const triggerNames = triggers.map((t) => t.name);
    expect(triggerNames).toContain('trg_sessions_insert_running');
    expect(triggerNames).toContain('trg_sessions_verify_only_from_completed');
    expect(triggerNames).toContain('trg_sessions_verified_no_update');
    expect(triggerNames).toContain('trg_sessions_verified_no_delete');
    expect(triggerNames).toContain('trg_session_events_no_update');
    expect(triggerNames).toContain('trg_session_events_no_delete');
  });

  it('V5: two non-abandoned sessions can share a task/day while one ACTIVE session stays unique', async () => {
    const db = createNodeDb();
    await migrate(db);

    await db.run(
      `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES (1, 'Читання', '📚', 15, 127, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`
    );

    // 1st run of the day completes...
    const first = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 900000, 900000, '2026-10-23T10:00:00Z', '2026-10-23T10:15:00Z');`
    );
    await db.run(`UPDATE sessions SET status = 'completed' WHERE id = ?;`, [first.lastInsertRowId]);

    // ...and the 2nd run of the SAME task/day is accepted (RED on the pre-fix
    // tree: UNIQUE constraint failed: sessions.task_id, sessions.local_date).
    const second = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-23', 'running', 900000, 0, '2026-10-23T11:00:00Z', '2026-10-23T11:00:00Z');`
    );
    expect(second.lastInsertRowId).toBeGreaterThan(first.lastInsertRowId);

    // AS-05 is untouched: a second ACTIVE session is still impossible.
    await expect(
      db.run(
        `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
         VALUES (1, '2026-10-24', 'running', 900000, 0, '2026-10-24T11:00:00Z', '2026-10-24T11:00:00Z');`
      )
    ).rejects.toThrow(/UNIQUE/);
  });

  it('V7 adds category with an other default and rejects invalid values', async () => {
    const db = createNodeDb(); await migrate(db);
    await db.run(`INSERT INTO tasks (title,target_minutes,days_mask,created_at,updated_at) VALUES ('New',15,127,'x','x')`);
    expect((await db.get<{category:string}>(`SELECT category FROM tasks WHERE title='New'`))?.category).toBe('other');
    await expect(db.run(`UPDATE tasks SET category='bad' WHERE title='New'`)).rejects.toThrow(/CHECK/);
  });

  it('UPGRADE: a V2 database with task rows and sessions migrates to the latest version without data loss', async () => {
    const db = createNodeDb();

    // Build a real pre-C4 install: V1 + V2 only, user_version = 2.
    await db.exec(MIGRATIONS[0]!);
    await db.exec(MIGRATIONS[1]!);
    await db.exec('PRAGMA user_version = 2;');

    // Task rows in the V2 shape — there is no target_per_day column yet.
    await db.run(
      `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES (1, 'Читання', '📚', 15, 127, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
              (2, 'Домашнє завдання', '📝', 30, 127, 1, 1, '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z');`
    );
    // Sessions: two runs of task 1 on different days.
    const s1 = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-20', 'running', 900000, 900000, '2026-10-20T10:00:00Z', '2026-10-20T10:15:00Z');`
    );
    await db.run(`UPDATE sessions SET status = 'completed', completed_at = '2026-10-20T10:15:00Z' WHERE id = ?;`, [
      s1.lastInsertRowId,
    ]);
    await db.run(`UPDATE sessions SET status = 'verified', verified_at = '2026-10-20T11:00:00Z' WHERE id = ?;`, [
      s1.lastInsertRowId,
    ]);
    const s2 = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-21', 'running', 900000, 450000, '2026-10-21T10:00:00Z', '2026-10-21T10:08:00Z');`
    );
    await db.run(`UPDATE sessions SET status = 'completed', completed_at = '2026-10-21T10:15:00Z' WHERE id = ?;`, [
      s2.lastInsertRowId,
    ]);

    // The real upgrade path: V3 (target_per_day), V4 (settings), V5 (index drop).
    await migrate(db);

    const version = await db.get<{ user_version: number }>('PRAGMA user_version;');
    expect(version?.user_version).toBe(MIGRATIONS.length);

    // Task rows survive verbatim and gain the DEFAULT 1 target.
    const tasks = await db.all<{
      id: number;
      title: string;
      target_minutes: number;
      archived: number;
      target_per_day: number;
    }>(`SELECT id, title, target_minutes, archived, target_per_day FROM tasks ORDER BY id;`);
    expect(tasks).toEqual([
      { id: 1, title: 'Читання', target_minutes: 15, archived: 0, target_per_day: 1 },
      { id: 2, title: 'Домашнє завдання', target_minutes: 30, archived: 1, target_per_day: 1 },
    ]);

    // Sessions are untouched: same rows, same statuses, same counters.
    const sessions = await db.all<{
      id: number;
      task_id: number;
      local_date: string;
      status: string;
      target_ms: number;
      elapsed_run_ms: number;
      completed_at: string | null;
      verified_at: string | null;
    }>(
      `SELECT id, task_id, local_date, status, target_ms, elapsed_run_ms, completed_at, verified_at
       FROM sessions ORDER BY id;`
    );
    expect(sessions).toEqual([
      {
        id: s1.lastInsertRowId,
        task_id: 1,
        local_date: '2026-10-20',
        status: 'verified',
        target_ms: 900000,
        elapsed_run_ms: 900000,
        completed_at: '2026-10-20T10:15:00Z',
        verified_at: '2026-10-20T11:00:00Z',
      },
      {
        id: s2.lastInsertRowId,
        task_id: 1,
        local_date: '2026-10-21',
        status: 'completed',
        target_ms: 900000,
        elapsed_run_ms: 450000,
        completed_at: '2026-10-21T10:15:00Z',
        verified_at: null,
      },
    ]);

    // V5 landed on the upgrade path too: the task/day UNIQUE index is gone.
    const indexes = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';`
    );
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).not.toContain('ux_sessions_task_day');
    expect(indexNames).toContain('ux_sessions_one_active');
    expect(indexNames).toContain('ix_sessions_date');

    // ...and the upgraded database now accepts a 2nd non-abandoned session
    // for the same task/day (the whole point of the drop).
    await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-21', 'running', 900000, 0, '2026-10-21T12:00:00Z', '2026-10-21T12:00:00Z');`
    );
    const sameDay = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions
       WHERE task_id = 1 AND local_date = '2026-10-21' AND status <> 'abandoned';`
    );
    expect(Number(sameDay?.n)).toBe(2);
  });
});