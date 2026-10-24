/**
 * C6 RED test - pluggable timer-complete jingle hook with volume from settings (default 0.5).
 * RED on the pre-fix tree: src/audio/celebrationSound.ts does not exist yet.
 * @jest-environment node
 */
import React from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { useMascotStore } from '../../state/mascotStore';
import { DEFAULT_MASCOT } from '../../ui/theme';

jest.setTimeout(30000);

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function restartStore() {
  useMascotStore.setState({ mascot: DEFAULT_MASCOT, hydrated: false });
}

describe('C6 - pluggable timer-complete jingle hook with volume from settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restartStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('reads jingle_volume from settings: default 0.5 when absent, custom value respected', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Import the pluggable hook module (does not exist on the pre-fix tree -> RED).
    const { getJingleVolume, onTimerComplete, playCelebrationSound } = require('../../audio/celebrationSound');

    // Default: no jingle_volume row -> 0.5.
    const defaultVol = await getJingleVolume(screen.services.settingsRepo);
    expect(defaultVol).toBeCloseTo(0.5, 5);

    // Custom value respected.
    await screen.services.settingsRepo.set('jingle_volume', '0.75');
    const customVol = await getJingleVolume(screen.services.settingsRepo);
    expect(customVol).toBeCloseTo(0.75, 5);

    // The play function is pluggable (a function; default implementation guarded by try/catch + dynamic require).
    expect(typeof playCelebrationSound).toBe('function');

    // onTimerComplete is the pluggable subscription hook (returns unsubscribe).
    expect(typeof onTimerComplete).toBe('function');

    screen.unmount();
  });

  it('emits onTimerComplete exactly once when the timer reaches Completed (not Running/Paused)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    const { onTimerComplete } = require('../../audio/celebrationSound');

    const spy = jest.fn();
    const unsubscribe = onTimerComplete(spy);

    // Running: no emission yet.
    await act(async () => {
      await timerStore.start(1);
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
    expect(spy).not.toHaveBeenCalled();

    // Paused: still no emission.
    await act(async () => {
      await timerStore.pause();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');
    expect(spy).not.toHaveBeenCalled();

    // Resume, advance to Completed: exactly one emission.
    await act(async () => {
      await timerStore.resume();
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
    expect(spy).toHaveBeenCalledTimes(1);

    unsubscribe();
    screen.unmount();
  });
});
