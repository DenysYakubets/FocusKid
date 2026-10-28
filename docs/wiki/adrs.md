# 📜 Architecture Decision Records (ADRs) & Constraints

> `VISION.md` remains the authoritative spec and is never edited silently: when an owner decision
> departs from it, the conflict is recorded here and in the stage notes. Invariants INV-01..INV-10
> and `scripts/check-invariants.sh` always win over convenience.

[[index]] | [[knowledge-store]] | [[patterns]]

---

## Active ADRs

### ADR-001: Child-Initiated STOP Dialog (owner order, VISION §1.2 conflict documented)

- **Decision**: The child may stop a Running/Paused session via a `STOP` FSM event behind a Ukrainian
  confirm dialog («Зупинити завдання? / Справді зупинити? / Так · Ні`). The session ends `abandoned`
  through the existing abandon path, requires **no parent token**, and can never reach
  Completed/Verified.
- **Rationale**: `VISION.md §1.2` says «…але не „стоп“ до закінчення», but the product owner
  explicitly ordered the child stop for the UX-fix round. INV-03 stays green because the terminal
  state is `abandoned`, which earns nothing and carries no penalty (INV-09) — the child still cannot
  *complete* a session early. The conflict is flagged instead of silently editing `VISION.md`.
- **Status**: Implemented (`feat/ux-fixes` F3). Evidence: `docs/UX_FIXES_NOTES.md` §F3 (lines 27–37),
  `src/services/timer/timerService.ts#L478-L511`, `src/services/timer/__tests__/timerStop.test.ts`.

### ADR-002: Cheap PBKDF2 (1 000 iterations) with V2 Migration and Lazy Re-Hash

- **Decision**: `PBKDF2_ITERATIONS` is 1 000 (down from 50 000). The algorithm contract is unchanged:
  PBKDF2-HMAC-SHA-256 with a 16-byte local salt and constant-time compare (VISION §2 honoured).
  Migration V2 rebuilds `parent_auth` so the old `iterations >= 50000` CHECK no longer forces the
  slow cost, copying row data verbatim; a legacy 50 000-iteration record verifies once at its stored
  cost and is immediately re-written at the fast cost (the PIN is only known at that moment).
- **Rationale**: This is a local-only kids app (INV-01, no network, no recovery): a single verify
  cost ~430 ms on desktop and ~5 s on the owner's phone, which read as a freeze right after the
  correct PIN. Offline PBKDF2 at 1 000 iterations still keeps a salted per-row hash while making
  verification effectively instant; no crypto hardening beyond the VISION algorithm contract is
  needed here. Lockout behavior (AS-12) and INV-05 are untouched.
- **Status**: Implemented (`feat/ux-fixes` F1). Evidence: `src/services/auth/pinHash.ts#L5-L20`,
  `src/services/auth/__tests__/fastPinVerify.test.ts` (timing <200 ms, V1→V2 migration, lockout),
  `src/services/auth/__tests__/pinHash.test.ts#L64`, `docs/UX_FIXES_NOTES.md` §F1.

### ADR-003: Mascot Is a Child-Side Affordance Only (removed from Stats per INV-05)

- **Decision**: `MascotFloating` renders on child screens only and is never mounted on
  PinGate/parent screens or on `StatsScreen`. The C5 brief's "bottom-left Stats" companion was
  dropped.
- **Rationale**: INV-05/AS-19 say statistics are parent-only. The companion is a child-side
  affordance (it lives in the child shell and on the child Timer), so a parent-only screen must not
  carry child chrome — and it gives the child nothing to tap while the parent reads charts. The
  orchestrator resolved the brief-vs-invariant contradiction in favour of the invariant; the INV-05
  test pins the absence on Stats **behind a real parent session** so `ParentGuard`'s pre-auth `null`
  cannot make the assertion vacuous.
- **Status**: Implemented (`feat/companion-round`, round-1 MED). Evidence:
  `src/screens/StatsScreen.tsx#L187-L191`, `src/ui/components/MascotFloating.tsx#L67`,
  `src/ui/__tests__/mascotFloating.test.tsx#L168-L175`, `docs/UX_FIXES_NOTES.md` §"mascot off Stats".

### ADR-004: GitHub Releases Update Channel (owner approved; INV-01 departure)

- **Decision**: Publish `FocusKid-latest.apk` and `manifest.json` as stable GitHub Release assets,
  with an in-app update banner whose update action opens the browser for the external download.
  This owner-approved feature departs from INV-01's zero-network policy. Keep the INTERNET
  permission blocked and leave TSC-3 / `withNoInternet` unchanged.
- **Rationale**: The release-asset CDN does not send `Access-Control-Allow-Origin`, so the app cannot
  fetch its release `manifest.json` from React Native Web. The app instead reads the synced root
  `update-manifest.json` at `raw.githubusercontent.com`, which sends
  `Access-Control-Allow-Origin: *`. Installation stays in the browser download flow; the app does
  not install packages itself.
- **Status**: Implemented, with two open deployment questions: the in-app check is inert on device
  while INTERNET remains blocked, until the owner explicitly unblocks it; and this repository is
  currently private, so unauthenticated raw and release URLs return 404 until the owner makes it
  public. The 'keep the INTERNET permission blocked and leave TSC-3 / withNoInternet unchanged' clause is superseded by ADR-005 (owner approved the INTERNET permission for the update check).

### ADR-005: INTERNET Permission Granted for Update Check Only (owner approved; amends INV-01)

- **Decision**: Grant `android.permission.INTERNET` in the APK: `app.json` `android.permissions` now includes it, `android.blockedPermissions` no longer blocks it, and the `./plugins/withNoInternet` config plugin is removed, so the in-app UpdateChecker can perform its single GET of `update-manifest.json`. INV-01 is **amended, not deleted**: the app must remain fully functional offline; INTERNET exists solely for the update-check fetch with silent failure; no other feature may require network. Gates TSC-3 / TSC-4 / TSC-18 now assert INTERNET is present and that no plugin strips it.
- **Rationale**: The owner (Denys) approved both making this repository public and adding the permission; without it the update banner shipped in ADR-004 is inert on device. Scope stays minimal — one unauthenticated GET to `raw.githubusercontent.com` (CORS `*`), and any failure is swallowed so the offline experience is unchanged; no analytics/telemetry/ads dependencies are introduced (TSC-5 untouched).
- **Status**: Implemented on `feat/update-channel` (PR #17). Evidence: `app.json` `android.permissions`, `scripts/check-invariants.sh` TSC-3/TSC-4/TSC-18, `test/config/appConfig.inv01.test.ts`, root `update-manifest.json`.
- **Status (scope extension)**: ADR-006 extends this from “update check only” to the update flow.

### ADR-006: In-App APK Download and Direct Install (owner approved; extends INV-01 amendment)

- **Decision**: Replace the browser-first update action with an in-app APK download and direct install flow. A FileProvider config plugin supplies Android cache access, and `expo-intent-launcher` sends an ACTION_VIEW intent with `FLAG_GRANT_READ_URI_PERMISSION`. `expo-sharing` opens a share sheet if the intent fails; `Linking.openURL` is the last resort. The downloaded APK's SHA-256 is verified against `manifest.sha256` before install. INTERNET now serves the whole update flow.
- **Rationale**: The release APK should download and hand off to Android's package installer without losing the in-app context in a browser. The native file digest avoids loading a 30–80 MB APK into JS memory. Every fallback keeps a path available if a device cannot handle the primary intent.
- **Status**: Owner-approved implementation; extends ADR-005's update-check scope. It supersedes ADR-004's “installation stays in the browser / app does not install packages” clause; history is retained.

## Historical / superseded decisions

_None yet. When an ADR is overturned, mark it superseded here and record the replacement ADR — do
not delete history._
