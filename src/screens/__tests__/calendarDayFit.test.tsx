/** @jest-environment node */
import React from 'react';
import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';
import { CalendarScreen, DAY_CELL_GAP, dayCellSize } from '../CalendarScreen';

const wall: WallClock = {
  ...systemWallClock,
  todayLocalDate: () => '2026-10-24',
  nowIso: () => '2026-10-24T10:00:00.000Z',
};

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function flat(node: any) {
  return StyleSheet.flatten(node.props.style) || {};
}

function containsHorizontalScroll(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (node.props?.horizontal === true) return true;
  return Array.isArray(node.children) && node.children.some(containsHorizontalScroll);
}

async function renderAtWidth(width: number, height: number) {
  const db = createNodeDb();
  const clock = createFakeClock(1000);
  const { services } = await renderWithApp(<></>, { db, clock, wall });
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width,
    height,
    scale: 1,
    fontScale: 1,
  });
  const screen = await renderWithApp(
    <CalendarScreen navigation={mockNavigation} route={{} as any} />,
    { db, clock, wall, services }
  );
  return screen;
}

describe('calendar responsive day cell sizing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('computes cell widths with a floor and cap', () => {
    expect(dayCellSize(326)).toBe(43);
    expect(dayCellSize(296)).toBe(38);
    expect(dayCellSize(200)).toBe(38);
    expect(dayCellSize(1000)).toBe(48);
  });

  it('fits 43dp day cells into the 390dp phone row and keeps the ScrollView', async () => {
    const screen = await renderAtWidth(390, 840);
    const cell = await screen.findByTestId('calendar-day-2026-10-24');
    const style = flat(cell);

    expect(style.width).toBe(43);
    expect(style.minWidth).toBe(43);
    expect(7 * style.width + 6 * DAY_CELL_GAP).toBeLessThanOrEqual(390 - 2 * 24 - 16);
    expect(style.width).toBeGreaterThanOrEqual(42);
    expect(style.width).toBeLessThanOrEqual(44);
    expect(containsHorizontalScroll(screen.toJSON())).toBe(true);
  });

  it('fits 38dp day cells into the 360dp phone row and keeps the ScrollView', async () => {
    const screen = await renderAtWidth(360, 800);
    const cell = await screen.findByTestId('calendar-day-2026-10-24');
    const style = flat(cell);

    expect(style.width).toBe(38);
    expect(7 * style.width + 6 * DAY_CELL_GAP).toBeLessThanOrEqual(360 - 2 * 24 - 16);
    expect(containsHorizontalScroll(screen.toJSON())).toBe(true);
  });
});
