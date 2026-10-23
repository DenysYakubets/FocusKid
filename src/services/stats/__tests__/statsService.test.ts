/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../../db/migrations';
import { createSessionsRepo } from '../../repos/sessionsRepo';
import { createStatsService } from '../statsService';
import { systemWallClock, WallClock } from '../../clock/wallClock';
import { Db } from '../../db/Db';

describe('StatsService (SQLite Integration)', () => {
  async function insertSessionWithStatus(
    db: Db,
    taskId: number,
    localDate: string,
    status: 'running' | 'completed' | 'verified' | 'abandoned',
    runMs: number
  ) {
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (?, ?, 'running', 900000, 0, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');`,
      [taskId, localDate]
    );

    if (status === 'running') {
      await db.run(
        `UPDATE sessions SET elapsed_run_ms = ? WHERE id = ?;`,
        [runMs, res.lastInsertRowId]
      );
      return;
    }

    if (status === 'abandoned') {
      await db.run(
        `UPDATE sessions SET status = 'abandoned', elapsed_run_ms = ? WHERE id = ?;`,
        [runMs, res.lastInsertRowId]
      );
      return;
    }

    // Must reach completed first
    await db.run(
      `UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`,
      [runMs, res.lastInsertRowId]
    );

    if (status === 'verified') {
      await db.run(
        `UPDATE sessions SET status = 'verified' WHERE id = ?;`,
        [res.lastInsertRowId]
      );
    }
  }

  it('correctly aggregates 9 days of fixture sessions for Mon–Sun week', async () => {
    const db = createNodeDb();
    await migrate(db);
    const sessionsRepo = createSessionsRepo(db);

    // Fixed wall clock where week is Mon 2026-10-19 to Sun 2026-10-25
    const testWallClock: WallClock = {
      ...systemWallClock,
      todayLocalDate: () => '2026-10-21', // Wednesday
    };

    const statsService = createStatsService({
      db,
      wall: testWallClock,
      sessionsRepo,
    });

    // 1. Insert tasks: Task 1 active, Task 2 archived
    await db.run(
      `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES (1, 'Читання', '📚', 15, 127, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`
    );
    await db.run(
      `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES (2, 'Малювання', '🎨', 30, 127, 1, 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`
    );

    // 2. Insert sessions across 9 days:
    // Day 0: Sun 2026-10-18 (before week) -> verified, 40 min
    await insertSessionWithStatus(db, 1, '2026-10-18', 'verified', 40 * 60000);

    // Day 1: Mon 2026-10-19 -> verified, 35 min (Task 1)
    await insertSessionWithStatus(db, 1, '2026-10-19', 'verified', 35 * 60000);

    // Day 2: Tue 2026-10-20 -> completed (not verified) 30 min (Task 2) + abandoned 10 min
    await insertSessionWithStatus(db, 2, '2026-10-20', 'completed', 30 * 60000);
    await insertSessionWithStatus(db, 1, '2026-10-20', 'abandoned', 10 * 60000);

    // Day 3: Wed 2026-10-21 -> verified, 65 min (Task 2, archived)
    await insertSessionWithStatus(db, 2, '2026-10-21', 'verified', 65 * 60000 + 40000);

    // Day 4: Thu 2026-10-22 -> missing (0)

    // Day 5: Fri 2026-10-23 -> verified, 20 min (Task 1)
    await insertSessionWithStatus(db, 1, '2026-10-23', 'verified', 20 * 60000);

    // Day 6: Sat 2026-10-24 -> missing (0)
    // Day 7: Sun 2026-10-25 -> missing (0)

    // Day 8: Mon 2026-10-26 (after week) -> verified, 50 min
    await insertSessionWithStatus(db, 1, '2026-10-26', 'verified', 50 * 60000);

    // 3. Test week summary
    const summary = await statsService.weekSummary('2026-10-21');

    expect(summary.days).toHaveLength(7);
    expect(summary.days[0]).toEqual({
      localDate: '2026-10-19',
      verified: 1,
      focusedMinutes: 35,
    });
    expect(summary.days[1]).toEqual({
      localDate: '2026-10-20',
      verified: 0,
      focusedMinutes: 0,
    });
    expect(summary.days[2]).toEqual({
      localDate: '2026-10-21',
      verified: 1,
      focusedMinutes: 65,
    });
    expect(summary.days[3]).toEqual({
      localDate: '2026-10-22',
      verified: 0,
      focusedMinutes: 0,
    });
    expect(summary.days[4]).toEqual({
      localDate: '2026-10-23',
      verified: 1,
      focusedMinutes: 20,
    });
    expect(summary.days[5]).toEqual({
      localDate: '2026-10-24',
      verified: 0,
      focusedMinutes: 0,
    });
    expect(summary.days[6]).toEqual({
      localDate: '2026-10-25',
      verified: 0,
      focusedMinutes: 0,
    });

    // Total: Mon (35) + Wed (65) + Fri (20) = 120 min, 3 verified
    expect(summary.totalVerified).toBe(3);
    expect(summary.totalMinutes).toBe(120);

    // 4. Test per-task breakdown
    const taskStats = await statsService.weekTaskStats('2026-10-21');
    expect(taskStats).toHaveLength(2);

    // Task 2 (archived) has 65 min -> sorted first
    expect(taskStats[0]).toEqual({
      taskId: 2,
      title: 'Малювання (архів)',
      emoji: '🎨',
      archived: true,
      minutes: 65,
    });

    // Task 1 has 35 + 20 = 55 min -> sorted second
    expect(taskStats[1]).toEqual({
      taskId: 1,
      title: 'Читання',
      emoji: '📚',
      archived: false,
      minutes: 55,
    });
  });
});
