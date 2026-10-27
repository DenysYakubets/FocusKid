import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import appJson from '../../app.json';

describe('INV-01: App Configuration and Manifest Transformation', () => {
  it('asserts INTERNET is granted solely for the update-check fetch (amended INV-01)', () => {
    const android = appJson.expo.android;
    expect(android.permissions).toContain('android.permission.INTERNET');
    expect(android.blockedPermissions).not.toContain('android.permission.INTERNET');
    expect(android.blockedPermissions).toContain('android.permission.ACCESS_NETWORK_STATE');
    expect(appJson.expo.orientation).toBe('default');

    const plugins = appJson.expo.plugins;
    expect(plugins).toContain('./plugins/withBundledDebugJs');
    expect(plugins).not.toContain('./plugins/withNoInternet');
  });

  it('no config plugin strips INTERNET from any manifest', () => {
    const pluginsDir = path.resolve(__dirname, '../..', 'plugins');
    const strippingFiles = readdirSync(pluginsDir)
      .filter((file) => file.endsWith('.js'))
      .filter((file) => {
        const content = readFileSync(path.join(pluginsDir, file), 'utf8');
        return content.includes("'android.permission.INTERNET'") && content.includes('tools:node');
      });

    expect(strippingFiles).toHaveLength(0);
  });
});
