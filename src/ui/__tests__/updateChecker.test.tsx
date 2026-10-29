import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { UpdateChecker } from '../components/UpdateChecker';
import { isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { downloadApk, installApk, INSTALL_INTENT_TIMEOUT_MS } from '../../services/update/downloadApk';
import { uk } from '../../i18n/uk';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-application', () => ({ nativeBuildVersion: '5' }));
jest.mock('../../services/update/downloadApk', () => ({
  downloadApk: jest.fn(),
  installApk: jest.fn(),
  PENDING_UPDATE_KEY: '@focuskid/pending_update',
  expectedApkCacheUri: () => 'file:///cache/focuskid-update.apk',
  openCachedApk: (uri: string) => ({ uri, exists: true }),
  reuseVerifiedApk: () => null,
  ApkDigestMismatchError: class MockApkDigestMismatchError extends Error {},
}));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache' } },
  File: class MockFile {
    uri: string;
    exists = true;
    constructor(uri: string) { this.uri = uri; }
  },
}));

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

  it('restores a verified ready update and installs it without downloading', async () => {
    mockManifest(goodManifest);
    const view = await renderWithApp(<UpdateChecker />);
    await view.findByText('Доступне оновлення 0.1.13');
    jest.spyOn(view.services.settingsRepo, 'get').mockResolvedValue(JSON.stringify({
      versionCode: goodManifest.versionCode,
      url: goodManifest.url,
      filePath: 'file:///cache/focuskid-update.apk',
      phase: 'ready',
    }));
    view.unmount();

    const resumed = await renderWithApp(<UpdateChecker />, { services: view.services });
    await resumed.findByText(uk.updateChecker.ready);
    fireEvent.press(resumed.getByLabelText(uk.updateChecker.updateA11y));
    await waitFor(() => expect(installApk).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///cache/focuskid-update.apk' }), goodManifest.url,
    ));
    expect(downloadApk).not.toHaveBeenCalled();
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

  it('continues the fallback ladder when the installer intent never returns', async () => {
    jest.setTimeout(INSTALL_INTENT_TIMEOUT_MS + 5000);
    (IntentLauncher.startActivityAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('browser failed'));
    const actual = jest.requireActual('../../services/update/downloadApk') as typeof import('../../services/update/downloadApk');
    await expect(actual.installApk({ uri: 'file:///cache/focuskid-update.apk' } as any, goodManifest.url)).rejects.toThrow('browser failed');
    expect(Sharing.isAvailableAsync).toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(goodManifest.url);
  });

  it('shares one actual install flight for concurrent calls with the same file URI', async () => {
    const actual = jest.requireActual('../../services/update/downloadApk') as typeof import('../../services/update/downloadApk');
    (IntentLauncher.startActivityAsync as jest.Mock).mockResolvedValue(undefined);
    const file = { uri: 'file:///cache/one.apk' } as any;
    await Promise.all([
      actual.installApk(file, goodManifest.url),
      actual.installApk(file, goodManifest.url),
    ]);
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledTimes(1);
  });

  it('shows an error and retry action when install fails after download', async () => {
    (installApk as jest.Mock).mockRejectedValueOnce(new Error('all install options failed'));
    mockManifest(goodManifest);
    const view = await renderWithApp(<UpdateChecker />);
    await view.findByText('Доступне оновлення 0.1.13');
    fireEvent.press(view.getByLabelText(uk.updateChecker.updateA11y));
    await waitFor(() => expect(downloadApk).toHaveBeenCalled());
    await view.findByText(uk.updateChecker.downloadError);
    expect(view.getByLabelText(uk.updateChecker.retryA11y)).toBeTruthy();
  });
});
