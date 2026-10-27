/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

describe('timerPauseBudget', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNav: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a static paused label without a countdown until manual resume', async () => {
    jest.useFakeTimers();
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByLabelText, findByText, queryByText, unmount } = await renderWithApp(
      <TimerScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall }
    );

    // Start session
    await act(async () => {
      await timerStore.start(1);
    });

    // While Running: paused label is not rendered
    expect(queryByText(/^Пауза: залишилось/)).toBeNull();

    // Press 'Пауза' -> paused label rendered, with no countdown.
    await act(async () => {
      fireEvent.press(getByLabelText(uk.timer.pause));
    });

    expect(await findByText(uk.status.paused)).toBeTruthy();
    expect(queryByText(/^Пауза: залишилось/)).toBeNull();

    // Advancing the clock does not update any pause countdown or trigger auto-resume.
    await act(async () => {
      clock.advance(300_000);
      jest.advanceTimersByTime(1000);
    });

    expect(queryByText(uk.timer.pauseBudgetExhausted)).toBeNull();
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');

    // 3. Resume -> budget line disappears
    await act(async () => {
      fireEvent.press(getByLabelText(uk.timer.resume));
    });

    expect(queryByText(/^Пауза: залишилось/)).toBeNull();
    expect(queryByText(uk.timer.pauseBudgetExhausted)).toBeNull();
    unmount();
  });
});
