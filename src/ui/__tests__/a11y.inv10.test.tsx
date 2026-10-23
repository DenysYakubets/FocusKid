import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { TapTarget } from '../components/TapTarget';
import { AppText } from '../components/AppText';
import { ProgressBar } from '../components/ProgressBar';
import { TaskCard } from '../components/TaskCard';
import { TodayTaskView } from '../../domain/tasks/types';

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
});
