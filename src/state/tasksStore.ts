import { logInfo, logError } from '../services/logging/fileLogger';
import { formatError } from '../services/logging/formatError';
import { create } from 'zustand';
import { TodayTaskView } from '../domain/tasks/types';
import { AppServices } from './appServices';

let refreshSeq = 0;
export interface RefreshDiagnostics { seq: number; raw: number; afterArchived: number; afterMask: number }

export interface TasksStoreState {
  todayTasks: TodayTaskView[];
  services: AppServices | null;
  refreshDiagnostics: RefreshDiagnostics | null;
  setServices: (services: AppServices) => void;
  refreshToday: (servicesOverride?: AppServices) => Promise<void>;
}

export const useTasksStore = create<TasksStoreState>((set, get) => ({
  todayTasks: [],
  services: null,
  refreshDiagnostics: null,

  setServices: (services: AppServices) => {
    set({ services });
  },

  refreshToday: async (servicesOverride?: AppServices) => {
    const seq = ++refreshSeq;
    void logInfo(`refreshToday start seq=${seq}`);
    try {
      const s = servicesOverride ?? get().services;
      if (!s) {
        void logInfo(`refreshToday skipped: services unavailable seq=${seq}`);
        return;
      }
      const today = s.wall.todayLocalDate();
      const weekdayIdx = s.wall.weekdayIndex(today);
      const tasks = await s.tasksRepo.listToday(today, weekdayIdx);
      let diagnostics: RefreshDiagnostics | null = null;
      try {
        const rows = await s.db.all<{ id: number; title: string; archived: number; days_mask: number }>(
          'SELECT id, title, archived, days_mask FROM tasks ORDER BY id'
        );
        const active = rows.filter(row => row.archived === 0);
        const eligible = active.filter(row => (row.days_mask & (1 << weekdayIdx)) !== 0);
        const binary = (mask: number) => `0b${mask.toString(2).padStart(8, '0')}`;
        diagnostics = { seq, raw: rows.length, afterArchived: active.length, afterMask: eligible.length };
        void logInfo(`refreshToday: listToday(${today}, weekday=${weekdayIdx}) → raw ${rows.length} rows seq=${seq}`);
        void logInfo(`refreshToday: filter archived → ${active.length} passed (removed: ${rows.filter(row => row.archived !== 0).map(row => `id=${row.id} archived=${row.archived}`).join(', ')}) seq=${seq}`);
        void logInfo(`refreshToday: filter days_mask(${binary(1 << weekdayIdx)}, weekday=${weekdayIdx}) → ${eligible.length} passed (removed: ${active.filter(row => !(row.days_mask & (1 << weekdayIdx))).map(row => `id=${row.id} mask=${binary(row.days_mask)} != weekday`).join(', ')}) seq=${seq}`);
        if (tasks.length === 0) {
          void logInfo(`refreshToday: EMPTY why=${rows.length === 0 ? 'empty-table' : eligible.length === 0 ? 'filters' : 'read-mismatch'} raw=${rows.length} afterArchived=${active.length} afterMask=${eligible.length} seq=${seq}`);
        }
      } catch (error) {
        void logError(`refreshToday: diagnostics failed seq=${seq} ${formatError(error)}`);
      }
      if (seq !== refreshSeq) {
        void logInfo(`refreshToday seq=${seq} stale-dropped (newer seq=${refreshSeq} in flight)`);
        return;
      }
      set({ todayTasks: tasks, refreshDiagnostics: diagnostics });
      void logInfo(`refreshToday success: ${tasks.length} tasks [ids=${tasks.map(task => task.id).join(',')}] seq=${seq}`);
    } catch (error) {
      void logError(`refreshToday failure: seq=${seq} ${formatError(error)}`);
      throw error;
    }
  },
}));

export const tasksStore = Object.assign(useTasksStore, {
  refreshToday: (servicesOverride?: AppServices) =>
    useTasksStore.getState().refreshToday(servicesOverride),
  setServices: (services: AppServices) => useTasksStore.getState().setServices(services),
});
