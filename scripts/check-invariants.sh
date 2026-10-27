#!/usr/bin/env bash
set -euo pipefail

# TSC-2: Strict TypeScript
if npx tsc --noEmit && grep -qE '"strict":\s*true' tsconfig.json; then
  echo "PASS TSC-2"
else
  echo "FAIL TSC-2"
  exit 1
fi

# TSC-3: INV-01 app.json permissions
if node -e "const a=require('./app.json').expo.android;const b=a.blockedPermissions ?? [];const p=a.permissions ?? [];process.exit(b.includes('android.permission.INTERNET') && !p.includes('android.permission.INTERNET') ? 0 : 1)"; then
  echo "PASS TSC-3"
else
  echo "FAIL TSC-3"
  exit 1
fi

# TSC-4: INV-01 Merged AndroidManifest has no INTERNET (requires Gradle build)
if test -d android/app/build/intermediates/merged_manifests/debug; then
  if ! grep -rq "android.permission.INTERNET" android/app/build/intermediates/merged_manifests/debug; then
    echo "PASS TSC-4"
  else
    echo "FAIL TSC-4"
    exit 1
  fi
else
  echo "SKIP TSC-4 (requires Gradle build)"
fi

# TSC-5: INV-01 networking/analytics ban with owner-approved update-check allowlist
if ! grep -qF -e '"firebase"' -e '@react-native-firebase/' -e '@sentry/' -e 'sentry-expo' -e '"axios"' -e '"expo-updates"' -e '"expo-notifications"' -e '"expo-network"' -e '@react-native-community/netinfo' -e 'google-mobile-ads' -e 'react-native-iap' -e 'expo-in-app-purchases' -e '@segment/' -e 'mixpanel' -e '@amplitude/' package.json && ! grep -rnE -e "XMLHttpRequest" -e "new WebSocket\(" src App.tsx && node <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
let matches;
try {
  matches = execFileSync('grep', ['-rlE', '\\bfetch\\(', 'src', 'App.tsx'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (error) {
  if (error.status !== 1) throw error;
  matches = [];
}
const allowed = new Set(['src/services/update/checkForUpdate.ts', 'src/ui/components/UpdateChecker.tsx']);
if (matches.some(name => !allowed.has(name))) process.exit(1);
NODE
then
  echo "PASS TSC-5"
else
  echo "FAIL TSC-5"
  exit 1
fi

# TSC-6: INV-02 Monotonic clock and Date restrictions
if ! grep -rnE --exclude-dir=__tests__ -e "Date\.now\(" -e "\.getTime\(\)" -e "performance\.timeOrigin" src App.tsx && ! grep -rnF --exclude-dir=__tests__ --exclude=wallClock.ts "new Date(" src App.tsx && grep -qF "performance.now()" src/services/clock/monotonic.ts; then
  echo "PASS TSC-6"
else
  echo "FAIL TSC-6"
  exit 1
fi

# TSC-12: INV-07 SQLite business data; reviewed file allowlist — diagnostic log + task JSON backup (owner-requested)
if grep -qF '"expo-sqlite"' package.json && ! grep -qF -e '@react-native-async-storage/' -e 'react-native-mmkv' -e '"realm"' -e 'watermelondb' -e 'expo-secure-store' package.json && ! grep -rnF -e "AsyncStorage" -e "localStorage" src && node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const logger = 'src/services/logging/fileLogger.ts';
const transfer = 'src/screens/ParentHomeScreen.tsx';
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    // Jest mocks are not runtime consumers of the storage dependency.
    if (entry.name === '__tests__' || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return [];
    return entry.isDirectory() ? sources(name) : [name];
  });
}
const consumers = [...sources('src'), 'App.tsx']
  .filter(name => fs.readFileSync(name, 'utf8').includes('expo-file-system'));
const installed = Object.keys({
  ...require('./package.json').dependencies,
  ...require('./package.json').devDependencies,
}).includes('expo-file-system');
if (consumers.length !== 2 || ![logger, transfer].every(name => consumers.includes(name)) ||
    (installed && !consumers.includes(logger))) {
  process.exit(1);
}
if (consumers.includes(logger)) {
  const source = fs.readFileSync(logger, 'utf8');
  // Accept only the reviewed named imports and literal document/log constructors.
  // Any remaining File/Paths/Directory use requires explicit review of this gate.
  const imports = /import\s*\{\s*File\s*,\s*Paths\s*\}\s*from\s*['"]expo-file-system['"];?/g;
  const opens = /new\s+File\(\s*Paths\.document\s*,\s*'focuskid\.log'\s*\)/g;
  if ((source.match(imports) ?? []).length !== 1 || !(source.match(opens) ?? []).length) process.exit(1);
  const remainder = source.replace(imports, '').replace(opens, '');
  if (/\b(File|Paths|Directory)\b|expo-file-system/.test(remainder)) process.exit(1);
}
if (consumers.includes(transfer)) {
  const source = fs.readFileSync(transfer, 'utf8');
  const imports = /import\s*\{\s*File\s*,\s*Paths\s*\}\s*from\s*['"]expo-file-system['"];?/g;
  const target = /new\s+File\(\s*Paths\.document\s*,\s*'focuskid-tasks\.json'\s*\)/g;
  const pickedFile = /new\s+File\(\s*result\.assets\[0\]\.uri\s*\)/g;
  if ((source.match(imports) ?? []).length !== 1 || !source.includes("new File(Paths.document, 'focuskid-tasks.json')") || !(source.match(target) ?? []).length ||
      !(source.match(pickedFile) ?? []).length || !source.includes('file.write(') || !source.includes('file.uri')) process.exit(1);
  const remainder = source.replace(imports, '').replace(target, '').replace(pickedFile, '')
    .replace(/file\.write\(/g, '').replace(/file\.uri/g, '').replace(/new\s+File\(/g, '');
  if (/expo-file-system|\bPaths\s*\.|\bDirectory\b/.test(remainder)) process.exit(1);
}
NODE
then
  echo "PASS TSC-12"
else
  echo "FAIL TSC-12"
  exit 1
fi

# TSC-14: INV-09 No dark patterns or penalties
if ! grep -rniF --exclude-dir=__tests__ -e streak -e paywall -e purchase -e subscription -e advert -e admob -e реклам -e підписк -e штраф src; then
  echo "PASS TSC-14"
else
  echo "FAIL TSC-14"
  exit 1
fi

# TSC-15: INV-10 no raw fontSize literals outside theme.ts (amended INV-10)
if ! grep -rnE --exclude=theme.ts --exclude-dir=__tests__ "fontSize:\s*[0-9]" src App.tsx; then
  echo "PASS TSC-15"
else
  echo "FAIL TSC-15"
  exit 1
fi

# TSC-16: INV-10 Pressable only via TapTarget (static half)
if ! grep -rlE --include=*.tsx --exclude=TapTarget.tsx -e "<Pressable\b" -e "<Touchable[A-Za-z]*\b" -e "<Button\b" src; then
  echo "PASS TSC-16"
else
  echo "FAIL TSC-16"
  exit 1
fi

# TSC-17: Distribution binary hygiene
if test -z "$(git ls-files '*.apk' '*.aab')" && grep -qxF '*.apk' .gitignore && grep -qxF 'android/' .gitignore && grep -qxF 'dist/' .gitignore; then
  echo "PASS TSC-17"
else
  echo "FAIL TSC-17"
  exit 1
fi

# TSC-18: INV-01 Config plugins registered and tested
if grep -qF './plugins/withNoInternet' app.json && grep -qF './plugins/withBundledDebugJs' app.json && npm test -- --ci test/config; then
  echo "PASS TSC-18"
else
  echo "FAIL TSC-18"
  exit 1
fi

# TSC-19: Build debug APK produced by Gradle (requires Gradle build)
if test -s android/app/build/outputs/apk/debug/app-debug.apk; then
  echo "PASS TSC-19"
else
  echo "SKIP TSC-19 (requires Gradle build)"
fi

# TSC-20: Distribution published release (requires published release)
if test -d /tmp/fk-release-verify && test -f /tmp/fk-release-verify/focuskid-v0.1.0-debug.apk; then
  echo "PASS TSC-20"
else
  echo "SKIP TSC-20 (requires published release)"
fi
