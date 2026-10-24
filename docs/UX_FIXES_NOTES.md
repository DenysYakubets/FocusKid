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