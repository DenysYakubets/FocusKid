import { create } from 'zustand';
import { TimerService, TimerSnapshot } from '../services/timer/timerService';

export interface TimerStoreState {
  snapshot: TimerSnapshot;
  lastError: string | null;
  service: TimerService | null;
  setService: (service: TimerService) => void;
  start: (taskId: number) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  addTime: (ms?: number) => Promise<boolean>;
  tick: () => Promise<void>;
  requestComplete: () => Promise<boolean>;
  hydrate: (serviceOverride?: TimerService) => Promise<TimerSnapshot>;
}

export const useTimerStore = create<TimerStoreState>((set, get) => ({
  snapshot: {
    state: { kind: 'Idle' },
    sessionId: null,
    taskId: null,
  },
  lastError: null,
  service: null,

  setService: (service: TimerService) => {
    set({ service, snapshot: service.getSnapshot() });
  },

  start: async (taskId: number) => {
    const service = get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    const res = await service.start(taskId);
    set({
      snapshot: service.getSnapshot(),
      lastError: res.ok ? null : res.error,
    });
    return res.ok;
  },

  pause: async () => {
    const service = get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    const res = await service.pause();
    set({
      snapshot: service.getSnapshot(),
      lastError: res.ok ? null : res.error,
    });
    return res.ok;
  },

  resume: async () => {
    const service = get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    const res = await service.resume();
    set({
      snapshot: service.getSnapshot(),
      lastError: res.ok ? null : res.error,
    });
    return res.ok;
  },

  addTime: async (ms?: number) => {
    const service = get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    const res = await service.addTime(ms);
    set({
      snapshot: service.getSnapshot(),
      lastError: res.ok ? null : res.error,
    });
    return res.ok;
  },

  tick: async () => {
    const service = get().service;
    if (!service) return;
    await service.tick();
    set({ snapshot: service.getSnapshot() });
  },

  requestComplete: async () => {
    const service = get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    const res = await service.requestComplete();
    set({
      snapshot: service.getSnapshot(),
      lastError: res.ok ? null : res.error,
    });
    return res.ok;
  },

  hydrate: async (serviceOverride?: TimerService) => {
    const service = serviceOverride ?? get().service;
    if (!service) throw new Error('TimerService not attached to timerStore');
    if (serviceOverride) {
      set({ service: serviceOverride });
    }
    const snap = await service.hydrate();
    set({ snapshot: snap, lastError: null });
    return snap;
  },
}));

export const timerStore = Object.assign(useTimerStore, {
  hydrate: (service?: TimerService) => useTimerStore.getState().hydrate(service),
  start: (taskId: number) => useTimerStore.getState().start(taskId),
  pause: () => useTimerStore.getState().pause(),
  resume: () => useTimerStore.getState().resume(),
  addTime: (ms?: number) => useTimerStore.getState().addTime(ms),
  tick: () => useTimerStore.getState().tick(),
  requestComplete: () => useTimerStore.getState().requestComplete(),
  setService: (service: TimerService) => useTimerStore.getState().setService(service),
  getSnapshot: () => useTimerStore.getState().snapshot,
});
