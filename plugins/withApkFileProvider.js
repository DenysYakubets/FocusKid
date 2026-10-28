const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');

function withApkFileProvider(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android manifest application element is missing');
    application.provider ??= [];
    const exists = application.provider.some((provider) =>
      String(provider.$?.['android:authorities'] ?? '').includes('.fileprovider'));
    if (!exists) {
      application.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': '${applicationId}.fileprovider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.support.FILE_PROVIDER_PATHS',
            'android:resource': '@xml/file_paths',
          },
        }],
      });
    }
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const xmlDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(xmlDirectory, { recursive: true });
    fs.writeFileSync(path.join(xmlDirectory, 'file_paths.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="cache" path="." /></paths>\n');
    return modConfig;
  }]);
}

module.exports = createRunOncePlugin(withApkFileProvider, 'withApkFileProvider', '1.0.0');
