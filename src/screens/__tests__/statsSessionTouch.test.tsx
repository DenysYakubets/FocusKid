/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { StatsScreen } from '../StatsScreen';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { parentSessionStore } from '../../state/parentSessionStore';

describe('StatsScreen session touch', () => {
  jest.setTimeout(15000);

  it('keeps parent session active when screen receives focus at t=100s', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    let focusCb: (() => void) | undefined;
    const mockNav: any = {
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn((event: string, cb: () => void) => {
        if (event === 'focus') {
          focusCb = cb;
        }
        return () => {};
      }),
    };

    const { services } = await renderWithApp(<></>, { db, clock });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    const { unmount } = await renderWithApp(<StatsScreen navigation={mockNav} route={{} as any} />, {
      db,
      clock,
      services,
    });

    await act(async () => {
      clock.advance(100_000);
      focusCb?.();
    });

    clock.advance(21_000);

    expect(parentSessionStore.isActive(clock.now())).toBe(true);
    expect(mockNav.replace).not.toHaveBeenCalled();

    unmount();
  });
});
