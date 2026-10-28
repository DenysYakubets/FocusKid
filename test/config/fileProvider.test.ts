import appJson from '../../app.json';
const withApkFileProvider = require('../../plugins/withApkFileProvider');

describe('withApkFileProvider', () => {
  it('registers plugin in app config', () => {
    expect(appJson.expo.plugins).toContain('./plugins/withApkFileProvider');
  });

  it('adds the non-exported provider with manifest authority placeholder and cache paths', async () => {
    const config = {
      name: 'focuskid',
      slug: 'focuskid',
      modResults: { manifest: { application: [{ $: {}, provider: [] }] } },
      mods: {},
    } as any;
    const transformed = withApkFileProvider(config);
    // Config plugins register mods; execute the manifest mod directly.
    const manifestMod = transformed.mods.android.manifest;
    const result = await manifestMod({ ...transformed, modResults: config.modResults });
    const provider = result.modResults.manifest.application[0].provider[0];
    expect(provider.$).toEqual({
      'android:name': 'androidx.core.content.FileProvider',
      'android:authorities': '${applicationId}.fileprovider',
      'android:exported': 'false',
      'android:grantUriPermissions': 'true',
    });
    expect(provider['meta-data'][0].$).toEqual({
      'android:name': 'android.support.FILE_PROVIDER_PATHS',
      'android:resource': '@xml/file_paths',
    });
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'focuskid-provider-'));
    const dangerousMod = transformed.mods.android.dangerous;
    await dangerousMod({ ...transformed, modRequest: { platformProjectRoot: projectRoot } });
    const pathsXml = fs.readFileSync(path.join(projectRoot, 'app/src/main/res/xml/file_paths.xml'), 'utf8');
    expect(pathsXml).toContain('<cache-path name="cache" path="." />');
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });
});
