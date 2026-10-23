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
import { spacing } from '../../ui/theme';
import { uk } from '../../i18n/uk';

/**
 * Two-child row resolver with React Native semantics (round-1 finding 1):
 * `flex: n` sets basis 0 + grow n + shrink n; RN's default flexShrink is 0;
 * `width: '100%'` only becomes the basis when no flex shorthand is present.
 * Mirrors the reviewer's Yoga probe (header vs PinPad inside contentLandscape).
 */
function predictRowWidths(
  inner: number,
  gap: number,
  styles: Array<Record<string, any>>
): number[] {
  const basisOf = (s: Record<string, any>): number => {
    if (typeof s.flexBasis === 'number') return s.flexBasis;
    if (s.flex !== undefined) return 0; // RN flex shorthand -> basis 0
    if (s.width === '100%') return inner;
    if (typeof s.width === 'number') return s.width;
    return 0;
  };
  const bases = styles.map(basisOf);
  const grows = styles.map((s) => (s.flex !== undefined ? s.flex : s.flexGrow ?? 0));
  const shrinks = styles.map((s) => (s.flex !== undefined ? s.flex : s.flexShrink ?? 0));

  const used = bases.reduce((a, b) => a + b, 0) + gap * (styles.length - 1);
  const free = inner - used;

  if (free > 0) {
    const totalGrow = grows.reduce((a, b) => a + b, 0);
    if (totalGrow <= 0) return bases.slice();
    return bases.map((b, i) => b + (free * (grows[i] ?? 0)) / totalGrow);
  }

  // Overflow: shrink proportionally; a basis never goes below 0.
  const weights = bases.map((b, i) => ((shrinks[i] ?? 0) > 0 ? b * (shrinks[i] ?? 0) : 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const out = bases.slice();
  if (totalWeight > 0) {
    const pool = -free;
    for (let i = 0; i < out.length; i++) {
      const w = weights[i] ?? 0;
      if (w > 0) out[i] = Math.max(0, (out[i] ?? 0) - (pool * w) / totalWeight);
    }
  }
  return out;
}

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

  it('landscape two-column: PinGate header shrinks instead of collapsing the keypad to 0dp (round-1 finding 1)', async () => {
    parentSessionStore.getState().clearPinDraft();

    // Reviewer probe widths (spec §4.1 landscape two-column + INV-08)
    for (const width of [640, 732, 826]) {
      const spy = jest
        .spyOn(ReactNative, 'useWindowDimensions')
        .mockImplementation(() => ({ width, height: 400, scale: 1, fontScale: 1 }) as any);

      const db = createNodeDb();
      const clock = createFakeClock(1000);

      const screen = await renderWithApp(
        <PinGateScreen
          navigation={mockNavigation}
          route={{ params: { intent: 'enterParent' } } as any}
        />,
        { db, clock, wall: systemWallClock }
      );

      expect(screen.getByTestId('pingate-layout-landscape')).toBeTruthy();

      // Left column = host View wrapping the title (step past the AppText composite).
      let headerNode: any = screen.getByText(uk.pin.gateTitle).parent;
      while (headerNode && typeof headerNode.type !== 'string') headerNode = headerNode.parent;
      const headerStyle = ReactNative.StyleSheet.flatten(headerNode.props.style);

      // Right column = PinPad root, i.e. the parent of the 4-dot indicator.
      const dots = screen.getByLabelText(uk.pin.digitsEntered(0));
      const pinPadStyle = ReactNative.StyleSheet.flatten(dots.parent!.props.style);

      const inner = width - 2 * spacing.xl; // §3.6 landscape gutter
      const [headerW = 0, pinPadW = 0] = predictRowWidths(inner, spacing.lg, [
        headerStyle,
        pinPadStyle,
      ]);

      // Before the fix the right column resolved to 0dp at every width
      // (header claimed width:100% with RN's default flexShrink 0).
      expect(pinPadW).toBeGreaterThan(0);
      expect(pinPadW).toBeGreaterThanOrEqual(inner * 0.3); // usable keypad column
      expect(headerW + pinPadW + spacing.lg).toBeLessThanOrEqual(inner + 0.01);

      screen.unmount();
      spy.mockRestore();
    }
  });
});
