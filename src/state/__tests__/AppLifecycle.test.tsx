/** @jest-environment node */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AppLifecycle } from '../AppLifecycle';
import { AppServicesProvider, createAppServices } from '../appServices';
import { timerStore } from '../timerStore';
import { tasksStore } from '../tasksStore';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { systemWallClock } from '../../services/clock/wallClock';
import { migrate } from '../../services/db/migrations';
import { seedIfEmpty } from '../../services/db/seed';

describe('AppLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('refreshes today tasks when timer state kind changes', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, systemWallClock);
    const clock = createFakeClock(1000);
    const services = createAppServices({ db, clock, wall: systemWallClock });

    timerStore.setService(services.timerService);
    await timerStore.hydrate();
    tasksStore.setServices(services);

    const refreshSpy = jest.spyOn(tasksStore, 'refreshToday');

    await act(async () => {
      render(
        <AppServicesProvider services={services}>
          <AppLifecycle />
        </AppServicesProvider>
      );
    });

    // Initial mount triggers refreshToday
    expect(refreshSpy).toHaveBeenCalled();
    refreshSpy.mockClear();

    // Transition timer state: Start task 1 (kind changes to Running)
    await act(async () => {
      await timerStore.start(1);
    });

    expect(refreshSpy).toHaveBeenCalled();
    refreshSpy.mockClear();

    // Transition timer state: Pause (kind changes to Paused)
    await act(async () => {
      await timerStore.pause();
    });

    expect(refreshSpy).toHaveBeenCalled();
  });
});
