/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { TodayScreen } from '../TodayScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { uk } from '../../i18n/uk';
import { timerStore } from '../../state/timerStore';
import { tasksStore } from '../../state/tasksStore';

describe('TodayScreen', () => {
  jest.setTimeout(15000);

  const fakeFridayWallClock: WallClock = {
    todayLocalDate: () => '2026-10-23', // Friday
    weekdayIndex: () => 4, // 0 = Mon, 4 = Fri
    addDays: (_date: string, n: number) => `2026-10-${23 + n}`,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows only non-archived tasks scheduled for today', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services, findByText, queryByText } = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeFridayWallClock }
    );

    // Default seeded tasks have daysMask=127 (Mon-Sun): "Читання", "Домашнє завдання", "Прибрати кімнату"
    expect(await findByText('Читання')).toBeTruthy();
    expect(await findByText('Домашнє завдання')).toBeTruthy();
    expect(await findByText('Прибрати кімнату')).toBeTruthy();

    // Insert an archived task
    await services.tasksRepo.create(
      {
        title: 'Архівне завдання',
        targetMinutes: 10,
        daysMask: 127,
      },
      fakeFridayWallClock.nowIso()
    );
    const all = await services.tasksRepo.listAll();
    const createdArchived = all.find((t) => t.title === 'Архівне завдання')!;
    await services.tasksRepo.archive(createdArchived.id, fakeFridayWallClock.nowIso());

    // Insert a task scheduled only for Monday (bit 0 = 1)
    await services.tasksRepo.create(
      {
        title: 'Тільки в понеділок',
        targetMinutes: 10,
        daysMask: 1, // Mon only
      },
      fakeFridayWallClock.nowIso()
    );

    // Refresh today tasks
    await act(async () => {
      await tasksStore.refreshToday(services);
    });

    expect(queryByText('Архівне завдання')).toBeNull();
    expect(queryByText('Тільки в понеділок')).toBeNull();
  });

  it('reflects session status in pills', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { findAllByText } = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeFridayWallClock }
    );

    // Before starting, tasks are Idle
    const idlePills = await findAllByText(uk.status.idle);
    expect(idlePills.length).toBeGreaterThan(0);
  });

  it('starts task and navigates when tapping an Idle task', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { findByLabelText } = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeFridayWallClock }
    );

    const task1Button = await findByLabelText(/Читання/);
    await act(async () => {
      fireEvent.press(task1Button);
    });

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Timer', { taskId: 1 });
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
  });

  it('starting a second task while one is Running shows AS-05 error and does not navigate', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services, findByLabelText, findByText } = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeFridayWallClock }
    );

    // Start Task 1 directly in timerStore
    await act(async () => {
      await timerStore.start(1);
    });
    mockNavigation.navigate.mockClear();

    // Now tap Task 2 ("Домашнє завдання")
    const task2Button = await findByLabelText(/Домашнє завдання/);
    await act(async () => {
      fireEvent.press(task2Button);
    });

    // Should NOT navigate to Task 2
    expect(mockNavigation.navigate).not.toHaveBeenCalled();

    // Should display AS-05 friendly error message
    expect(await findByText(uk.today.activeSessionError)).toBeTruthy();
  });
});
