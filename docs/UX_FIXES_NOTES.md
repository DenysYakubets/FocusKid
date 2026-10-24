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