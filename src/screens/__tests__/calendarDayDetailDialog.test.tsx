/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';
import { CalendarScreen } from '../CalendarScreen';
import { uk } from '../../i18n/uk';
import { MIN_TOUCH_DP, colors } from '../../ui/theme';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

const wall: WallClock = {
  ...systemWallClock,
  todayLocalDate: () => '2026-10-24',
  nowIso: () => '2026-10-24T10:00:00.000Z',
};

async function setup() {
  const db = createNodeDb();
  const clock = createFakeClock(1000);
  const { services } = await renderWithApp(<></>, { db, clock, wall });

  const verified = await db.run(
    `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
     VALUES (1, '2026-10-21', 'running', 2100000, 0, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z');`
  );
  await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`, [
    35 * 60000,
    verified.lastInsertRowId,
  ]);
  await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [verified.lastInsertRowId]);

  const pending = await db.run(
    `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
     VALUES (2, '2026-10-22', 'running', 1800000, 0, '2026-10-22T10:00:00Z', '2026-10-22T10:00:00Z');`
  );
  await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = ? WHERE id = ?;`, [
    15 * 60000,
    pending.lastInsertRowId,
  ]);

  return { db, clock, services };
}

describe('Calendar day detail: full-screen dialog instead of cramped bottom sheet', () => {
  jest.setTimeout(30000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a full-screen, scrollable day-detail dialog (not the old 280dp bottom card)', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    // Nothing is open yet
    expect(screen.queryByTestId('calendar-day-detail-dialog')).toBeNull();

    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-22'));
    });

    // 1) The dialog exists as its own full-screen surface
    const dialog = await screen.findByTestId('calendar-day-detail-dialog', {}, { timeout: 3000 });
    const dialogStyle = flat(dialog);
    expect(dialogStyle.position).toBe('absolute');
    expect(dialogStyle.top).toBe(0);
    expect(dialogStyle.left).toBe(0);
    expect(dialogStyle.right).toBe(0);
    expect(dialogStyle.bottom).toBe(0);

    // 2) It is a LARGE dialog: no cramped maxHeight cap (the old card was 280dp)
    expect(dialogStyle.maxHeight).toBeUndefined();
    // The scroll card (not the backdrop) must also be uncapped
    expect(flat(screen.getByTestId('calendar-day-detail-scroll')).maxHeight).toBeUndefined();

    // 3) It is scrollable: the element exists and is a scroll view (RN reports
    //    the native host type as RCTScrollView)
    const scroll = screen.getByTestId('calendar-day-detail-scroll');
    expect(scroll).toBeTruthy();
    expect(String(scroll.type)).toMatch(/ScrollView/);

    // 4) Full day details are present: title, task, duration, status chip, approve action
    expect(await screen.findByText('Домашнє завдання', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(`${15} ${uk.calendar.minutesUnit}`)).toBeTruthy();
    expect(screen.getByText(uk.timer.awaiting)).toBeTruthy();
    expect(screen.getByLabelText(uk.parentHome.verify)).toBeTruthy();

    // 5) The dialog has a close control (>=48dp INV-10 touch target)
    const close = screen.getByLabelText(uk.calendar.close);
    expect(close).toBeTruthy();
    const closeStyle = flat(close);
    expect(closeStyle.minWidth ?? closeStyle.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
    expect(closeStyle.minHeight ?? closeStyle.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_DP);

    // 6) Approve still routes through the PIN gate (INV-05 unchanged)
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.parentHome.verify));
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId: expect.any(Number),
    });
  });

  it('closing the dialog dismisses it and clears the selected day', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-22'));
    });
    expect(await screen.findByTestId('calendar-day-detail-dialog', {}, { timeout: 3000 })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.calendar.close));
    });

    expect(screen.queryByTestId('calendar-day-detail-dialog')).toBeNull();
    expect(screen.queryByText('Домашнє завдання')).toBeNull();
  });

  it('still refreshes the open dialog after the PIN gate approves (round-1 MED)', async () => {
    const { db, clock, services } = await setup();

    let refocus: (() => void) | undefined;
    const nav: any = {
      ...mockNavigation,
      addListener: jest.fn((event: string, cb: () => void) => {
        if (event === 'focus') refocus = cb;
        return () => {};
      }),
    };

    const screen = await renderWithApp(
      <CalendarScreen navigation={nav} route={{} as any} />,
      { db, clock, wall, services }
    );

    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-22'));
    });
    expect(await screen.findByText('Домашнє завдання', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(uk.timer.awaiting)).toBeTruthy();
    expect(screen.getByLabelText(uk.parentHome.verify)).toBeTruthy();

    await db.run(
      `UPDATE sessions SET status = 'verified' WHERE local_date = '2026-10-22' AND status = 'completed';`
    );
    await act(async () => {
      refocus?.();
    });

    // The dialog stays open and reflects the verified state
    expect(await screen.findByText(uk.status.verified, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(uk.timer.awaiting)).toBeNull();
    expect(screen.queryByLabelText(uk.parentHome.verify)).toBeNull();
  });
});