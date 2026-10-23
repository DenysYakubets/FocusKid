import React, { createContext, useContext } from 'react';
import { MonotonicClock } from '../services/clock/monotonic';
import { WallClock } from '../services/clock/wallClock';
import { Db } from '../services/db/Db';
import { createAuthRepo, AuthRepo } from '../services/repos/authRepo';
import { createAuthService, AuthService } from '../services/auth/authService';
import { createSessionsRepo, SessionsRepo } from '../services/repos/sessionsRepo';
import { createTasksRepo, TasksRepo } from '../services/repos/tasksRepo';
import {
  createTimerService,
  TimerService,
  TokenConsumer,
} from '../services/timer/timerService';

export interface AppServices {
  db: Db;
  clock: MonotonicClock;
  wall: WallClock;
  tasksRepo: TasksRepo;
  sessionsRepo: SessionsRepo;
  authRepo: AuthRepo;
  authService: AuthService;
  timerService: TimerService;
}

export interface CreateAppServicesOptions {
  db: Db;
  clock: MonotonicClock;
  wall: WallClock;
  consumeToken?: TokenConsumer;
  randomBytes?: (byteCount: number) => Uint8Array;
  iterations?: number;
}

export function createAppServices(options: CreateAppServicesOptions): AppServices {
  const { db, clock, wall } = options;
  const tasksRepo = createTasksRepo(db);
  const sessionsRepo = createSessionsRepo(db);
  const authRepo = createAuthRepo(db);

  const authService = createAuthService({
    authRepo,
    clock,
    wall,
    randomBytes: options.randomBytes,
    iterations: options.iterations,
  });

  const consumeToken =
    options.consumeToken ?? ((token: unknown) => authService.consumeToken(token));

  const timerService = createTimerService({
    db,
    clock,
    wall,
    tasksRepo,
    sessionsRepo,
    consumeToken,
  });

  return {
    db,
    clock,
    wall,
    tasksRepo,
    sessionsRepo,
    authRepo,
    authService,
    timerService,
  };
}

const AppServicesContext = createContext<AppServices | null>(null);

export interface AppServicesProviderProps {
  services: AppServices;
  children: React.ReactNode;
}

export function AppServicesProvider({ services, children }: AppServicesProviderProps) {
  return React.createElement(
    AppServicesContext.Provider,
    { value: services },
    children
  );
}

export function useServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useServices must be used within an AppServicesProvider');
  }
  return ctx;
}
