import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { UpdateChecker } from '../components/UpdateChecker';
import { isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { downloadApk, installApk } from '../../services/update/downloadApk';
import { uk } from '../../i18n/uk';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-application', () => ({ nativeBuildVersion: '5' }));
jest.mock('../../services/update/downloadApk', () => ({ downloadApk: jest.fn(), installApk: jest.fn() }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } } }));

const goodManifest: UpdateManifest = {
  versionName: '0.1.13', versionCode: 6, sha256: 'a'.repeat(64),
  url: 'https://github.com/DenysYakubets/FocusKid/releases/latest/download/FocusKid-latest.apk', notes: 'Fixes and improvements.',
};
const rawManifest = (manifest: UpdateManifest) => JSON.stringify(manifest);
let originalFetch: typeof globalThis.fetch;
function mockManifest(manifest: UpdateManifest) {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => rawManifest(manifest) }) as unknown as typeof globalThis.fetch;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  (downloadApk as jest.Mock).mockResolvedValue({ uri: 'file:///cache/focuskid-update.apk' });
  (installApk as jest.Mock).mockResolvedValue(undefined);
  originalFetch = globalThis.fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; });

describe('GitHub Releases update checker', () => {
  it('compares version codes and validates manifest fields', () => {
    expect(isNewerVersion(6, 5)).toBe(true);
    expect(isNewerVersion(5, 5)).toBe(false);
    expect(parseUpdateManifest(rawManifest(goodManifest))).toEqual(goodManifest);
    expect(parseUpdateManifest(JSON.stringify({ ...goodManifest, sha256: 'bad' }))).toBeNull();
  });

  it('keeps the newer banner and downloads with progress, retry, and install', async () => {
    let progress: ((percent: number) => void) | undefined;
    let finishDownload: ((file: { uri: string }) => void) | undefined;
    (downloadApk as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_manifest, onProgress) => {
        progress = onProgress;
        return new Promise((resolve) => { finishDownload = resolve; });
      });
    mockManifest(goodManifest);
    const view = await renderWithApp(<UpdateChecker />);
    await view.findByText('Доступне оновлення 0.1.13');
    expect(view.queryByText('Пізніше')).toBeNull();
    expect(uk.updateChecker).not.toHaveProperty('laterA11y');
    fireEvent.press(view.getByLabelText(uk.updateChecker.updateA11y));
    await view.findByText(uk.updateChecker.downloadError);
    fireEvent.press(view.getByLabelText(uk.updateChecker.retryA11y));
    expect(downloadApk).toHaveBeenCalledTimes(2);
    await view.findByText('Завантаження 0%');
    await act(async () => { progress?.(34); });
    await view.findByText('Завантаження 34%');
    await act(async () => { progress?.(71); });
    await view.findByText('Завантаження 71%');
    await act(async () => { finishDownload?.({ uri: 'file:///cache/focuskid-update.apk' }); });
    await act(async () => { await Promise.resolve(); });
    expect(installApk).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///cache/focuskid-update.apk' }), goodManifest.url);
    view.unmount();

    expect(isNewerVersion(5, 5)).toBe(false);
  });

  it('uses share sheet then browser when FileProvider intent throws', async () => {
    (IntentLauncher.startActivityAsync as jest.Mock).mockRejectedValueOnce(new Error('intent failed'));
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('share failed'));
    // The component receives the real fallback ladder through the mocked service in production tests;
    // assert its stage ordering directly here using the service implementation below.
    const actual = jest.requireActual('../../services/update/downloadApk') as typeof import('../../services/update/downloadApk');
    await actual.installApk({ uri: 'file:///cache/focuskid-update.apk' } as any, goodManifest.url);
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalled();
    expect(Sharing.isAvailableAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(goodManifest.url);
  });
});
