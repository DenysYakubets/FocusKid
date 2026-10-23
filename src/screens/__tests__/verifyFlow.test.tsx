/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { PinGateScreen } from '../PinGateScreen';
import { TodayScreen } from '../TodayScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';
import { statusColors } from '../../ui/theme';

describe('verifyFlow (INV-05 / INV-06)', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  it('runs complete verify flow: start -> complete -> show parent -> PIN -> verified status', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockTimerNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
    };

    const { services, findByText: findInTimer, getByLabelText: getInTimer } = await renderWithApp(
      <TimerScreen navigation={mockTimerNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall }
    );

    await services.authService.setupPin('1234');

    // 1. Start task 1 (15 min = 900,000 ms)
    await act(async () => {
      await timerStore.start(1);
    });
    expect(timerStore.getState().snapshot.state.kind).toBe('Running');
    const sessionId = timerStore.getState().snapshot.sessionId!;

    // 2. Advance clock to target and tick into Completed
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    expect(timerStore.getState().snapshot.state.kind).toBe('Completed');

    // 3. "Покажи батькам" button appears and tapping navigates to PinGate
    const showParentBtn = await findInTimer(uk.timer.showParent);
    expect(showParentBtn).toBeTruthy();

    fireEvent.press(getInTimer(uk.timer.showParent));
    expect(mockTimerNav.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'verify',
      sessionId,
    });

    // 4. Case A: Wrong PIN leaves session completed
    const mockGateNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { getByLabelText: getInGateWrong, findByText: findInGateWrong } = await renderWithApp(
      <PinGateScreen
        navigation={mockGateNav}
        route={{ params: { intent: 'verify', sessionId } } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    // Enter wrong PIN: 0000
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(getInGateWrong('Цифра 0'));
      });
    }

    expect(await findInGateWrong(uk.pin.invalidPin)).toBeTruthy();
    let sessionRow = await services.sessionsRepo.get(sessionId);
    expect(sessionRow?.status).toBe('completed');

    // 5. Case B: Enter correct PIN (1234)
    const { getByLabelText: getInGateCorrect } = await renderWithApp(
      <PinGateScreen
        navigation={mockGateNav}
        route={{ params: { intent: 'verify', sessionId } } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => {
      fireEvent.press(getInGateCorrect('Цифра 1'));
    });
    await act(async () => {
      fireEvent.press(getInGateCorrect('Цифра 2'));
    });
    await act(async () => {
      fireEvent.press(getInGateCorrect('Цифра 3'));
    });
    await act(async () => {
      fireEvent.press(getInGateCorrect('Цифра 4'));
    });

    // Session is now verified
    sessionRow = await services.sessionsRepo.get(sessionId);
    expect(sessionRow?.status).toBe('verified');
    expect(mockGateNav.goBack).toHaveBeenCalled();

    // 6. TodayScreen renders verified TaskCard in green style
    const mockTodayNav: any = {
      navigate: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };

    const { findByText: findInToday, getByLabelText: getInToday } = await renderWithApp(
      <TodayScreen navigation={mockTodayNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await findInToday(uk.status.verified)).toBeTruthy();
    const verifiedCard = getInToday(/Перевірено/);
    expect(verifiedCard).toBeTruthy();

    // 7. INV-06: Subsequent attempt to abandon or verify again leaves row verified
    const freshToken = services.authService.issueToken();
    const abandonRes = await services.timerService.abandon(sessionId, freshToken);
    expect(abandonRes.ok).toBe(false);
    if (!abandonRes.ok) {
      expect(abandonRes.error).toBe('VERIFIED_IMMUTABLE');
    }

    const freshToken2 = services.authService.issueToken();
    const verifyRes = await services.timerService.verify(sessionId, freshToken2);
    expect(verifyRes.ok).toBe(false);
    if (!verifyRes.ok) {
      expect(verifyRes.error).toBe('VERIFIED_IMMUTABLE');
    }

    const finalRow = await services.sessionsRepo.get(sessionId);
    expect(finalRow?.status).toBe('verified');
  });
});
