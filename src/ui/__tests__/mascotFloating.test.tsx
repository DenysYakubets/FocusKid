/** @jest-environment node */
import React from 'react';
import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { MascotFloating } from '../components/MascotFloating';
import { ChildTabsScreen } from '../../screens/ChildTabsScreen';
import { PinGateScreen } from '../../screens/PinGateScreen';
import { ParentHomeScreen } from '../../screens/ParentHomeScreen';
import { StatsScreen } from '../../screens/StatsScreen';
import { TaskListEditScreen } from '../../screens/TaskListEditScreen';
import { TaskEditScreen } from '../../screens/TaskEditScreen';
import { MascotSelectScreen } from '../../screens/MascotSelectScreen';
import { parentSessionStore } from '../../state/parentSessionStore';
import { useMascotStore } from '../../state/mascotStore';
import { DEFAULT_MASCOT } from '../theme';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved =
    typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

function restartStore() {
  useMascotStore.setState({ mascot: DEFAULT_MASCOT, hydrated: false });
}

const label = (mood: keyof typeof uk.mascot.moods) =>
  uk.mascot.floatingLabel(DEFAULT_MASCOT, uk.mascot.moods[mood]);

describe('C5 - floating tappable companion (MASCOT_DESIGN §5)', () => {
  beforeEach(() => {
    restartStore();
  });

  it('renders the selected mascot as a >=48dp target in the corner', async () => {
    const screen = await renderWithApp(<MascotFloating />, {
      db: createNodeDb(),
      clock: createFakeClock(1000),
      wall: systemWallClock,
    });

    const wrapper = await screen.findByTestId('mascot-floating');
    const wrapperStyle = flat(wrapper);
    expect(wrapperStyle.position).toBe('absolute');
    expect(wrapperStyle.bottom).toBeGreaterThanOrEqual(16);
    expect(wrapperStyle.right).toBeGreaterThanOrEqual(16);
    // passes taps through except on the mascot itself (non-blocking guarantee)
    expect(wrapper.props.pointerEvents).toBe('box-none');

    const target = await screen.findByLabelText(label('happy'));
    const targetStyle = flat(target);
    expect(Math.max(targetStyle.minWidth ?? 0, targetStyle.width ?? 0)).toBeGreaterThanOrEqual(48);
    expect(Math.max(targetStyle.minHeight ?? 0, targetStyle.height ?? 0)).toBeGreaterThanOrEqual(48);
    expect(target.props.accessibilityRole).toBe('button');
  });

  it('cycles mood on tap: happy -> excited -> neutral -> sleepy -> happy', async () => {
    const screen = await renderWithApp(<MascotFloating />, {
      db: createNodeDb(),
      clock: createFakeClock(1000),
      wall: systemWallClock,
    });

    const order = ['happy', 'excited', 'neutral', 'sleepy'] as const;
    for (const mood of order) {
      const target = await screen.findByLabelText(label(mood));
      expect(target).toBeTruthy();
      await act(async () => {
        fireEvent.press(target);
      });
    }
    // a full lap returns to the default mood
    expect(await screen.findByLabelText(label('happy'))).toBeTruthy();
  });

  it('places the mascot per corner (bottom-right default, bottom-left, top-right)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const right = await renderWithApp(<MascotFloating />, { db, clock, wall: systemWallClock });
    const rightStyle = flat(await right.findByTestId('mascot-floating'));
    expect(rightStyle.right).toBeDefined();
    expect(rightStyle.left).toBeUndefined();
    expect(rightStyle.top).toBeUndefined();
    right.unmount();

    const left = await renderWithApp(<MascotFloating corner="bottom-left" />, {
      db,
      clock,
      wall: systemWallClock,
    });
    const leftStyle = flat(await left.findByTestId('mascot-floating'));
    expect(leftStyle.left).toBeDefined();
    expect(leftStyle.right).toBeUndefined();
    left.unmount();

    const top = await renderWithApp(<MascotFloating corner="top-right" />, {
      db,
      clock,
      wall: systemWallClock,
    });
    const topStyle = flat(await top.findByTestId('mascot-floating'));
    expect(topStyle.top).toBeDefined();
    expect(topStyle.bottom).toBeUndefined();
    top.unmount();
  });

  it('INV-05: visible on child screens, never rendered on PIN/parent screens or the selection tab', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    // Child shell (Today tab) shows the companion.
    const tabs = await renderWithApp(
      <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(await tabs.findByTestId('mascot-floating')).toBeTruthy();
    tabs.unmount();

    // The selection tab hides it (the roster IS the focus there).
    const selectTab = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    expect(selectTab.queryByTestId('mascot-floating')).toBeNull();
    selectTab.unmount();

    // PIN gate + parent screens: no companion at all.
    const parentScreens: Array<[React.ReactElement, string]> = [
      [
        <PinGateScreen
          navigation={mockNavigation}
          route={{ params: { intent: 'enterParent' } } as any}
        />,
        'PinGate',
      ],
      [<ParentHomeScreen navigation={mockNavigation} route={{} as any} />, 'ParentHome'],
      [<TaskListEditScreen navigation={mockNavigation} route={{} as any} />, 'TaskListEdit'],
      [<TaskEditScreen navigation={mockNavigation} route={{ params: {} } as any} />, 'TaskEdit'],
    ];

    for (const [element, name] of parentScreens) {
      const screen = await renderWithApp(element, { db, clock, wall: systemWallClock });
      expect(`${name}:${screen.queryByTestId('mascot-floating') === null}`).toBe(
        `${name}:true`
      );
      screen.unmount();
    }

    // Round-1 MED (INV-05 half): Stats is parent-only, so the companion must
    // be absent there too — asserted behind a REAL parent session, otherwise
    // ParentGuard's pre-auth `null` would make the check vacuous.
    const prep = await renderWithApp(<></>, { db, clock, wall: systemWallClock });
    await prep.services.authService.setupPin('1234');
    prep.services.authService.startParentSession();
    parentSessionStore.setService(prep.services.authService);
    prep.unmount();

    const stats = await renderWithApp(
      <StatsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock, services: prep.services }
    );
    expect(await stats.findByTestId('stats-layout-portrait')).toBeTruthy();
    expect(`${StatsScreen.name}:${stats.queryByTestId('mascot-floating') === null}`).toBe(
      `${StatsScreen.name}:true`
    );
    stats.unmount();
  });
});

/**
 * Round-1 MED: the companion is the LAST sibling of the child content area,
 * so it used to sit on the bottom-right corner of the primary CTA (Today's
 * TaskCard, the Calendar day sheet's «Перевірити»). The fix reserves the
 * corner with a bottom content inset (Today) and hides the mascot while the
 * day sheet is open (Calendar) — pinned here as a >=48dp clearance assertion
 * derived from the rendered geometry (corner offset + rendered target size).
 */
describe('C5 - mascot clearance from primary CTAs (round-1 MED)', () => {
  jest.setTimeout(30000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const BREAKPOINTS = [320, 413] as const;

  for (const width of BREAKPOINTS) {
    it(`Today: >=48dp between the mascot and the bottom-right TaskCard corner at ${width}dp`, async () => {
      jest
        .spyOn(ReactNative, 'useWindowDimensions')
        .mockImplementation(() => ({ width, height: 800, scale: 1, fontScale: 1 } as any));

      const db = createNodeDb();
      const clock = createFakeClock(1000);
      const screen = await renderWithApp(
        <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
        { db, clock, wall: systemWallClock }
      );

      // Mascot rectangle: absolute corner offset + rendered target height.
      const wrapper = await screen.findByTestId('mascot-floating');
      const wrapperStyle = flat(wrapper);
      const target = await screen.findByLabelText(label('happy'));
      const targetStyle = flat(target);
      const mascotBottom = wrapperStyle.bottom as number;
      const mascotTop = mascotBottom + (targetStyle.height as number);
      expect(wrapperStyle.position).toBe('absolute');

      // The list reserves the whole corner: content bottom edge (last card's
      // bottom when scrolled to the end) minus the mascot's top edge.
      const list = await screen.findByTestId('today-list');
      const listContent = StyleSheet.flatten(list.props.contentContainerStyle as any) || {};
      const paddingBottom = listContent.paddingBottom as number;
      expect(typeof paddingBottom).toBe('number');
      expect(paddingBottom - mascotTop).toBeGreaterThanOrEqual(48);

      screen.unmount();
    });
  }

  it("Calendar: no mascot while the day sheet shows its «Перевірити» CTA (and back after closing)", async () => {
    jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockImplementation(() => ({ width: 320, height: 800, scale: 1, fontScale: 1 } as any));

    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await setupTestServices({ db, clock, wall: systemWallClock });
    const today = prep.wall.todayLocalDate();

    // A pending (completed, not yet verified) session today -> the day sheet
    // renders the right-aligned «Перевірити» primary action.
    const res = await db.run(
      `INSERT INTO sessions (task_id, local_date, status, target_ms, elapsed_run_ms, started_at, updated_at)
       VALUES (1, ?, 'running', 900000, 0, ?, ?);`,
      [today, `${today}T10:00:00Z`, `${today}T10:00:00Z`]
    );
    await db.run(`UPDATE sessions SET status = 'completed', elapsed_run_ms = 900000 WHERE id = ?;`, [
      res.lastInsertRowId,
    ]);

    const screen = await renderWithApp(
      <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock, services: prep.services }
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.nav.calendar));
    });
    await screen.findByTestId('calendar-layout-portrait');
    // Sheet closed: the companion is on the tab (no CTA in the corner yet).
    expect(screen.queryByTestId('mascot-floating')).toBeTruthy();

    await act(async () => {
      fireEvent.press(await screen.findByTestId(`calendar-day-${today}`));
    });
    const cta = await screen.findByLabelText(uk.parentHome.verify);
    expect(cta).toBeTruthy();
    // RED on the pre-fix tree: the mascot still overlays the sheet's corner.
    expect(screen.queryByTestId('mascot-floating')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.calendar.close));
    });
    expect(screen.queryByTestId('mascot-floating')).toBeTruthy();

    screen.unmount();
  });
});