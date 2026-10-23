/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../../db/migrations';
import { createTasksRepo } from '../tasksRepo';

describe('TasksRepo', () => {
  let db = createNodeDb();
  let repo = createTasksRepo(db);

  beforeEach(async () => {
    db = createNodeDb();
    await migrate(db);
    repo = createTasksRepo(db);
  });

  it('creates and retrieves tasks', async () => {
    const task = await repo.create(
      {
        title: 'Малювання',
        emoji: '🎨',
        targetMinutes: 20,
        daysMask: 127,
      },
      '2026-10-23T10:00:00Z'
    );

    expect(task.id).toBeGreaterThan(0);
    expect(task.title).toBe('Малювання');
    expect(task.emoji).toBe('🎨');
    expect(task.targetMinutes).toBe(20);
    expect(task.archived).toBe(false);

    const fetched = await repo.get(task.id);
    expect(fetched).toEqual(task);
  });

  it('updates task fields', async () => {
    const task = await repo.create(
      { title: 'Стара назва', targetMinutes: 10, daysMask: 127 },
      '2026-10-23T10:00:00Z'
    );

    const updated = await repo.update(
      task.id,
      { title: 'Нова назва', targetMinutes: 25 },
      '2026-10-23T10:05:00Z'
    );

    expect(updated.title).toBe('Нова назва');
    expect(updated.targetMinutes).toBe(25);
    expect(updated.updatedAt).toBe('2026-10-23T10:05:00Z');
  });

  it('archives tasks', async () => {
    const task = await repo.create(
      { title: 'Архівне завдання', targetMinutes: 15, daysMask: 127 },
      '2026-10-23T10:00:00Z'
    );

    await repo.archive(task.id, '2026-10-23T11:00:00Z');
    const fetched = await repo.get(task.id);
    expect(fetched?.archived).toBe(true);
  });

  it('handles deleteIfUnused (allows when unused, forbids when referenced by sessions)', async () => {
    const task = await repo.create(
      { title: 'Тимчасове завдання', targetMinutes: 10, daysMask: 127 },
      '2026-10-23T10:00:00Z'
    );

    // Before any session: delete succeeds
    const deleted = await repo.deleteIfUnused(task.id);
    expect(deleted).toBe(true);
    expect(await repo.get(task.id)).toBeNull();

    // Create another task and attach a session
    const taskWithSession = await repo.create(
      { title: 'Завдання із сесією', targetMinutes: 15, daysMask: 127 },
      '2026-10-23T10:00:00Z'
    );
    await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (?, '2026-10-23', 'running', 60000, '2026-10-23T10:00:00Z', '2026-10-23T10:00:00Z');`,
      [taskWithSession.id]
    );

    const cannotDelete = await repo.deleteIfUnused(taskWithSession.id);
    expect(cannotDelete).toBe(false);
    expect(await repo.get(taskWithSession.id)).not.toBeNull();
  });

  it('moves task order up and down', async () => {
    const t1 = await repo.create(
      { title: 'T1', targetMinutes: 10, daysMask: 127, sortOrder: 0 },
      '2026-10-23T10:00:00Z'
    );
    const t2 = await repo.create(
      { title: 'T2', targetMinutes: 10, daysMask: 127, sortOrder: 1 },
      '2026-10-23T10:00:00Z'
    );

    // Move t2 up
    await repo.move(t2.id, 'up');
    const listAfterUp = await repo.listAll();
    expect(listAfterUp[0]?.id).toBe(t2.id);
    expect(listAfterUp[1]?.id).toBe(t1.id);

    // Move t2 down
    await repo.move(t2.id, 'down');
    const listAfterDown = await repo.listAll();
    expect(listAfterDown[0]?.id).toBe(t1.id);
    expect(listAfterDown[1]?.id).toBe(t2.id);
  });

  it('listToday filters by weekday mask and maps session status correctly', async () => {
    // Mon=bit0 (1), Tue=bit1 (2), Wed=bit2 (4)...
    // Create task for Mon only (mask 1)
    const tMon = await repo.create(
      { title: 'Понеділок', targetMinutes: 10, daysMask: 1 },
      '2026-10-23T10:00:00Z'
    );
    // Create task for Friday only (mask 16, bit 4)
    const tFri = await repo.create(
      { title: 'П’ятниця', targetMinutes: 15, daysMask: 16 },
      '2026-10-23T10:00:00Z'
    );

    // Today is Friday (weekdayIdx = 4, mask = 16)
    const todayTasks = await repo.listToday('2026-10-23', 4);
    expect(todayTasks.map((t) => t.id)).toContain(tFri.id);
    expect(todayTasks.map((t) => t.id)).not.toContain(tMon.id);
    expect(todayTasks.find((t) => t.id === tFri.id)?.status).toBe('idle');

    // Start a session for tFri
    await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, started_at, updated_at)
       VALUES (?, '2026-10-23', 'running', 60000, '2026-10-23T10:00:00Z', '2026-10-23T10:00:00Z');`,
      [tFri.id]
    );

    const todayAfterStart = await repo.listToday('2026-10-23', 4);
    const friView = todayAfterStart.find((t) => t.id === tFri.id);
    expect(friView?.status).toBe('running');
    expect(friView?.sessionId).toBeGreaterThan(0);
  });
});
