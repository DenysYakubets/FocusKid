#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <tag> [notes...]" >&2
  exit 1
fi

TAG="$1"
shift
NOTES="${*:-FocusKid ${TAG}}"
GRADLE_FILE="android/app/build.gradle"
REPO="DenysYakubets/FocusKid"
MANIFEST_URL="https://github.com/${REPO}/releases/latest/download/FocusKid-latest.apk"

if [ ! -f "$GRADLE_FILE" ]; then
  echo "Error: cannot find $GRADLE_FILE" >&2
  exit 1
fi

# Version values live in defaultConfig, which is used by the release application type.
VERSION_CODE=$(sed -n '/defaultConfig[[:space:]]*{/,/^[[:space:]]*}/p' "$GRADLE_FILE" | sed -nE 's/^[[:space:]]*versionCode[[:space:]]+([0-9]+).*$/\1/p' | head -n 1)
VERSION_NAME=$(sed -n '/defaultConfig[[:space:]]*{/,/^[[:space:]]*}/p' "$GRADLE_FILE" | sed -nE 's/^[[:space:]]*versionName[[:space:]]+"([^"]+)".*$/\1/p' | head -n 1)
if [ -z "$VERSION_CODE" ] || [ -z "$VERSION_NAME" ]; then
  echo "Error: versionCode/versionName missing from $GRADLE_FILE defaultConfig" >&2
  exit 1
fi

mkdir -p dist
rm -f dist/FocusKid-*-arm64-release.apk
echo "Downloading arm64 release APK for $TAG..."
gh release download "$TAG" --pattern 'FocusKid-*-arm64-release.apk' --dir dist --clobber
shopt -s nullglob
APKS=(dist/FocusKid-*-arm64-release.apk)
if [ "${#APKS[@]}" -ne 1 ]; then
  echo "Error: expected one versioned arm64 APK in dist, found ${#APKS[@]}" >&2
  exit 1
fi
APK="${APKS[0]}"
SHA256=$(sha256sum "$APK" | awk '{print $1}')
jq -n --arg versionName "$VERSION_NAME" --argjson versionCode "$VERSION_CODE" \
  --arg sha256 "$SHA256" --arg url "$MANIFEST_URL" --arg notes "$NOTES" \
  '{versionName:$versionName,versionCode:$versionCode,sha256:$sha256,url:$url,notes:$notes}' > dist/manifest.json
cp "$APK" dist/FocusKid-latest.apk
echo "Uploading stable update assets to release $TAG..."
gh release upload "$TAG" dist/FocusKid-latest.apk dist/manifest.json --clobber

CONTENTS_PATH="/repos/${REPO}/contents/update-manifest.json"
CURRENT_SHA=""
if CURRENT_CONTENT=$(gh api "${CONTENTS_PATH}?ref=main" 2>/dev/null); then
  CURRENT_SHA=$(printf '%s' "$CURRENT_CONTENT" | jq -r '.sha // empty')
fi
ENCODED=$(base64 < dist/manifest.json | tr -d '\n')
MESSAGE="chore(release): update update-manifest.json for ${TAG}"
PAYLOAD=$(jq -n --arg message "$MESSAGE" --arg content "$ENCODED" --arg sha "$CURRENT_SHA" \
  '{message:$message,content:$content,branch:"main"} + (if $sha == "" then {} else {sha:$sha} end)')
echo "Syncing update-manifest.json to ${REPO}:main..."
if ! printf '%s' "$PAYLOAD" | gh api -X PUT "$CONTENTS_PATH" -H 'Accept: application/vnd.github+json' --input - >/dev/null 2>dist/publish-manifest-error.log; then
  if grep -q 'does not change' dist/publish-manifest-error.log && grep -q '422' dist/publish-manifest-error.log; then
    echo "Manifest already matches main; continuing."
    rm -f dist/publish-manifest-error.log
  else
    cat dist/publish-manifest-error.log >&2
    rm -f dist/publish-manifest-error.log
    exit 1
  fi
fi
echo "Stable update channel published for $TAG."
