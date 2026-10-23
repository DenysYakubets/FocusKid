/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { TimerScreen } from '../TimerScreen';
import { timerStore, useTimerStore } from '../../state/timerStore';
import { mapTimerError } from '../../ui/timerErrors';

describe('timerErrorSurface', () => {
  jest.setTimeout(30000);

  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNav: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('renders mapped error in an error box when timerStore.lastError is non-null', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { findByText } = await renderWithApp(
      <TimerScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: fakeWall }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    await act(async () => {
      useTimerStore.setState({ lastError: 'INVALID_TRANSITION' });
    });

    const expectedText = mapTimerError('INVALID_TRANSITION');
    expect(await findByText(expectedText)).toBeTruthy();
  });
});
