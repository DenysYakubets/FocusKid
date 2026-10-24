/**
 * C3 RED: explicit start — tapping a task must NOT auto-start the timer.
 *
 * Owner brief: "entering a task item must NOT auto-start the timer. Tap task
 * -> navigate to Timer screen in an IDLE/READY state showing a clear 'Почати'
 * (Start) button; only pressing Start begins the countdown."
 *
 * RED-phase assertions (must FAIL against current auto-start code):
 *   - pressing an idle TaskCard does NOT start a session
 *   - navigating to 'Timer' still happens
 *
 * GREEN-phase assertions (must PASS after implementing):
 *   - Timer screen shows a 'Почати' Start button when no session is active
 *   - pressing Start begins the countdown (FSM -> Running)
 */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { systemWallClock } from '../../../src/services/clock/wallClock';
import { TodayScreen } from '../TodayScreen';
import { TimerScreen } from '../TimerScreen';
import { timerStore } from '../../../src/state/timerStore';
import { uk } from '../../../src/i18n/uk';

jest.setTimeout(30000);

const fakeWall = {
  ...systemWallClock,
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
};

describe('C3: explicit start — no auto-start on task tap', () => {
  it('RED: pressing an idle task does NOT start a session, but still navigates to Timer', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const mockNav: any = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => () => {}) };

    const { findByLabelText } = await renderWithApp(
      <TodayScreen navigation={mockNav} route={{ key: 'today', name: 'Today' } as any} />,
      { db, clock, wall: fakeWall }
    );

    // The seeded first task is "Читання" with status idle
    const taskCard = await findByLabelText(/Читання/);
    await act(async () => {
      fireEvent.press(taskCard);
    });

    // C3 RED assertion: NO session started
    expect(timerStore.getSnapshot().state.kind).not.toBe('Running');
    expect(timerStore.getSnapshot().sessionId).toBeNull();

    // But navigation to the Timer screen still happens (READY state)
    expect(mockNav.navigate).toHaveBeenCalledWith('Timer', { taskId: expect.any(Number) });
  });

  it('GREEN: Timer screen shows a "Почати" Start button in IDLE/READY state, pressing it starts the countdown', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const mockNav: any = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => () => {}) };

    const { findByLabelText, getByText, queryByText } = await renderWithApp(
      <TimerScreen navigation={mockNav} route={{ key: 'timer', name: 'Timer', params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall }
    );

    // No session active yet — READY state should show the Start button
    expect(timerStore.getSnapshot().state.kind).toBe('Idle');

    // The explicit Start button must be present
    const startBtn = await findByLabelText(uk.timer.start);
    expect(startBtn).toBeTruthy();

    // Pressing Start begins the countdown
    await act(async () => {
      fireEvent.press(startBtn);
    });

    expect(timerStore.getSnapshot().state.kind).toBe('Running');
  });
});