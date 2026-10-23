import { Db } from '../db/Db';
import { WallClock } from '../clock/wallClock';
import { SessionsRepo } from '../repos/sessionsRepo';
import {
  summarizeWeek,
  perTask as aggregatePerTask,
  WeekSummary,
  TaskStat,
} from '../../domain/stats/aggregate';

export interface StatsServiceOptions {
  db: Db;
  wall: WallClock;
  sessionsRepo: SessionsRepo;
}

export interface StatsService {
  weekSummary(forDate?: string): Promise<WeekSummary>;
  perTask(startDate: string, endDate: string): Promise<TaskStat[]>;
  weekTaskStats(forDate?: string): Promise<TaskStat[]>;
  getWeekRange(forDate?: string): { monday: string; sunday: string; weekDates: string[] };
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

  return {
    getWeekRange,

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
  };
}
