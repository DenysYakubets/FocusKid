import { Alert, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { installApk } from '../downloadApk';
import { logError, logInfo } from '../../logging/fileLogger';

jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: {
    cache: { uri: 'file:///cache' },
    document: { uri: 'file:///document' },
  },
  File: class MockFile {
    uri: string;
    exists = true;
    constructor(uri: string) { this.uri = uri; }
  },
  DownloadTask: class MockDownloadTask {},
}));
jest.mock('../../logging/fileLogger', () => ({
  log: jest.fn(async () => {}),
  logInfo: jest.fn(async () => {}),
  logError: jest.fn(async () => {}),
  readLogContent: jest.fn(async () => ''),
  logFileUri: () => 'file:///document/focuskid.log',
}));

const MANIFEST_URL = 'https://github.com/DenysYakubets/FocusKid/releases/latest/download/FocusKid-latest.apk';
const infoLines = () => (logInfo as unknown as jest.Mock).mock.calls.map((call) => String(call[0]));
const errorLines = () => (logError as unknown as jest.Mock).mock.calls.map((call) => String(call[0]));

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((() => undefined) as unknown as typeof Alert.alert);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

describe('in-app install result reporting', () => {
  it('logs the real resultCode and alerts when the installer returns RESULT_CANCELED', async () => {
    (IntentLauncher.startActivityAsync as jest.Mock).mockResolvedValueOnce({ resultCode: 0 });

    await expect(installApk({ uri: 'file:///cache/canceled.apk' } as never, MANIFEST_URL))
      .rejects.toThrow(/RESULT_CANCELED/);

    const logged = infoLines().join('\n');
    expect(logged).toContain('update install stage=1 resultCode=0');
    expect(logged).toContain('update install stage=1 dismissed');
    // Silence must never masquerade as success.
    expect(logged).not.toContain('update install route success stage=1');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Встановлення не завершено');
    // The dismissal dialog replaces the fallback ladder instead of stacking on it.
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('treats RESULT_OK as the only success and does not alert', async () => {
    (IntentLauncher.startActivityAsync as jest.Mock).mockResolvedValueOnce({ resultCode: -1 });

    await expect(installApk({ uri: 'file:///cache/ok.apk' } as never, MANIFEST_URL)).resolves.toBeUndefined();

    const logged = infoLines().join('\n');
    expect(logged).toContain('update install stage=1 resultCode=-1');
    expect(logged).toContain('update install route success stage=1');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('logs and falls through the ladder when resultCode is neither OK nor CANCELED', async () => {
    (IntentLauncher.startActivityAsync as jest.Mock).mockResolvedValueOnce({ resultCode: 1 });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValueOnce(undefined);

    await expect(installApk({ uri: 'file:///cache/unknown.apk' } as never, MANIFEST_URL)).resolves.toBeUndefined();

    expect(infoLines().join('\n')).toContain('update install stage=1 resultCode=1');
    expect(errorLines().join('\n')).toContain('unexpected resultCode=1');
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});