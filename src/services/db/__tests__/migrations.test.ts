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
    expect(indexNames).toContain('ux_sessions_task_day');
    expect(indexNames).toContain('ux_sessions_one_active');
    expect(indexNames).toContain('ix_session_events_session');

    // Check triggers
    const triggers = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'trigger';`
    );
    const triggerNames = triggers.map((tr) => tr.name);
    expect(triggerNames).toContain('trg_sessions_insert_running');
    expect(triggerNames).toContain('trg_sessions_verify_only_from_completed');
    expect(triggerNames).toContain('trg_sessions_verified_no_update');
    expect(triggerNames).toContain('trg_sessions_verified_no_delete');
    expect(triggerNames).toContain('trg_session_events_no_update');
    expect(triggerNames).toContain('trg_session_events_no_delete');
  });
});
