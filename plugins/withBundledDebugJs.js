const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

function insertBundledDebugJs(buildGradle) {
  if (!buildGradle) {
    return buildGradle;
  }

  // Idempotent: if already present, do not duplicate
  if (buildGradle.includes('debuggableVariants = []')) {
    return buildGradle;
  }

  const reactBlockRegex = /(react\s*\{)/;
  if (reactBlockRegex.test(buildGradle)) {
    return buildGradle.replace(
      reactBlockRegex,
      `$1\n    debuggableVariants = []`
    );
  }

  // Fallback if react block not found
  return buildGradle + `\nreact {\n    debuggableVariants = []\n}\n`;
}

function withBundledDebugJs(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = insertBundledDebugJs(modConfig.modResults.contents);
    return modConfig;
  });
}

const plugin = createRunOncePlugin(withBundledDebugJs, 'withBundledDebugJs', '1.0.0');
plugin.insertBundledDebugJs = insertBundledDebugJs;
module.exports = plugin;
