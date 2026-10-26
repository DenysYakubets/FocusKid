import { logInfo, logError } from '../services/logging/fileLogger';
import { create } from 'zustand';
import { TodayTaskView } from '../domain/tasks/types';
import { AppServices } from './appServices';

export interface TasksStoreState {
  todayTasks: TodayTaskView[];
  services: AppServices | null;
  setServices: (services: AppServices) => void;
  refreshToday: (servicesOverride?: AppServices) => Promise<void>;
}

export const useTasksStore = create<TasksStoreState>((set, get) => ({
  todayTasks: [],
  services: null,

  setServices: (services: AppServices) => {
    set({ services });
  },

  refreshToday: async (servicesOverride?: AppServices) => {
    void logInfo('refreshToday start');
    try {
      const s = servicesOverride ?? get().services;
      if (!s) {
        void logInfo('refreshToday skipped: services unavailable');
        return;
      }
      const today = s.wall.todayLocalDate();
      const weekdayIdx = s.wall.weekdayIndex(today);
      const tasks = await s.tasksRepo.listToday(today, weekdayIdx);
      set({ todayTasks: tasks });
      void logInfo(`refreshToday success: ${tasks.length} tasks`);
    } catch (error) {
      void logError(`refreshToday failure: ${String(error)}`);
      throw error;
    }
  },
}));

export const tasksStore = Object.assign(useTasksStore, {
  refreshToday: (servicesOverride?: AppServices) =>
    useTasksStore.getState().refreshToday(servicesOverride),
  setServices: (services: AppServices) => useTasksStore.getState().setServices(services),
});
