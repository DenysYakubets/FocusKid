/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { PinGateScreen } from '../PinGateScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';
import { mapTimerError } from '../../ui/timerErrors';

jest.mock('@noble/hashes/utils', () => {
  const actual = jest.requireActual('@noble/hashes/utils');
  return {
    ...actual,
    randomBytes: () => {
      throw new Error('crypto.getRandomValues must be defined');
    },
  };
});

describe('pinGateVerifyErrors', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  it('(1) correct PIN on an intent=verify gate completes: session row becomes verified and navigation.goBack was called', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockGateNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');

    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getState().snapshot.sessionId!;

    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });

    const { getByLabelText, unmount } = await renderWithApp(
      <PinGateScreen
        navigation={mockGateNav}
        route={{ params: { intent: 'verify', sessionId } } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    for (const d of ['1', '2', '3', '4']) {
      await act(async () => {
        fireEvent.press(getByLabelText(`Цифра ${d}`));
      });
    }

    const sessionRow = await services.sessionsRepo.get(sessionId);
    expect(sessionRow?.status).toBe('verified');
    expect(mockGateNav.goBack).toHaveBeenCalled();
    unmount();
  });

  it('(2) wrong PIN renders invalidPin + attemptsLeft(4)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockGateNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');

    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getState().snapshot.sessionId!;

    const { getByLabelText, findByText, unmount } = await renderWithApp(
      <PinGateScreen
        navigation={mockGateNav}
        route={{ params: { intent: 'verify', sessionId } } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(getByLabelText('Цифра 0'));
      });
    }

    const expectedMsg = `${uk.pin.invalidPin}. ${uk.pin.attemptsLeft(4)}`;
    expect(await findByText(expectedMsg)).toBeTruthy();
    unmount();
  });

  it('(3) verify that fails at service level renders mapTimerError(NOT_COMPLETED) and goBack is NOT called', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockGateNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');

    // Start task 1 but DO NOT tick to completed, leaving status = 'running'
    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getState().snapshot.sessionId!;

    const { getByLabelText, findByText, unmount } = await renderWithApp(
      <PinGateScreen
        navigation={mockGateNav}
        route={{ params: { intent: 'verify', sessionId } } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    for (const d of ['1', '2', '3', '4']) {
      await act(async () => {
        fireEvent.press(getByLabelText(`Цифра ${d}`));
      });
    }

    expect(await findByText(mapTimerError('NOT_COMPLETED'))).toBeTruthy();
    expect(mockGateNav.goBack).not.toHaveBeenCalled();
    unmount();
  });
});
