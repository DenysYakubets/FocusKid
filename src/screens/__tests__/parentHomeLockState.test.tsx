/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { ParentHomeScreen } from '../ParentHomeScreen';
import { parentSessionStore } from '../../state/parentSessionStore';
import { uk } from '../../i18n/uk';

describe('parentHomeLockState', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNavigation: any = {
    navigate: jest.fn(),
    reset: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('renders countdown and disables PinPad when locked in ParentHomeScreen change-PIN', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services } = await setupTestServices({
      db,
      clock,
      wall: fakeWall,
    });

    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    // Call attempt('0000') 5 times to arm the in-memory lock
    for (let i = 0; i < 5; i++) {
      await services.authService.attempt('0000');
    }
    expect(services.authService.lockoutRemainingMs()).toBeGreaterThan(0);

    const { getByLabelText, findByText, unmount } = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Tap changePin nav button
    await act(async () => {
      fireEvent.press(getByLabelText(uk.parentHome.changePin));
    });

    // Assert: countdown text containing uk.pin.lockedRemaining is rendered
    expect(await findByText(new RegExp(uk.pin.lockedRemaining))).toBeTruthy();

    // Assert: PinPad digit button is disabled
    const digit1 = getByLabelText(uk.pin.digit(1));
    expect(digit1.props.accessibilityState?.disabled).toBe(true);
    unmount();
  });
});
