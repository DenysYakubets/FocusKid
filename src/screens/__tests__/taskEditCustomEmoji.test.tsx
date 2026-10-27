/** @jest-environment node */
import React from 'react';
import { act, fireEvent, within } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { parentSessionStore } from '../../state/parentSessionStore';
import { TaskEditScreen } from '../TaskEditScreen';
import { uk } from '../../i18n/uk';

const fakeWall: WallClock = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

describe('Custom Unicode emoji input (beyond the curated picker)', () => {
  jest.setTimeout(30000);

  async function setup() {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const { services } = await renderWithApp(<></>, { db, clock, wall: fakeWall });
    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);
    return { db, clock, services };
  }

  it('shows custom emoji input only inside the picker dialog', async () => {
    const { db, clock, services } = await setup();
    const screen = await renderWithApp(
      <TaskEditScreen navigation={{ goBack: jest.fn(), replace: jest.fn() } as any} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    expect(screen.queryByTestId('task-emoji-input')).toBeNull();
    expect(screen.queryByTestId('task-custom-emoji-input')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('task-emoji-field')));
    expect(screen.getByPlaceholderText(uk.taskCrud.customEmojiPlaceholder)).toBeTruthy();
  });

  it('accepts a pasted Unicode emoji and shows it as the selected value', async () => {
    const { db, clock, services } = await setup();
    const screen = await renderWithApp(
      <TaskEditScreen navigation={{ goBack: jest.fn(), replace: jest.fn() } as any} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => fireEvent.press(screen.getByTestId('task-emoji-field')));
    const input = screen.getByTestId('emoji-custom-input');
    await act(async () => {
      fireEvent.changeText(input, '🦄');
    });
    await act(async () => fireEvent.press(screen.getByTestId('emoji-picker-save')));

    // The emoji field now reflects the custom value
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain('🦄');
  });

  it('clears the picker selection when custom input becomes non-empty', async () => {
    const { db, clock, services } = await setup();
    const screen = await renderWithApp(
      <TaskEditScreen navigation={{ goBack: jest.fn(), replace: jest.fn() } as any} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Pick a curated emoji first
    await act(async () => {
      fireEvent.press(screen.getByTestId('task-emoji-field'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('🏊'));
    });
    await act(async () => fireEvent.press(screen.getByTestId('emoji-picker-save')));
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain('🏊');

    // Paste a custom emoji -> overrides the picker selection
    await act(async () => {
      fireEvent.press(screen.getByTestId('task-emoji-field'));
    });
    await act(async () => fireEvent.changeText(screen.getByTestId('emoji-custom-input'), '🦄'));
    await act(async () => fireEvent.press(screen.getByTestId('emoji-picker-save')));
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain('🦄');
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).not.toContain('🏊');
  });

  it('persists the custom emoji to the task record on save', async () => {
    const { db, clock, services } = await setup();
    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };
    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'Custom emoji task');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('task-emoji-field'));
    });
    await act(async () => fireEvent.changeText(screen.getByTestId('emoji-custom-input'), '🦄'));
    await act(async () => fireEvent.press(screen.getByTestId('emoji-picker-save')));
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.taskCrud.save));
    });

    expect(mockNav.goBack).toHaveBeenCalled();
    const created = await services.tasksRepo.listAll();
    const task = created.find((t) => t.title === 'Custom emoji task');
    expect(task?.emoji).toBe('🦄');
  });
});
