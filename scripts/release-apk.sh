#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <tag> [pr-number]"
  exit 1
fi

TAG="$1"
PR_NUMBER="${2:-}"

# Refuse to run if working tree is dirty
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: git working tree is dirty. Commit or stash changes before releasing."
  exit 1
fi

# Refuse to run if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: git tag $TAG already exists."
  exit 1
fi

echo "=== Step 1: Clean install ==="
npm ci

echo "=== Step 2: Tests green ==="
npm test -- --ci

echo "=== Step 3: tsc clean ==="
npx tsc --noEmit

echo "=== Step 4: Static invariants ==="
bash scripts/check-invariants.sh

echo "=== Step 5: Native project generation ==="
npx expo prebuild --platform android --clean

echo "=== Step 6: Gradle debug build ==="
(cd android && ./gradlew assembleDebug)

echo "=== Step 7: Shipped manifest has no INTERNET ==="
if [ ! -d android/app/build/intermediates/merged_manifests/debug ] || grep -rq "android.permission.INTERNET" android/app/build/intermediates/merged_manifests/debug; then
  echo "Error: Merged manifest contains android.permission.INTERNET or was not generated."
  exit 1
fi

echo "=== Step 8: Packaging artifact ==="
mkdir -p dist
APK_TARGET="dist/focuskid-${TAG}-debug.apk"
cp android/app/build/outputs/apk/debug/app-debug.apk "$APK_TARGET"

echo "=== Step 9: Creating GitHub Release ==="
NOTES_FILE=$(mktemp)
cat <<EOF > "$NOTES_FILE"
FocusKid ${TAG} (Offline Debug Build)

- Offline-first child visual timer with parent PIN verification
- INV-01: zero networking, zero ads/analytics/telemetry, blocked INTERNET permission
- INV-08: full landscape and portrait parity
- INV-10: scalable text (16sp body, maxFontScale 3.0) + touch targets >= 48dp + TalkBack
- Self-contained debug APK with bundled JS
EOF

gh release create "$TAG" "$APK_TARGET" \
  --title "FocusKid ${TAG}" \
  --notes-file "$NOTES_FILE" \
  --prerelease

rm -f "$NOTES_FILE"

ASSET_URL=$(gh release view "$TAG" --json assets --jq '.assets[] | select(.name=="focuskid-'"${TAG}"'-debug.apk") | .url')
echo "Asset URL: $ASSET_URL"

if [ -n "$PR_NUMBER" ]; then
  echo "=== Step 10: Commenting on PR #${PR_NUMBER} ==="
  gh pr comment "$PR_NUMBER" --body "📦 APK: $ASSET_URL"
fi

echo "Release $TAG completed successfully."
