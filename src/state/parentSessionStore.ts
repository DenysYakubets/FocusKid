import { create } from 'zustand';
import { AuthService, ParentToken, AuthAttemptResult } from '../services/auth/authService';

export type ParentIntent =
  | 'enterParent'
  | 'verify'
  | 'abandon'
  | { intent: 'enterParent' | 'verify' | 'abandon'; [key: string]: unknown };

export interface ParentSessionStoreState {
  isSessionActive: boolean;
  service: AuthService | null;
  setService: (service: AuthService) => void;
  isActive: (now?: number) => boolean;
  lockoutRemainingMs: (now?: number) => number;
  attempt: (
    pin: string,
    intent: ParentIntent
  ) => Promise<{
    ok: boolean;
    status: AuthAttemptResult;
    token?: ParentToken;
    remainingMs?: number;
  }>;
  exit: () => void;
  touch: (now?: number) => void;
}

export const useParentSessionStore = create<ParentSessionStoreState>((set, get) => ({
  isSessionActive: false,
  service: null,

  setService: (service: AuthService) => {
    set({
      service,
      isSessionActive: service.isParentSessionActive(),
    });
  },

  isActive: (now?: number) => {
    const service = get().service;
    if (!service) return false;
    const active = service.isParentSessionActive(now);
    if (!active && get().isSessionActive) {
      set({ isSessionActive: false });
    }
    return active;
  },

  lockoutRemainingMs: (now?: number) => {
    const service = get().service;
    if (!service) return 0;
    return service.lockoutRemainingMs(now);
  },

  attempt: async (pin: string, intent: ParentIntent) => {
    const service = get().service;
    if (!service) {
      throw new Error('AuthService not attached to parentSessionStore');
    }

    const res = await service.attempt(pin);
    const intentName = typeof intent === 'string' ? intent : intent.intent;

    if (res === 'SUCCESS') {
      if (intentName === 'enterParent') {
        service.startParentSession();
        set({ isSessionActive: true });
        return { ok: true, status: 'SUCCESS' };
      } else {
        const token = service.issueToken();
        return { ok: true, status: 'SUCCESS', token };
      }
    } else if (res === 'LOCKED') {
      return {
        ok: false,
        status: 'LOCKED',
        remainingMs: service.lockoutRemainingMs(),
      };
    } else {
      return { ok: false, status: 'INVALID' };
    }
  },

  exit: () => {
    const service = get().service;
    if (service) {
      service.endParentSession();
    }
    set({ isSessionActive: false });
  },

  touch: (now?: number) => {
    const service = get().service;
    if (service) {
      service.touch(now);
    }
  },
}));

export const parentSessionStore = Object.assign(useParentSessionStore, {
  isActive: (now?: number) => useParentSessionStore.getState().isActive(now),
  lockoutRemainingMs: (now?: number) =>
    useParentSessionStore.getState().lockoutRemainingMs(now),
  attempt: (pin: string, intent: ParentIntent) =>
    useParentSessionStore.getState().attempt(pin, intent),
  exit: () => useParentSessionStore.getState().exit(),
  touch: (now?: number) => useParentSessionStore.getState().touch(now),
  setService: (service: AuthService) =>
    useParentSessionStore.getState().setService(service),
});
