/** @jest-environment node */
import React from 'react';
import { StatsScreen } from '../StatsScreen';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { parentSessionStore } from '../../state/parentSessionStore';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';

describe('StatsScreen', () => {
  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no verified tasks for the current week', async () => {
    const { services } = await renderWithApp(<></>);
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    const { findByText } = await renderWithApp(
      <StatsScreen navigation={mockNavigation} route={{} as any} />,
      { services }
    );

    const emptyText = await findByText('Ще немає перевірених завдань цього тижня');
    expect(emptyText).toBeTruthy();
  });

  it('renders week totals and task breakdown when verified sessions exist', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const testWallClock: WallClock = {
      ...systemWallClock,
      todayLocalDate: () => '2026-10-21',
    };

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: testWallClock,
    });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    // Insert task and verified session for Wednesday 2026-10-21 via valid FSM transitions
    await db.run(
      `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, created_at, updated_at)
       VALUES (10, 'Читання', '📚', 15, 127, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`
    );
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (10, '2026-10-21', 'running', 900000, 0, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z');`
    );
    await db.run(
      `UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`,
      [35 * 60000, res.lastInsertRowId]
    );
    await db.run(
      `UPDATE sessions SET status = 'verified' WHERE id = ?;`,
      [res.lastInsertRowId]
    );

    const { findByText } = await renderWithApp(
      <StatsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: testWallClock, services }
    );

    const taskText = await findByText('📚 Читання');
    expect(taskText).toBeTruthy();

    const minText = await findByText('35 хв');
    expect(minText).toBeTruthy();
  });
});
