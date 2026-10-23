/** @jest-environment node */
import React from 'react';
import { act, cleanup, waitFor } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

describe('TimerScreen routeSession refresh on verify / focus', () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('refreshes routeSession on store mutation and focus after verify', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    let focusCb: (() => void) | undefined;

    const mockNavigation: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn((event: string, cb: () => void) => {
        if (event === 'focus') {
          focusCb = cb;
        }
        return () => {};
      }),
    };

    // 1. Initial render
    const firstRender = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    const services = firstRender.services;

    // 2. Setup pin, start task 1, advance to complete
    await services.authService.setupPin('1234');
    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });

    const snapshotAfterTick = timerStore.getState().snapshot;
    expect(snapshotAfterTick.state.kind).toBe('Completed');
    const sessionId = snapshotAfterTick.sessionId;
    expect(sessionId).not.toBeNull();

    // 3. UNMOUNT, then render AGAIN with the SAME db and { db, clock, wall: systemWallClock, services }
    firstRender.unmount();

    const secondRender = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock, services }
    );

    // Baseline: awaiting and showParent are visible
    expect(await secondRender.findByText(uk.timer.awaiting)).toBeTruthy();
    expect(await secondRender.findByText(uk.timer.showParent)).toBeTruthy();

    // 4. WHILE STILL MOUNTED: verify the session
    const token = services.authService.issueToken();
    await act(async () => {
      await timerStore.verify(sessionId!, token);
    });

    // 5. Assert the screen now shows the verified state and no longer offers the verify action
    await waitFor(() => {
      expect(secondRender.queryByText(uk.timer.verified)).toBeTruthy();
    });
    expect(secondRender.queryByText(uk.timer.awaiting)).toBeNull();
    expect(secondRender.queryByText(uk.timer.showParent)).toBeNull();

    // 6. Fire the captured focus callback and re-assert the same three expectations
    await act(async () => {
      focusCb?.();
    });

    await waitFor(() => {
      expect(secondRender.queryByText(uk.timer.verified)).toBeTruthy();
    });
    expect(secondRender.queryByText(uk.timer.awaiting)).toBeNull();
    expect(secondRender.queryByText(uk.timer.showParent)).toBeNull();
  });
});
