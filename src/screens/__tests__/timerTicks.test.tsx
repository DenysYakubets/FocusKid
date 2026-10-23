/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { AppLifecycle } from '../../state/AppLifecycle';
import { timerStore } from '../../state/timerStore';

describe('timerTicks', () => {
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

  it('(1) LIVE path: digits countdown ticks as clock advances', async () => {
    jest.useFakeTimers();
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { getByText, queryByText, unmount } = await renderWithApp(
      <>
        <AppLifecycle />
        <TimerScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />
      </>,
      { db, clock, wall: fakeWall }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    // Task 1 is 15 min (15:00)
    expect(getByText('15:00')).toBeTruthy();

    await act(async () => {
      clock.advance(5000);
      jest.advanceTimersByTime(5000);
    });

    expect(queryByText('15:00')).toBeNull();
    expect(getByText('14:55')).toBeTruthy();
    unmount();
  });

  it('(2) RESTORED (non-live) path: digits decrease as clock advances without freezing', async () => {
    jest.useFakeTimers();
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services, wall } = await setupTestServices({
      db,
      clock,
      wall: fakeWall,
    });

    // Insert a stale running session row for task 2 AFTER hydrate
    await db.run(
      "INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, paused_total_ms, pause_count, started_at, updated_at) VALUES (2, ?, 'running', 900000, 0, 0, 0, ?, ?)",
      [wall.todayLocalDate(), wall.nowIso(), wall.nowIso()]
    );

    const { getByText, queryByText, findByText, unmount } = await renderWithApp(
      <TimerScreen navigation={mockNav} route={{ params: { taskId: 2 } } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await findByText('15:00')).toBeTruthy();

    await act(async () => {
      clock.advance(10000);
      jest.advanceTimersByTime(10000);
    });

    expect(queryByText('15:00')).toBeNull();
    expect(getByText('14:50')).toBeTruthy();
    unmount();
  });
});
