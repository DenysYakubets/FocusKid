import { Db } from '../db/Db';
import { WallClock } from '../clock/wallClock';
import { SessionsRepo } from '../repos/sessionsRepo';
import {
  summarizeWeek,
  perTask as aggregatePerTask,
  WeekSummary,
  TaskStat,
} from '../../domain/stats/aggregate';
import { firstOfMonth, lastOfMonth } from '../../domain/stats/calendar';

export interface StatsServiceOptions {
  db: Db;
  wall: WallClock;
  sessionsRepo: SessionsRepo;
}

/** F6: per-day approval state used by the calendar screen. */
export interface DayStat {
  localDate: string;
  verified: number;
  pending: number;
  verifiedMinutes: number;
  pendingMinutes: number;
}

/** F6: one session of a day, for the day detail sheet. */
export interface DaySessionStat {
  sessionId: number;
  taskId: number;
  title: string;
  emoji: string | null;
  status: 'completed' | 'verified';
  minutes: number;
}

export interface MonthSummary {
  start: string;
  end: string;
  verifiedMinutes: number;
  pendingMinutes: number;
  days: DayStat[];
}

export interface StatsService {
  weekSummary(forDate?: string): Promise<WeekSummary>;
  perTask(startDate: string, endDate: string): Promise<TaskStat[]>;
  weekTaskStats(forDate?: string): Promise<TaskStat[]>;
  getWeekRange(forDate?: string): { monday: string; sunday: string; weekDates: string[] };
  /** F6: bounds of the month containing `forDate` (defaults to today). */
  monthRange(forDate?: string): { start: string; end: string };
  /** F6: approved vs pending sessions per day inside a date range. */
  dayStats(startDate: string, endDate: string): Promise<DayStat[]>;
  /** F6: sessions of one day with their task info. */
  daySessions(localDate: string): Promise<DaySessionStat[]>;
  /** F6: everything the calendar header + grid needs for one month. */
  monthSummary(forDate?: string): Promise<MonthSummary>;
}

interface DbTaskStatRow {
  task_id: number;
  title: string;
  emoji: string | null;
  archived: number;
  run_ms: number;
}

export function createStatsService(options: StatsServiceOptions): StatsService {
  const { db, wall, sessionsRepo } = options;

  function getWeekRange(forDate?: string) {
    const targetDate = forDate ?? wall.todayLocalDate();
    const wIndex = wall.weekdayIndex(targetDate); // 0 = Mon, 6 = Sun
    const monday = wall.addDays(targetDate, -wIndex);
    const weekDates = [0, 1, 2, 3, 4, 5, 6].map((i) => wall.addDays(monday, i));
    const sunday = weekDates[6] as string;

    return { monday, sunday, weekDates };
  }

  function getMonthRange(forDate?: string) {
    const targetDate = forDate ?? wall.todayLocalDate();
    const start = firstOfMonth(targetDate);
    return { start, end: lastOfMonth(targetDate) };
  }

  return {
    getWeekRange,
    monthRange: getMonthRange,
    async weekSummary(forDate?: string): Promise<WeekSummary> {
      const { monday, sunday, weekDates } = getWeekRange(forDate);
      const rows = await sessionsRepo.rangeStats(monday, sunday);
      return summarizeWeek(rows, weekDates);
    },

    async perTask(startDate: string, endDate: string): Promise<TaskStat[]> {
      const rows = await db.all<DbTaskStatRow>(
        `SELECT 
           t.id AS task_id,
           t.title,
           t.emoji,
           t.archived,
           SUM(s.elapsed_run_ms) AS run_ms
         FROM sessions s
         JOIN tasks t ON s.task_id = t.id
         WHERE s.status = 'verified' AND s.local_date BETWEEN ? AND ?
         GROUP BY t.id, t.title, t.emoji, t.archived;`,
        [startDate, endDate]
      );

      const taskInputs = rows.map((r) => ({
        taskId: r.task_id,
        title: r.title,
        emoji: r.emoji,
        archived: Boolean(r.archived),
        runMs: Number(r.run_ms),
        status: 'verified',
      }));

      return aggregatePerTask(taskInputs);
    },

    async weekTaskStats(forDate?: string): Promise<TaskStat[]> {
      const { monday, sunday } = getWeekRange(forDate);
      return this.perTask(monday, sunday);
    },

    async dayStats(startDate: string, endDate: string): Promise<DayStat[]> {
      const rows = await db.all<{ local_date: string; status: string; elapsed_run_ms: number }>(
        `SELECT local_date, status, elapsed_run_ms
         FROM sessions
         WHERE local_date BETWEEN ? AND ? AND status IN ('completed', 'verified')
         ORDER BY local_date ASC;`,
        [startDate, endDate]
      );

      const byDate = new Map<string, DayStat>();
      for (const row of rows) {
        const minutes = Math.floor(Number(row.elapsed_run_ms) / 60000);
        const entry =
          byDate.get(row.local_date) ??
          {
            localDate: row.local_date,
            verified: 0,
            pending: 0,
            verifiedMinutes: 0,
            pendingMinutes: 0,
          };
        if (row.status === 'verified') {
          entry.verified += 1;
          entry.verifiedMinutes += minutes;
        } else {
          entry.pending += 1;
          entry.pendingMinutes += minutes;
        }
        byDate.set(row.local_date, entry);
      }

      return Array.from(byDate.values()).sort((a, b) =>
        a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0
      );
    },

    async daySessions(localDate: string): Promise<DaySessionStat[]> {
      const rows = await db.all<{
        id: number;
        task_id: number;
        title: string;
        emoji: string | null;
        status: string;
        elapsed_run_ms: number;
      }>(
        `SELECT s.id, s.task_id, t.title, t.emoji, s.status, s.elapsed_run_ms
         FROM sessions s
         JOIN tasks t ON s.task_id = t.id
         WHERE s.local_date = ? AND s.status IN ('completed', 'verified')
         ORDER BY s.id ASC;`,
        [localDate]
      );

      return rows.map((row) => ({
        sessionId: row.id,
        taskId: row.task_id,
        title: row.title,
        emoji: row.emoji,
        status: row.status as 'completed' | 'verified',
        minutes: Math.floor(Number(row.elapsed_run_ms) / 60000),
      }));
    },

    async monthSummary(forDate?: string): Promise<MonthSummary> {
      const { start, end } = getMonthRange(forDate);
      const days = await this.dayStats(start, end);
      const verifiedMinutes = days.reduce((acc, d) => acc + d.verifiedMinutes, 0);
      const pendingMinutes = days.reduce((acc, d) => acc + d.pendingMinutes, 0);
      return { start, end, verifiedMinutes, pendingMinutes, days };
    },
  };
}
