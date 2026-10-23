/** @jest-environment node */
import React from 'react';
import { act, cleanup, fireEvent } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

describe('TimerScreen session scoping (F2)', () => {
  jest.setTimeout(25000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('TEST 1 (cold-start completed): shows awaiting and showParent after cold start, navigates with completedSessionId, disables +5 min, no pause button', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockNavigation: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const firstRender = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await firstRender.services.authService.setupPin('1234');

    // Start task 1 (15 min = 900,000 ms)
    await act(async () => {
      await timerStore.start(1);
    });

    // Advance clock to target and tick into Completed
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });

    const snapshotAfterTick = timerStore.getState().snapshot;
    expect(snapshotAfterTick.state.kind).toBe('Completed');
    const completedSessionId = snapshotAfterTick.sessionId;
    expect(completedSessionId).not.toBeNull();

    // Unmount before simulating cold start
    firstRender.unmount();

    // SIMULATE COLD START: call renderWithApp AGAIN with the SAME db but fresh options (no services passed)
    // so a fresh createAppServices + hydrate happens (hydrate loads no active row -> snapshot Idle).
    const mockNavCold: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const coldRender = await renderWithApp(
      <TimerScreen navigation={mockNavCold} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Verify snapshot is Idle on cold start
    expect(timerStore.getState().snapshot.state.kind).toBe('Idle');

    // Assert: uk.timer.awaiting and uk.timer.showParent are VISIBLE once routeSession loads
    const awaitingEl = await coldRender.findByText(uk.timer.awaiting);
    expect(awaitingEl).toBeTruthy();

    const showParentBtn = await coldRender.findByText(uk.timer.showParent);
    expect(showParentBtn).toBeTruthy();

    // Press showParent -> navigation.navigate called with ('PinGate', { intent: 'verify', sessionId: completedSessionId })
    await act(async () => {
      fireEvent.press(showParentBtn);
    });

    expect(mockNavCold.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId: completedSessionId,
    });

    // Assert no pause button
    expect(coldRender.queryByLabelText(uk.timer.pause)).toBeNull();

    // Assert the "+5 хв" control is disabled if present, or absent
    const addTimeBtn = coldRender.queryByLabelText(uk.timer.addTime);
    if (addTimeBtn) {
      expect(addTimeBtn.props.accessibilityState?.disabled).toBe(true);
    }
  });

  it("TEST 2 (multi-task): on a fresh db, start task 2, advance 900000, tick -> completed (session2). Then timerStore.start(1) -> task 1 running (session1, active). Render TimerScreen with route taskId 2. Assert: shows uk.timer.awaiting + uk.timer.showParent, does NOT show uk.timer.pause (the other task's control), and pressing showParent navigates with sessionId === session2 (NOT session1). Also assert digits show 00:00 (completed remaining is 0) — queryByText('00:00').", async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services, wall } = await setupTestServices({ db, clock, wall: systemWallClock });
    await services.authService.setupPin('1234');

    // Ensure task 2 target is 15 min (900_000 ms) so advancing 900,000 completes it
    await db.run('UPDATE tasks SET target_minutes = 15 WHERE id = 2;');

    // On a fresh db, start task 2, advance 900000, tick -> completed (session2)
    await act(async () => {
      await timerStore.start(2);
    });

    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });

    const snapshotSession2 = timerStore.getState().snapshot;
    expect(snapshotSession2.state.kind).toBe('Completed');
    const session2 = snapshotSession2.sessionId;
    expect(session2).not.toBeNull();

    // Then timerStore.start(1) -> task 1 running (session1, active)
    await act(async () => {
      await timerStore.start(1);
    });

    const snapshotSession1 = timerStore.getState().snapshot;
    expect(snapshotSession1.state.kind).toBe('Running');
    expect(snapshotSession1.taskId).toBe(1);
    const session1 = snapshotSession1.sessionId;
    expect(session1).not.toBeNull();
    expect(session1).not.toBe(session2);

    // Render TimerScreen with route taskId 2
    const mockNavTask2: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const screenTask2 = await renderWithApp(
      <TimerScreen navigation={mockNavTask2} route={{ params: { taskId: 2 } } as any} />,
      { db, clock, wall, services }
    );

    // Assert: shows uk.timer.awaiting + uk.timer.showParent
    const awaitingEl = await screenTask2.findByText(uk.timer.awaiting);
    expect(awaitingEl).toBeTruthy();

    const showParentBtn = await screenTask2.findByText(uk.timer.showParent);
    expect(showParentBtn).toBeTruthy();

    // Assert: does NOT show uk.timer.pause (the other task's control)
    expect(screenTask2.queryByLabelText(uk.timer.pause)).toBeNull();

    // Also assert digits show 00:00 (completed remaining is 0) — queryByText('00:00')
    expect(screenTask2.queryByText('00:00')).toBeTruthy();

    // Pressing showParent navigates with sessionId === session2 (NOT session1)
    await act(async () => {
      fireEvent.press(showParentBtn);
    });

    expect(mockNavTask2.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId: session2,
    });
    expect(mockNavTask2.navigate).not.toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId: session1,
    });
  });
});
