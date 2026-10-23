# Fix round 1 — notes & interpretations (PR #3)

Review: round 1, comment id 6362044538, verdict REQUEST_CHANGES, 11 findings (2 HIGH).
All 11 addressed; **0 rebutted** (every finding reproduced as valid against the code/diff).
Engine: Antigravity CLI (`agy-default --model gemini-3.8-flash-medium --effort medium`),
one call per logical group: (A) F1+F3, (B) F2, (C) F5+F6, (D) F4+F7+F8+F9+F11.
Headless agy auto-denied a `command` permission on the first call; retried with the
sanctioned `--dangerously-skip-permissions` flag, which was used for all subsequent calls.

## Findings fixed

- **F1 (HIGH)** — `useAppStateCheckpoint` had zero consumers. New app-level
  `src/state/AppLifecycle.tsx` mounts `useAppStateCheckpoint()` + `useTicker()` under the
  services provider in `App.tsx`; `resume()`/`addTime()` now persist `elapsedRunMs`
  (defence in depth). New lifecycle tests prove kill/restart mid-run keeps
  `runElapsed === 600000` and mid-pause keeps `pauseBudgetLeft === 180000` (INV-04 no
  longer bypassable by restarting during a pause).
- **F2 (HIGH)** — TimerScreen now resolves the session from `route.params.taskId`
  (`getTodayForTask` → fallback `getLatestForTask`), renders completed/verified states via
  `restore(row)` independent of the global snapshot, and binds every action (incl.
  "Покажи батькам" → `sessionId`) to the displayed session. New tests: cold-start
  completed-task navigation + multi-task wrong-session binding.
- **F3** — ticking moved from TimerScreen to the app-level `AppLifecycle`; Today
  projections refresh whenever the persisted timer status kind changes.
- **F4** — ParentHome change-PIN PinPad is now controlled (`value`/`onChange`) and cleared
  at every step/retry/toggle; dead `newPinInput` state removed.
- **F5** — AS-04/AS-05 re-checked **inside** the transaction; new partial unique index
  `ux_sessions_one_active ON sessions ((1)) WHERE status IN ('running','paused')`;
  UNIQUE-constraint failures translated to `{ok:false}` (no escaped rejections);
  `timerStore` actions catch and record `lastError`; TodayScreen disables the control
  while a start is pending.
- **F6** — all timer operations (`start/pause/resume/addTime/tick/requestComplete/verify/
  abandon/checkpoint/hydrate`) serialized through a single promise queue inside
  `createTimerService`, so timer DB transactions can never overlap the connection;
  `tick` results (and thrown errors) now land in `lastError` instead of being swallowed.
- **F7** — hardcoded user-visible strings moved to `src/i18n/uk.ts`
  (`parentHome.enterCurrentPin/enterNewPin/taskFallback`, `pin.digitsEntered()/digit()`,
  the already-defined-but-unused `pin.backspace`, `taskCrud` stepper labels + weekday
  labels (existing `taskCrud.weekdays` array now actually used) + `daySelected/
  dayUnselected`). All literals byte-identical — tests query them by constant.
- **F8** — `attempt()` no longer issues a token on every successful PIN (only
  `parentSessionStore` issues for the requested verify/abandon action); `activeTokens` is
  pruned of >30 s entries on issue and on consume; read-only `activeTokenCount()` added so
  the pruning is test-assertable.
- **F9** — `accessibilityLiveRegion="polite"` removed from the per-second countdown;
  minute-boundary `announceForAccessibility` kept (Stage 4: ≤1 announcement/minute).
- **F10** — PR body "Success Criteria Map" rewritten from `docs/IMPLEMENTATION_PLAN.md` §D
  identifiers verbatim; TSC-4/19/20 marked NOT YET RUN (require the §E Gradle build /
  release steps). Body edited via `gh pr edit` — no PR comment was posted.
- **F11** — flaky timeouts: `verifyFlow.test.tsx` and `TaskEditScreen.test.tsx` got
  `jest.setTimeout(30000)` and jest.config.js got a global `testTimeout: 30000`.

## Interpretations (yolo mode)

1. **F5 index goes into `V1_SQL`, not a new V2 migration.** The migration has never
   shipped: PR #3 is unmerged, no release exists (TSC-19/20 not run), so no installed
   device carries `user_version=1` of the old schema. Adding V2 would only churn
   `migrations.test.ts` expectations for no user. `MIGRATIONS` stays `[V1_SQL]`.
2. **F11 fix = bounded raised timeouts, not fake timers.** Both flagged suites already run
   on fake clocks; the flake was the default 5 000 ms budget vs cold-start
   transform/compile + PBKDF2 cost (reviewer's own suggested fix: "raise testTimeout for
   the render-heavy suites"). Global `testTimeout: 30000` covers the suites that had none.
3. **F1 "kill/restart" lifecycle test** is simulated by constructing a fresh
   `createAppServices` on the same DB (the store/service closure is what a process kill
   resets; the DB is what survives) and re-hydrating — deterministic, no real timers.
4. **F10 counts as a code-review finding fixed by a PR-body edit** (the finding IS about
   the body); it is not a PR comment and nothing was merged.
5. `activeTokenCount()` (F8) is a new read-only service method added purely so pruning is
   observable in tests; it exposes no secret material.

## Gates (final)

- `npx tsc --noEmit` → clean (exit 0)
- `npm test -- --ci` ×3 consecutive → all green: 36 suites / 164 tests each run
  (run 1: 36/36, 164/164 · run 2: 36/36, 164/164 · run 3: 36/36, 164/164)
- `bash scripts/check-invariants.sh` → exit 0 — PASS TSC-2,3,5,6,12,14,15,16,17,18; SKIP TSC-4,19,20 — require Gradle build / published release