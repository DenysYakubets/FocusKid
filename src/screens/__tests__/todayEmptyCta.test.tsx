/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { TodayScreen } from '../TodayScreen';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { uk } from '../../i18n/uk';
import { tasksStore } from '../../state/tasksStore';

describe('TodayScreen empty-state CTA', () => {
  jest.setTimeout(15000);

  it('renders parent CTA button when today task list is empty and navigates to PinGate', async () => {
    const db = createNodeDb();
    const mockNav: any = {
      navigate: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };

    const { services, getByLabelText } = await renderWithApp(
      <TodayScreen navigation={mockNav} route={{} as any} />,
      { db }
    );

    // Archive all tasks in DB and refresh store
    await db.run('UPDATE tasks SET archived = 1;');
    await act(async () => {
      await tasksStore.refreshToday(services);
    });

    const cta = getByLabelText(uk.today.emptyCta);
    expect(cta).toBeTruthy();

    act(() => {
      fireEvent.press(cta);
    });

    expect(mockNav.navigate).toHaveBeenCalledWith('PinGate', {
      intent: 'enterParent',
    });
  });
});
