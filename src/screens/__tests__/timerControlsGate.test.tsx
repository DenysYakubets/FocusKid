/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { PinGateScreen } from '../PinGateScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

const wall = { todayLocalDate: () => '2026-10-23', weekdayIndex: () => 4, addDays: (d: string) => d, nowIso: () => '2026-10-23T10:00:00.000Z' };

describe('timer controls PIN gate', () => {
  it('gear routes to controls gate; dialog waits for successful PIN even in active parent session', async () => {
    const db = createNodeDb(), clock = createFakeClock(1000), nav: any = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    const { services } = await renderWithApp(<></>, { db, clock, wall });
    await services.authService.setupPin('1234'); await timerStore.start(1);
    services.authService.startParentSession();
    const id = timerStore.getState().snapshot.sessionId!;
    const timer = await renderWithApp(<TimerScreen navigation={nav} route={{ params: { taskId: 1 } } as any} />, { db, clock, wall, services });
    fireEvent.press(timer.getByTestId('timer-gear'));
    expect(nav.navigate).toHaveBeenCalledWith('PinGate', { intent: 'timerControls', sessionId: id });

    const gate = await renderWithApp(<PinGateScreen navigation={nav} route={{ params: { intent: 'timerControls', sessionId: id } } as any} />, { db, clock, wall, services });
    expect(gate.queryByTestId('timer-controls-dialog')).toBeNull();
    for (const d of ['0','0','0','0']) await act(async () => { fireEvent.press(gate.getByLabelText(`Цифра ${d}`)); });
    expect(gate.queryByTestId('timer-controls-dialog')).toBeNull();
    for (const d of ['1','2','3','4']) await act(async () => { fireEvent.press(gate.getByLabelText(`Цифра ${d}`)); });
    expect(await gate.findByTestId('timer-controls-dialog')).toBeTruthy();
    expect(gate.queryByLabelText(uk.timer.stop)).toBeNull();
    await act(async () => { fireEvent.press(gate.getByLabelText(uk.timer.controlsCancel)); });
    expect(gate.queryByTestId('timer-controls-dialog')).toBeNull();
    expect(nav.goBack).toHaveBeenCalled();
  });
});
