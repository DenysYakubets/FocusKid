/** @jest-environment node */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { TaskListEditScreen } from '../TaskListEditScreen';
import { ParentHomeScreen } from '../ParentHomeScreen';
import { parentSessionStore } from '../../state/parentSessionStore';
import { uk } from '../../i18n/uk';

/**
 * Round-1 review finding 2 (INV-10 TalkBack, spec §4.5/§4.6): list actions keep
 * the plain visible label but must announce the per-task context, so TalkBack's
 * button list never exposes several identical «Редагувати»/«Перевірити» entries.
 */
describe('round-1: TalkBack keeps per-task context on list actions', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  const setupParentSession = async (db: any, clock: any) => {
    const { services } = await setupTestServices({ db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);
    return services;
  };

  it('TaskListEdit: the edit button announces which task it edits', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await setupParentSession(db, clock);

    const screen = await renderWithApp(
      <TaskListEditScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Visible label stays the plain §4.5 action name (one per seeded task)...
    const visible = await screen.findAllByText(uk.taskCrud.editTask);
    const tasks = await services.tasksRepo.listAll();
    expect(visible.length).toBe(tasks.length);
    // ...while TalkBack gets the base-85f762c composite label with the task title.
    for (const task of tasks) {
      expect(screen.getByLabelText(`${uk.taskCrud.editTask}: ${task.title}`)).toBeTruthy();
    }
  });

  it('ParentHome: verify / abandon buttons announce which session they act on', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const services = await setupParentSession(db, clock);

    // A session awaiting verification makes the action row render (spec §4.6).
    const created = await services.sessionsRepo.insertRunning({
      taskId: 1,
      localDate: '2026-10-23',
      targetMs: 900_000,
      startedAt: fakeWall.nowIso(),
      updatedAt: fakeWall.nowIso(),
    });
    await services.sessionsRepo.setStatus(created.id, 'completed', {
      completedAt: fakeWall.nowIso(),
      updatedAt: fakeWall.nowIso(),
    });

    const task = await services.tasksRepo.get(1);
    expect(task).toBeTruthy();

    const screen = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Visible labels stay the plain §4.6 action names...
    expect(await screen.findByText(uk.parentHome.verify)).toBeTruthy();
    expect(screen.getByText(uk.parentHome.abandon)).toBeTruthy();
    // ...TalkBack keeps the per-task suffix from the baseline implementation.
    expect(
      screen.getByLabelText(`${uk.parentHome.verify}: ${task!.title}`)
    ).toBeTruthy();
    expect(
      screen.getByLabelText(`${uk.parentHome.abandon}: ${task!.title}`)
    ).toBeTruthy();
  });
});