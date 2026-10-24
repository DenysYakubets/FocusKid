/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { parentSessionStore } from '../../state/parentSessionStore';
import { TaskEditScreen } from '../TaskEditScreen';
import { PinPad } from '../../ui/components/PinPad';
import { uk } from '../../i18n/uk';
import { MIN_TOUCH_DP } from '../../ui/theme';

const fakeWall: WallClock = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

describe('F4 - Save button lives at the bottom of the task form', () => {
  jest.setTimeout(30000);

  it('renders Зберегти inside a bottom footer, not in the top bar', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    const screen = await renderWithApp(
      <TaskEditScreen
        navigation={{ goBack: jest.fn(), replace: jest.fn() } as any}
        route={{ params: {} } as any}
      />,
      { db, clock, wall: fakeWall, services }
    );

    const footer = screen.getByTestId('taskedit-footer');
    expect(footer).toBeTruthy();

    // The Save button must be a descendant of the footer...
    const save = screen.getByLabelText(uk.taskCrud.save);
    let node: any = save;
    let insideFooter = false;
    while (node) {
      if (node.props?.testID === 'taskedit-footer') {
        insideFooter = true;
        break;
      }
      node = node.parent;
    }
    expect(insideFooter).toBe(true);

    // ...and it must be full-width primary.
    const saveStyle = flat(save);
    expect(saveStyle.alignSelf).toBe('stretch');

    // ...and NOT inside the top bar any more.
    let up: any = save;
    let insideTopBar = false;
    while (up) {
      if (up.props?.testID === 'taskedit-topbar') {
        insideTopBar = true;
        break;
      }
      up = up.parent;
    }
    expect(insideTopBar).toBe(false);
    expect(flat(screen.getByTestId('taskedit-topbar')).flexWrap).toBe('wrap');
  });
});

describe('C1 (was F7) - PinPad is a tight calculator-like cluster', () => {
  it('uses the spec gap (8-12dp, both axes) and a compact key height', async () => {
    const screen = await render(
      <PinPad onComplete={jest.fn()} value="" onChange={jest.fn()} />
    );

    const grid = screen.getByTestId('pinpad-grid');
    const gridStyle = flat(grid);
    const cluster: any = grid.children[0];
    const clusterStyle = flat(cluster);
    const rowStyle = flat(cluster.children[0]);

    // horizontal gap between digit keys: PIN_KEYPAD_SPEC §2 (8/10/12dp max)
    const gap = rowStyle.gap ?? clusterStyle.gap ?? gridStyle.gap;
    expect(gap).toBeDefined();
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(12);

    const key = flat(screen.getByLabelText(uk.pin.digit(1)));
    expect(key.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
    // spec key sizes are 56/64/72dp — never taller than the 72dp breakpoint
    expect(key.minHeight).toBeLessThanOrEqual(72);

    // keys must not be pushed apart vertically across the whole screen
    expect(gridStyle.justifyContent).not.toBe('space-evenly');
    expect(flat(grid.parent).justifyContent).not.toBe('space-evenly');
  });
});