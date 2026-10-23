/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { TaskEditScreen } from '../TaskEditScreen';
import { TodayScreen } from '../TodayScreen';
import { parentSessionStore } from '../../state/parentSessionStore';
import { uk } from '../../i18n/uk';

describe('TaskEditScreen (Task CRUD & validation)', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4, // Friday (bit 4)
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const createAuthServices = async (db: any, clock: any) => {
    const { services } = await setupTestServices({
      db,
      clock,
      wall: fakeWall,
    });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);
    return services;
  };

  it('shows validation errors for empty title, title > 60 chars, target outside 1-120, and no weekdays', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await createAuthServices(db, clock);

    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };
    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    const saveButton = screen.getByLabelText(uk.taskCrud.save);

    // 1. Empty title validation
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), '   ');
    });
    await act(async () => {
      fireEvent.press(saveButton);
    });
    expect(await screen.findByText(uk.taskCrud.errors.titleEmpty)).toBeTruthy();
    expect(mockNav.goBack).not.toHaveBeenCalled();

    // 2. Title > 60 chars
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'A'.repeat(61));
    });
    await act(async () => {
      fireEvent.press(saveButton);
    });
    expect(await screen.findByText(uk.taskCrud.errors.titleTooLong)).toBeTruthy();

    // 3. Target outside 1-120 (decrease to 0)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'Нормальна назва');
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText('-5 хвилин'));
      });
    }
    await act(async () => {
      fireEvent.press(saveButton);
    });
    expect(await screen.findByText(uk.taskCrud.errors.targetRange)).toBeTruthy();

    // Reset target to valid 20 (tap +5 four times)
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText('+5 хвилин'));
      });
    }

    // 4. No weekdays: deselect all 7 days
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    for (const d of days) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(`${d}: вибрано`));
      });
    }
    await act(async () => {
      fireEvent.press(saveButton);
    });
    expect(await screen.findByText(uk.taskCrud.errors.daysEmpty)).toBeTruthy();

    screen.unmount();
  });

  it('creates a new task and reflects in TodayScreen', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await createAuthServices(db, clock);

    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };

    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'Плавання');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-emoji-input'), '🏊');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.taskCrud.save));
    });

    expect(mockNav.goBack).toHaveBeenCalled();
    screen.unmount();

    // Check TodayScreen
    const mockTodayNav: any = { addListener: jest.fn(() => () => {}) };
    const todayScreen = await renderWithApp(
      <TodayScreen navigation={mockTodayNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await todayScreen.findByText('Плавання')).toBeTruthy();
    todayScreen.unmount();
  });

  it('edits an existing task and reflects in TodayScreen', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await createAuthServices(db, clock);

    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };

    // Task 1 is seeded "Читання"
    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await screen.findByDisplayValue('Читання')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'Читання нової книги');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.taskCrud.save));
    });

    expect(mockNav.goBack).toHaveBeenCalled();
    screen.unmount();

    // Check TodayScreen
    const mockTodayNav: any = { addListener: jest.fn(() => () => {}) };
    const todayScreen = await renderWithApp(
      <TodayScreen navigation={mockTodayNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await todayScreen.findByText('Читання нової книги')).toBeTruthy();
    todayScreen.unmount();
  });

  it('enforces archive only when task has sessions, and delete when unused (AS-18)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await createAuthServices(db, clock);

    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };

    // Create a session for task 1 (15 min)
    await services.timerService.start(1);

    // Task 1 has a session: must show "Архівувати", not "Видалити"
    const screen1 = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await screen1.findByText(uk.taskCrud.archive)).toBeTruthy();
    expect(screen1.queryByText(uk.taskCrud.delete)).toBeNull();

    // Archive task 1
    await act(async () => {
      fireEvent.press(screen1.getByLabelText(uk.taskCrud.archive));
    });
    expect(mockNav.goBack).toHaveBeenCalled();
    screen1.unmount();

    // Task 1 is archived in DB
    const task1 = await services.tasksRepo.get(1);
    expect(task1?.archived).toBe(true);

    // Now test task 2 (no sessions): must show "Видалити"
    const mockNav2: any = { goBack: jest.fn(), replace: jest.fn() };
    const screen2 = await renderWithApp(
      <TaskEditScreen navigation={mockNav2} route={{ params: { taskId: 2 } } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await screen2.findByText(uk.taskCrud.delete)).toBeTruthy();
    expect(screen2.queryByText(uk.taskCrud.archive)).toBeNull();

    // Delete task 2
    await act(async () => {
      fireEvent.press(screen2.getByLabelText(uk.taskCrud.delete));
    });
    expect(mockNav2.goBack).toHaveBeenCalled();
    screen2.unmount();

    const task2 = await services.tasksRepo.get(2);
    expect(task2).toBeNull();
  });
});
