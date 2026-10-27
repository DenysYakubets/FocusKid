/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

describe('TimerScreen', () => {
  jest.setTimeout(15000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('INV-03 (Criterion 1): no stop/finish element in non-completed state; "Покажи батькам" absent at target - 1ms, appears at target', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { queryByText, queryByLabelText, queryAllByRole } = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Start Task 1 (target 15 min = 900_000 ms)
    await act(async () => {
      await timerStore.start(1);
    });

    // Check no element matching /стоп|stop|завершити|finish/i exists
    const forbiddenRegex = /стоп|stop|завершити|finish/i;
    const allButtons = queryAllByRole('button');
    for (const btn of allButtons) {
      const label = btn.props.accessibilityLabel ?? '';
      expect(label).not.toMatch(forbiddenRegex);
    }
    expect(queryByText(forbiddenRegex)).toBeNull();
    expect(queryByLabelText(forbiddenRegex)).toBeNull();

    // Advancing fake clock to target - 1 ms
    await act(async () => {
      clock.advance(899_999);
      await timerStore.tick();
    });

    // "Покажи батькам" and "Очікує перевірки" must stay ABSENT
    expect(queryByText(uk.timer.showParent)).toBeNull();
    expect(queryByText(uk.timer.awaiting)).toBeNull();

    // Advance 1 ms to reach exact target
    await act(async () => {
      clock.advance(1);
      await timerStore.tick();
    });

    // Now in Completed state: "Покажи батькам" and "Очікує перевірки" MUST appear
    expect(queryByText(uk.timer.showParent)).toBeTruthy();
    expect(queryByText(uk.timer.awaiting)).toBeTruthy();

    // Still no stop/finish button
    expect(queryByText(forbiddenRegex)).toBeNull();
  });

  it('pausing and advancing time keeps the timer paused until manual resume', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByLabelText } = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    // Press Pause button
    const pauseBtn = getByLabelText(uk.timer.pause);
    await act(async () => {
      fireEvent.press(pauseBtn);
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');

    // Advance beyond the former pause budget.
    await act(async () => {
      clock.advance(300_000);
      await timerStore.tick();
    });

    expect(timerStore.getSnapshot().state.kind).toBe('Paused');
  });

  it('Criterion 3: gear control is available for a running session; +5 хв is removed', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByTestId, queryByLabelText } = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    expect(getByTestId('timer-gear')).toBeTruthy();
    expect(queryByLabelText(uk.timer.addTime)).toBeNull();
  });
});
