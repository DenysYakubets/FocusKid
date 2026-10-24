/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { MascotFloating } from '../components/MascotFloating';
import { ChildTabsScreen } from '../../screens/ChildTabsScreen';
import { PinGateScreen } from '../../screens/PinGateScreen';
import { ParentHomeScreen } from '../../screens/ParentHomeScreen';
import { TaskListEditScreen } from '../../screens/TaskListEditScreen';
import { TaskEditScreen } from '../../screens/TaskEditScreen';
import { MascotSelectScreen } from '../../screens/MascotSelectScreen';
import { useMascotStore } from '../../state/mascotStore';
import { DEFAULT_MASCOT } from '../../ui/theme';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved =
    typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

function restartStore() {
  useMascotStore.setState({ mascot: DEFAULT_MASCOT, hydrated: false });
}

const label = (mood: keyof typeof uk.mascot.moods) =>
  uk.mascot.floatingLabel(DEFAULT_MASCOT, uk.mascot.moods[mood]);

describe('C5 - floating tappable companion (MASCOT_DESIGN §5)', () => {
  beforeEach(() => {
    restartStore();
  });

  it('renders the selected mascot as a >=48dp target in the corner', async () => {
    const screen = await renderWithApp(<MascotFloating />, {
      db: createNodeDb(),
      clock: createFakeClock(1000),
      wall: systemWallClock,
    });

    const wrapper = await screen.findByTestId('mascot-floating');
    const wrapperStyle = flat(wrapper);
    expect(wrapperStyle.position).toBe('absolute');
    expect(wrapperStyle.bottom).toBeGreaterThanOrEqual(16);
    expect(wrapperStyle.right).toBeGreaterThanOrEqual(16);
    // passes taps through except on the mascot itself (non-blocking guarantee)
    expect(wrapper.props.pointerEvents).toBe('box-none');

    const target = await screen.findByLabelText(label('happy'));
    const targetStyle = flat(target);
    expect(Math.max(targetStyle.minWidth ?? 0, targetStyle.width ?? 0)).toBeGreaterThanOrEqual(48);
    expect(Math.max(targetStyle.minHeight ?? 0, targetStyle.height ?? 0)).toBeGreaterThanOrEqual(48);
    expect(target.props.accessibilityRole).toBe('button');
  });

  it('cycles mood on tap: happy -> excited -> neutral -> sleepy -> happy', async () => {
    const screen = await renderWithApp(<MascotFloating />, {
      db: createNodeDb(),
      clock: createFakeClock(1000),
      wall: systemWallClock,
    });

    const order = ['happy', 'excited', 'neutral', 'sleepy'] as const;
    for (const mood of order) {
      const target = await screen.findByLabelText(label(mood));
      expect(target).toBeTruthy();
      await act(async () => {
        fireEvent.press(target);
      });
    }
    // a full lap returns to the default mood
    expect(await screen.findByLabelText(label('happy'))).toBeTruthy();
  });

  it('places the mascot per corner (bottom-right default, bottom-left, top-right)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const right = await renderWithApp(<MascotFloating />, { db, clock, wall: systemWallClock });
    const rightStyle = flat(await right.findByTestId('mascot-floating'));
    expect(rightStyle.right).toBeDefined();
    expect(rightStyle.left).toBeUndefined();
    expect(rightStyle.top).toBeUndefined();
    right.unmount();

    const left = await renderWithApp(<MascotFloating corner="bottom-left" />, {
      db,
      clock,
      wall: systemWallClock,
    });
    const leftStyle = flat(await left.findByTestId('mascot-floating'));
    expect(leftStyle.left).toBeDefined();
    expect(leftStyle.right).toBeUndefined();
    left.unmount();

    const top = await renderWithApp(<MascotFloating corner="top-right" />, {
      db,
      clock,
      wall: systemWallClock,
    });
    const topStyle = flat(await top.findByTestId('mascot-floating'));
    expect(topStyle.top).toBeDefined();
    expect(topStyle.bottom).toBeUndefined();
    top.unmount();
  });

  it('INV-05: visible on child screens, never rendered on PIN/parent screens or the selection tab', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    // Child shell (Today tab) shows the companion.
    const tabs = await renderWithApp(
      <ChildTabsScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(await tabs.findByTestId('mascot-floating')).toBeTruthy();
    tabs.unmount();

    // The selection tab hides it (the roster IS the focus there).
    const selectTab = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    expect(selectTab.queryByTestId('mascot-floating')).toBeNull();
    selectTab.unmount();

    // PIN gate + parent screens: no companion at all.
    const parentScreens: Array<[React.ReactElement, string]> = [
      [
        <PinGateScreen
          navigation={mockNavigation}
          route={{ params: { intent: 'enterParent' } } as any}
        />,
        'PinGate',
      ],
      [<ParentHomeScreen navigation={mockNavigation} route={{} as any} />, 'ParentHome'],
      [<TaskListEditScreen navigation={mockNavigation} route={{} as any} />, 'TaskListEdit'],
      [<TaskEditScreen navigation={mockNavigation} route={{ params: {} } as any} />, 'TaskEdit'],
    ];

    for (const [element, name] of parentScreens) {
      const screen = await renderWithApp(element, { db, clock, wall: systemWallClock });
      expect(`${name}:${screen.queryByTestId('mascot-floating') === null}`).toBe(
        `${name}:true`
      );
      screen.unmount();
    }
  });
});