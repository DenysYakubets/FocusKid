/**
 * Round-1 LOW (progress clamp): the parent may lower `target_per_day` below
 * what the child already completed today, which would render "4/3".
 * RED-first: `progressLabel` is unclamped on the pre-fix tree.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { TaskCard } from '../../../src/ui/components/TaskCard';
import { TodayTaskView } from '../../../src/domain/tasks/types';
import { uk } from '../../../src/i18n/uk';

jest.setTimeout(30000);

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

describe('TaskCard progress label clamp', () => {
  it('never renders a numerator above the target (target lowered below completed)', async () => {
    const task = makeTask({ targetPerDay: 3, completedToday: 4 });
    const { getByText, queryByText } = await render(<TaskCard task={task} onPress={() => {}} />);

    expect(queryByText('4/3')).toBeNull();
    expect(getByText('3/3')).toBeTruthy();
    // Clamped to the target -> still the done state for the day.
    expect(getByText(uk.taskCrud.doneToday)).toBeTruthy();
  });
});