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

# TSC-5: INV-01 No networking/analytics dependencies or calls
if ! grep -qF -e '"firebase"' -e '@react-native-firebase/' -e '@sentry/' -e 'sentry-expo' -e '"axios"' -e '"expo-updates"' -e '"expo-notifications"' -e '"expo-network"' -e '@react-native-community/netinfo' -e 'google-mobile-ads' -e 'react-native-iap' -e 'expo-in-app-purchases' -e '@segment/' -e 'mixpanel' -e '@amplitude/' package.json && ! grep -rnE -e "\bfetch\(" -e "XMLHttpRequest" -e "new WebSocket\(" src App.tsx; then
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

# TSC-12: INV-07 SQLite only, no alternative storage (static half)
if grep -qF '"expo-sqlite"' package.json && ! grep -qF -e '@react-native-async-storage/' -e 'react-native-mmkv' -e '"realm"' -e 'watermelondb' -e 'expo-secure-store' -e 'expo-file-system' package.json && ! grep -rnF -e "AsyncStorage" -e "localStorage" src; then
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

# TSC-15: INV-10 Typography >= 48sp, no raw fontSize (static half)
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
