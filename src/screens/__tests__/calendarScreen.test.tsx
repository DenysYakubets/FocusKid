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
  await db.run(`UPDATE sessions SET status = 'verified' WHERE id = ?;`, [
    verified.lastInsertRowId,
  ]);

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

describe('F6 - Calendar screen (earnings + approved/pending markers)', () => {
  jest.setTimeout(30000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('shows week/month minutes earned, a month grid and per-day markers', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    expect(await screen.findByText(uk.calendar.title)).toBeTruthy();

    // Header summary: minutes earned this week (35) and this month (35)
    expect(await screen.findByText(uk.calendar.weekEarned, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(uk.calendar.monthEarned)).toBeTruthy();
    expect(screen.getAllByText(`35 ${uk.calendar.minutesUnit}`)).toHaveLength(2);

    // Month label
    expect(screen.getByText(`${uk.calendar.months[9]} 2026`)).toBeTruthy();

    // Approved day 21 and pending day 22 are both marked
    const approvedCell = await screen.findByTestId('calendar-day-2026-10-21');
    const pendingCell = await screen.findByTestId('calendar-day-2026-10-22');
    expect(approvedCell.props.accessibilityLabel).toMatch(/21 .*1/);
    expect(pendingCell.props.accessibilityLabel).toMatch(/22 .*1/);

    // Approved marker uses the green token, pending uses the warning token
    expect(flat(approvedCell).backgroundColor).toBe(colors.verified);
    expect(flat(pendingCell).backgroundColor).toBe(colors.awaiting);
  });

  it('every day cell is a >=48dp touch target (INV-10)', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    const dayCell = await screen.findByTestId('calendar-day-2026-10-24');
    const style = flat(dayCell);
    expect(style.width ?? style.minWidth ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
    expect(style.minHeight ?? style.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
  });

  it('tapping a day opens details with the sessions and an approve action behind the parent PIN gate', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-22'));
    });

    // Detail sheet lists the pending session and its approve action
    expect(await screen.findByText('Домашнє завдання', {}, { timeout: 3000 })).toBeTruthy();
    const approve = screen.getByLabelText(uk.parentHome.verify);
    expect(approve).toBeTruthy();

    // Approving routes through the PIN gate (INV-05), never marks it directly
    await act(async () => {
      fireEvent.press(approve);
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId: expect.any(Number),
    });
  });

  it('refreshes the open day sheet when the screen regains focus after the PIN gate approves (round-1 MED)', async () => {
    const { db, clock, services } = await setup();

    // Capture the focus listener the screen registers (PinGate's goBack
    // refocuses this screen and that is what triggers reload()).
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

    // The pending day sheet shows the «Очікує перевірки» chip + approve action
    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-22'));
    });
    expect(await screen.findByText('Домашнє завдання', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(uk.timer.awaiting)).toBeTruthy();
    expect(screen.getByLabelText(uk.parentHome.verify)).toBeTruthy();

    // The parent approves in the PIN gate (row flips to verified) and
    // navigation.goBack() refocuses the Calendar screen.
    await db.run(
      `UPDATE sessions SET status = 'verified' WHERE local_date = '2026-10-22' AND status = 'completed';`
    );
    await act(async () => {
      refocus?.();
    });

    // The sheet must now read the verified state — no stale awaiting chip
    // and no approve button left to press (that press hit VERIFIED_IMMUTABLE).
    expect(await screen.findByText(uk.status.verified, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(uk.timer.awaiting)).toBeNull();
    expect(screen.queryByLabelText(uk.parentHome.verify)).toBeNull();

    // ...and it agrees with the now-green day cell (the reported inconsistency).
    expect(flat(screen.getByTestId('calendar-day-2026-10-22')).backgroundColor).toBe(
      colors.verified
    );
  });

  it('shows the empty state for a day with no sessions', async () => {
    const { db, clock, services } = await setup();

    const screen = await renderWithApp(
      <CalendarScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall, services }
    );

    await act(async () => {
      fireEvent.press(await screen.findByTestId('calendar-day-2026-10-25'));
    });
    expect(
      await screen.findByText(uk.calendar.dayEmpty, {}, { timeout: 3000 })
    ).toBeTruthy();
  });
});