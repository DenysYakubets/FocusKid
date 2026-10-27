/** @jest-environment node */
import React from 'react';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { systemWallClock, WallClock } from '../../services/clock/wallClock';
import { CalendarScreen } from '../CalendarScreen';

const wall: WallClock = { ...systemWallClock, todayLocalDate: () => '2026-10-24' };

it('renders the calendar without category analytics controls', async () => {
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
});
