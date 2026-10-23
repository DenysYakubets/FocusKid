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

  it('INV-04 (Criterion 2): pausing, advancing 5 min and ticking leaves screen Running with Pause button disabled', async () => {
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

    // Advance 5 minutes (300_000 ms = PAUSE_BUDGET_MS)
    await act(async () => {
      clock.advance(300_000);
      await timerStore.tick();
    });

    // Auto-resumed to Running
    expect(timerStore.getSnapshot().state.kind).toBe('Running');

    // Pause button must now be disabled
    const updatedPauseBtn = getByLabelText(uk.timer.pause);
    expect(updatedPauseBtn.props.accessibilityState).toEqual({ disabled: true });
    expect(updatedPauseBtn.props.accessibilityState.disabled).toBe(true);
  });

  it('Criterion 3: "+5 хв" increases remaining time by 300 s, disabled after 12 presses', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByLabelText } = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    const addTimeBtn = getByLabelText(uk.timer.addTime);

    // Initial state: target 15 min (900_000 ms)
    const initialRemaining = timerStore.getSnapshot().state;
    const initialAdded = initialRemaining.kind === 'Running' ? initialRemaining.addedMs : 0;
    expect(initialAdded).toBe(0);

    // 1st press
    await act(async () => {
      fireEvent.press(addTimeBtn);
    });

    const after1State = timerStore.getSnapshot().state;
    const after1Added = after1State.kind === 'Running' ? after1State.addedMs : 0;
    expect(after1Added).toBe(300_000); // 300 s

    // Press 11 more times (total 12 presses)
    for (let i = 2; i <= 12; i++) {
      await act(async () => {
        fireEvent.press(addTimeBtn);
      });
    }

    const stateAfter12 = timerStore.getSnapshot().state;
    expect(stateAfter12.kind === 'Running' && stateAfter12.addedMs).toBe(3_600_000);

    // After 12 presses, the button is disabled
    const disabledBtn = getByLabelText(uk.timer.addTime);
    expect(disabledBtn.props.accessibilityState.disabled).toBe(true);
  });
});
