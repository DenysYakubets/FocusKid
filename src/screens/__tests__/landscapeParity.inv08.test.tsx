/** @jest-environment node */
import React from 'react';
import * as ReactNative from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { TimerScreen } from '../TimerScreen';
import { TodayScreen } from '../TodayScreen';
import { StatsScreen } from '../StatsScreen';
import { PinGateScreen } from '../PinGateScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { parentSessionStore } from '../../state/parentSessionStore';
import { pauseBudgetLeft, remaining } from '../../domain/timer/elapsed';

describe('INV-08 Landscape Parity', () => {
  jest.setTimeout(25000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  it('preserves TodayScreen state across rotation', async () => {
    let mockDimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const spy = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockImplementation(() => mockDimensions as any);

    const { getByTestId, rerender, findByText } = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />
    );

    expect(getByTestId('today-layout-portrait')).toBeTruthy();
    const taskTitlePortrait = await findByText('Читання');
    expect(taskTitlePortrait).toBeTruthy();

    // Rotate to landscape
    mockDimensions = { width: 800, height: 400, scale: 1, fontScale: 1 };

    await act(async () => {
      await rerender(<TodayScreen navigation={mockNavigation} route={{} as any} />);
    });

    expect(getByTestId('today-layout-landscape')).toBeTruthy();
    const taskTitleLandscape = await findByText('Читання');
    expect(taskTitleLandscape).toBeTruthy();

    spy.mockRestore();
  });

  it('preserves StatsScreen state and data across rotation', async () => {
    let mockDimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const spy = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockImplementation(() => mockDimensions as any);

    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const testWall: WallClock = {
      ...systemWallClock,
      todayLocalDate: () => '2026-10-21',
    };

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: testWall,
    });

    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    // Seed a verified session
    await act(async () => {
      await db.run(
        `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
         VALUES (20, 'Читання', '📚', 15, 127, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`
      );
      const res = await db.run(
        `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
         VALUES (20, '2026-10-21', 'running', 900000, 0, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z');`
      );
      await db.run(
        `UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`,
        [35 * 60000, res.lastInsertRowId]
      );
      await db.run(
        `UPDATE sessions SET status = 'verified' WHERE id = ?;`,
        [res.lastInsertRowId]
      );
    });

    const { getByTestId, rerender, findByText } = await renderWithApp(
      <StatsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: testWall, services }
    );

    expect(getByTestId('stats-layout-portrait')).toBeTruthy();
    const portraitTask = await findByText('📚 Читання');
    expect(portraitTask).toBeTruthy();

    // Rotate to landscape
    mockDimensions = { width: 800, height: 400, scale: 1, fontScale: 1 };

    await act(async () => {
      await rerender(<StatsScreen navigation={mockNavigation} route={{} as any} />);
    });

    expect(getByTestId('stats-layout-landscape')).toBeTruthy();
    const landscapeTask = await findByText('📚 Читання');
    expect(landscapeTask).toBeTruthy();

    spy.mockRestore();
  });

  it('preserves typed partial PIN across rotation on PinGateScreen', async () => {
    let mockDimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const spy = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockImplementation(() => mockDimensions as any);

    parentSessionStore.getState().clearPinDraft();

    const { getByTestId, getByLabelText, rerender } = await renderWithApp(
      <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'enterParent' } } as any} />
    );

    expect(getByTestId('pingate-layout-portrait')).toBeTruthy();
    expect(getByLabelText('Введено 0 з 4 цифр')).toBeTruthy();

    // Type partial PIN: "1", "2"
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 1'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 2'));
    });

    expect(getByLabelText('Введено 2 з 4 цифр')).toBeTruthy();
    expect(parentSessionStore.getState().pinDraft).toBe('12');

    // Rotate to landscape
    mockDimensions = { width: 800, height: 400, scale: 1, fontScale: 1 };

    await act(async () => {
      await rerender(
        <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'enterParent' } } as any} />
      );
    });

    expect(getByTestId('pingate-layout-landscape')).toBeTruthy();
    // Verify typed partial PIN survives rotation
    expect(getByLabelText('Введено 2 з 4 цифр')).toBeTruthy();
    expect(parentSessionStore.getState().pinDraft).toBe('12');

    parentSessionStore.getState().clearPinDraft();
    spy.mockRestore();
  });
});
