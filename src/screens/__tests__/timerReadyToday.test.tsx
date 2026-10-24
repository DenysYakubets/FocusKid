/** @jest-environment node */
/**
 * Round-1 HIGH (C3): the READY state must be derived from TODAY's sessions.
 *
 * RED-first (pre-fix tree): `refreshRouteSession` falls back to
 * `getLatestForTask`, so any prior-day (or today-completed) session drives
 * displayState to Completed/Verified, `isReady` stays false and «Почати» never
 * appears — the start path dead-ends on any previously used task, and a stale
 * prior-day row even routes the child to PinGate `verify`.
 */
import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { Db } from '../../services/db/Db';
import { WallClock } from '../../services/clock/wallClock';
import { TimerScreen } from '../TimerScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

const TODAY = '2026-10-24';
const YESTERDAY = '2026-10-23';

const fakeWall: WallClock = {
  todayLocalDate: () => TODAY,
  weekdayIndex: () => 5,
  addDays: (d) => d,
  nowIso: () => `${TODAY}T10:00:00.000Z`,
};

/** Insert a session in a terminal state through the real FSM-shaped writes. */
async function seedSession(
  db: Db,
  taskId: number,
  localDate: string,
  status: 'completed' | 'verified' | 'running'
): Promise<number> {
  const res = await db.run(
    `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
     VALUES (?, ?, 'running', 900000, 0, ?, ?);`,
    [taskId, localDate, `${localDate}T10:00:00Z`, `${localDate}T10:00:00Z`]
  );
  if (status !== 'running') {
    await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = 900000 WHERE id = ?;`, [
      res.lastInsertRowId,
    ]);
  }
  if (status === 'verified') {
    await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [res.lastInsertRowId]);
  }
  return res.lastInsertRowId;
}

async function countSessions(db: Db, taskId: number, localDate: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sessions WHERE task_id = ? AND local_date = ? AND status <> 'abandoned';`,
    [taskId, localDate]
  );
  return Number(row?.n ?? 0);
}

/** Let the screen's async routeSession refresh land before asserting. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockNav() {
  const nav: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  return nav;
}

describe("C3: READY comes from today's sessions, not the latest ever", () => {
  it("a task verified YESTERDAY + a free today shows «Почати» and starting it creates TODAY's session", async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await setupTestServices({ db, clock, wall: fakeWall });
    await seedSession(db, 1, YESTERDAY, 'verified');

    const nav = mockNav();
    const screen = await renderWithApp(
      <TimerScreen navigation={nav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services: prep.services }
    );
    await flush();

    // RED on the pre-fix tree: the stale Verified box wins and Start is absent.
    expect(screen.queryByText(uk.timer.verified)).toBeNull();
    const startBtn = await screen.findByLabelText(uk.timer.start);

    await act(async () => {
      fireEvent.press(startBtn);
    });
    await flush();

    expect(timerStore.getSnapshot().state.kind).toBe('Running');
    expect(await countSessions(db, 1, TODAY)).toBe(1);
    // Yesterday's row is untouched (INV-06: verified is immutable).
    const row = await db.get<{ status: string }>(
      `SELECT status FROM sessions WHERE task_id = 1 AND local_date = ?;`,
      [YESTERDAY]
    );
    expect(row?.status).toBe('verified');
  });

  it('a task COMPLETED yesterday neither dead-ends the screen nor routes the child to PinGate verify', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await setupTestServices({ db, clock, wall: fakeWall });
    await seedSession(db, 1, YESTERDAY, 'completed');

    const nav = mockNav();
    const screen = await renderWithApp(
      <TimerScreen navigation={nav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services: prep.services }
    );
    await flush();

    // RED on the pre-fix tree: «Очікує перевірки» + «Покажи батькам» for a
    // stale row, no Start button at all.
    expect(screen.queryByText(uk.timer.awaiting)).toBeNull();
    expect(screen.queryByText(uk.timer.showParent)).toBeNull();
    expect(screen.queryByText(uk.timer.verified)).toBeNull();
    expect(await screen.findByLabelText(uk.timer.start)).toBeTruthy();
    expect(nav.navigate).not.toHaveBeenCalledWith('PinGate', expect.anything());
  });

  it('a session COMPLETED TODAY (default target 1) still shows awaiting + «Покажи батькам» and no Start', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await setupTestServices({ db, clock, wall: fakeWall });
    await seedSession(db, 1, TODAY, 'completed');

    const nav = mockNav();
    const screen = await renderWithApp(
      <TimerScreen navigation={nav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services: prep.services }
    );
    await flush();

    expect(await screen.findByText(uk.timer.awaiting)).toBeTruthy();
    expect(screen.getByText(uk.timer.showParent)).toBeTruthy();
    // Day is done (1/1): no further start is offered.
    expect(screen.queryByLabelText(uk.timer.start)).toBeNull();
  });

  it('a session COMPLETED TODAY with target_per_day = 3 offers Start for the next run of the day', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await setupTestServices({ db, clock, wall: fakeWall });
    const task = await prep.services.tasksRepo.create(
      { title: 'Зарядка', targetMinutes: 1, daysMask: 127, targetPerDay: 3 },
      fakeWall.nowIso()
    );
    await seedSession(db, task.id, TODAY, 'completed');

    const nav = mockNav();
    const screen = await renderWithApp(
      <TimerScreen navigation={nav} route={{ params: { taskId: task.id } } as any} />,
      { db, clock, wall: fakeWall, services: prep.services }
    );
    await flush();

    // Today's run is still displayed (awaiting) — and the day is NOT over yet
    // (1/3), so the child can start the next run: this is what makes '2/3'
    // reachable in the UI.
    expect(await screen.findByText(uk.timer.awaiting)).toBeTruthy();
    expect(screen.getByText(uk.timer.showParent)).toBeTruthy();
    expect(await screen.findByLabelText(uk.timer.start)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.timer.start));
    });
    await waitFor(() => {
      expect(timerStore.getSnapshot().state.kind).toBe('Running');
    });
    expect(await countSessions(db, task.id, TODAY)).toBe(2);
  });
});