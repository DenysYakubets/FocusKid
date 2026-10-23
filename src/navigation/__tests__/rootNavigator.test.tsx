/** @jest-environment node */
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../RootNavigator';
import { setupTestServices, renderWithApp } from '../../../test/helpers/renderWithApp';
import { uk } from '../../i18n/uk';

describe('RootNavigator fallback on hasPin rejection', () => {
  jest.setTimeout(15000);

  it('falls back to Today route when hasPin rejects instead of stranding on null', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { services } = await setupTestServices();
    jest.spyOn(services.authService, 'hasPin').mockImplementation(() => {
      return Promise.reject(new Error('pin read failed'));
    });

    const { queryByText } = await renderWithApp(<RootNavigator />, { services });

    await waitFor(
      () => {
        expect(queryByText(uk.today.title)).toBeTruthy();
      },
      { timeout: 2000 }
    );

    errorSpy.mockRestore();
  });
});
