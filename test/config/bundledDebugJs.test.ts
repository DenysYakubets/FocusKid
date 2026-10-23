import appJson from '../../app.json';
const { insertBundledDebugJs } = require('../../plugins/withBundledDebugJs');

describe('withBundledDebugJs Plugin', () => {
  it('asserts that app.json registers ./plugins/withBundledDebugJs', () => {
    const plugins = appJson.expo.plugins;
    expect(plugins).toContain('./plugins/withBundledDebugJs');
  });

  it('inserts debuggableVariants = [] idempotently into a fixture build.gradle', () => {
    const fixtureGradle = `
apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
    /* Folders */
    //   root = file("../../")
}

android {
    namespace "com.focuskid.app"
    defaultConfig {
        applicationId "com.focuskid.app"
    }
}
`;

    // First transform
    const transformedOnce = insertBundledDebugJs(fixtureGradle);
    expect(transformedOnce).toContain('debuggableVariants = []');

    const occurrencesOnce = (transformedOnce.match(/debuggableVariants\s*=\s*\[\]/g) || []).length;
    expect(occurrencesOnce).toBe(1);

    // Second transform to test idempotency
    const transformedTwice = insertBundledDebugJs(transformedOnce);
    expect(transformedTwice).toBe(transformedOnce);

    const occurrencesTwice = (transformedTwice.match(/debuggableVariants\s*=\s*\[\]/g) || []).length;
    expect(occurrencesTwice).toBe(1);
  });
});
