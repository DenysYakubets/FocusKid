/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { PinGateScreen } from '../PinGateScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

const wall = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d: string) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

describe('parent early completion from the timer controls dialog', () => {
  jest.setTimeout(30000);

  it('confirm-as-completed marks the session completed before the timer ends and releases the child screen', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const nav: any = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

    const { services } = await renderWithApp(<></>, { db, clock, wall });
    await services.authService.setupPin('1234');

    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getState().snapshot.sessionId!;
    expect((await services.sessionsRepo.get(sessionId))?.status).toBe('running');

    // Only 1 minute of the 15-minute target elapses — the timer has NOT ended.
    await act(async () => {
      clock.advance(60_000);
    });
    expect((await services.sessionsRepo.get(sessionId))?.status).toBe('running');

    const gate = await renderWithApp(
      <PinGateScreen
        navigation={nav}
        route={{ params: { intent: 'timerControls', sessionId } } as any}
      />,
      { db, clock, wall, services }
    );

    for (const d of ['1', '2', '3', '4']) {
      await act(async () => {
        fireEvent.press(gate.getByLabelText(`Цифра ${d}`));
      });
    }

    await gate.findByTestId('timer-controls-dialog');
    await act(async () => {
      fireEvent.press(gate.getByLabelText(uk.timer.confirmComplete));
    });
    await gate.findByTestId('confirm-complete-dialog');

    await act(async () => {
      fireEvent.press(gate.getByTestId('confirm-complete-accept'));
    });

    // Session transitioned running -> completed BEFORE the timer reached zero
    // (same completion path as a natural finish: status + COMPLETE event).
    const row = await services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('completed');
    expect(row?.completedAt).not.toBeNull();

    const events = await db.all<{ event: string }>(
      `SELECT event FROM session_events WHERE session_id = ? ORDER BY id ASC;`,
      [sessionId]
    );
    expect(events.map((e) => e.event)).toContain('COMPLETE');

    // timerStore rehydrated from the completed session — the child-facing store
    // now reflects the natural-finish end state (no active session).
    expect(timerStore.getSnapshot().sessionId).toBeNull();

    // Child screen released (same end-state as a natural finish -> goBack).
    expect(nav.goBack).toHaveBeenCalled();
    gate.unmount();
  });

  it('confirm dialog cancel keeps the session running', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const nav: any = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

    const { services } = await renderWithApp(<></>, { db, clock, wall });
    await services.authService.setupPin('1234');

    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getState().snapshot.sessionId!;

    const gate = await renderWithApp(
      <PinGateScreen
        navigation={nav}
        route={{ params: { intent: 'timerControls', sessionId } } as any}
      />,
      { db, clock, wall, services }
    );

    for (const d of ['1', '2', '3', '4']) {
      await act(async () => {
        fireEvent.press(gate.getByLabelText(`Цифра ${d}`));
      });
    }

    await gate.findByTestId('timer-controls-dialog');
    await act(async () => {
      fireEvent.press(gate.getByLabelText(uk.timer.confirmComplete));
    });
    await gate.findByTestId('confirm-complete-dialog');
    await act(async () => {
      // The confirm dialog's own "Закрити" (cancel) button.
      fireEvent.press(gate.getAllByLabelText(uk.timer.controlsCancel).at(-1)!);
    });

    // Back on the controls dialog; session untouched, no navigation.
    await gate.findByTestId('timer-controls-dialog');
    expect((await services.sessionsRepo.get(sessionId))?.status).toBe('running');
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
    expect(nav.goBack).not.toHaveBeenCalled();
    gate.unmount();
  });
});