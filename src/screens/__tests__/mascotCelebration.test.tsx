/**
 * C9 RED tests - mascot celebration flight:
 *  - fires exactly once on a live Completed/Verified transition, never on
 *    Running/Paused, never on parent/PIN screens (INV-05);
 *  - round-1 MED: the overlay UNMOUNTS as soon as the flight settles;
 *  - round-1 LOW: remounting TimerScreen while the snapshot is still
 *    Completed must NOT replay the flight (session-scoped celebrate-once).
 *
 * RED on the round-1 tree: `handleCelebrationFinished` cleared the refs and the
 * render-phase block re-armed them in the same commit (overlay parked forever,
 * proven by `queryByTestId(...)` staying non-null after the flight), and
 * `celebratedRef` is per-mount so a remount flew the arc a second time.
 *
 * MascotCelebration is wrapped in a mount counter so "exactly once" stays
 * observable even though the overlay now correctly unmounts after the flight.
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

// Mount counter for the overlay: `__mounts.count` tells how many times the
// celebration was actually laid into the tree, regardless of how long it stayed.
jest.mock('../../ui/components/MascotCelebration', () => {
  const ReactModule = require('react');
  const actual = jest.requireActual('../../ui/components/MascotCelebration');
  const mounts = { count: 0 };
  return {
    ...actual,
    MascotCelebration: (props: Record<string, unknown>) => {
      // Count real mounts, not re-renders (the overlay re-renders while the
      // reduce-motion answer is in flight).
      const mounted = ReactModule.useRef(false);
      if (!mounted.current) {
        mounted.current = true;
        mounts.count += 1;
      }
      return ReactModule.createElement(actual.MascotCelebration, props);
    },
    __mounts: mounts,
  };
});

const celebration = require('../../ui/components/MascotCelebration') as {
  __mounts: { count: number };
};

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function restartStore() {
  useMascotStore.setState({ mascot: DEFAULT_MASCOT, hydrated: false });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('C9 - mascot celebration fires exactly once on Completed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restartStore();
    celebration.__mounts.count = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('runs the celebration exactly once when the timer reaches Completed, not while Running/Paused, and unmounts the overlay once the flight settles (round-1 MED)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Running: celebration must NOT be present.
    await act(async () => {
      await timerStore.start(1);
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
    expect(screen.queryByTestId('mascot-celebration')).toBeNull();
    expect(celebration.__mounts.count).toBe(0);

    // Paused: celebration must still NOT be present.
    await act(async () => {
      await timerStore.pause();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');
    expect(screen.queryByTestId('mascot-celebration')).toBeNull();
    expect(celebration.__mounts.count).toBe(0);

    // Resume, advance to target, tick into Completed.
    await act(async () => {
      await timerStore.resume();
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    await flush();
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');

    // Laid into the tree exactly once...
    expect(celebration.__mounts.count).toBe(1);
    // ...and gone again once the flight settles: no static duplicate mascot
    // parked on MascotFloating's corner for the whole Completed state.
    expect(screen.queryByTestId('mascot-celebration')).toBeNull();

    // A further tick while still Completed must not spawn a second flight.
    await act(async () => {
      await timerStore.tick();
    });
    await flush();
    expect(celebration.__mounts.count).toBe(1);
    expect(screen.queryByTestId('mascot-celebration')).toBeNull();

    screen.unmount();
  });

  it('INV-05: never rendered on parent/PIN screens (celebration lives only on the child Timer)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { PinGateScreen } = require('../PinGateScreen');
    const pin = await renderWithApp(
      <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'enterParent' } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(pin.queryByTestId('mascot-celebration')).toBeNull();
    expect(celebration.__mounts.count).toBe(0);
    pin.unmount();

    const { ParentHomeScreen } = require('../ParentHomeScreen');
    const parent = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(parent.queryByTestId('mascot-celebration')).toBeNull();
    expect(celebration.__mounts.count).toBe(0);
    parent.unmount();
  });

  it('round-1 LOW: a TimerScreen remount while the snapshot is still Completed does not replay the flight', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const first = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    await flush();
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
    expect(celebration.__mounts.count).toBe(1);

    // App behaviour: Today -> Timer does NOT cold-restore anything — the live
    // timer store still holds the Completed snapshot. renderWithApp always
    // re-hydrates during setup, so pin hydrate to the service's own current
    // snapshot (i.e. "no restore happened") and reuse the same services.
    jest
      .spyOn(first.services.timerService, 'hydrate')
      .mockResolvedValue(first.services.timerService.getSnapshot());
    first.unmount();

    const second = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock, services: first.services }
    );
    await flush();
    expect(second.queryByTestId('timer-layout-portrait')).toBeTruthy();
    expect(celebration.__mounts.count).toBe(1);
    expect(second.queryByTestId('mascot-celebration')).toBeNull();
    second.unmount();
  });
});