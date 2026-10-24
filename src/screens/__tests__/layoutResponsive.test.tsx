/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TaskListEditScreen } from '../TaskListEditScreen';
import { TaskEditScreen } from '../TaskEditScreen';
import { TodayScreen } from '../TodayScreen';
import { PinPad } from '../../ui/components/PinPad';
import { parentSessionStore } from '../../state/parentSessionStore';
import { uk } from '../../i18n/uk';

describe('Group A - Responsive Layout Tests', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4, // Friday (bit 4)
    addDays: (d, n) => `2026-10-${23 + n}`,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  function getFlattenedStyle(node: any) {
    const styleProp = node.props.style;
    const resolved =
      typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
    return StyleSheet.flatten(resolved) || {};
  }

  const setupParentSessionServices = async (db: any, clock: any) => {
    const { services } = await renderWithApp(<></>, {
      db,
      clock,
      wall: fakeWall,
    });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);
    return services;
  };

  it('TaskListEdit: add button is full-width, top bar wraps, title has numberOfLines=1', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await setupParentSessionServices(db, clock);

    const screen = await renderWithApp(
      <TaskListEditScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    const addButton = screen.getByLabelText(uk.taskCrud.addTask);
    expect(addButton).toBeTruthy();
    const addStyle = getFlattenedStyle(addButton);
    expect(addStyle.flexBasis).toBe('100%');

    const topBar = screen.getByTestId('tasklistedit-topbar');
    const topBarStyle = getFlattenedStyle(topBar);
    expect(topBarStyle.flexWrap).toBe('wrap');

    const titleNode = screen.getByTestId('tasklistedit-title');
    expect(titleNode.props.numberOfLines).toBe(1);
  });

  it('TaskEdit: save button is full-width in the bottom footer, top bar and rows wrap, stepper controls present', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await setupParentSessionServices(db, clock);

    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNavigation} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // F4: the primary action lives in the bottom footer, full-width.
    const footer = screen.getByTestId('taskedit-footer');
    expect(footer).toBeTruthy();

    const saveButton = screen.getByLabelText(uk.taskCrud.save);
    expect(saveButton).toBeTruthy();
    const saveStyle = getFlattenedStyle(saveButton);
    expect(saveStyle.alignSelf).toBe('stretch');

    let node: any = saveButton;
    let insideTopBar = false;
    let insideFooter = false;
    while (node) {
      if (node.props?.testID === 'taskedit-topbar') insideTopBar = true;
      if (node.props?.testID === 'taskedit-footer') insideFooter = true;
      node = node.parent;
    }
    expect(insideFooter).toBe(true);
    expect(insideTopBar).toBe(false);

    const topBar = screen.getByTestId('taskedit-topbar');
    const topBarStyle = getFlattenedStyle(topBar);
    expect(topBarStyle.flexWrap).toBe('wrap');

    const stepper = screen.getByTestId('taskedit-stepper');
    const stepperStyle = getFlattenedStyle(stepper);
    expect(stepperStyle.flexWrap).toBe('wrap');

    const weekdays = screen.getByTestId('taskedit-weekdays');
    const weekdaysStyle = getFlattenedStyle(weekdays);
    expect(weekdaysStyle.flexWrap).toBe('wrap');

    expect(screen.getByLabelText(uk.taskCrud.stepLess5)).toBeTruthy();
    expect(screen.getByLabelText(uk.taskCrud.stepLess1)).toBeTruthy();
    expect(screen.getByLabelText(uk.taskCrud.stepMore1)).toBeTruthy();
    expect(screen.getByLabelText(uk.taskCrud.stepMore5)).toBeTruthy();
  });

  it('Today: title has numberOfLines=1 and flexShrink>=1, header wraps', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <TodayScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall }
    );

    const titleNode = screen.getByText(uk.today.title);
    expect(titleNode.props.numberOfLines).toBe(1);
    const titleStyle = getFlattenedStyle(titleNode);
    expect(titleStyle.flexShrink).toBeGreaterThanOrEqual(1);

    const header = screen.getByTestId('today-header');
    const headerStyle = getFlattenedStyle(header);
    expect(headerStyle.flexWrap).toBe('wrap');
  });

  it('PinPad: all digit and backspace labels present, grid has flex:1, touch targets >=48x48', async () => {
    const screen = await render(
      <PinPad onComplete={jest.fn()} value="" onChange={jest.fn()} />
    );

    for (let d = 0; d <= 9; d++) {
      const key = screen.getByLabelText(`Цифра ${d}`);
      expect(key).toBeTruthy();
      const style = getFlattenedStyle(key);
      const w = style.minWidth ?? style.width ?? 0;
      const h = style.minHeight ?? style.height ?? 0;
      expect(w).toBeGreaterThanOrEqual(48);
      expect(h).toBeGreaterThanOrEqual(48);
    }

    const backspace = screen.getByLabelText(uk.pin.backspace);
    expect(backspace).toBeTruthy();

    const grid = screen.getByTestId('pinpad-grid');
    const gridStyle = getFlattenedStyle(grid);
    expect(gridStyle.flex).toBe(1);
  });
});
