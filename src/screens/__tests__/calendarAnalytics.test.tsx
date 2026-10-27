/** @jest-environment node */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';
import { CalendarScreen } from '../CalendarScreen';

const wall: WallClock = { ...systemWallClock, todayLocalDate: () => '2026-10-24' };

it('opens analytics filters and cancel keeps the applied period unchanged', async () => {
  const db = createNodeDb();
  const clock = createFakeClock(1000);
  const { services } = await renderWithApp(<></>, { db, clock, wall });
  const screen = await renderWithApp(
    <CalendarScreen navigation={{ addListener: () => () => {}, navigate: jest.fn() } as any} route={{} as any} />,
    { db, clock, wall, services },
  );
  expect(await screen.findByTestId('calendar-summary')).toBeTruthy();
  expect(screen.queryByTestId('calendar-category-filter')).toBeNull();
  expect(screen.queryByTestId('calendar-category-totals')).toBeNull();
  expect(screen.getByTestId('calendar-analytics-filter-btn')).toBeTruthy();
  expect(screen.getByTestId('calendar-analytics-summary').props.children).toContain('Разом:');
  expect(screen.queryByTestId('calendar-analytics-filter-dialog')).toBeNull();

  await fireEvent.press(screen.getByTestId('calendar-analytics-filter-btn'));
  expect(await screen.findByTestId('calendar-analytics-filter-dialog')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('calendar-analytics-range-thisWeek'));
  await fireEvent.press(screen.getByTestId('calendar-analytics-cancel'));
  expect(screen.queryByTestId('calendar-analytics-filter-dialog')).toBeNull();
  expect(screen.getByText('Останні 2 тижні')).toBeTruthy();
});
