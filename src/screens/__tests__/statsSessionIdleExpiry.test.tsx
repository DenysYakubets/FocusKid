/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { StatsScreen } from '../StatsScreen';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { parentSessionStore } from '../../state/parentSessionStore';

describe('StatsScreen AS-14 idle expiry', () => {
  jest.setTimeout(30000);

  afterEach(() => {
    jest.useRealTimers();
  });

  it('session idle >121s while StatsScreen is mounted still reports expired and redirects to PinGate', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const mockNav: any = {
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };

    const { services } = await renderWithApp(<></>, { db, clock });
    await services.authService.setupPin('1234');
    services.authService.startParentSession(); // lastActivity = t=1000
    parentSessionStore.setService(services.authService);

    jest.useFakeTimers();

    const { unmount } = await renderWithApp(
      <StatsScreen navigation={mockNav} route={{} as any} />,
      { db, clock, services }
    );

    // Parent walks away: 130s of wall time pass with Stats mounted; only timers fire.
    // 1s steps: at the expiry tick the guard interval is cleared mid-advance, and a
    // wider window would leave sinon fake-timers calling a timer already removed.
    await act(async () => {
      for (let i = 0; i < 130; i++) {
        clock.advance(1_000);
        jest.advanceTimersByTime(1_000);
      }
    });

    // AS-14: >121s of monotonic inactivity must expire the parent session.
    expect(clock.now() - 1000).toBeGreaterThan(121_000);
    expect(services.authService.isParentSessionActive()).toBe(false);
    expect(parentSessionStore.isActive(clock.now())).toBe(false);
    expect(mockNav.replace).toHaveBeenCalledWith('PinGate', { intent: 'enterParent' });

    unmount();
  });
});
