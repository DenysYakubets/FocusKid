import { NewTask, Task, TodayTaskView } from '../../domain/tasks/types';
import { Db, SqlParam } from '../db/Db';

interface TaskRow {
  id: number;
  title: string;
  emoji: string | null;
  target_minutes: number;
  days_mask: number;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

interface TodayTaskRow extends TaskRow {
  session_id: number | null;
  status: 'running' | 'paused' | 'completed' | 'verified' | null;
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    targetMinutes: row.target_minutes,
    daysMask: row.days_mask,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTodayTask(row: TodayTaskRow): TodayTaskView {
  return {
    ...mapTask(row),
    sessionId: row.session_id,
    status: row.status ?? 'idle',
  };
}

export interface TasksRepo {
  listToday(localDate: string, weekdayIdx: number): Promise<TodayTaskView[]>;
  listAll(): Promise<Task[]>;
  get(id: number): Promise<Task | null>;
  create(task: NewTask, nowIso: string): Promise<Task>;
  update(id: number, patch: Partial<NewTask>, nowIso: string): Promise<Task>;
  archive(id: number, nowIso: string): Promise<void>;
  deleteIfUnused(id: number): Promise<boolean>;
  move(id: number, direction: 'up' | 'down'): Promise<void>;
}

export function createTasksRepo(db: Db): TasksRepo {
  return {
    async listToday(localDate: string, weekdayIdx: number): Promise<TodayTaskView[]> {
      const weekdayMask = 1 << weekdayIdx;
      const rows = await db.all<TodayTaskRow>(
        `SELECT t.id, t.title, t.emoji, t.target_minutes, t.days_mask, t.sort_order, t.archived, t.created_at, t.updated_at,
                s.id AS session_id, s.status
         FROM tasks t
         LEFT JOIN sessions s ON s.task_id = t.id AND s.local_date = ? AND s.status <> 'abandoned'
         WHERE t.archived = 0 AND (t.days_mask & ?) <> 0
         ORDER BY t.sort_order ASC, t.id ASC;`,
        [localDate, weekdayMask]
      );
      return rows.map(mapTodayTask);
    },

    async listAll(): Promise<Task[]> {
      const rows = await db.all<TaskRow>(
        `SELECT * FROM tasks ORDER BY archived ASC, sort_order ASC, id ASC;`
      );
      return rows.map(mapTask);
    },

    async get(id: number): Promise<Task | null> {
      const row = await db.get<TaskRow>(`SELECT * FROM tasks WHERE id = ?;`, [id]);
      return row ? mapTask(row) : null;
    },

    async create(task: NewTask, nowIso: string): Promise<Task> {
      let sortOrder = task.sortOrder;
      if (sortOrder === undefined) {
        const maxRow = await db.get<{ next_order: number }>(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks;`
        );
        sortOrder = maxRow ? maxRow.next_order : 0;
      }

      const res = await db.run(
        `INSERT INTO tasks (title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
        [
          task.title,
          task.emoji ?? null,
          task.targetMinutes,
          task.daysMask,
          sortOrder,
          nowIso,
          nowIso,
        ]
      );

      const created = await this.get(res.lastInsertRowId);
      if (!created) {
        throw new Error(`Failed to retrieve newly created task ${res.lastInsertRowId}`);
      }
      return created;
    },

    async update(id: number, patch: Partial<NewTask>, nowIso: string): Promise<Task> {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`Task ${id} not found`);
      }

      const title = patch.title ?? existing.title;
      const emoji = patch.emoji !== undefined ? patch.emoji : existing.emoji;
      const targetMinutes = patch.targetMinutes ?? existing.targetMinutes;
      const daysMask = patch.daysMask ?? existing.daysMask;
      const sortOrder = patch.sortOrder ?? existing.sortOrder;

      await db.run(
        `UPDATE tasks
         SET title = ?, emoji = ?, target_minutes = ?, days_mask = ?, sort_order = ?, updated_at = ?
         WHERE id = ?;`,
        [title, emoji, targetMinutes, daysMask, sortOrder, nowIso, id]
      );

      const updated = await this.get(id);
      if (!updated) {
        throw new Error(`Failed to retrieve updated task ${id}`);
      }
      return updated;
    },

    async archive(id: number, nowIso: string): Promise<void> {
      await db.run(`UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?;`, [nowIso, id]);
    },

    async deleteIfUnused(id: number): Promise<boolean> {
      const sessionCount = await db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM sessions WHERE task_id = ?;`,
        [id]
      );
      if (sessionCount && sessionCount.count > 0) {
        return false;
      }
      const res = await db.run(`DELETE FROM tasks WHERE id = ?;`, [id]);
      return res.changes > 0;
    },

    async move(id: number, direction: 'up' | 'down'): Promise<void> {
      const tasks = await this.listAll();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= tasks.length) return;

      const currentTask = tasks[idx]!;
      const targetTask = tasks[targetIdx]!;

      await db.transaction(async (tx) => {
        await tx.run(`UPDATE tasks SET sort_order = ? WHERE id = ?;`, [
          targetTask.sortOrder,
          currentTask.id,
        ]);
        await tx.run(`UPDATE tasks SET sort_order = ? WHERE id = ?;`, [
          currentTask.sortOrder,
          targetTask.id,
        ]);
      });
    },
  };
}
