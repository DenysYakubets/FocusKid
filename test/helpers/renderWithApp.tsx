import React from 'react';
import { render, RenderResult } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppServices, createAppServices, AppServicesProvider } from '../../src/state/appServices';
import { createNodeDb } from './nodeDb';
import { createFakeClock, FakeClock } from './fakeClock';
import { systemWallClock, WallClock } from '../../src/services/clock/wallClock';
import { migrate } from '../../src/services/db/migrations';
import { seedIfEmpty } from '../../src/services/db/seed';
import { timerStore } from '../../src/state/timerStore';
import { tasksStore } from '../../src/state/tasksStore';
import { parentSessionStore } from '../../src/state/parentSessionStore';
import { Db } from '../../src/services/db/Db';

export interface RenderWithAppOptions {
  services?: AppServices;
  clock?: FakeClock;
  wall?: WallClock;
  db?: Db;
}

export interface RenderWithAppResult extends RenderResult {
  services: AppServices;
  clock: FakeClock;
  wall: WallClock;
  db: Db;
}

export async function setupTestServices(options: RenderWithAppOptions = {}): Promise<{
  services: AppServices;
  clock: FakeClock;
  wall: WallClock;
  db: Db;
}> {
  const db = options.db ?? createNodeDb();
  await migrate(db);
  const wall = options.wall ?? systemWallClock;
  await seedIfEmpty(db, wall);
  const clock = options.clock ?? createFakeClock(1000);

  const services =
    options.services ??
    createAppServices({
      db,
      clock,
      wall,
    });

  timerStore.setService(services.timerService);
  await timerStore.hydrate();
  tasksStore.setServices(services);
  await tasksStore.refreshToday();
  parentSessionStore.setService(services.authService);

  return { services, clock, wall, db };
}

export async function renderWithApp(
  ui: React.ReactElement,
  options: RenderWithAppOptions = {}
): Promise<RenderWithAppResult> {
  const { services, clock, wall, db } = await setupTestServices(options);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppServicesProvider services={services}>
      <SafeAreaProvider>
        <NavigationContainer>{children}</NavigationContainer>
      </SafeAreaProvider>
    </AppServicesProvider>
  );

  const result = await render(ui, { wrapper: Wrapper });

  return Object.assign(result, {
    services,
    clock,
    wall,
    db,
  });
}
