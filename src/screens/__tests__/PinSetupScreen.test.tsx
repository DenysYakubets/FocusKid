/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { PinSetupScreen } from '../PinSetupScreen';
import { uk } from '../../i18n/uk';

describe('PinSetupScreen', () => {
  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  it('renders initial setup step and AS-13 no-recovery notice', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockNav: any = {
      reset: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    };

    const { findByText } = await renderWithApp(
      <PinSetupScreen navigation={mockNav} route={{} as any} />,
      { db, clock, wall: fakeWall }
    );

    expect(await findByText(uk.pin.setupTitle)).toBeTruthy();
    expect(await findByText(uk.pin.setupStep1)).toBeTruthy();
    expect(await findByText(uk.pin.noRecoveryNotice)).toBeTruthy();
  });

  it('shows error on PIN mismatch and resets back to step 1', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockNav: any = {
      reset: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    };

    const { findByText, getByLabelText } = await renderWithApp(
      <PinSetupScreen navigation={mockNav} route={{} as any} />,
      { db, clock, wall: fakeWall }
    );

    // Step 1: enter 1234
    for (let i = 1; i <= 4; i++) {
      await act(async () => {
        fireEvent.press(getByLabelText(`Цифра ${i}`));
      });
    }

    // Step 2 prompt should now appear
    expect(await findByText(uk.pin.setupStep2)).toBeTruthy();

    // Step 2: enter mismatch 1235
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 1'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 2'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 3'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Цифра 5'));
    });

    // Mismatch error appears, reset back to step 1
    expect(await findByText(uk.pin.mismatch)).toBeTruthy();
    expect(await findByText(uk.pin.setupStep1)).toBeTruthy();
    expect(mockNav.reset).not.toHaveBeenCalled();
  });

  it('calls setupPin and resets navigation to Today on matching confirmation', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockNav: any = {
      reset: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    };

    const { findByText, getByLabelText, services } = await renderWithApp(
      <PinSetupScreen navigation={mockNav} route={{} as any} />,
      { db, clock, wall: fakeWall }
    );

    expect(await services.authService.hasPin()).toBe(false);

    // Step 1: enter 2580
    const pin = ['2', '5', '8', '0'];
    for (const d of pin) {
      await act(async () => {
        fireEvent.press(getByLabelText(`Цифра ${d}`));
      });
    }

    expect(await findByText(uk.pin.setupStep2)).toBeTruthy();

    // Step 2: enter matching 2580
    for (const d of pin) {
      await act(async () => {
        fireEvent.press(getByLabelText(`Цифра ${d}`));
      });
    }

    expect(await services.authService.hasPin()).toBe(true);
    expect(mockNav.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Today' }],
    });
  });
});
