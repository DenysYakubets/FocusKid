/**
 * C9 RED test - mascot celebration flight fires exactly once on Completed/Verified,
 * not on Running/Paused, not on parent/PIN screens (INV-05).
 * RED on the pre-fix tree: MascotCelebration does not exist yet.
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

describe('C9 - mascot celebration fires exactly once on Completed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restartStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('runs the celebration exactly once when the timer reaches Completed, not while Running/Paused, and the overlay is box-none', async () => {
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

    // Paused: celebration must still NOT be present.
    await act(async () => {
      await timerStore.pause();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');
    expect(screen.queryByTestId('mascot-celebration')).toBeNull();

    // Resume, advance to target, tick into Completed.
    await act(async () => {
      await timerStore.resume();
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');

    // Celebration overlay must now be present exactly once.
    const celebrations = screen.getAllByTestId('mascot-celebration');
    expect(celebrations).toHaveLength(1);

    // Non-blocking: pointerEvents box-none so touches pass through (INV-04 gentle).
    expect((celebrations[0] as any).props.pointerEvents).toBe('box-none');

    // Re-render (e.g. a further tick while still Completed) must NOT spawn a second overlay.
    await act(async () => {
      await timerStore.tick();
    });
    expect(screen.getAllByTestId('mascot-celebration')).toHaveLength(1);

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
    pin.unmount();

    const { ParentHomeScreen } = require('../ParentHomeScreen');
    const parent = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(parent.queryByTestId('mascot-celebration')).toBeNull();
    parent.unmount();
  });
});
