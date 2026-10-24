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
  /** F3: child-initiated stop (no parent token). */
  stop: () => Promise<boolean>;
  verify: (sessionId: number, token?: unknown) => Promise<boolean>;
  abandon: (sessionId: number, token?: unknown) => Promise<boolean>;
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
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.start(taskId);
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  pause: async () => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.pause();
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  resume: async () => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.resume();
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  addTime: async (ms?: number) => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.addTime(ms);
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  tick: async () => {
    try {
      const service = get().service;
      if (!service) return;
      const res = await service.tick();
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
    }
  },

  requestComplete: async () => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.requestComplete();
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  stop: async () => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.stop();
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  verify: async (sessionId: number, token?: unknown) => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.verify(sessionId, token);
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
  },

  abandon: async (sessionId: number, token?: unknown) => {
    try {
      const service = get().service;
      if (!service) throw new Error('TimerService not attached to timerStore');
      const res = await service.abandon(sessionId, token);
      set({
        snapshot: service.getSnapshot(),
        lastError: res.ok ? null : res.error,
      });
      return res.ok;
    } catch (err) {
      const service = get().service;
      set({
        snapshot: service ? service.getSnapshot() : get().snapshot,
        lastError: err instanceof Error ? err.message : 'OPERATION_FAILED',
      });
      return false;
    }
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
  stop: () => useTimerStore.getState().stop(),
  verify: (sessionId: number, token?: unknown) =>
    useTimerStore.getState().verify(sessionId, token),
  abandon: (sessionId: number, token?: unknown) =>
    useTimerStore.getState().abandon(sessionId, token),
  setService: (service: TimerService) => useTimerStore.getState().setService(service),
  getSnapshot: () => useTimerStore.getState().snapshot,
});
