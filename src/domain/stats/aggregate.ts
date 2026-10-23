export interface DayStatInput {
  localDate: string;
  verified?: number;
  runMs?: number;
  elapsedRunMs?: number;
  status?: string;
}

export interface DaySummary {
  localDate: string;
  verified: number;
  focusedMinutes: number;
}

export interface WeekSummary {
  days: DaySummary[];
  totalVerified: number;
  totalMinutes: number;
}

export interface TaskStatInput {
  taskId: number;
  title: string;
  emoji?: string | null;
  archived?: boolean | number;
  runMs?: number;
  elapsedRunMs?: number;
  status?: string;
}

export interface TaskStat {
  taskId: number;
  title: string;
  emoji: string | null;
  archived: boolean;
  minutes: number;
}

/**
 * Summarizes week metrics across the given weekDates array.
 * Missing days are filled with 0. Only verified sessions/counts are counted.
 * Minutes are floored via Math.floor(ms / 60000).
 * Pure function: does not mutate inputs or read any clock.
 */
export function summarizeWeek(
  rows: readonly DayStatInput[],
  weekDates: readonly string[]
): WeekSummary {
  const dayAggregates = new Map<string, { verified: number; runMs: number }>();

  for (const date of weekDates) {
    dayAggregates.set(date, { verified: 0, runMs: 0 });
  }

  for (const row of rows) {
    // If status is present, only verified sessions count
    if (row.status !== undefined && row.status !== 'verified') {
      continue;
    }

    const current = dayAggregates.get(row.localDate);
    if (!current) {
      // Row falls outside the specified weekDates range
      continue;
    }

    const verifiedCount =
      row.verified !== undefined
        ? row.verified
        : row.status === 'verified' || !row.status
          ? 1
          : 0;

    const ms = row.runMs !== undefined ? row.runMs : (row.elapsedRunMs ?? 0);

    current.verified += verifiedCount;
    current.runMs += ms;
  }

  const days: DaySummary[] = weekDates.map((localDate) => {
    const agg = dayAggregates.get(localDate) ?? { verified: 0, runMs: 0 };
    return {
      localDate,
      verified: agg.verified,
      focusedMinutes: Math.floor(agg.runMs / 60000),
    };
  });

  const totalVerified = days.reduce((acc, d) => acc + d.verified, 0);
  const totalMinutes = days.reduce((acc, d) => acc + d.focusedMinutes, 0);

  return {
    days,
    totalVerified,
    totalMinutes,
  };
}

/**
 * Aggregates statistics per task, formatted and sorted by minutes descending.
 * Archived tasks have "(архів)" appended to title.
 * Pure function.
 */
export function perTask(rows: readonly TaskStatInput[]): TaskStat[] {
  const taskMap = new Map<
    number,
    {
      taskId: number;
      title: string;
      emoji: string | null;
      archived: boolean;
      totalMs: number;
    }
  >();

  for (const row of rows) {
    if (row.status !== undefined && row.status !== 'verified') {
      continue;
    }

    const ms = row.runMs !== undefined ? row.runMs : (row.elapsedRunMs ?? 0);
    const isArchived = Boolean(row.archived);

    const existing = taskMap.get(row.taskId);
    if (!existing) {
      taskMap.set(row.taskId, {
        taskId: row.taskId,
        title: row.title,
        emoji: row.emoji ?? null,
        archived: isArchived,
        totalMs: ms,
      });
    } else {
      existing.totalMs += ms;
      if (isArchived) {
        existing.archived = true;
      }
    }
  }

  const result: TaskStat[] = Array.from(taskMap.values()).map((t) => {
    const minutes = Math.floor(t.totalMs / 60000);
    const displayTitle =
      t.archived && !t.title.includes('(архів)') ? `${t.title} (архів)` : t.title;

    return {
      taskId: t.taskId,
      title: displayTitle,
      emoji: t.emoji,
      archived: t.archived,
      minutes,
    };
  });

  // Sort by minutes descending
  result.sort((a, b) => b.minutes - a.minutes);

  return result;
}
