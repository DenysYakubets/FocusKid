/** @jest-environment node */
import React from 'react';
import * as ReactNative from 'react-native';
import { act } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { pauseBudgetLeft, remaining } from '../../domain/timer/elapsed';

describe('INV-08 Landscape Parity', () => {
  jest.setTimeout(15000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  it('preserves timer state, remaining time and pause budget when rotating from portrait to landscape', async () => {
    let mockDimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const spy = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockImplementation(() => mockDimensions as any);

    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByTestId, rerender, findByText } = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Start session and advance 30 s
    await act(async () => {
      await timerStore.start(1);
      clock.advance(30_000);
      await timerStore.tick();
    });

    // Verify portrait layout testID
    expect(getByTestId('timer-layout-portrait')).toBeTruthy();

    const portraitState = timerStore.getSnapshot().state;
    const now = clock.now();
    const portraitRemaining = remaining(portraitState, now);
    const portraitBudget = pauseBudgetLeft(portraitState, now);

    // Target 15 min = 900s. After 30s run, 870s left = 14:30
    const timeTextPortrait = await findByText('14:30');
    expect(timeTextPortrait).toBeTruthy();

    // 2. Rotate to landscape
    mockDimensions = { width: 800, height: 400, scale: 1, fontScale: 1 };

    await act(async () => {
      await rerender(
        <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />
      );
    });

    // Verify landscape layout testID
    expect(getByTestId('timer-layout-landscape')).toBeTruthy();

    const landscapeState = timerStore.getSnapshot().state;
    const landscapeRemaining = remaining(landscapeState, now);
    const landscapeBudget = pauseBudgetLeft(landscapeState, now);

    // Check parity
    expect(landscapeState).toEqual(portraitState);
    expect(landscapeRemaining).toBe(portraitRemaining);
    expect(landscapeBudget).toBe(portraitBudget);

    const timeTextLandscape = await findByText('14:30');
    expect(timeTextLandscape).toBeTruthy();

    spy.mockRestore();
  });
});
