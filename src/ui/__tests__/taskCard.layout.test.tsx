import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { TodayTaskView } from '../../domain/tasks/types';
import { TaskCard } from '../components/TaskCard';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

const task = {
  id: 1,
  title: 'Читання',
  targetMinutes: 15,
  daysMask: 127,
  sortOrder: 0,
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
  sessionId: null,
  status: 'idle',
} as unknown as TodayTaskView;

describe('TaskCard meta row layout', () => {
  it('keeps duration left and groups the status pill beside the right-edge chevron', async () => {
    const screen = await render(<TaskCard task={task} onPress={() => {}} />);
    const row = flat(screen.getByTestId('task-card-meta-row'));
    const trailing = flat(screen.getByTestId('task-card-trailing-meta'));
    const chevron = flat(screen.getByTestId('task-card-chevron'));

    expect(row.flexDirection).toBe('row');
    expect(row.alignItems).toBe('center');
    expect(trailing.marginLeft).toBe('auto');
    expect(trailing.flexDirection).toBe('row');
    expect(trailing.alignItems).toBe('center');
    expect(chevron.marginTop ?? 0).toBe(0);
    expect(screen.getByLabelText('Читання, 15 хвилин, Не розпочато')).toBeTruthy();
  });
});
