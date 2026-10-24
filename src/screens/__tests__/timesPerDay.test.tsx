/**
 * C4 RED: times-per-day field (target_per_day) on tasks + "2/3" progress on TodayScreen card.
 *
 * Owner brief:
 *   - parent task creation gains a 'Скільки разів на день' field (default 1, range 1-10, step 1)
 *   - child can complete that task 1..N times per day
 *   - TodayScreen task card shows progress like '2/3' (completed/today's target)
 *   - when all N done, card shows a done state
 *
 * RED-phase assertions (must FAIL against current code):
 *   - tasksRepo.create() does not yet accept target_per_day
 *   - TaskCard does not yet render progress "X/Y"
 *
 * GREEN-phase assertions (must PASS after implementing):
 *   - target_per_day is persisted and returned
 *   - TaskCard renders "2/3" style progress when target > 1
 *   - card shows done state when completedCount >= target
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { systemWallClock } from '../../../src/services/clock/wallClock';
import { TaskCard } from '../../../src/ui/components/TaskCard';
import { TodayTaskView } from '../../../src/domain/tasks/types';
import { uk } from '../../../src/i18n/uk';

jest.setTimeout(30000);

const fakeWall = {
  ...systemWallClock,
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
};

function makeTask(overrides: Record<string, unknown>): TodayTaskView {
  return {
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
    targetPerDay: 3,
    completedToday: 2,
    ...overrides,
  } as unknown as TodayTaskView;
}

describe('C4: times-per-day (target_per_day) + progress on card', () => {
  it('RED: tasksRepo.create persists target_per_day, listToday returns it', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });

    const task = await services.tasksRepo.create(
      { title: 'Завдання', targetMinutes: 15, daysMask: 127, targetPerDay: 4 } as any,
      '2026-10-23T10:00:00Z'
    );

    // RED: targetPerDay should be persisted
    expect((task as any).targetPerDay).toBe(4);

    const today = await services.tasksRepo.listToday('2026-10-23', 4);
    const found = today.find((t) => t.id === task.id);
    expect(found).toBeTruthy();
    expect((found as any).targetPerDay).toBe(4);
    // completedToday counts sessions with status completed/verified for today
    expect((found as any).completedToday).toBe(0);
  });

  it('GREEN: TaskCard renders "2/3" progress when targetPerDay > 1', async () => {
    const task = makeTask({ targetPerDay: 3, completedToday: 2 });
    const { getByText } = await render(<TaskCard task={task} onPress={() => {}} />);

    // Should render "2/3" progress text
    const progressText = getByText('2/3');
    expect(progressText).toBeTruthy();
  });

  it('GREEN: TaskCard shows done state when completedToday >= targetPerDay', async () => {
    const task = makeTask({ targetPerDay: 3, completedToday: 3 });
    const { getByText } = await render(<TaskCard task={task} onPress={() => {}} />);

    // Done label shown when fully complete
    const doneLabel = getByText(uk.taskCrud.doneToday);
    expect(doneLabel).toBeTruthy();

    // Progress still shown as "3/3"
    const progressText = getByText('3/3');
    expect(progressText).toBeTruthy();
  });

  it('GREEN: TaskCard hides progress when targetPerDay <= 1 (default)', async () => {
    const task = makeTask({ targetPerDay: 1, completedToday: 0 });
    const { queryByText } = await render(<TaskCard task={task} onPress={() => {}} />);

    // Should not render any "x/y" progress for target=1
    expect(queryByText(/^[0-9]+\/[0-9]+$/)).toBeNull();
  });
});