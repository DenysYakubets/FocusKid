import { Db } from './Db';
import { WallClock } from '../clock/wallClock';

export async function seedIfEmpty(db: Db, wall: WallClock): Promise<void> {
  const row = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tasks;');
  if (row && row.count > 0) {
    return;
  }
  const now = wall.nowIso();
  const sampleTasks = [
    { title: 'Читання', emoji: '📚', targetMinutes: 15, sortOrder: 0 },
    { title: 'Домашнє завдання', emoji: '📝', targetMinutes: 30, sortOrder: 1 },
    { title: 'Прибрати кімнату', emoji: '🧹', targetMinutes: 10, sortOrder: 2 },
  ];
  await db.transaction(async (tx) => {
    for (const task of sampleTasks) {
      await tx.run(
        `INSERT INTO tasks (title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, 127, ?, 0, ?, ?);`,
        [task.title, task.emoji, task.targetMinutes, task.sortOrder, now, now]
      );
    }
  });
}
