/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';

const wall = { todayLocalDate: () => '2026-10-23', weekdayIndex: () => 4, addDays: (d: string) => d, nowIso: () => '2026-10-23T10:00:00.000Z' };

test('timer gear is visible while Running or Paused and absent in Idle or Completed', async () => {
  const db = createNodeDb(), clock = createFakeClock(1000), navigation: any = { navigate: jest.fn(), addListener: () => () => {} };
  const screen = await renderWithApp(<TimerScreen navigation={navigation} route={{ params: { taskId: 1 } } as any} />, { db, clock, wall });
  expect(screen.queryByTestId('timer-gear')).toBeNull();
  await act(async () => { await timerStore.start(1); });
  const gear = screen.getByTestId('timer-gear');
  expect(gear.props.accessibilityLabel).toBe(uk.timer.gear);
  await act(async () => { fireEvent.press(screen.getByLabelText(uk.timer.pause)); });
  expect(screen.getByTestId('timer-gear')).toBeTruthy();
  await act(async () => { clock.advance(900000); await timerStore.tick(); });
  expect(timerStore.getSnapshot().state.kind).toBe('Paused');
  await act(async () => { await timerStore.resume(); });
  await act(async () => { clock.advance(900000); await timerStore.tick(); });
  expect(screen.queryByTestId('timer-gear')).toBeNull();
});
