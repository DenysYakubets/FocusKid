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
    const s = servicesOverride ?? get().services;
    if (!s) return;
    const today = s.wall.todayLocalDate();
    const weekdayIdx = s.wall.weekdayIndex(today);
    const tasks = await s.tasksRepo.listToday(today, weekdayIdx);
    set({ todayTasks: tasks });
  },
}));

export const tasksStore = Object.assign(useTasksStore, {
  refreshToday: (servicesOverride?: AppServices) =>
    useTasksStore.getState().refreshToday(servicesOverride),
  setServices: (services: AppServices) => useTasksStore.getState().setServices(services),
});
