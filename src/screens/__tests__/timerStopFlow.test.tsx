/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { timerStore } from '../../state/timerStore';
import { TimerScreen } from '../TimerScreen';
import { uk } from '../../i18n/uk';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved = typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

describe('F3 - child-initiated STOP flow in the Timer screen', () => {
  jest.setTimeout(30000);

  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('asks for confirmation in Ukrainian and only stops on «Так»', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });
    const sessionId = timerStore.getSnapshot().sessionId!;

    // 1. The child sees a stop control while the session runs
    const stopButton = screen.getByLabelText(uk.timer.stop);
    expect(stopButton).toBeTruthy();

    // 2. Tapping it opens the confirm dialog (nothing stopped yet)
    await act(async () => {
      fireEvent.press(stopButton);
    });
    expect(screen.getByText(uk.timer.stopTitle)).toBeTruthy();
    expect(screen.getByText(uk.timer.stopMessage)).toBeTruthy();
    expect(timerStore.getSnapshot().state.kind).toBe('Running');

    // 3. «Ні» keeps the session alive
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.timer.stopCancel));
    });
    expect(screen.queryByText(uk.timer.stopTitle)).toBeNull();
    expect(timerStore.getSnapshot().state.kind).toBe('Running');

    // 4. Re-open and confirm with «Так» -> session terminated
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.timer.stop));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.timer.stopConfirm));
    });

    expect(timerStore.getSnapshot().state.kind).toBe('Idle');
    expect(timerStore.getSnapshot().sessionId).toBeNull();

    const row = await screen.services.sessionsRepo.get(sessionId);
    expect(row?.status).toBe('abandoned');

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Today');
  });

  it('hides the stop control once the session completed (INV-03)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });

    expect(screen.queryByText(uk.timer.stopTitle)).toBeNull();
    expect(screen.queryByLabelText(uk.timer.stop)).toBeNull();
    expect(screen.getByText(uk.timer.awaiting)).toBeTruthy();
  });
});