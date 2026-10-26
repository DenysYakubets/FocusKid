/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { Share, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { ParentHomeScreen } from '../ParentHomeScreen';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { parentSessionStore } from '../../state/parentSessionStore';
import { logInfo } from '../../services/logging/fileLogger';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../../services/logging/fileLogger', () => ({
  logInfo: jest.fn().mockResolvedValue(undefined), logError: jest.fn(),
  logFileUri: () => 'file:///documents/focuskid.log',
}));
afterEach(() => jest.restoreAllMocks());

async function openAndShare() {
  const { services } = await setupTestServices();
  await services.authService.setupPin('1234');
  services.authService.startParentSession();
  parentSessionStore.setService(services.authService);
  const screen = await renderWithApp(<ParentHomeScreen navigation={{ addListener: () => () => {}, replace: jest.fn() } as any} route={{} as any} />, { services, db: services.db });
  await act(async () => { fireEvent.press(screen.getByLabelText('Поділитися журналом')); });
  screen.unmount();
}

it('prepares and shares the log file URI as a plain text attachment', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
  await openAndShare();
  expect(logInfo).toHaveBeenCalledWith('share: preparing log file');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///documents/focuskid.log', {
    dialogTitle: 'Share FocusKid logs', mimeType: 'text/plain', UTI: 'public.plain-text',
  });
});

it.each(['android', 'ios'] as const)('falls back to a file URL on %s when unavailable', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  await openAndShare();
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///documents/focuskid.log' }), expect.any(Object));
});

it('falls back after a native sharing error and contains fallback failures', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('native failure'));
  const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('fallback failure'));
  await expect(openAndShare()).resolves.toBeUndefined();
  expect(share).toHaveBeenCalled();
});
