import appJson from '../../app.json';
import { removeInternetPermission } from '../../plugins/withNoInternet';

describe('INV-01: App Configuration and Manifest Transformation', () => {
  it('asserts that app.json strictly blocks INTERNET and enforces offline defaults', () => {
    const androidConfig = appJson.expo.android;
    expect(androidConfig.blockedPermissions).toContain('android.permission.INTERNET');
    expect(androidConfig.permissions).not.toContain('android.permission.INTERNET');
    expect(appJson.expo.orientation).toBe('default');

    const plugins = appJson.expo.plugins;
    expect(plugins).toContain('./plugins/withNoInternet');
  });

  it('unit-tests the manifest transform on a fixture containing INTERNET permission', () => {
    const fixtureManifest = {
      manifest: {
        $: {
          'xmlns:android': 'http://schemas.android.com/apk/res/android',
        },
        'uses-permission': [
          { $: { 'android:name': 'android.permission.INTERNET' } },
          { $: { 'android:name': 'android.permission.VIBRATE' } },
        ],
      },
    };

    const transformed = removeInternetPermission(fixtureManifest as any);

    // Asserts xmlns:tools namespace is set
    expect(transformed.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');

    // Asserts INTERNET permission now has tools:node="remove"
    const permissions = transformed.manifest['uses-permission'];
    const internetPerm = permissions.find(
      (p: any) => p.$['android:name'] === 'android.permission.INTERNET'
    );
    expect(internetPerm).toBeDefined();
    expect(internetPerm?.$['tools:node']).toBe('remove');

    // Asserts VIBRATE is still present
    const vibratePerm = permissions.find(
      (p: any) => p.$['android:name'] === 'android.permission.VIBRATE'
    );
    expect(vibratePerm).toBeDefined();
    expect(vibratePerm?.$['tools:node']).toBeUndefined();
  });
});
