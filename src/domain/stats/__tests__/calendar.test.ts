import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../../services/clock/wallClock';
import { migrate } from '../../../services/db/migrations';
import { seedIfEmpty } from '../../../services/db/seed';
import { createSessionsRepo } from '../../../services/repos/sessionsRepo';
import { createStatsService } from '../../../services/stats/statsService';
import { addMonths, buildMonthGrid, daysInMonth, firstOfMonth } from '../calendar';

describe('F6 - calendar domain helpers (pure, no Date usage)', () => {
  it('derives month bounds without Date/Math tricks', () => {
    expect(firstOfMonth('2026-10-24')).toBe('2026-10-01');
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29); // leap year
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it('walks months forwards and backwards across year boundaries', () => {
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
    expect(addMonths('2026-10-01', -1)).toBe('2026-09-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('builds a 7-column grid with leading blanks for October 2026 (starts Thursday)', () => {
    const grid = buildMonthGrid('2026-10-24', 3); // 0 = Monday, 2026-10-01 is Thursday
    expect(grid.monthStart).toBe('2026-10-01');
    expect(grid.monthEnd).toBe('2026-10-31');
    expect(grid.rows).toHaveLength(5); // 3 blanks + 31 days = 34 cells -> 5 rows
    expect(grid.rows[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(grid.rows[4]?.[5]).toBe('2026-10-31');
    expect(grid.rows[4]?.[6]).toBeNull(); // trailing pad keeps every row 7 wide
    // every cell is 7 wide
    for (const row of grid.rows) expect(row).toHaveLength(7);
  });
});

describe('F6 - statsService calendar data (single source of truth: sessions table)', () => {
  jest.setTimeout(30000);

  const wall: WallClock = {
    ...systemWallClock,
    todayLocalDate: () => '2026-10-24',
    nowIso: () => '2026-10-24T10:00:00.000Z',
  };

  async function buildStats() {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, wall); // task 1 = Читання, task 2 = Домашнє завдання

    // Verified session: 2026-10-21, 35 minutes earned
    const verified = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, '2026-10-21', 'running', 2100000, 0, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z');`
    );
    await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`, [
      35 * 60000,
      verified.lastInsertRowId,
    ]);
    await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [
      verified.lastInsertRowId,
    ]);

    // Pending (completed, not yet approved) session: 2026-10-22, 15 minutes
    const pending = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (2, '2026-10-22', 'running', 1800000, 0, '2026-10-22T10:00:00Z', '2026-10-22T10:00:00Z');`
    );
    await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`, [
      15 * 60000,
      pending.lastInsertRowId,
    ]);

    const statsService = createStatsService({ db, wall, sessionsRepo: createSessionsRepo(db) });
    return { db, statsService };
  }

  it('monthRange resolves the anchor month bounds', async () => {
    const { statsService } = await buildStats();
    expect(statsService.monthRange('2026-10-24')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(statsService.monthRange()).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('dayStats separates approved (verified) from pending (completed) minutes per day', async () => {
    const { statsService } = await buildStats();
    const days = await statsService.dayStats('2026-10-01', '2026-10-31');

    const approvedDay = days.find((d) => d.localDate === '2026-10-21');
    expect(approvedDay).toEqual({
      localDate: '2026-10-21',
      verified: 1,
      pending: 0,
      verifiedMinutes: 35,
      pendingMinutes: 0,
    });

    const pendingDay = days.find((d) => d.localDate === '2026-10-22');
    expect(pendingDay).toEqual({
      localDate: '2026-10-22',
      verified: 0,
      pending: 1,
      verifiedMinutes: 0,
      pendingMinutes: 15,
    });

    expect(days.find((d) => d.localDate === '2026-10-23')).toBeUndefined();
  });

  it('monthSummary reports total minutes earned this month', async () => {
    const { statsService } = await buildStats();
    const summary = await statsService.monthSummary('2026-10-24');
    expect(summary.start).toBe('2026-10-01');
    expect(summary.end).toBe('2026-10-31');
    expect(summary.verifiedMinutes).toBe(35);
    expect(summary.pendingMinutes).toBe(15);
    expect(summary.days).toHaveLength(2);
  });

  it('weekSummary (existing service) still reports this week minutes earned', async () => {
    const { statsService } = await buildStats();
    // 2026-10-24 is a Saturday -> week is 2026-10-19..2026-10-25
    const week = await statsService.weekSummary('2026-10-24');
    expect(week.totalMinutes).toBe(35);
    expect(week.totalVerified).toBe(1);
  });

  it('keeps month boundaries strict: 2026-09-30 and 2026-11-01 never leak into October (round-1 LOW)', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, wall); // task 1 = Читання, task 2 = Домашнє завдання

    const insertSession = async (
      localDate: string,
      taskId: number,
      minutes: number,
      finalStatus: 'completed' | 'verified'
    ): Promise<number> => {
      const created = await db.run(
        `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
         VALUES (?, ?, 'running', 3600000, 0, ?, ?);`,
        [taskId, localDate, `${localDate}T09:00:00Z`, `${localDate}T09:00:00Z`]
      );
      await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`, [
        minutes * 60000,
        created.lastInsertRowId,
      ]);
      if (finalStatus === 'verified') {
        await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [
          created.lastInsertRowId,
        ]);
      }
      return created.lastInsertRowId;
    };

    await insertSession('2026-09-30', 1, 60, 'verified'); // September, must stay out
    await insertSession('2026-10-15', 1, 35, 'verified'); // October approved
    await insertSession('2026-10-20', 2, 15, 'completed'); // October pending
    await insertSession('2026-11-01', 2, 45, 'completed'); // November, must stay out

    const statsService = createStatsService({ db, wall, sessionsRepo: createSessionsRepo(db) });

    // dayStats over the October range only ever sees October rows
    const days = await statsService.dayStats('2026-10-01', '2026-10-31');
    expect(days.map((d) => d.localDate)).toEqual(['2026-10-15', '2026-10-20']);
    expect(days[0]).toEqual({
      localDate: '2026-10-15',
      verified: 1,
      pending: 0,
      verifiedMinutes: 35,
      pendingMinutes: 0,
    });

    // monthSummary for the October anchor excludes both neighbours entirely
    const summary = await statsService.monthSummary('2026-10-24');
    expect(summary.start).toBe('2026-10-01');
    expect(summary.end).toBe('2026-10-31');
    expect(summary.verifiedMinutes).toBe(35);
    expect(summary.pendingMinutes).toBe(15);
    expect(summary.days.map((d) => d.localDate)).toEqual(['2026-10-15', '2026-10-20']);

    // Each neighbour month still reports its own session (nothing double-counted)
    const september = await statsService.monthSummary('2026-09-15');
    expect(september.verifiedMinutes).toBe(60);
    expect(september.pendingMinutes).toBe(0);
    const november = await statsService.monthSummary('2026-11-15');
    expect(november.verifiedMinutes).toBe(0);
    expect(november.pendingMinutes).toBe(45);
  });

  it('daySessions lists the day tasks with their approval state for the detail sheet', async () => {
    const { statsService } = await buildStats();
    const approved = await statsService.daySessions('2026-10-21');
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      title: 'Читання',
      emoji: '📚',
      status: 'verified',
      minutes: 35,
    });
    expect(approved[0]!.sessionId).toBeGreaterThan(0);

    const pending = await statsService.daySessions('2026-10-22');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: 'completed', minutes: 15 });

    expect(await statsService.daySessions('2026-10-25')).toEqual([]);
  });
});