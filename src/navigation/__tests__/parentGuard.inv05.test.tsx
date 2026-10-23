/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { ParentGuard } from '../ParentGuard';
import { ParentHomeScreen } from '../../screens/ParentHomeScreen';
import { TaskListEditScreen } from '../../screens/TaskListEditScreen';
import { TaskEditScreen } from '../../screens/TaskEditScreen';
import { StatsScreen } from '../../screens/StatsScreen';
import { uk } from '../../i18n/uk';
import { parentSessionStore } from '../../state/parentSessionStore';

describe('INV-05 ParentGuard', () => {
  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') {
        appStateListeners.push(listener as any);
      }
      return {
        remove: () => {
          const idx = appStateListeners.indexOf(listener as any);
          if (idx !== -1) appStateListeners.splice(idx, 1);
        },
      } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redirects to PinGate when navigating to any parent route without an active session', async () => {
    const guardedScreens = [
      { name: 'ParentHome', component: (nav: any) => <ParentHomeScreen navigation={nav} route={{} as any} /> },
      { name: 'TaskListEdit', component: (nav: any) => <TaskListEditScreen navigation={nav} route={{} as any} /> },
      { name: 'TaskEdit', component: (nav: any) => <TaskEditScreen navigation={nav} route={{ params: {} } as any} /> },
      { name: 'Stats', component: (nav: any) => <StatsScreen navigation={nav} route={{} as any} /> },
    ];

    for (const { name, component } of guardedScreens) {
      const mockNav: any = {
        replace: jest.fn(),
        navigate: jest.fn(),
        goBack: jest.fn(),
        reset: jest.fn(),
        addListener: jest.fn(() => () => {}),
      };

      const db = createNodeDb();
      const clock = createFakeClock(1000);

      // Explicitly exit parent session to ensure inactive
      parentSessionStore.exit();

      await renderWithApp(component(mockNav), {
        db,
        clock,
        wall: fakeWall,
      });

      expect(mockNav.replace).toHaveBeenCalledWith('PinGate', {
        intent: 'enterParent',
      });
    }
  });

  it('renders ParentHome after a correct PIN unlocks the session', async () => {
    const mockNav: any = {
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
      reset: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };

    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: fakeWall,
    });

    // Setup PIN and start session
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    // Render with active session
    const { findByText } = await renderWithApp(
      <ParentHomeScreen navigation={mockNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(await findByText(uk.parentHome.title)).toBeTruthy();
    expect(mockNav.replace).not.toHaveBeenCalled();
  });

  it('redirects to PinGate after 120s of monotonic idle', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: fakeWall,
    });

    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    // Advance 121s without interaction -> session expired
    clock.advance(121_000);
    expect(parentSessionStore.isActive(clock.now())).toBe(false);

    const idleNav: any = {
      replace: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };
    await renderWithApp(
      <ParentHomeScreen navigation={idleNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );
    expect(idleNav.replace).toHaveBeenCalledWith('PinGate', {
      intent: 'enterParent',
    });
  });

  it('redirects to PinGate on AppState background event', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: fakeWall,
    });

    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);
    expect(parentSessionStore.isActive(clock.now())).toBe(true);

    const bgNav: any = {
      replace: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };
    await renderWithApp(
      <ParentHomeScreen navigation={bgNav} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(appStateListeners.length).toBeGreaterThan(0);
    act(() => {
      appStateListeners.forEach((l) => l('background'));
    });

    expect(parentSessionStore.isActive(clock.now())).toBe(false);
    expect(bgNav.replace).toHaveBeenCalledWith('PinGate', {
      intent: 'enterParent',
    });
  });

  it('timerService.verify rejects missing, reused or expired token leaving session completed', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: fakeWall,
    });

    await services.authService.setupPin('1234');

    // Start a task session and run to completion
    await services.timerService.start(1);
    clock.advance(900_000); // 15 minutes target
    await services.timerService.requestComplete();

    const snapshot = services.timerService.getSnapshot();
    expect(snapshot.state.kind).toBe('Completed');
    const sessionId = snapshot.sessionId!;

    // Case 1: Missing token
    const resMissing = await services.timerService.verify(sessionId, undefined);
    expect(resMissing.ok).toBe(false);
    if (!resMissing.ok) {
      expect(resMissing.error).toBe('PARENT_AUTH_REQUIRED');
    }
    let row = await services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('completed');

    // Case 2: Expired token (> 30s)
    const expiredToken = services.authService.issueToken();
    clock.advance(30_001);
    const resExpired = await services.timerService.verify(sessionId, expiredToken);
    expect(resExpired.ok).toBe(false);
    if (!resExpired.ok) {
      expect(resExpired.error).toBe('PARENT_AUTH_REQUIRED');
    }
    row = await services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('completed');

    // Case 3: Valid fresh token succeeds
    const freshToken = services.authService.issueToken();
    const resSuccess = await services.timerService.verify(sessionId, freshToken);
    expect(resSuccess.ok).toBe(true);
    row = await services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('verified');

    // Case 4: Reusing the same token fails
    const resReused = await services.timerService.verify(sessionId, freshToken);
    expect(resReused.ok).toBe(false);
    if (!resReused.ok) {
      expect(resReused.error).toBe('PARENT_AUTH_REQUIRED');
    }
    row = await services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('verified');
  });
});
