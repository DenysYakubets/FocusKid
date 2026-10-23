import * as aggregateModule from '../aggregate';
import { summarizeWeek, perTask, DayStatInput, TaskStatInput } from '../aggregate';

describe('Domain: Stats aggregate (Pure)', () => {
  it('does not export anything named *streak* (INV-09)', () => {
    const exportedKeys = Object.keys(aggregateModule);
    for (const key of exportedKeys) {
      expect(key.toLowerCase()).not.toContain('streak');
    }
  });

  describe('summarizeWeek', () => {
    const weekDates = [
      '2026-10-19', // Monday
      '2026-10-20', // Tuesday
      '2026-10-21', // Wednesday
      '2026-10-22', // Thursday
      '2026-10-23', // Friday
      '2026-10-24', // Saturday
      '2026-10-25', // Sunday
    ];

    it('correctly aggregates verified sessions, floors minutes, fills missing days with 0, and ignores unverified', () => {
      const rows: DayStatInput[] = [
        // Before the week (should be ignored)
        { localDate: '2026-10-18', runMs: 120_000, verified: 1, status: 'verified' },

        // Monday: 2 verified sessions, 35 minutes + 15.5 minutes = 50.5 min -> 50 min floored
        { localDate: '2026-10-19', runMs: 35 * 60_000, status: 'verified' },
        { localDate: '2026-10-19', runMs: 15.5 * 60_000, status: 'verified' },
        // Monday non-verified session (should be ignored)
        { localDate: '2026-10-19', runMs: 60 * 60_000, status: 'abandoned' },
        { localDate: '2026-10-19', runMs: 20 * 60_000, status: 'completed' },

        // Tuesday: missing (should be 0)

        // Wednesday: 1 verified session of 25 min 50 sec -> 25 min floored
        { localDate: '2026-10-21', runMs: 25 * 60_000 + 50_000, status: 'verified' },

        // Friday: 1 verified session with 59 sec -> 0 min floored
        { localDate: '2026-10-23', runMs: 59_000, status: 'verified' },

        // After the week (should be ignored)
        { localDate: '2026-10-26', runMs: 120_000, verified: 1, status: 'verified' },
      ];

      const result = summarizeWeek(rows, weekDates);

      expect(result.days).toHaveLength(7);

      // Mon: 2 verified, 50 min
      expect(result.days[0]).toEqual({
        localDate: '2026-10-19',
        verified: 2,
        focusedMinutes: 50,
      });

      // Tue: 0 verified, 0 min
      expect(result.days[1]).toEqual({
        localDate: '2026-10-20',
        verified: 0,
        focusedMinutes: 0,
      });

      // Wed: 1 verified, 25 min
      expect(result.days[2]).toEqual({
        localDate: '2026-10-21',
        verified: 1,
        focusedMinutes: 25,
      });

      // Thu: 0 verified, 0 min
      expect(result.days[3]).toEqual({
        localDate: '2026-10-22',
        verified: 0,
        focusedMinutes: 0,
      });

      // Fri: 1 verified, 0 min
      expect(result.days[4]).toEqual({
        localDate: '2026-10-23',
        verified: 1,
        focusedMinutes: 0,
      });

      // Sat & Sun: 0
      expect(result.days[5]).toEqual({
        localDate: '2026-10-24',
        verified: 0,
        focusedMinutes: 0,
      });
      expect(result.days[6]).toEqual({
        localDate: '2026-10-25',
        verified: 0,
        focusedMinutes: 0,
      });

      // Totals
      expect(result.totalVerified).toBe(4);
      expect(result.totalMinutes).toBe(75);
    });

    it('handles pre-aggregated rangeStats rows', () => {
      const rows: DayStatInput[] = [
        { localDate: '2026-10-19', verified: 3, runMs: 45 * 60_000 },
        { localDate: '2026-10-20', verified: 1, runMs: 20 * 60_000 },
      ];

      const result = summarizeWeek(rows, weekDates);
      expect(result.days[0]?.verified).toBe(3);
      expect(result.days[0]?.focusedMinutes).toBe(45);
      expect(result.days[1]?.verified).toBe(1);
      expect(result.days[1]?.focusedMinutes).toBe(20);
      expect(result.totalVerified).toBe(4);
      expect(result.totalMinutes).toBe(65);
    });
  });

  describe('perTask', () => {
    it('aggregates per task, sorts by minutes descending, and appends (архів) to archived tasks', () => {
      const inputs: TaskStatInput[] = [
        {
          taskId: 1,
          title: 'Читання',
          emoji: '📚',
          archived: false,
          runMs: 30 * 60_000,
          status: 'verified',
        },
        {
          taskId: 2,
          title: 'Малювання',
          emoji: '🎨',
          archived: true,
          runMs: 65 * 60_000,
          status: 'verified',
        },
        {
          taskId: 1,
          title: 'Читання',
          emoji: '📚',
          archived: false,
          runMs: 20 * 60_000,
          status: 'verified',
        },
        // Unverified should be ignored
        {
          taskId: 3,
          title: 'Прибирання',
          emoji: '🧹',
          archived: false,
          runMs: 120 * 60_000,
          status: 'completed',
        },
      ];

      const result = perTask(inputs);

      // Task 2 (65 min) > Task 1 (50 min). Task 3 ignored.
      expect(result).toHaveLength(2);

      expect(result[0]).toEqual({
        taskId: 2,
        title: 'Малювання (архів)',
        emoji: '🎨',
        archived: true,
        minutes: 65,
      });

      expect(result[1]).toEqual({
        taskId: 1,
        title: 'Читання',
        emoji: '📚',
        archived: false,
        minutes: 50,
      });
    });
  });
});
