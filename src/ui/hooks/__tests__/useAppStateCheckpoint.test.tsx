/** @jest-environment node */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAppStateCheckpoint } from '../useAppStateCheckpoint';
import { AppServicesProvider, createAppServices } from '../../../state/appServices';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { systemWallClock } from '../../../services/clock/wallClock';
import { migrate } from '../../../services/db/migrations';
import { seedIfEmpty } from '../../../services/db/seed';
import { CHECKPOINT_INTERVAL_MS } from '../../../domain/timer/constants';

function CheckpointProbe({ onBackground }: { onBackground?: () => void }) {
  useAppStateCheckpoint(onBackground);
  return null;
}

describe('useAppStateCheckpoint', () => {
  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(() => {
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') {
        appStateListeners.push(listener as any);
      }
      return {
        remove: () => {
          const idx = appStateListeners.indexOf(listener as any);
          if (idx !== -1) appStateListeners.splice(idx, 1);
        },
      } as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls timerService.checkpoint every CHECKPOINT_INTERVAL_MS', async () => {
    jest.useFakeTimers();
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, systemWallClock);
    const clock = createFakeClock(1000);
    const services = createAppServices({ db, clock, wall: systemWallClock });

    const checkpointSpy = jest.spyOn(services.timerService, 'checkpoint').mockResolvedValue(undefined);

    await act(async () => {
      render(
        <AppServicesProvider services={services}>
          <CheckpointProbe />
        </AppServicesProvider>
      );
    });

    expect(checkpointSpy).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(CHECKPOINT_INTERVAL_MS);
    });

    expect(checkpointSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(CHECKPOINT_INTERVAL_MS);
    });

    expect(checkpointSpy).toHaveBeenCalledTimes(2);
  });

  it('calls checkpoint and onBackground when app transitions to background or inactive', async () => {
    const db = createNodeDb();
    await migrate(db);
    await seedIfEmpty(db, systemWallClock);
    const clock = createFakeClock(1000);
    const services = createAppServices({ db, clock, wall: systemWallClock });

    const checkpointSpy = jest.spyOn(services.timerService, 'checkpoint').mockResolvedValue(undefined);
    const onBackground = jest.fn();

    await act(async () => {
      render(
        <AppServicesProvider services={services}>
          <CheckpointProbe onBackground={onBackground} />
        </AppServicesProvider>
      );
    });

    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(onBackground).not.toHaveBeenCalled();

    await act(async () => {
      for (const listener of appStateListeners) {
        listener('background');
      }
    });

    expect(checkpointSpy).toHaveBeenCalledTimes(1);
    expect(onBackground).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (const listener of appStateListeners) {
        listener('inactive');
      }
    });

    expect(checkpointSpy).toHaveBeenCalledTimes(2);
    expect(onBackground).toHaveBeenCalledTimes(2);
  });
});
