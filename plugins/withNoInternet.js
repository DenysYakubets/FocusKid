const { withAndroidManifest, withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function removeInternetPermission(androidManifest) {
  if (!androidManifest) {
    androidManifest = {};
  }
  if (!androidManifest.manifest) {
    androidManifest.manifest = {};
  }
  if (!androidManifest.manifest.$) {
    androidManifest.manifest.$ = {};
  }
  androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

  if (!Array.isArray(androidManifest.manifest['uses-permission'])) {
    androidManifest.manifest['uses-permission'] = [];
  }

  // Remove any existing INTERNET permission elements
  const existing = androidManifest.manifest['uses-permission'].filter(
    (item) => item?.$?.['android:name'] !== 'android.permission.INTERNET'
  );

  // Add the explicit remove node
  existing.push({
    $: {
      'android:name': 'android.permission.INTERNET',
      'tools:node': 'remove',
    },
  });

  androidManifest.manifest['uses-permission'] = existing;
  return androidManifest;
}

function stripInternetFromDebugManifest(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const regex = /<uses-permission[^>]*android:name=["']android\.permission\.INTERNET["'][^>]*\/>\s*/g;
    content = content.replace(regex, '');
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function withNoInternet(config) {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = removeInternetPermission(modConfig.modResults);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot =
        modConfig.modRequest.platformProjectRoot ||
        path.join(modConfig.modRequest.projectRoot, 'android');
      const debugManifestPath = path.join(
        projectRoot,
        'app',
        'src',
        'debug',
        'AndroidManifest.xml'
      );
      const debugOptimizedManifestPath = path.join(
        projectRoot,
        'app',
        'src',
        'debugOptimized',
        'AndroidManifest.xml'
      );

      stripInternetFromDebugManifest(debugManifestPath);
      stripInternetFromDebugManifest(debugOptimizedManifestPath);

      return modConfig;
    },
  ]);

  return config;
}

const plugin = createRunOncePlugin(withNoInternet, 'withNoInternet', '1.0.0');
plugin.removeInternetPermission = removeInternetPermission;
module.exports = plugin;
