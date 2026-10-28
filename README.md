# FocusKid

FocusKid is an honest, offline-first child visual timer and task management application designed for parents and children.

## Key Features

- **Honest Visual Timer (INV-03, INV-04):** The child cannot stop or complete a timer prematurely. Pauses are strictly bounded to 5 minutes total per session with automatic resumption.
- **Parent Verification & Protection (INV-05, INV-06):** Completed tasks must be verified by a parent with a local PBKDF2-hashed PIN. Verified sessions are immutable in the SQLite database.
- **100% Offline & Private (INV-01, amended):** `android.permission.INTERNET` is granted solely for the update flow — one silent GET of `update-manifest.json` (silent manifest check) plus a user-initiated APK download from GitHub (ADR-005/ADR-006). The app remains fully functional offline with zero telemetry/analytics/ads.
- **Monotonic Duration Timing (INV-02):** Timer durations rely solely on monotonic time (`performance.now()`), completely immune to device clock tampering or timezone jumps.
- **Positive Framing Only (INV-09):** No punishment, no negative badges, and no streak pressures. Missing days or sessions simply show 0 with zero shame copy.
- **Accessible & Adaptive (INV-08, INV-10):** Full portrait and landscape (Desk-Clock) parity. Typography is ≥ 48sp, and all interactive touch targets are ≥ 48×48dp with comprehensive TalkBack accessibility labels and roles. High-contrast colors meeting WCAG AA (≥ 4.5:1).

## PIN & No-Recovery Notice (AS-13)

> **Important Notice on Parent PIN Recovery:**
> FocusKid deliberately does not possess internet access, backend servers, or SMS/email recovery mechanisms.
> If the parent PIN is forgotten, there is **no recovery backdoor**. The only way to reset the PIN is by clearing the application data in the Android system settings (`Settings -> Apps -> FocusKid -> Clear Data`), which resets the database.

## Development Commands

```bash
# Run unit and integration test suite
npm test -- --ci

# Type-check TypeScript in strict mode
npx tsc --noEmit

# Verify static technical invariants (TSC-2 through TSC-18)
bash scripts/check-invariants.sh
```

## Release Procedure

To produce a self-contained offline debug APK and publish a GitHub release:

```bash
# Format: bash scripts/release-apk.sh <tag> [pr-number]
bash scripts/release-apk.sh v0.1.0
```

The script runs the following steps in sequence:
1. `npm ci`
2. `npm test -- --ci`
3. `npx tsc --noEmit`
4. `bash scripts/check-invariants.sh`
5. `npx expo prebuild --platform android --clean`
6. `cd android && ./gradlew assembleDebug`
7. Verifies the merged manifest has no `android.permission.INTERNET` permission
8. Packages `dist/focuskid-<tag>-debug.apk`
9. Creates a GitHub release using `gh release create`
10. Optionally posts the download link to the pull request
