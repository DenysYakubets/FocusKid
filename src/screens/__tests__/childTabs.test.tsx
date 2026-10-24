/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { ChildTabsScreen } from '../ChildTabsScreen';
import { uk } from '../../i18n/uk';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

describe('F6 - child flow bottom navigation (Tasks / Calendar)', () => {
  jest.setTimeout(30000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('shows the Today list by default together with a bottom nav of two tabs', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );

    expect(await screen.findByText(uk.today.title)).toBeTruthy();

    const tasksTab = screen.getByLabelText(uk.nav.tasks);
    const calendarTab = screen.getByLabelText(uk.nav.calendar);
    expect(tasksTab.props.accessibilityRole).toBe('tab');
    expect(calendarTab.props.accessibilityRole).toBe('tab');

    // INV-10: tab targets >= 48dp
    for (const tab of [tasksTab, calendarTab]) {
      const style = flat(tab);
      expect(style.minWidth ?? style.width ?? 0).toBeGreaterThanOrEqual(48);
      expect(style.minHeight ?? style.height ?? 0).toBeGreaterThanOrEqual(48);
    }

    // Tabs sit in a bar at the bottom of the screen
    const bar = screen.getByTestId('child-tab-bar');
    expect(bar.props.testID).toBe('child-tab-bar');
    expect(flat(bar).flexDirection).toBe('row');
  });

  it('switches to the Calendar tab and back', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.nav.calendar));
    });

    // The Calendar tab is mounted (testID), so the tab label itself never
    // collides with the screen header text.
    expect(await screen.findByTestId('calendar-layout-portrait')).toBeTruthy();
    expect(screen.getAllByText(uk.calendar.title).length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.nav.tasks));
    });
    expect(await screen.findByTestId('today-layout-portrait')).toBeTruthy();
    expect(screen.getByText(uk.today.title)).toBeTruthy();
  });
});