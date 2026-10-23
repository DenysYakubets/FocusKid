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

describe('ParentHomeScreen change-PIN (F4 & F7)', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('controls the PinPad value and clears pad between step 1 and step 2', async () => {
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

    const { getByLabelText, getByText, queryByText } = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Tap changePin nav button
    await act(async () => {
      fireEvent.press(getByLabelText(uk.parentHome.changePin));
    });

    // Prompt shows enterCurrentPin
    expect(getByText(uk.parentHome.enterCurrentPin)).toBeTruthy();
    expect(getByLabelText(uk.pin.digitsEntered(0))).toBeTruthy();

    // Type 1, 2, 3, 4
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(1)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(2)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(3)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(4)));
    });

    // Step moves to step 2: prompt changes to enterNewPin
    expect(getByText(uk.parentHome.enterNewPin)).toBeTruthy();
    // PinPad is cleared to 0 digits between steps
    expect(getByLabelText(uk.pin.digitsEntered(0))).toBeTruthy();

    // Now enter 5, 6, 7, 8 (the new PIN)
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(5)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(6)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(7)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(8)));
    });

    // After completion, changePin section closes, new PIN is active
    expect(queryByText(uk.parentHome.enterNewPin)).toBeNull();
    expect(await services.authService.attempt('5678')).toBe('SUCCESS');
    expect(await services.authService.attempt('1234')).toBe('INVALID');
  });

  it('clears pinDraft when toggling changePin button closed and reopened', async () => {
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

    const { getByLabelText, getByText, queryByText } = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Open changePin
    await act(async () => {
      fireEvent.press(getByLabelText(uk.parentHome.changePin));
    });
    expect(getByText(uk.parentHome.enterCurrentPin)).toBeTruthy();

    // Type 2 digits
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(1)));
    });
    await act(async () => {
      fireEvent.press(getByLabelText(uk.pin.digit(2)));
    });
    expect(getByLabelText(uk.pin.digitsEntered(2))).toBeTruthy();

    // Toggle closed
    await act(async () => {
      fireEvent.press(getByLabelText(uk.parentHome.changePin));
    });
    expect(queryByText(uk.parentHome.enterCurrentPin)).toBeNull();

    // Toggle open again -> draft is reset to 0
    await act(async () => {
      fireEvent.press(getByLabelText(uk.parentHome.changePin));
    });
    expect(getByText(uk.parentHome.enterCurrentPin)).toBeTruthy();
    expect(getByLabelText(uk.pin.digitsEntered(0))).toBeTruthy();
  });
});
