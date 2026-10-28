import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { installedAppVersion } from '../appVersion';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '3.4.5' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

describe('installedAppVersion', () => {
  it('prefers the native application version', () => {
    expect(installedAppVersion()).toBe('3.4.5');
  });

  it('falls back to expo config version when native version is absent', () => {
    jest.doMock('expo-application', () => ({ nativeApplicationVersion: null }));
    jest.resetModules();
    const { installedAppVersion: versionWithFallback } = require('../appVersion') as typeof import('../appVersion');
    expect(versionWithFallback()).toBe('0.1.0');
    expect(Constants.expoConfig?.version).toBe('0.1.0');
  });
});
