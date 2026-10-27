/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import * as Application from 'expo-application';
import { Linking } from 'react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { UpdateChecker } from '../components/UpdateChecker';
import { isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { uk } from '../../i18n/uk';

jest.mock('expo-application', () => ({ nativeBuildVersion: '5' }));


const goodManifest: UpdateManifest = {
  versionName: '0.1.13',
  versionCode: 6,
  sha256: 'a'.repeat(64),
  url: 'https://github.com/DenysYakubets/FocusKid/releases/latest/download/FocusKid-latest.apk',
  notes: 'Fixes and improvements.',
};
const rawManifest = (manifest: UpdateManifest) => JSON.stringify(manifest);
let originalFetch: typeof globalThis.fetch;

function mockManifest(manifest: UpdateManifest) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => rawManifest(manifest),
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitHub Releases update checker', () => {
  it('compares version codes and validates every manifest field', () => {
    expect(isNewerVersion(6, 5)).toBe(true);
    expect(isNewerVersion(5, 5)).toBe(false);
    expect(isNewerVersion(4, 5)).toBe(false);
    expect(parseUpdateManifest(rawManifest(goodManifest))).toEqual(goodManifest);
    const missing = { ...goodManifest } as Partial<UpdateManifest>;
    delete missing.notes;
    expect(parseUpdateManifest(JSON.stringify(missing))).toBeNull();
    expect(parseUpdateManifest(JSON.stringify({ ...goodManifest, versionCode: '6' }))).toBeNull();
    expect(parseUpdateManifest(JSON.stringify({ ...goodManifest, sha256: 'bad' }))).toBeNull();
  });

  it('shows the banner only when the manifest version code is newer', async () => {
    mockManifest(goodManifest);
    const newer = await renderWithApp(<UpdateChecker />);
    expect(await newer.findByText('Доступне оновлення 0.1.13')).toBeTruthy();
    newer.unmount();

    const noBannerFor = async (versionCode: number) => {
      mockManifest({ ...goodManifest, versionCode });
      const view = await renderWithApp(<UpdateChecker />);
      await act(async () => { await Promise.resolve(); });
      expect(view.queryByText(/Доступне оновлення/)).toBeNull();
      view.unmount();
    };
    await noBannerFor(5);
    await noBannerFor(4);
  });

  it('dismisses the same version persistently and shows a higher version', async () => {
    const databaseServices = await renderWithApp(<UpdateChecker />);
    const { db, clock, wall } = databaseServices;
    databaseServices.unmount();

    mockManifest(goodManifest);
    const first = await renderWithApp(<UpdateChecker />, { db, clock, wall });
    const later = await first.findByLabelText(uk.updateChecker.laterA11y);
    await act(async () => { fireEvent.press(later); });
    await act(async () => { await Promise.resolve(); });
    expect(first.queryByText(/Доступне оновлення/)).toBeNull();
    first.unmount();

    const same = await renderWithApp(<UpdateChecker />, { db, clock, wall });
    await act(async () => { await Promise.resolve(); });
    expect(same.queryByText(/Доступне оновлення/)).toBeNull();
    same.unmount();

    mockManifest({ ...goodManifest, versionName: '0.1.14', versionCode: 7 });
    const higher = await renderWithApp(<UpdateChecker />, { db, clock, wall });
    expect(await higher.findByText('Доступне оновлення 0.1.14')).toBeTruthy();
    higher.unmount();
  });

  it('opens the release URL in the browser when update is selected', async () => {
    mockManifest(goodManifest);
    const screen = await renderWithApp(<UpdateChecker />);
    const update = await screen.findByLabelText(uk.updateChecker.updateA11y);
    await act(async () => { fireEvent.press(update); });
    expect(Linking.openURL).toHaveBeenCalledWith(goodManifest.url);
    screen.unmount();
  });
});
