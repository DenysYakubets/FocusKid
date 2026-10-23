/** @jest-environment node */
import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react-native';
import { uk } from '../i18n/uk';

const mockOpenExpoDb = jest.fn(() => Promise.reject(new Error('db exploded')));

jest.mock('../services/db/expoDb', () => ({
  openExpoDb: () => mockOpenExpoDb(),
}));

import App from '../../App';

describe('App Bootstrap', () => {
  jest.setTimeout(15000);

  beforeEach(() => {
    mockOpenExpoDb.mockClear();
    mockOpenExpoDb.mockImplementation(() => Promise.reject(new Error('db exploded')));
  });

  it('renders error boundary retry screen on bootstrap failure instead of blank loading', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      render(<App />);
    });

    const errorTitle = await screen.findByText(uk.errorBoundary.title, {}, { timeout: 2000 });
    expect(errorTitle).toBeTruthy();

    const retryButton = screen.getByLabelText(uk.errorBoundary.retry);
    expect(retryButton).toBeTruthy();

    const initialCalls = mockOpenExpoDb.mock.calls.length;
    await act(async () => {
      fireEvent.press(retryButton);
    });

    expect(mockOpenExpoDb.mock.calls.length).toBeGreaterThan(initialCalls);

    errorSpy.mockRestore();
  });
});
