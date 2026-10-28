/** @jest-environment node */
import React from 'react';
import { act } from '@testing-library/react-native';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { WallClock } from '../../services/clock/wallClock';
import { UpdateManifest } from '../../services/update/checkForUpdate';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { ParentHomeScreen } from '../ParentHomeScreen';
import { parentSessionStore } from '../../state/parentSessionStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-application', () => ({ nativeBuildVersion: '5' }));
jest.mock('../../services/update/downloadApk', () => ({
  downloadApk: jest.fn(),
  installApk: jest.fn(),
  PENDING_UPDATE_KEY: '@focuskid/pending_update',
  expectedApkCacheUri: () => 'file:///cache/focuskid-update.apk',
  openCachedApk: (uri: string) => ({ uri, exists: true }),
}));
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
}));

// Same manifest shape as src/ui/__tests__/updateChecker.test.tsx mockManifest.
const newerManifest: UpdateManifest = {
  versionName: '0.1.13',
  versionCode: 6,
  sha256: 'a'.repeat(64),
  url: 'https://github.com/DenysYakubets/FocusKid/releases/latest/download/FocusKid-latest.apk',
  notes: 'Fixes and improvements.',
};
let originalFetch: typeof globalThis.fetch;
function mockManifest(manifest: UpdateManifest) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(manifest),
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('ParentHomeScreen update card', () => {
  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  const mockNavigation: any = {
    navigate: jest.fn(),
    reset: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };

  it('renders the update card when manifest versionCode (6) > current (5)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const { services } = await setupTestServices({ db, clock, wall: fakeWall });

    await services.authService.setupPin('1234');
    services.authService.startParentSession();
    parentSessionStore.setService(services.authService);

    mockManifest(newerManifest);

    const view = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: fakeWall, services }
    );

    await act(async () => {});
    expect(await view.findByText('Доступне оновлення 0.1.13')).toBeTruthy();
  });
});