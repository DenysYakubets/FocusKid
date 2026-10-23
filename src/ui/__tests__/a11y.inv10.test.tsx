import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { TapTarget } from '../components/TapTarget';
import { AppText } from '../components/AppText';
import { ProgressBar } from '../components/ProgressBar';
import { TaskCard } from '../components/TaskCard';
import { StatBar } from '../components/StatBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TodayTaskView } from '../../domain/tasks/types';
import { renderWithApp, RenderWithAppResult } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { systemWallClock } from '../../services/clock/wallClock';
import { timerStore } from '../../state/timerStore';
import { parentSessionStore } from '../../state/parentSessionStore';

import { TodayScreen } from '../../screens/TodayScreen';
import { TimerScreen } from '../../screens/TimerScreen';
import { PinSetupScreen } from '../../screens/PinSetupScreen';
import { PinGateScreen } from '../../screens/PinGateScreen';
import { ParentHomeScreen } from '../../screens/ParentHomeScreen';
import { TaskListEditScreen } from '../../screens/TaskListEditScreen';
import { TaskEditScreen } from '../../screens/TaskEditScreen';
import { StatsScreen } from '../../screens/StatsScreen';

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function walkTree(node: any, visitor: (node: any) => void) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) {
      walkTree(child, visitor);
    }
    return;
  }
  visitor(node);
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        walkTree(child, visitor);
      }
    }
  }
}

function auditA11yTree(result: RenderWithAppResult) {
  const tree = result.toJSON();
  expect(tree).toBeTruthy();

  walkTree(tree, (node) => {
    // 1. Every node with onPress has a non-empty accessibilityLabel and an accessibilityRole
    if (typeof node.props?.onPress === 'function') {
      const label = node.props.accessibilityLabel;
      expect(typeof label).toBe('string');
      expect(label.trim().length).toBeGreaterThan(0);

      const role = node.props.accessibilityRole;
      expect(typeof role).toBe('string');
      expect(role.trim().length).toBeGreaterThan(0);

      // 2. Every pressable's flattened style has minWidth >= 48 and minHeight >= 48
      const resolved =
        typeof node.props.style === 'function'
          ? node.props.style({ pressed: false })
          : node.props.style;
      const flat = StyleSheet.flatten(resolved) || {};
      const w = flat.minWidth ?? flat.width ?? 0;
      const h = flat.minHeight ?? flat.height ?? 0;
      expect(w).toBeGreaterThanOrEqual(48);
      expect(h).toBeGreaterThanOrEqual(48);
    }

    // 3. Amended INV-10: scalable text — sizes come from the 12..72 ramp,
    //    font scaling stays on, and text roles reach the legacy 48sp need
    //    through their per-role maxFontSizeMultiplier (16 x 3.0 = 48sp).
    if (node.type === 'Text') {
      const flat = StyleSheet.flatten(node.props?.style);
      if (flat && flat.fontSize !== undefined) {
        expect(flat.fontSize).toBeGreaterThanOrEqual(12);
        expect(flat.fontSize).toBeLessThanOrEqual(72);
      }
      expect(node.props?.allowFontScaling).not.toBe(false);
      const maxScale = node.props?.maxFontSizeMultiplier;
      if (typeof maxScale === 'number') {
        const size = flat?.fontSize ?? 16;
        if (size >= 16 && size <= 18) {
          // body roles (16/18) must reach the legacy 48sp need via scaling
          expect(maxScale * size).toBeGreaterThanOrEqual(48);
        }
      }
    }
  });
}

describe('INV-10 Accessibility & Touch Targets', () => {
  it('TapTarget enforces required accessibility props and disabled state', async () => {
    const { getByRole } = await render(
      <TapTarget
        accessibilityRole="button"
        accessibilityLabel="Action button"
        disabled={true}
      >
        <AppText variant="body">Action</AppText>
      </TapTarget>
    );

    const target = getByRole('button');
    expect(target.props.accessibilityLabel).toBe('Action button');
    expect(target.props.accessibilityRole).toBe('button');
    expect(target.props.accessibilityState).toEqual({ disabled: true });
    expect(target.props.accessibilityState.disabled).toBe(true);

    const flatStyle = StyleSheet.flatten(target.props.style);
    expect(flatStyle.minWidth).toBeGreaterThanOrEqual(48);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('ProgressBar renders with progressbar role and accessibilityValue', async () => {
    const { getByRole } = await render(
      <ProgressBar total={900000} elapsed={300000} />
    );

    const bar = getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 900000,
      now: 300000,
    });
  });

  it('TaskCard generates correct accessibilityLabel with title, minutes, and status', async () => {
    const task: TodayTaskView = {
      id: 1,
      title: 'Читання',
      emoji: '📚',
      targetMinutes: 15,
      daysMask: 127,
      sortOrder: 0,
      archived: false,
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
      sessionId: null,
      status: 'idle',
    };

    const { getByRole } = await render(
      <TaskCard task={task} onPress={() => {}} />
    );

    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toBe('Читання, 15 хвилин, Не розпочато');
  });

  it('StatBar has combined accessibilityLabel and value text', async () => {
    const { getByLabelText, getByText } = await render(
      <StatBar
        label="Пн"
        fullDayName="Понеділок"
        verifiedCount={2}
        minutes={35}
        maxMinutes={60}
      />
    );

    expect(getByLabelText('Понеділок: 2 завдання, 35 хвилин')).toBeTruthy();
    expect(getByText('35 хв (2)')).toBeTruthy();
  });

  it('ErrorBoundary renders accessible retry button on error', async () => {
    const BadComponent = () => {
      throw new Error('Test render crash');
    };

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByRole } = await render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toBe('Спробувати ще');
    const flat = StyleSheet.flatten(button.props.style);
    expect(flat.minWidth).toBeGreaterThanOrEqual(48);
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);

    spy.mockRestore();
  });

  describe('INV-10 Screen-level Audit (all screens in relevant states)', () => {
    it('audits PinSetupScreen', async () => {
      const res = await renderWithApp(
        <PinSetupScreen navigation={mockNavigation} route={{} as any} />
      );
      auditA11yTree(res);
    });

    it('audits TodayScreen', async () => {
      const res = await renderWithApp(
        <TodayScreen navigation={mockNavigation} route={{} as any} />
      );
      auditA11yTree(res);
    });

    it('audits TimerScreen across states', async () => {
      const db = createNodeDb();
      const clock = createFakeClock(1000);

      const res = await renderWithApp(
        <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
        { db, clock, wall: systemWallClock }
      );

      // Running
      await act(async () => {
        await timerStore.start(1);
      });
      auditA11yTree(res);

      // Paused
      await act(async () => {
        await timerStore.pause();
      });
      auditA11yTree(res);

      // Completed
      await act(async () => {
        await timerStore.resume();
        clock.advance(900_000); // 15 min
        await timerStore.tick();
      });
      auditA11yTree(res);
    });

    it('audits PinGateScreen (intents: enterParent, verify, abandon)', async () => {
      const res1 = await renderWithApp(
        <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'enterParent' } } as any} />
      );
      auditA11yTree(res1);

      const res2 = await renderWithApp(
        <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'verify', sessionId: 1 } } as any} />
      );
      auditA11yTree(res2);

      const res3 = await renderWithApp(
        <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'abandon', sessionId: 1 } } as any} />
      );
      auditA11yTree(res3);
    });

    it('audits ParentHomeScreen', async () => {
      const { services } = await renderWithApp(<></>);
      await services.authService.setupPin('1234');
      services.authService.startParentSession();
      parentSessionStore.setService(services.authService);

      const res = await renderWithApp(
        <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
        { services }
      );
      auditA11yTree(res);
    });

    it('audits TaskListEditScreen and TaskEditScreen', async () => {
      const { services } = await renderWithApp(<></>);
      await services.authService.setupPin('1234');
      services.authService.startParentSession();
      parentSessionStore.setService(services.authService);

      const resList = await renderWithApp(
        <TaskListEditScreen navigation={mockNavigation} route={{} as any} />,
        { services }
      );
      auditA11yTree(resList);

      const resEdit = await renderWithApp(
        <TaskEditScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
        { services }
      );
      auditA11yTree(resEdit);
    });

    it('audits StatsScreen', async () => {
      const { services } = await renderWithApp(<></>);
      await services.authService.setupPin('1234');
      services.authService.startParentSession();
      parentSessionStore.setService(services.authService);

      const res = await renderWithApp(
        <StatsScreen navigation={mockNavigation} route={{} as any} />,
        { services }
      );
      auditA11yTree(res);
    });
  });
});
