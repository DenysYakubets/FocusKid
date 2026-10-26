/** @jest-environment node */
import { setupTestServices } from '../../../test/helpers/renderWithApp';
import { tasksStore, useTasksStore } from '../tasksStore';
import { TodayTaskView } from '../../domain/tasks/types';
import { logInfo, logError } from '../../services/logging/fileLogger';

jest.mock('../../services/logging/fileLogger', () => ({ logInfo: jest.fn(), logError: jest.fn() }));
afterEach(() => jest.restoreAllMocks());

it('contains a task immediately after repository create and refresh', async () => {
  const { services } = await setupTestServices();
  const task = await services.tasksRepo.create({ title: 'New task', targetMinutes: 15, daysMask: 127 }, services.wall.nowIso());
  await tasksStore.refreshToday(services);
  expect(useTasksStore.getState().todayTasks.length).toBeGreaterThan(0);
  expect(useTasksStore.getState().todayTasks.map(t => t.id)).toContain(task.id);
});

it('drops an older empty refresh which resolves after the newer populated refresh', async () => {
  const { services } = await setupTestServices();
  let resolve!: (rows: TodayTaskView[]) => void;
  const deferred = new Promise<TodayTaskView[]>(r => { resolve = r; });
  jest.spyOn(services.tasksRepo, 'listToday').mockImplementationOnce(() => deferred);
  const first = tasksStore.refreshToday(services);
  await tasksStore.refreshToday(services);
  const fresh = useTasksStore.getState().todayTasks;
  expect(fresh.length).toBeGreaterThan(0);
  resolve([]);
  await first;
  expect(useTasksStore.getState().todayTasks).toEqual(fresh);
  expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('stale-dropped'));
});

it('logs raw counts and distinguishes an empty table from filtered rows', async () => {
  const { services } = await setupTestServices();
  await services.db.run('DELETE FROM tasks');
  await tasksStore.refreshToday(services);
  expect(logInfo).toHaveBeenCalledWith(expect.stringMatching(/→ raw 0 rows seq=\d+/));
  expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('EMPTY why=empty-table raw=0'));
  const task = await services.tasksRepo.create({ title: 'Archived', targetMinutes: 15, daysMask: 127 }, services.wall.nowIso());
  await services.tasksRepo.archive(task.id, services.wall.nowIso());
  await tasksStore.refreshToday(services);
  expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('EMPTY why=filters raw=1 afterArchived=0 afterMask=0'));
});

it('still publishes results if the diagnostic read fails', async () => {
  const { services } = await setupTestServices();
  const original = services.db.all.bind(services.db);
  jest.spyOn(services.db, 'all').mockImplementation((sql, params) => {
    if (sql.startsWith('SELECT id, title, archived')) return Promise.reject(new Error('diagnostic failure'));
    return original(sql, params);
  });
  await tasksStore.refreshToday(services);
  expect(useTasksStore.getState().todayTasks.length).toBeGreaterThan(0);
  expect(logError).toHaveBeenCalledWith(expect.stringContaining('diagnostics failed'));
});
