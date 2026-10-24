# UX fix round — owner items F1..F7 (`feat/ux-fixes`)

Baseline `main @ 4592618`. All seven items from the owner's v0.1.2 phone test.
RED evidence: `docs/evidence/ux-fixes-red.log` (11 suites / 14 tests failed on the
pre-fix tree). Gates: `npx tsc --noEmit`, `npm test -- --ci`, `bash scripts/check-invariants.sh`.

## F1 — instant PIN gate
- `PBKDF2_ITERATIONS` 50 000 → **1 000** (`src/services/auth/pinHash.ts`); algorithm
  stays PBKDF2/SHA-256 with a local salt (VISION §2 honoured). A single verify now
  costs ~10ms here vs ~430ms before (~5s on the owner's phone — Hermes has no JIT).
- **Migration V2** (`src/services/db/schema.ts`): rebuilds `parent_auth` so the
  `iterations >= 50000` CHECK no longer forces the slow cost. Row data is copied
  verbatim, so legacy records keep verifying.
- **Lazy re-hash** (`authService.attempt`): a legacy 50k record verifies once with
  its stored cost and is immediately re-written at the fast cost — the PIN is only
  known at that moment, so this is the one instant a legacy record can migrate.
  After the first correct entry every gate open is fast; no lockout/INV-05 change.
- Tests: `fastPinVerify.test.ts` (timing <200ms, legacy migration, lockout intact),
  `pinHash.test.ts` updated (was pinned to 50 000).

## F2 — system bars
- New `src/ui/components/AppFrame.tsx` wraps the navigation tree in `App.tsx` and
  applies `useSafeAreaInsets().top/.bottom`. Background stays edge-to-edge; *content*
  never sits under the status bar or the Android nav bar. No new dependency
  (`react-native-safe-area-context` was already present).

## F3 — child-initiated STOP
- FSM: new `STOP` event, `Running|Paused → Idle` with the existing `ABANDONED`
  effect. It never reaches Completed/Verified, so INV-03 stays green; the session is
  `abandoned`, earns nothing and the task can be restarted (INV-09, no penalty).
- `timerService.stop()` reuses the abandon path but needs **no parent token**;
  `timerStore.stop()` + a `danger` button on the Timer screen behind the Ukrainian
  confirm dialog «Зупинити завдання? / Справді зупинити? / Так · Ні».
- **Conflict to note:** `VISION.md §1.2` says «…але не „стоп“ до закінчення». The owner
  explicitly ordered the child stop for this round; INV-03 (the enforceable invariant)
  is untouched because the terminal state is `abandoned`, not Completed/Verified.
  Flagged here instead of silently editing `VISION.md`.

## F4 — «Зберегти» at the bottom
- `TaskEditScreen` is now shell → ScrollView (form) → `taskedit-footer` with a
  full-width primary `AppButton size=lg`. The top bar keeps Row A only.
- `layoutResponsive.test.tsx` updated (footer placement + `alignSelf: stretch`),
  `uiRedesignLayout.test.tsx` now anchors its form-max-width walk on the title input.

## F5 — emoji picker
- New `src/domain/tasks/emoji.ts`: 36 curated kid-friendly emojis with Ukrainian/
  latin search keywords + `filterEmojis()`.
- New `src/ui/components/EmojiPicker.tsx`: full-screen dialog, search field, 4-column
  grid (cells ≥48dp), «Без емодзі» to clear. The free-text `task-emoji-input` is gone;
  the field opens the picker. Selection persists through the existing
  `validateTask → tasksRepo.create/update` path (`tasks.emoji`, ≤8 chars).

## F6 — two child modes + calendar
- New `ChildTabsScreen` (route name `Today` unchanged, so guards/tests/back stack are
  untouched) renders Tasks (existing Today flow) or Calendar, plus a new
  `BottomNav` (two `role="tab"` targets, ≥48dp, indicator + colour for the selected
  state). No new npm dependency — `@react-navigation/bottom-tabs` is not installed.
- `src/domain/stats/calendar.ts`: Date-free month math (INV-02/TSC-6 safe).
- `statsService` gains `monthRange / dayStats / daySessions / monthSummary`, all
  reading the single `sessions` table (verified = approved, completed = pending).
- `CalendarScreen`: week + month minutes-earned header, 7-column month grid in a
  horizontal scroll so every day keeps a 48dp target at 320dp, green approved /
  amber pending cells with count labels, day detail sheet whose approve action
  routes through the PIN gate (`PinGate intent: verify`) — approval itself is
  unchanged (`timerService.verify`, INV-05/INV-06).

## F7 — tighter PIN keypad
- `PinPad`: key gap and row gap `spacing.s12 → spacing.sm`, key `minHeight 56 → 48`
  (INV-10 floor), pad/grid `space-evenly → space-between`, less vertical padding.
  Keys stay `flex: 1` with no `maxWidth` cap, so all 10 digits + ⌫ still fit at 320dp.

## Not done / notes
- No emulator run and no screenshots at 3 densities (owner tests on his phone; the
  §6 rows 12-18 visual checks stay with the tester).
- One-time legacy PIN verification after updating (50k record) before the lazy
  re-hash lands; every later entry is fast.
- No PR / no merge — branch pushed only, per instruction.

## Review round 1 — findings (3, 0 HIGH), fixed in this round

### MED — stale day sheet after approve (`CalendarScreen`)
- **Symptom:** approving from the calendar's day sheet left the sheet on the
  «Очікує перевірки» chip + «Перевірити» button while the day cell was already
  green; a repeat press reached `timerService.verify` and failed
  `VERIFIED_IMMUTABLE`. PinGate's `goBack()` refocuses the screen, whose focus
  listener runs `reload()` — but `reload()` only refreshed week/month/grid.
- **Fix chosen:** keep the sheet open **and refresh it** — `reload()` now
  re-reads `statsService.daySessions(selectedDay)` whenever a day is selected
  (`selectedDay` added to the `useCallback` deps, so opening a day also keeps
  the sheet on fresh data). Closing the sheet after approve was rejected: the
  parent loses the confirmation of what was just approved.
- **RED:** `src/screens/__tests__/calendarScreen.test.tsx` «refreshes the open
  day sheet when the screen regains focus after the PIN gate approves» — opens
  the pending day, flips the row to `verified` (what PinGate's verify writes),
  fires the screen's focus listener (what `goBack()` triggers) and asserts the
  sheet shows «Перевірено» with no approve button, consistent with the green
  cell. Fails on the pre-fix tree: `docs/evidence/ux-fixes-r2-red.log`
  (`JEST_EXIT=1`, 1 failed / 18 passed).

### LOW — V1→V2 migration never exercised (`fastPinVerify.test.ts`)
- New test builds a **real pre-F1 install**: `V1_SQL` only (`iterations >=
  50000` CHECK enforced — asserted by a rejected fast-cost `UPDATE`),
  `user_version = 1`, legacy 50 000-iteration row with `failed_attempts = 3`;
  then runs the actual `migrate()` (which executes `V2_SQL`) and asserts
  `user_version = 2`, verbatim row copy (algo/iterations/salt/hash/
  failed_attempts/updated_at), `verifyPin` true for the right PIN and false for
  a wrong one at the stored cost, and that the rebuilt table accepts the fast
  cost (the point of the rebuild).
- RED-first evidence: the migration path was reachable (schema exports
  `V1_SQL`/`MIGRATIONS`, `migrate()` resumes from `user_version`), so the test
  passed against correct code; its teeth are proven by mutation — with the V2
  step dropped from `MIGRATIONS` it fails with `CHECK constraint failed:
  iterations >= 50000`: `docs/evidence/ux-fixes-r2-low-red-mutation.log`
  (`JEST_EXIT=1`). Mutation reverted before the green run.

### LOW — no month-boundary query test (`calendar.test.ts`)
- New test seeds 2026-09-30 (verified), 2026-10-15 (verified), 2026-10-20
  (pending), 2026-11-01 (pending) and asserts October `dayStats` /
  `monthSummary` contain only the two October days (35 verified / 15 pending
  minutes) while September and November each report their own session.
- RED-first: subject code (`local_date BETWEEN ? AND ?`) was already correct,
  so the test is green as written; teeth proven by mutation that drops the
  month range — same log, `docs/evidence/ux-fixes-r2-low-red-mutation.log`
  (`JEST_EXIT=1`). Mutation reverted.

### Gates (direct runs, no pipes/tee)
- `docs/evidence/ux-fixes-r2-red.log` — targeted RED run before any fix.
- `docs/evidence/ux-fixes-r2-green.log` — same three suites after the fix.
- `docs/evidence/ux-fixes-r2-*.log` all embed their real `JEST_EXIT`/`INV_EXIT`.

## Evidence note — continuation verification (direct runs, no pipe)
- **Lesson: `cmd | tee` masks the gate.** Two early background gates
  (`npx jest --ci … | tee docs/evidence/ux-fixes-green.log`, 00:28:52 / 00:29:19)
  actually ended **4 suites / 3 tests failed, 225/228** while reporting exit 0
  (tee's exit, not jest's). The real failures were: `calendar.test.ts` wrong
  import depth (`../../` → `../../../services/...`), childTabs duplicate
  «Календар» query (tab label + header), emoji test `findByText` on a TextInput
  value (→ `findByDisplayValue`), and the calendar summary queried as one combined
  string while the header renders label + value nodes. All four were fixed before
  the final green run; the stale background output was never re-read.
- **Re-verified with DIRECT commands (exit code is jest's, not a pipe's):**
  `npx jest --ci` → 62 suites / 236 tests, **exit 0 × 5**;
  `npx tsc --noEmit` → exit 0; `bash scripts/check-invariants.sh` → exit 0.
  `docs/evidence/ux-fixes-green.log` and `ux-fixes-invariants.log` regenerated by
  direct redirect with the real codes embedded (`JEST_EXIT=0`, `INV_EXIT=0`).
- `taskEditEmojiPicker.test.tsx` regression now really opens the picker, cancels
  (queries scoped `within(picker)` — top bar shares «Скасувати») and saves on the
  **update** path, asserting the record keeps 📚 (RED → GREEN, direct run).
## Review round 1 — companion cycle (`feat/companion-round`): all 8 findings fixed

RED evidence: `docs/evidence/companion-round-r2-red.log` — 8 suites / **18 failed, 23 passed** on the
pre-fix tree (`JEST_EXIT=1`), one failing test per finding. GREEN:
`docs/evidence/companion-round-r2-green.log` — same 8 suites, 41/41 (`JEST_EXIT=0`).
Gates (direct runs, no pipes): `npx tsc --noEmit` → `TSC_EXIT=0`;
`npm test -- --ci` → **71 suites / 278 tests**, `JEST_EXIT=0` twice
(`companion-round-r2-full-1.log` / `-full-2.log`); `bash scripts/check-invariants.sh` → `INV_EXIT=0`.

### HIGH — C4 is now enforced end to end (was UI-only)
- **Migration V5** (`src/services/db/schema.ts`) drops `ux_sessions_task_day` — N-per-day cannot be
  expressed as `UNIQUE` (N varies per row) — and deliberately leaves `ux_sessions_one_active` (AS-05)
  alone. A fresh install creates it in V1 and drops it in V5; the upgrade path runs the same statement.
- **Service rule** (`timerService.doStart`): rejects only when non-abandoned sessions for
  `(task_id, today) >= task.targetPerDay`, with the new code `SESSION_LIMIT_REACHED_TODAY`
  (mapped in `mapTimerError` → `uk.today.sessionLimitError`). The check is repeated inside the
  transaction; the UNIQUE-catch now maps AS-05 first, then the day limit. AS-05 (one ACTIVE session)
  keeps its precedence over everything except a full day.
- `sessionsRepo.countForTaskOnDay()` is the counter; `tasksRepo.listToday` now LEFT JOINs the *latest*
  of today's runs through a correlated subquery, so several runs on one day can never duplicate the
  task card (`completed_today` genuinely reaches 2, 3, …).
- RED: 2nd session same task/day allowed (previously `UNIQUE constraint failed` / AS-04), 3rd rejected
  with `SESSION_LIMIT_REACHED_TODAY` for `target_per_day = 2`, default target 1 keeps its cap.

### HIGH — READY comes from TODAY's sessions (C3 dead-end)
- `TimerScreen.refreshRouteSession` uses `getLatestForTask` **only when its `local_date` is today**;
  a prior-day row is ignored, so a verified/completed session from yesterday shows «Почати» instead of
  a dead Verified box, and a stale Completed row no longer routes the child to PinGate `verify`.
- Documented extension of the review's formula (needed for C4 to be reachable in the UI):
  `READY = no ACTIVE session AND todayRuns < target_per_day`. With the literal
  "no session with local_date = today" a child could never start run 2 of '2/3' — today's completed
  run would block Start forever. Today's Completed/Verified state is still rendered; «Почати» is
  *added* next to «Покажи батькам» only while the day's target is not reached, and disappears at
  `runs >= target` (pinned by `timerReadyToday.test.tsx`, 4 cases).

### MED — mascot CTA clearance (Today + Calendar)
- New exported geometry in `MascotFloating`: `MASCOT_CLEARANCE_DP = 48`, `mascotSize/Offset` and
  `mascotBottomInset(width) = offset + size + 48` (128dp at 320, 144dp from 340). `TodayScreen`'s list
  `contentContainerStyle` reserves that bottom inset, so the last TaskCard can never end under the
  companion.
- Calendar: `CalendarScreen` reports day-sheet state upward (`onDayDetailChange`) and
  `ChildTabsScreen` **hides** the mascot while the sheet (with its right-aligned «Перевірити») is
  open; it returns when the sheet closes.
- Clearance test: geometry from the rendered styles (corner offset + target height) vs the list's
  bottom inset at 320dp and 413dp — `paddingBottom - mascotTop >= 48`. RED was −32 / −48.

### MED — mascot off Stats (INV-05)
- `MascotFloating` removed from `StatsScreen`. Owner-side rationale: the C5 brief asked for a
  "bottom-left Stats" companion, but INV-05/AS-19 say *statistics are parent-only* and the companion is
  a **child-side** affordance (it lives in the child shell and on the child Timer). The orchestrator
  resolved the contradiction in favour of the invariant — a parent-only screen must not carry child
  chrome, and it gives the child nothing to tap while the parent is reading charts. The INV-05 test now
  pins absence on Stats **behind a real parent session** (otherwise `ParentGuard`'s pre-auth `null`
  would make the assertion vacuous).

### LOW
- **Dead component:** `src/ui/components/ScreenTopBar.tsx` deleted (all 5 screens use `AppToolbar`;
  no importer left).
- **Upgrade migration test:** `migrations.test.ts` builds a real V2 install (V1+V2 SQL,
  `user_version = 2`) with task rows and three sessions, runs the actual `migrate()` and asserts rows
  verbatim, `target_per_day` defaulting to 1, sessions untouched and `ux_sessions_task_day` gone.
- **`select()` rejection:** `MascotSelectScreen` catches the rethrown persistence error and surfaces it
  in a `NoticeBox` (`testID="mascot-save-error"`, `uk.mascot.saveError`); `mascotStore.select` keeps
  its rollback.
- **Progress clamp:** `TaskCard` clamps `completedToday` to `target_per_day`, so lowering the target
  below what is done renders `3/3` + «Виконано на сьогодні», never `4/3`.

Commits: `test(review): … (RED)` → `fix(timer):` → `fix(tasks):` → `fix(mascot):` → `chore:`. Branch
pushed only — no PR, no merge.


## Celebration round (`feat/celebration`) — C9 + C6

RED evidence: `docs/evidence/celebration-red.log` — 2 suites / 4 tests failed on the
pre-fix tree (`JEST_EXIT=1`), one failing test per assertion. GREEN:
`docs/evidence/celebration-green-1.log` / `-green-2.log` — **73 suites / 282 tests**,
`JEST_EXIT=0` twice (direct runs, no pipes/tee). `npx tsc --noEmit` → `TSC_EXIT=0`;
`bash scripts/check-invariants.sh` → `INV_EXIT=0` (`celebration-invariants.log`).

### C9 — mascot celebration flight (INV-04 gentle, non-jarring)
- New `src/ui/components/MascotCelebration.tsx`: one-shot overlay, `pointerEvents="box-none"`
  (passes every touch through — never blocks Timer buttons), 1.8s ease-in-out arc across the
  screen and back to the resting corner with a scale/rotate pulse on the `excited` mood.
  Skipped entirely under `AccessibilityInfo.isReduceMotionEnabled()` (the overlay still renders
  so the trigger is observable, but no Animated work runs) and under `NODE_ENV=test` (same gate
  as `MascotFloating`, so jest never sees async Animated updates).
- Trigger: `TimerScreen` mounts the overlay only when a **LIVE** session (`isLive=true`, i.e.
  the store snapshot, not the cold-start `routeSession` restore) reaches `Completed`/`Verified`.
  The `celebratedRef`/`celebratedSessionId` pair makes it **exactly once per session** — re-renders
  while still `Completed` keep the same instance (keyed by sessionId), and a second completion of
  the same session would need a new sessionId. After the flight finishes the overlay unmounts.
- INV-05: `PinGateScreen` / `ParentHomeScreen` never mount `MascotCelebration` (asserted by
  `queryByTestId('mascot-celebration') === null` in the RED test).

### C6 — pluggable timer-complete jingle hook (volume from settings)
- New `src/audio/celebrationSound.ts`:
  - `getJingleVolume(settingsRepo)` reads the `jingle_volume` key from the SQLite `settings`
    table (INV-07), default **0.5** when the row is absent or malformed, clamped to `[0, 1]`.
  - `onTimerComplete(cb)` / `emitTimerComplete(payload)` — a module-level `Set` of listeners;
    returns an unsubscribe. `timerStore` subscribes once and fires **exactly once per Completed
    transition** (`prev.kind !== 'Completed' && next.kind === 'Completed'`), so hydrate/setService
    (which start FROM `Completed`) never re-emit. Listener errors are swallowed so a broken
    listener can never break the completion path (INV-04).
  - `playCelebrationSound(mascot, volume)` — pluggable player, default impl is a guarded dynamic
    `require('expo-audio')` → `require('expo-av')` behind nested try/catch. **Zero new deps**: neither
    module is installed on this branch (both are in `expo`'s `bundledNativeModules.json` but not in
    `package.json`), so the default is a silent no-op and the app never crashes. The follow-up
    commit drops in WAV assets per `docs/JINGLE_DESIGN.md` (absent on this branch) and swaps the impl.
- Wired: `timerStore` subscribes to `onTimerComplete` at module scope; `TimerScreen` mounts
  `MascotCelebration` on the same transition. The two are independent — the jingle fires even
  if the animation is skipped (reduce motion), and vice versa.

### Tests (RED → GREEN)
- `src/screens/__tests__/mascotCelebration.test.tsx` — celebration fires exactly once on
  `Completed` (not `Running`/`Paused`), overlay is `box-none`, re-render does not spawn a second,
  and the overlay is absent on `PinGate`/`ParentHome` (INV-05).
- `src/screens/__tests__/jingleHook.test.tsx` — `getJingleVolume` returns 0.5 when the row is
  absent and the custom `0.75` when set; `onTimerComplete` emits exactly once on `Completed`
  (not on `Running`/`Paused`); `playCelebrationSound` and `onTimerComplete` are functions
  (pluggable interface).
- Both suites share the `mockNavigation` pattern with `addListener: jest.fn(() => () => {})`
  (the previous `mockNavigation` lacked it, causing `ParentHomeScreen`'s focus listener to throw).

Commits: `test(celebration): RED` → `feat(celebration): C9 flight + C6 jingle hook`. Branch
pushed only — no PR, no merge.


## C8 — mascot jingles + volume settings (integration round, `feat/celebration`)

Baseline `feat/celebration @ c4360a5` (C9 flight + C6 jingle stub already on the branch).
Contract + assets imported from the isolated design clone: `sfx/jingles/` (7 ×
`<Mascot>-complete.wav` + `INDEX.json` + `PATTERNS.json`) and `docs/JINGLE_DESIGN.md`
(408 lines — §3 is the integration spec this round implements).

- **One new dependency: `expo-audio` `~58.0.10`** (`npx expo install expo-audio`, SDK-58
  aligned; the config plugin was auto-registered in `app.json`). The owner asked for real
  sound and `package.json` had **neither `expo-av` nor `expo-audio`** (JINGLE_DESIGN §3.2
  checked both) — this is the single new native module, so hearing it on a device needs a
  native rebuild (`npx expo run:android`); JS/unit gates are unaffected. Nothing else was
  added: the volume control is a `TapTarget` stepper (no slider dependency).
- **Migration V6** (`src/services/db/schema.ts`) — spec §3.1 SQL verbatim: `INSERT OR IGNORE`
  seeds `@focuskid/jingle_volume = 0.5` and `@focuskid/jingle_enabled = true`.
  `MIGRATIONS.length` 5 → 6; the migration tests compare against `MIGRATIONS.length`
  symbolically, so no assertion changed (V6 inserts rows — tables/indexes/triggers untouched).
- **Storage** — `src/state/jingleStore.ts` + `src/ui/hooks/useJingle.ts` mirror
  `mascotStore`/`useMascot`: optimistic value, rollback + throw on a failed settings write,
  volume clamped to `[0,1]` and rounded to 2 decimals (a 10% step never persists
  `0.30000000000000004`). `getJingleVolume()` reads the C6 stub's bare `jingle_volume` key
  first (so anything written against the stub still applies), then the V6 key (default 0.5).
- **Playback** — `src/ui/jingleSources.ts` is the Metro-safe static `require` map (one
  literal per roster member, mirrors `mascotImages.ts`). `playJingle(mascot, volume)` in
  `src/audio/celebrationSound.ts` (the C6 stub is now the real player; `playCelebrationSound`
  keeps its name) creates an `expo-audio` player from that source, sets `volume`, plays once
  and `remove()`s on `didJustFinish`; a 4s `unref`'d fallback timer frees the player if the
  status event never lands. Every failure path (missing module, unknown mascot, volume 0,
  throw) degrades to silence, never a crash (INV-04); `jingle_enabled = false` short-circuits
  inside `playCompletionJingle()`.
- **Trigger** — `TimerScreen`'s existing `displayState.kind` effect: play on the **live**
  `Completed` and `Verified` transitions only. Parent/PIN screens never mount `TimerScreen`,
  so the screen boundary is the guard (INV-05); the cold-start restore path is excluded by
  `isLive` (opening an already-completed session stays silent).
- **UI** — `MascotSelectScreen` gains the §3.3 row right under the preview panel:
  `jingle-volume` container, `jingle-volume-value` readout (`Гучність мелодії: NN%`, also the
  a11y label), `jingle-volume-down` / `jingle-volume-up` in 10% steps, `jingle-test` playing
  the **currently previewed** mascot at the chosen volume (disabled when jingles are off or
  volume is 0), `jingle-save-error` `NoticeBox` when the write fails. All three controls are
  `TapTarget size="sm"` → ≥48dp (INV-10), every string from `uk.ts` exactly as spec'd.
- **Tests (RED → GREEN)** — `docs/evidence/jingle-red.log` (exit 1: the `jingleVolume` suite
  failed to load on the missing store, `jinglePlayback` had 2 failing tests) → 9 new tests.
  `src/screens/__tests__/jingleVolume.test.tsx`: default 50% readout, ±10 steps, restart
  persistence, Test button → `createAudioPlayer(source)` at the chosen volume, disabled when
  jingles are off, save-error rollback. `src/screens/__tests__/jinglePlayback.test.tsx`:
  exactly-once on a live Completed with the right mascot + volume and unload on
  `didJustFinish`, custom `0.8`/Stella honoured, `jingle_enabled=false` ⇒ silent, the 7-entry
  map verified against `INDEX.json` (literal require paths read back from the source file),
  and INV-05: a completion while only parent/PIN screens are mounted stays silent.
  `test/setup.ts` mocks `expo-audio` (the native module must never load in Jest).
- **Gates** — `npx tsc --noEmit`, `npm test -- --ci` ×2, `bash scripts/check-invariants.sh`:
  **75 suites / 291 tests** (was 73 / 282), all exit 0. Zero drift re-checked:
  `grep -rnE '#[0-9a-fA-F]{3,8}' src/` → only `theme.ts`.

Commits: `chore(celebration)` assets+dep → `test(celebration): RED` →
`feat(celebration): integration`. Branch pushed only — no PR, no merge.
