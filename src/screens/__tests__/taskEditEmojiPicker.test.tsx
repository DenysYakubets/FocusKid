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
import { EMOJI_OPTIONS } from '../../domain/tasks/emoji';

const fakeWall: WallClock = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

describe('F5 - emoji picker dialog (no system keyboard) + persistence', () => {
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

  it('opens a dialog with a searchable grid and persists the chosen emoji on save', async () => {
    const { db, clock, services } = await setup();
    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };

    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: {} } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('task-title-input'), 'Плавання');
    });

    // 1. The free-text emoji keyboard input is gone; a picker trigger is present
    expect(screen.queryByTestId('task-emoji-input')).toBeNull();

    // 2. Opening the picker shows the dialog, a search field and the curated grid
    await act(async () => {
      fireEvent.press(screen.getByTestId('task-emoji-field'));
    });

    expect(screen.getByText(uk.taskCrud.emojiTitle)).toBeTruthy();
    const gridEmojis = EMOJI_OPTIONS.map((o) => o.char);
    for (const char of gridEmojis.slice(0, 5)) {
      expect(screen.getByLabelText(char)).toBeTruthy();
    }

    // 3. Search filters the grid
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('emoji-search'), 'спорт');
    });
    const visible = EMOJI_OPTIONS.filter((o) => o.keys.includes('спорт'));
    expect(visible.length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(visible[0]!.char)).toBeTruthy();
    const nonSport = EMOJI_OPTIONS.find((o) => !o.keys.includes('спорт'))!;
    expect(screen.queryByLabelText(nonSport.char)).toBeNull();

    // 4. Tapping an emoji selects it and closes the dialog (no system keyboard)
    const chosen = visible[0]!.char;
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('emoji-search'), '');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(chosen));
    });
    expect(screen.queryByText(uk.taskCrud.emojiTitle)).toBeNull();
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain(chosen);

    // 5. Save persists the emoji into the task record
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.taskCrud.save));
    });
    expect(mockNav.goBack).toHaveBeenCalled();

    const created = await services.tasksRepo.listAll();
    const task = created.find((t) => t.title === 'Плавання');
    expect(task?.emoji).toBe(chosen);
  });

  it('keeps the already-saved emoji when opening the picker on an existing task', async () => {
    const { db, clock, services } = await setup();
    const mockNav: any = { goBack: jest.fn(), replace: jest.fn() };

    const screen = await renderWithApp(
      <TaskEditScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall, services }
    );

    // Seed task 1 ships with 📚 and the picker field shows it
    expect(await screen.findByDisplayValue('Читання')).toBeTruthy();
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain('📚');

    // Opening the picker must not disturb the saved selection: the grid lists
    // the current emoji and cancelling closes the dialog untouched. Queries are
    // scoped to the dialog because the top bar shares the «Скасувати» label.
    await act(async () => {
      fireEvent.press(screen.getByTestId('task-emoji-field'));
    });
    const picker = screen.getByTestId('emoji-picker');
    expect(within(picker).getByText(uk.taskCrud.emojiTitle)).toBeTruthy();
    expect(within(picker).getByLabelText('📚')).toBeTruthy();

    await act(async () => {
      fireEvent.press(within(picker).getByLabelText(uk.taskCrud.cancel));
    });
    expect(screen.queryByText(uk.taskCrud.emojiTitle)).toBeNull();
    expect(screen.getByTestId('task-emoji-field').props.accessibilityLabel).toContain('📚');

    // Saving on the UPDATE path keeps the emoji in the record (F5 persistence)
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.taskCrud.save));
    });
    expect(mockNav.goBack).toHaveBeenCalled();

    const all = await services.tasksRepo.listAll();
    const updated = all.find((t) => t.title === 'Читання');
    expect(updated?.emoji).toBe('📚');
  });
});