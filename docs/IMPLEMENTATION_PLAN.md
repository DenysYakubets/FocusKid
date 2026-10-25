# FocusKid — Staged Implementation Plan

> Audience: developer agents executing the build stage by stage.
> Authoritative spec: [`VISION.md`](../VISION.md). If this plan conflicts with VISION.md, VISION.md wins. Raise the conflict in the PR description and don't resolve it silently.
> Do **not** modify `VISION.md`.

---

## A. Restated understanding + assumptions

### A.1 What we are building

FocusKid is an **offline-only Android app** (React Native + Expo, TypeScript `strict`) for children aged 5–13. It runs the loop **Focus ➔ Result ➔ Confirmation**:

1. **Choose.** The child picks one of today's tasks from a list that the parent prepared.
2. **Honest timer.** The child starts a countdown. It cannot be cut short. A short pause is allowed (limited budget) and so is adding time. There is no "stop" before the target time is reached.
3. **Real result.** When the target time has elapsed, the session becomes `Completed`, shown as "Очікує перевірки" (awaiting verification). The child shows the parent the result.
4. **PIN confirmation.** The parent enters a 4-digit PIN and the session becomes `Verified` (green). That state is final.

Non-negotiables taken from VISION.md:

- **Zero network.** No `android.permission.INTERNET`, no analytics or telemetry, no accounts, no cloud (INV-01).
- **Monotonic time** for every duration. `Date.now()` is never used for durations (INV-02).
- **Timer FSM** `Idle → Running → Paused → Completed → Verified`, with strictly validated transitions (INV-03, INV-04, INV-06).
- **Parent mode only through a local PIN.** The PIN is hashed with PBKDF2-SHA256 and a local salt, and there is no recovery (INV-05).
- **All data lives in `expo-sqlite`** on the device (INV-07).
- **Portrait and landscape** ("Desk Clock") parity (INV-08). **No dark patterns** (INV-09). **Accessibility:** minimum font 48sp, touch targets ≥ 48×48dp, TalkBack support (INV-10).
- **Distribution:** run `npx expo prebuild` then `./gradlew assembleDebug`, and publish the APK with `gh release create`. Never commit APKs to git.
- **Fast verification** with `npm test` (Jest), so no emulator is needed for logic, data or UI-component tests.

### A.2 Assumptions (agents MUST follow these; anything marked ⚠ needs a product-owner glance in the PR)

| ID | Assumption |
|----|-----------|
| AS-01 | Use the **latest stable Expo SDK** at execution time (`npx create-expo-app@latest --template blank-typescript`). Install every `expo-*` package with `npx expo install` so versions match the SDK. If that SDK's default Android `minSdkVersion` is above 24, pin it to 24 through `expo-build-properties`. If the SDK can't support 24, use the newest SDK that can, and note it in the PR. |
| AS-02 | The **UI language is Ukrainian** (matching VISION.md). Every user-visible string lives in `src/i18n/uk.ts`, and tests query by those constants. |
| AS-03 | **`Idle` is not persisted.** A task with no non-abandoned session for today is `Idle`. A `sessions` row is created on `START`. |
| AS-04 | **One session per task per local calendar day**, unless it was abandoned by a parent. This is enforced by a partial unique index. |
| AS-05 | **At most one active (Running or Paused) session at a time** across all tasks. Several `Completed` sessions may wait for verification at once. |
| AS-06 | **Pause budget (INV-04)** is cumulative: at most **5 minutes (300 000 ms) of pause per session**. When the budget runs out, the timer **auto-resumes** at exactly the moment it ran out. Once the budget is spent, `PAUSE` is rejected. |
| AS-07 | **Adding time** is allowed in Running or Paused, in steps of **+5 min**, up to **+60 min per session**. The base target is 1–120 min. Adding time never shortens the session. |
| AS-08 ⚠ | **Parent abandon.** VISION.md defines no cancel path. To avoid a stuck session (for example, a task created by mistake), a **PIN-authorized** `PARENT_ABANDON` moves Running/Paused/Completed → Idle and marks the row `abandoned`. The child can never trigger it (INV-03). It is forbidden from `Verified` (INV-06). |
| AS-09 | **Process death and deep sleep.** The JS monotonic clock (`performance.now()`) resets when the process restarts. Running elapsed time is checkpointed to SQLite every 5 s and when the app goes to the background. On cold start, a `Running` session resumes from its last checkpoint, and time while the process was dead is **not** counted. This is conservative: the child can only lose time, never gain it. `expo-keep-awake` is active while Running so the "Desk Clock" use case keeps the process alive. |
| AS-10 | **Wall clock** (`new Date()`) is allowed **only** in `src/services/clock/wallClock.ts`, and only for calendar data such as the local date `YYYY-MM-DD`, the weekday, and ISO timestamps for display. It is never used for durations. If the child changes the device date, they might reach a "new day". That is an accepted limitation because no time is gained inside a session. |
| AS-11 | **INV-10 typography is applied strictly.** Every typography token in `src/ui/theme.ts` is ≥ 48sp, layouts scroll, and raw `fontSize` literals are forbidden outside the theme. `allowFontScaling` stays enabled, so system scaling only makes text larger. |
| AS-12 | **PIN:** exactly 4 digits. Hashing is PBKDF2-HMAC-SHA256 with a 16-byte random salt from `expo-crypto`, `@noble/hashes@^1` (pure JS, CommonJS-compatible), **50 000 iterations** stored per row so they can be raised later, and constant-time comparison. **Lockout:** after 5 consecutive failures the app locks for 30 s, doubling each time up to 15 min. The lock is timed with the monotonic clock and the failure counter is persisted. |
| AS-13 | **First launch requires PIN setup** before the child UI is reachable, because verification is impossible without a PIN. There is **no PIN recovery**: the only path is Android "Clear app data", and this is documented in the parent-mode help text. |
| AS-14 | **Parent session:** a correct PIN opens parent mode for **120 s of monotonic inactivity**. It ends immediately when the app goes to the background or the parent taps "Вийти". Verification always requires a **fresh** PIN entry, even inside a parent session, so the parent must physically confirm each time. |
| AS-15 | **Navigation** uses React Navigation 7 native-stack rather than expo-router, because explicit guards are simpler to test. **State** uses `zustand`. There is no other state library. |
| AS-16 | **Tests** use the `jest-expo` preset and `@testing-library/react-native`. Data tests run real SQL through a `better-sqlite3` adapter that implements the same `Db` interface as the `expo-sqlite` adapter. Tests never touch `expo-sqlite` itself. |
| AS-17 | The **distributed APK is a debug build with the JS bundle embedded** (`debuggableVariants = []`, set by a config plugin), so it runs with no Metro server and no network. Day-to-day development can use `npx expo start` with Expo Go. That is a dev convenience only and is not the shipped artifact. |
| AS-18 | **Tasks are archived** (soft-deleted) once any session references them. Hard delete is allowed only for tasks that have never had a session (`ON DELETE RESTRICT`). |
| AS-19 | **Statistics are parent-only** (INV-05 lists "перегляд статистики"). They show positive totals only: verified count and focused minutes per day, week and task. There are no streaks and no "you broke your streak" messages (INV-09). |
| AS-20 | **Android package id:** `com.focuskid.app`. **Version** `0.1.0`, **release tag** `v0.1.0`. |
| AS-21 | `android/` and `ios/` are **generated** (Continuous Native Generation). They are git-ignored and never committed. All native changes go through `app.json` and the config plugins in `plugins/`. |

---

## B. Architecture

### B.1 Folder layout

```
FocusKid/
├── App.tsx                      # Root: DB bootstrap → providers → RootNavigator
├── index.ts                     # registerRootComponent(App)
├── app.json                     # Expo config (orientation default, blockedPermissions, plugins)
├── babel.config.js
├── tsconfig.json                # extends expo/tsconfig.base, "strict": true
├── jest.config.js               # preset jest-expo, setupFiles, transformIgnorePatterns
├── package.json                 # scripts: test, typecheck, check:invariants, release:apk
├── plugins/
│   ├── withNoInternet.js        # strips INTERNET from every manifest source (INV-01)
│   └── withBundledDebugJs.js    # embeds JS bundle in debug APK (Stage 4)
├── scripts/
│   ├── check-invariants.sh      # runs all static TSC checks (section D)
│   └── release-apk.sh           # prebuild → assembleDebug → gh release create (Stage 4)
├── test/
│   ├── setup.ts                 # RTL matchers, safe-area mock, crypto/keep-awake mocks
│   ├── helpers/
│   │   ├── nodeDb.ts            # better-sqlite3 implementation of Db (in-memory)
│   │   ├── fakeClock.ts         # controllable MonotonicClock
│   │   └── renderWithApp.tsx    # renders screens with stores + navigation container
│   └── config/
│       ├── appConfig.inv01.test.ts
│       └── bundledDebugJs.test.ts
└── src/
    ├── domain/                  # PURE TypeScript: no React, no expo, no clocks, no I/O
    │   ├── timer/{types.ts, constants.ts, elapsed.ts, fsm.ts, __tests__/}
    │   ├── tasks/{types.ts, validation.ts, __tests__/}
    │   └── stats/{aggregate.ts, __tests__/}
    ├── services/                # side effects behind interfaces (DI for tests)
    │   ├── clock/{monotonic.ts, wallClock.ts, __tests__/}
    │   ├── db/{Db.ts, expoDb.ts, schema.ts, migrations.ts, seed.ts, __tests__/}
    │   ├── repos/{tasksRepo.ts, sessionsRepo.ts, authRepo.ts, __tests__/}
    │   ├── timer/{timerService.ts, __tests__/}
    │   ├── auth/{pinHash.ts, authService.ts, __tests__/}
    │   └── stats/{statsService.ts, __tests__/}
    ├── state/                   # zustand stores (UI-facing façade over services)
    │   ├── appServices.ts       # service container created once in App.tsx
    │   ├── timerStore.ts
    │   ├── tasksStore.ts
    │   ├── parentSessionStore.ts
    │   └── __tests__/
    ├── navigation/{routes.ts, RootNavigator.tsx, ParentGuard.tsx, __tests__/}
    ├── screens/
    │   ├── TodayScreen.tsx  TimerScreen.tsx  PinGateScreen.tsx  PinSetupScreen.tsx
    │   ├── ParentHomeScreen.tsx  TaskListEditScreen.tsx  TaskEditScreen.tsx  StatsScreen.tsx
    │   └── __tests__/
    ├── ui/
    │   ├── theme.ts             # colors, spacing, typography tokens (all ≥ 48sp), MIN_TOUCH_DP
    │   ├── components/{AppText.tsx, TapTarget.tsx, TaskCard.tsx, ProgressBar.tsx,
    │   │               PinPad.tsx, StatBar.tsx, ErrorBoundary.tsx}
    │   ├── hooks/{useOrientation.ts, useTicker.ts, useAppStateCheckpoint.ts}
    │   └── __tests__/
    └── i18n/uk.ts
```

**Layering rule:** `screens → state → services → domain`. `domain` imports nothing outside `domain`. Only `services/clock` reads clocks, and only `services/db/expoDb.ts` imports `expo-sqlite`.

### B.2 Navigation

React Navigation native-stack, defined in `src/navigation/routes.ts`:

```ts
export type RootStackParamList = {
  PinSetup: undefined;                                  // first launch only
  Today: undefined;                                     // child home
  Timer: { taskId: number };                            // child timer
  PinGate: { intent: 'enterParent' } | { intent: 'verify'; sessionId: number }
         | { intent: 'abandon'; sessionId: number };
  ParentHome: undefined;                                // guarded
  TaskListEdit: undefined;                              // guarded
  TaskEdit: { taskId?: number };                        // guarded (undefined = create)
  Stats: undefined;                                     // guarded
};
```

Flow:

```
App start ──(no PIN in parent_auth)──► PinSetup ──► Today
          └─(PIN exists)─────────────► Today
Today ──tap task──► Timer ──(Completed) "Покажи батькам" ──► PinGate{verify} ──ok──► Timer (Verified, green) / Today
Today ──"Батьки" (lock icon)──► PinGate{enterParent} ──ok──► ParentHome ─► TaskListEdit ─► TaskEdit
                                                                      └─► Stats
```

- `ParentGuard` wraps ParentHome, TaskListEdit, TaskEdit and Stats. If `parentSessionStore.isActive(now)` is false, it renders nothing and calls `navigation.replace('PinGate', { intent: 'enterParent' })` (INV-05).
- The hardware back button on `Timer` returns to `Today`. The timer keeps running in the store and `Today` shows an "active" badge. Back never stops the timer.
- Orientation is `"default"` (both orientations). Screens compute layout from `useOrientation()` (`useWindowDimensions`). State lives only in stores, so rotation never resets it (INV-08).

### B.3 Screens

| Screen | Mode | Purpose / key elements |
|---|---|---|
| `PinSetupScreen` | first launch | Enter the PIN twice (PinPad), then `authService.setupPin`. Explains that there is no recovery. |
| `TodayScreen` | child | Today's tasks as large `TaskCard`s, with a status color per state: Idle neutral, Running/Paused blue, Completed amber "Очікує перевірки", Verified green ✓. Has a lock-icon `TapTarget` for parent mode. |
| `TimerScreen` | child | Remaining `mm:ss` in the largest token, a `ProgressBar`, the **Pause/Resume** button (shows remaining pause budget), and **"+5 хв"**. There is **no Stop button.** In Completed it shows "Очікує перевірки" and "Покажи батькам" → PinGate{verify}. In Verified it shows a green success state. In landscape it uses the Desk Clock layout (digits left, controls right). |
| `PinGateScreen` | gate | `PinPad` with 4 dots. It shows a lockout countdown when locked. On success it dispatches by `intent`: open the parent session, VERIFY, or PARENT_ABANDON. |
| `ParentHomeScreen` | parent | Links to Tasks, Stats, Change PIN, and Exit parent mode. Shows the list of Completed sessions awaiting verification. |
| `TaskListEditScreen` | parent | Lists tasks with reorder (up/down `TapTarget`s), archive, and "Додати". |
| `TaskEditScreen` | parent | Title (1–60 chars), emoji, target minutes (stepper 1–120), and weekday toggles. |
| `StatsScreen` | parent | This week: verified count, focused minutes, a per-day `StatBar` and per-task totals. Positive framing only. |

### B.4 SQLite schema (migration v1, `src/services/db/schema.ts`)

Schema version is tracked with `PRAGMA user_version`. `migrations.ts` applies `MIGRATIONS[i]` for every `i >= user_version` inside one transaction and then sets `user_version`. The connection pragmas, `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`, run at every open in `expoDb.ts` and `nodeDb.ts`, not in the migration.

```sql
-- v1
CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 60),
  emoji           TEXT    CHECK (emoji IS NULL OR length(emoji) <= 8),
  target_minutes  INTEGER NOT NULL CHECK (target_minutes BETWEEN 1 AND 120),
  days_mask       INTEGER NOT NULL DEFAULT 127 CHECK (days_mask BETWEEN 1 AND 127), -- bit0=Mon … bit6=Sun
  sort_order      INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at      TEXT    NOT NULL,           -- ISO wall time, display only
  updated_at      TEXT    NOT NULL
);
CREATE INDEX ix_tasks_active ON tasks (archived, sort_order);

CREATE TABLE sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id          INTEGER NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
  local_date       TEXT    NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status           TEXT    NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'verified', 'abandoned')),
  target_ms        INTEGER NOT NULL CHECK (target_ms > 0),
  added_ms         INTEGER NOT NULL DEFAULT 0 CHECK (added_ms >= 0 AND added_ms <= 3600000),
  elapsed_run_ms   INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_run_ms >= 0),   -- monotonic-derived checkpoint
  paused_total_ms  INTEGER NOT NULL DEFAULT 0 CHECK (paused_total_ms >= 0 AND paused_total_ms <= 300000),
  pause_count      INTEGER NOT NULL DEFAULT 0 CHECK (pause_count >= 0),
  started_at       TEXT    NOT NULL,          -- ISO wall time, display only
  completed_at     TEXT,
  verified_at      TEXT,
  updated_at       TEXT    NOT NULL
);
CREATE INDEX ix_sessions_date ON sessions (local_date);
CREATE UNIQUE INDEX ux_sessions_task_day ON sessions (task_id, local_date) WHERE status <> 'abandoned';

-- Defence in depth for the FSM (the service layer is the primary guard)
CREATE TRIGGER trg_sessions_insert_running BEFORE INSERT ON sessions
WHEN NEW.status <> 'running'
BEGIN SELECT RAISE(ABORT, 'FSM: sessions must start in running'); END;

CREATE TRIGGER trg_sessions_verify_only_from_completed BEFORE UPDATE OF status ON sessions
WHEN NEW.status = 'verified' AND OLD.status <> 'completed'
BEGIN SELECT RAISE(ABORT, 'INV-03: only completed sessions can be verified'); END;

CREATE TRIGGER trg_sessions_verified_no_update BEFORE UPDATE ON sessions
WHEN OLD.status = 'verified'
BEGIN SELECT RAISE(ABORT, 'INV-06: verified session is immutable'); END;

CREATE TRIGGER trg_sessions_verified_no_delete BEFORE DELETE ON sessions
WHEN OLD.status = 'verified'
BEGIN SELECT RAISE(ABORT, 'INV-06: verified session is immutable'); END;

CREATE TABLE session_events (            -- append-only audit trail
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions (id) ON DELETE RESTRICT,
  event       TEXT    NOT NULL,          -- START, PAUSE, RESUME, AUTO_RESUME, ADD_TIME, COMPLETE, VERIFY, PARENT_ABANDON
  from_state  TEXT    NOT NULL,
  to_state    TEXT    NOT NULL,
  run_ms      INTEGER NOT NULL,          -- elapsed run ms at the event (monotonic-derived)
  created_at  TEXT    NOT NULL
);
CREATE INDEX ix_session_events_session ON session_events (session_id);
CREATE TRIGGER trg_session_events_no_update BEFORE UPDATE ON session_events
BEGIN SELECT RAISE(ABORT, 'session_events is append-only'); END;
CREATE TRIGGER trg_session_events_no_delete BEFORE DELETE ON session_events
BEGIN SELECT RAISE(ABORT, 'session_events is append-only'); END;

CREATE TABLE parent_auth (               -- single row
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  algo             TEXT    NOT NULL DEFAULT 'pbkdf2-sha256',
  iterations       INTEGER NOT NULL CHECK (iterations >= 50000),
  salt_hex         TEXT    NOT NULL CHECK (length(salt_hex) = 32),
  hash_hex         TEXT    NOT NULL CHECK (length(hash_hex) = 64),
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  updated_at       TEXT    NOT NULL
);
```

Key queries, which live in the repos:

- **Today's tasks plus status:**
  `SELECT t.*, s.id AS session_id, s.status FROM tasks t LEFT JOIN sessions s ON s.task_id = t.id AND s.local_date = ? AND s.status <> 'abandoned' WHERE t.archived = 0 AND (t.days_mask & ?) <> 0 ORDER BY t.sort_order, t.id;`
  The second parameter is `1 << weekdayIndex`.
- **Active session:** `SELECT * FROM sessions WHERE status IN ('running','paused') LIMIT 1;`
- **Stats per day:** `SELECT local_date, COUNT(*) AS verified, SUM(elapsed_run_ms) AS run_ms FROM sessions WHERE status = 'verified' AND local_date BETWEEN ? AND ? GROUP BY local_date;`

### B.5 Timer FSM

**Types** (`src/domain/timer/types.ts`). The FSM is pure: it never reads a clock. Every event carries `now`, a monotonic number in ms supplied by `services/clock/monotonic.ts`.

```ts
export type TimerStateKind = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Verified';
interface Base { targetMs: number; addedMs: number; runAccumMs: number; pausedTotalMs: number; pauseCount: number }
export type TimerState =
  | { kind: 'Idle' }
  | (Base & { kind: 'Running'; runSince: number })
  | (Base & { kind: 'Paused'; pausedSince: number })
  | (Base & { kind: 'Completed' })
  | (Base & { kind: 'Verified' });
export type TimerEvent =
  | { type: 'START'; now: number; targetMs: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ADD_TIME'; now: number; ms: number }
  | { type: 'COMPLETE'; now: number }                                   // child "I'm done" request
  | { type: 'VERIFY'; now: number; parentAuthorized: boolean }
  | { type: 'PARENT_ABANDON'; now: number; parentAuthorized: boolean };
export type TimerError =
  | 'INVALID_TRANSITION' | 'EARLY_TERMINATION_FORBIDDEN' | 'NOT_COMPLETED'
  | 'PAUSE_BUDGET_EXHAUSTED' | 'ADD_TIME_LIMIT' | 'INVALID_TARGET'
  | 'PARENT_AUTH_REQUIRED' | 'VERIFIED_IMMUTABLE';
export type TimerEffect = 'COMPLETED' | 'AUTO_RESUMED' | 'VERIFIED' | 'ABANDONED';
export type TransitionResult =
  | { ok: true; state: TimerState; effects: TimerEffect[] }
  | { ok: false; state: TimerState; error: TimerError };   // state is returned unchanged
export function transition(state: TimerState, event: TimerEvent): TransitionResult;
```

**Constants** (`constants.ts`):

| Constant | Value |
|---|---|
| `PAUSE_BUDGET_MS` | 300 000 |
| `ADD_TIME_STEP_MS` | 300 000 |
| `MAX_ADDED_MS` | 3 600 000 |
| `MIN_TARGET_MS` | 60 000 |
| `MAX_TARGET_MS` | 7 200 000 |
| `TICK_INTERVAL_MS` | 250 |
| `CHECKPOINT_INTERVAL_MS` | 5 000 |

**Derived values** (`elapsed.ts`). All of them clamp negative deltas to 0, as a defence against a non-monotonic `now`:

- `runElapsed(s, now) = runAccumMs + (Running ? max(0, now − runSince) : 0)`
- `pausedElapsed(s, now) = pausedTotalMs + (Paused ? max(0, now − pausedSince) : 0)`
- `remaining(s, now) = max(0, targetMs + addedMs − runElapsed(s, now))`
- `pauseBudgetLeft(s, now) = max(0, PAUSE_BUDGET_MS − pausedElapsed(s, now))`

**Transition table.** Tests reference rows by ID. Any (state, event) pair not listed returns `{ ok: false, error: 'INVALID_TRANSITION' }`.

| ID | From | Event | Guard | To | Effects / error |
|---|---|---|---|---|---|
| T01 | Idle | START | `MIN_TARGET_MS ≤ targetMs ≤ MAX_TARGET_MS` | Running | `runAccumMs=0, runSince=now, addedMs=0, pausedTotalMs=0` |
| T02 | Idle | START | target out of range | Idle | ✗ `INVALID_TARGET` |
| T03 | Running | TICK | `remaining > 0` | Running | none |
| T04 | Running | TICK | `remaining = 0` | Completed | `runAccumMs = targetMs + addedMs` (exact), effect `COMPLETED` |
| T05 | Running | COMPLETE | `remaining = 0` | Completed | same as T04 |
| T06 | Running | COMPLETE | `remaining > 0` | Running | ✗ `EARLY_TERMINATION_FORBIDDEN` (INV-03) |
| T07 | Running | VERIFY | any | Running | ✗ `NOT_COMPLETED` (INV-03) |
| T08 | Running | PAUSE | `pauseBudgetLeft > 0` | Paused | `runAccumMs = runElapsed(now)`, `pausedSince=now`, `pauseCount+1` |
| T09 | Running | PAUSE | `pauseBudgetLeft = 0` | Running | ✗ `PAUSE_BUDGET_EXHAUSTED` (INV-04) |
| T10 | Running / Paused | ADD_TIME | `ms = ADD_TIME_STEP_MS` and `addedMs + ms ≤ MAX_ADDED_MS` | same | `addedMs += ms` |
| T11 | Running / Paused | ADD_TIME | otherwise | same | ✗ `ADD_TIME_LIMIT` |
| T12 | Paused | RESUME | — | Running | `pausedTotalMs = pausedElapsed(now)`, `runSince=now` |
| T13 | Paused | TICK | `pausedElapsed < PAUSE_BUDGET_MS` | Paused | none |
| T14 | Paused | TICK | `pausedElapsed ≥ PAUSE_BUDGET_MS` | Running (then re-evaluated as T03/T04 with the same `now`) | `pausedTotalMs = PAUSE_BUDGET_MS`, `runSince = pausedSince + (PAUSE_BUDGET_MS − pausedTotalMs_before)`, effect `AUTO_RESUMED` (INV-04) |
| T15 | Paused | COMPLETE / VERIFY | any | Paused | ✗ `EARLY_TERMINATION_FORBIDDEN` / `NOT_COMPLETED` (INV-03) |
| T16 | Completed | VERIFY | `parentAuthorized = true` | Verified | effect `VERIFIED` |
| T17 | Completed | VERIFY | `parentAuthorized = false` | Completed | ✗ `PARENT_AUTH_REQUIRED` (INV-05) |
| T18 | Completed | TICK | — | Completed | no-op, `ok: true` |
| T19 | Running / Paused / Completed | PARENT_ABANDON | `parentAuthorized = true` | Idle | effect `ABANDONED` (row → `abandoned`) |
| T20 | Running / Paused / Completed | PARENT_ABANDON | `parentAuthorized = false` | same | ✗ `PARENT_AUTH_REQUIRED` |
| T21 | Verified | **any** event (TICK included) | — | Verified | ✗ `VERIFIED_IMMUTABLE` (INV-06) |
| T22 | Running / Paused / Completed | START | — | same | ✗ `INVALID_TRANSITION` |

**Hydration** (`timerService.restore(row, now)`, applied on cold start per AS-09):

| Persisted row | Restored as |
|---|---|
| `running` | Running with `runAccumMs = elapsed_run_ms`, `runSince = now` |
| `paused` | Paused with `pausedTotalMs = paused_total_ms`, `pausedSince = now` |
| `completed` | Completed |
| `verified` | Verified |
| `abandoned` | ignored (task is Idle) |

**State ↔ DB status mapping:**

| FSM state | `sessions.status` |
|---|---|
| Running | `running` |
| Paused | `paused` |
| Completed | `completed` |
| Verified | `verified` |
| Idle after T19 | `abandoned` |

### B.6 Services (all constructed in `src/state/appServices.ts`, injected for tests)

| Service | File | Responsibility | Key API |
|---|---|---|---|
| MonotonicClock | `services/clock/monotonic.ts` | The only source of duration time. Wraps `performance.now()`, with a fallback to `global.nativePerformanceNow` and a hard error if neither exists. | `interface MonotonicClock { now(): number }`, `systemMonotonicClock` |
| WallClock | `services/clock/wallClock.ts` | Calendar data only (AS-10). | `todayLocalDate()`, `weekdayIndex(localDate)` (Mon=0), `addDays(localDate, n)`, `nowIso()` |
| Db | `services/db/Db.ts`, `expoDb.ts` | Thin async SQL interface. `expoDb` wraps `expo-sqlite` `openDatabaseAsync('focuskid.db')`. | `exec`, `run`, `all<T>`, `get<T>`, `transaction<T>(fn)` |
| Migrations | `services/db/migrations.ts` | Applies `schema.ts` migrations by `user_version`. | `migrate(db)` |
| Seed | `services/db/seed.ts` | On first run with an empty `tasks` table, inserts 3 sample tasks: "Читання" 15, "Домашнє завдання" 30, "Прибрати кімнату" 10. | `seedIfEmpty(db, wall)` |
| TasksRepo | `services/repos/tasksRepo.ts` | Tasks CRUD, today query, reorder, archive vs. delete (AS-18). | `listToday`, `listAll`, `get`, `create`, `update`, `archive`, `deleteIfUnused`, `move` |
| SessionsRepo | `services/repos/sessionsRepo.ts` | Session rows plus the append-only events. | `insertRunning`, `checkpoint`, `setStatus`, `getActive`, `getTodayForTask`, `listCompleted`, `appendEvent`, `rangeStats` |
| AuthRepo | `services/repos/authRepo.ts` | `parent_auth` single row. | `get`, `upsert`, `setFailedAttempts` |
| TimerService | `services/timer/timerService.ts` | Orchestrates FSM + persistence + single-active rule. Every accepted transition is written in **one transaction** (session row + event). | `start(taskId)`, `pause()`, `resume()`, `addTime()`, `tick()`, `requestComplete()`, `verify(sessionId, parentToken)`, `abandon(sessionId, parentToken)`, `checkpoint()`, `hydrate()`, `getSnapshot()` |
| PinHash | `services/auth/pinHash.ts` | PBKDF2-SHA256 (`@noble/hashes/pbkdf2` + `@noble/hashes/sha256`) and a constant-time compare. | `hashPin(pin, saltBytes, iterations)`, `verifyPin(pin, record)`, `isValidPinFormat(pin)` |
| AuthService | `services/auth/authService.ts` | PIN setup/change, verification with lockout (AS-12), parent session (AS-14). Issues short-lived, single-use `ParentToken`s that TimerService checks before passing `parentAuthorized: true` to the FSM. | `hasPin`, `setupPin`, `changePin`, `attempt(pin)`, `lockoutRemainingMs`, `isParentSessionActive`, `touch`, `endParentSession`, `consumeToken` |
| StatsService | `services/stats/statsService.ts` | Read-only aggregates for the Stats screen. | `weekSummary(localDate)`, `perTask(range)` |

**UI hooks:**

- `useTicker` calls `timerStore.tick()` every `TICK_INTERVAL_MS` while a session is Running or Paused.
- `useAppStateCheckpoint` calls `checkpoint()` every `CHECKPOINT_INTERVAL_MS`, and on `AppState` changing to `background`/`inactive` it also ends the parent session.
- `useOrientation` returns `'portrait' | 'landscape'`.

---

## C. Staged task briefs

### Rules for every stage

- **Branch** `feat/stage-N-<slug>` from an up-to-date `main`. Use Conventional Commits and open one PR per stage.
- **Before opening the PR**, run `npm test -- --ci`, `npx tsc --noEmit` and `bash scripts/check-invariants.sh`. All three must be green.
- **Do not add dependencies** beyond those listed for the stage. Any extra dependency must be justified in the PR and must not violate TSC-5 or TSC-12.
- **Never commit** `android/`, `ios/`, `dist/`, `*.apk` or `*.aab`.
- **Tests sit next to code** in `__tests__/`. Tests that use SQLite start with the docblock `/** @jest-environment node */`.

---

### Stage 1 — Data + FSM core (headless)

**Goal:** Scaffold the project, then build the pure timer FSM, the monotonic clock, the SQLite schema and migrations, the repos and a headless `TimerService`. It ships no UI beyond a placeholder `App.tsx`.

**Context needed:** sections A.2, B.4, B.5 and B.6 of this plan, plus INV-01, INV-02, INV-03, INV-04, INV-06 and INV-07.

**Step 0 — scaffold** (the repo already contains `VISION.md` and `docs/`, so scaffold into a temp directory and copy):

```bash
npx create-expo-app@latest /tmp/fk-scaffold --template blank-typescript --no-install
cp -rn /tmp/fk-scaffold/. ./          # -n: never overwrite VISION.md/docs
npm install
npx expo install expo-sqlite expo-crypto expo-keep-awake expo-build-properties
npm install zustand @noble/hashes@^1
npm install -D jest jest-expo @types/jest @testing-library/react-native better-sqlite3 @types/better-sqlite3
```

**Files to create or modify:**

| File | Content |
|---|---|
| `package.json` | `scripts`: `"test": "jest"`, `"typecheck": "tsc --noEmit"`, `"check:invariants": "bash scripts/check-invariants.sh"`; `"jest"` config removed in favour of `jest.config.js`. |
| `tsconfig.json` | `{ "extends": "expo/tsconfig.base", "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true }, "include": ["**/*.ts", "**/*.tsx"] }` |
| `jest.config.js` | `preset: 'jest-expo'`, `setupFilesAfterEnv: ['<rootDir>/test/setup.ts']`, `testPathIgnorePatterns: ['/node_modules/', '/android/']`, `transformIgnorePatterns` per jest-expo docs, extended with `@react-navigation` and `@noble`. |
| `app.json` | `name` "FocusKid", `slug` "focuskid", `version` "0.1.0", **`orientation: "default"`**, `android.package: "com.focuskid.app"`, **`android.permissions: []`**, **`android.blockedPermissions: ["android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE"]`**, `plugins: ["expo-sqlite", ["expo-build-properties", { "android": { "minSdkVersion": 24 } }], "./plugins/withNoInternet"]`. |
| `.gitignore` | Ensure the lines `android/`, `ios/`, `dist/`, `*.apk`, `*.aab`, `*.keystore` and `.expo/` are present. |
| `plugins/withNoInternet.js` | `withAndroidManifest`: ensures `<uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>` and the `xmlns:tools` namespace in the main manifest. `withDangerousMod('android')`: after prebuild, deletes any `uses-permission` for INTERNET from `android/app/src/debug/AndroidManifest.xml` and `src/debugOptimized/` if present, because build-type manifests outrank `tools:node="remove"` in main. Idempotent. |
| `scripts/check-invariants.sh` | `set -euo pipefail`. Runs the **static** TSC commands TSC-2, 3, 5, 6, 12 (static half), 14, 15 (static half), 16 (static half) and 17 verbatim from section D, each echoing `PASS TSC-n` or exiting non-zero with `FAIL TSC-n`. Lines for checks whose files don't exist yet print `SKIP TSC-n (stage X)` and are guarded with `test -e`. |
| `App.tsx` | Placeholder: runs `migrate()` + `seedIfEmpty()` and renders `AppText` "FocusKid". Stage 2 replaces it. Uses no raw `fontSize`. |
| `src/domain/timer/types.ts`, `constants.ts`, `elapsed.ts`, `fsm.ts` | Exactly as in B.5. `fsm.ts` is a single exported `transition()` built from a `switch (state.kind)` with exhaustive `never` checks. It does not mutate its input. |
| `src/domain/tasks/types.ts`, `validation.ts` | `Task`, `NewTask`, `TodayTaskView` types. `validateTask(input)` returns `{ ok: true, value } \| { ok: false, errors: ('TITLE_EMPTY' \| 'TITLE_TOO_LONG' \| 'TARGET_RANGE' \| 'DAYS_EMPTY')[] }`. |
| `src/services/clock/monotonic.ts` | `MonotonicClock` + `systemMonotonicClock` as in B.6. |
| `src/services/clock/wallClock.ts` | As in B.6. Uses `new Date()` + `getFullYear/getMonth/getDate/getDay/toISOString` only. **It must not call `Date.now()` or `.getTime()`.** |
| `src/services/db/Db.ts` | `export type SqlParam = string \| number \| null`; the `Db` interface (B.6). |
| `src/services/db/expoDb.ts` | `openExpoDb(): Promise<Db>` with `openDatabaseAsync`, the pragmas, `runAsync/getAllAsync/getFirstAsync/withTransactionAsync`. |
| `src/services/db/schema.ts` | `export const MIGRATIONS: readonly string[] = [V1_SQL]` with the B.4 DDL verbatim. |
| `src/services/db/migrations.ts`, `seed.ts` | As in B.6. |
| `src/services/repos/tasksRepo.ts`, `sessionsRepo.ts` | As in B.6. They map rows ↔ domain types (snake_case → camelCase) and use parameterized SQL only. |
| `src/services/timer/timerService.ts` | `createTimerService({ db, clock, wall, sessionsRepo, tasksRepo })`. Behaviour: rejects `start` if an active session exists (AS-05) or today's row exists (AS-04); persists each accepted transition plus a `session_events` row in one transaction; `checkpoint()` writes `elapsed_run_ms`/`paused_total_ms` computed at `clock.now()`; `hydrate()` implements the B.5 restore table. `verify/abandon` accept a `ParentToken` and call an injected `consumeToken(token): boolean`. In Stage 1 the default is a stub that returns `false`, and Stage 3 wires `authService.consumeToken`. |
| `test/setup.ts` | `@testing-library/react-native` matchers, `jest.mock('expo-keep-awake')`, a safe-area mock. |
| `test/helpers/nodeDb.ts` | `createNodeDb(): Db` on `new Database(':memory:')` with the same pragmas. `transaction` uses `BEGIN`/`COMMIT`/`ROLLBACK`. |
| `test/helpers/fakeClock.ts` | `createFakeClock(start = 1000)` returning `{ now(), advance(ms) }`. |
| Tests | `src/domain/timer/__tests__/fsm.transitions.test.ts` (one `it` per row T01–T22), `fsm.inv03.test.ts`, `fsm.inv04.test.ts`, `fsm.inv06.test.ts`, `elapsed.test.ts`; `src/domain/tasks/__tests__/validation.test.ts`; `src/services/clock/__tests__/monotonic.inv02.test.ts`; `src/services/db/__tests__/migrations.test.ts`, `verifiedImmutable.inv06.test.ts`; `src/services/repos/__tests__/tasksRepo.test.ts`, `sessionsRepo.test.ts`; `src/services/timer/__tests__/timerService.test.ts`; `test/config/appConfig.inv01.test.ts`. |

**Acceptance criteria:**

1. `transition()` is pure. A property-style test runs 1 000 random event sequences with a fake `now` and checks that the input state is deep-frozen (`Object.freeze`) and unchanged, that no result has `runElapsed > targetMs + addedMs` while still Running, and that `pausedTotalMs ≤ PAUSE_BUDGET_MS` always holds.
2. **INV-03:** COMPLETE at `remaining = 1 ms` is rejected with `EARLY_TERMINATION_FORBIDDEN`. VERIFY from Running or Paused is rejected. Only TICK or COMPLETE with `remaining = 0` reaches Completed. There is no event the child can send that moves a session out of Running without the time elapsing.
3. **INV-04:** pausing for 10 min of fake time and then TICKing yields Running with `pausedTotalMs = 300000` and an `AUTO_RESUMED` effect, and run time counted from the exact budget-exhaustion moment (T14 arithmetic). A further PAUSE is rejected with `PAUSE_BUDGET_EXHAUSTED`. Several short pauses that add up to 5 min behave the same way.
4. **INV-06:** every event type sent to Verified returns `VERIFIED_IMMUTABLE` with the identical state. At the SQL level, `UPDATE`/`DELETE` of a verified row throws an error containing `INV-06`, and `UPDATE ... SET status='verified'` from `running` throws `INV-03`.
5. **INV-02:** `monotonic.inv02.test.ts` drives `TimerService` with a fake monotonic clock while `jest.spyOn(Date, 'now')` and a mocked `Date` constructor jump ±24 h. Remaining time depends only on the monotonic clock. A backwards monotonic step clamps to 0 delta, so the timer never gains time.
6. **Hydration:** in `timerService.test.ts`, start, advance 7 s, checkpoint, then create a **new** service instance on the same `Db` with a fresh fake clock starting at 0 and hydrate. The restored state is Running with `runAccumMs = 7000` (±checkpoint granularity), and it completes after exactly `target − 7000` more ms.
7. **Single active and one-per-day:** a second `start()` while one session is Running is rejected. A second `start()` of the same task on the same `local_date` is rejected unless the first was abandoned.
8. **Migrations:** `migrate()` is idempotent (run twice → `user_version = 1`, no error). All tables, indexes and triggers exist (checked via `sqlite_master`).
9. **INV-01:** `appConfig.inv01.test.ts` asserts that `app.json` contains `android.blockedPermissions ⊇ [INTERNET]`, that `permissions` doesn't include it, that `orientation === 'default'`, and that `plugins` contains `./plugins/withNoInternet`. It also unit-tests the plugin's manifest transform on a fixture object containing INTERNET and asserts the `tools:node="remove"` result.
10. `npx tsc --noEmit` is clean under `strict`.

**Test commands:**

```bash
npm test -- --ci src/domain src/services test/config
npx tsc --noEmit
bash scripts/check-invariants.sh
```

**Out of scope:** any screen, navigation, auth implementation (the token stub is fine) and statistics.

---

### Stage 2 — Timer UI (child flow)

**Goal:** Build the child-facing experience: the Today list, the honest Timer screen (portrait and Desk-Clock landscape), the theme and base accessible components, the stores and the ticking/checkpoint hooks.

**Context needed:** sections B.1, B.2, B.3 and B.5 of this plan, plus INV-03, INV-04, INV-08 and INV-10. The Stage 1 services already exist. Consume them and do not change their contracts (additive changes only).

**Dependencies:**

```bash
npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

**Files to create or modify:**

| File | Content |
|---|---|
| `src/i18n/uk.ts` | `export const uk = { today: { title: 'Мої завдання на сьогодні', parentButton: 'Батьки', active: 'Іде таймер' }, timer: { pause: 'Пауза', resume: 'Продовжити', addTime: '+5 хв', pauseLeft: 'Пауза: залишилось', awaiting: 'Очікує перевірки', showParent: 'Покажи батькам', verified: 'Молодець! Перевірено' }, status: { idle: 'Не розпочато', running: 'Триває', paused: 'Пауза', completed: 'Очікує перевірки', verified: 'Перевірено' }, … } as const;` |
| `src/ui/theme.ts` | `MIN_FONT_SP = 48`, `MIN_TOUCH_DP = 48`; `typography = { body: 48, title: 56, timer: 120, timerLandscape: 160 }`. Every value is ≥ `MIN_FONT_SP`. Status colors: `idle`, `active`, `awaiting`, `verified` (green), each with a text-on-color pair meeting WCAG AA 4.5:1 (checked in Stage 4). Plus a spacing scale. |
| `src/ui/components/AppText.tsx` | The **only** text component: `variant: keyof typeof typography`, `allowFontScaling` stays true, and it accepts `accessibilityRole`/`accessibilityLiveRegion`. |
| `src/ui/components/TapTarget.tsx` | The **only** file that may render `Pressable`. Enforces `minWidth/minHeight = MIN_TOUCH_DP` and a `hitSlop` that brings the effective area to ≥ 48dp. It requires the props `accessibilityLabel: string` and `accessibilityRole: 'button' \| 'link' \| 'tab'` (TypeScript-required, not optional), and it supports `disabled` → `accessibilityState={{ disabled }}`. |
| `src/ui/components/TaskCard.tsx` | A `TapTarget` showing emoji, title, target minutes and a status pill. The label reads, for example, "Читання, 15 хвилин, Не розпочато". |
| `src/ui/components/ProgressBar.tsx` | A View-based progress bar (no svg) with `accessibilityRole="progressbar"` and `accessibilityValue={{ min: 0, max: total, now: elapsed }}`. |
| `src/ui/hooks/useOrientation.ts`, `useTicker.ts`, `useAppStateCheckpoint.ts` | As in B.6. `useTicker` uses `setInterval` purely as a **wake-up**: it never accumulates time itself, because time comes from `clock.now()`. |
| `src/state/appServices.ts` | `createAppServices({ db, clock, wall })` builds the repos and services. A React context `AppServicesProvider` and `useServices()`. |
| `src/state/timerStore.ts` | A zustand store: `snapshot` (the FSM state + sessionId + taskId), `lastError`, and the actions `start, pause, resume, addTime, tick, requestComplete, hydrate`. Each action calls `timerService` and then sets `snapshot` from `getSnapshot()`. |
| `src/state/tasksStore.ts` | `todayTasks: TodayTaskView[]`, `refreshToday()`. |
| `src/navigation/routes.ts`, `RootNavigator.tsx` | The B.2 param list. Stage 2 registers `Today`, `Timer` and a **stub** `PinGate` screen showing a "Скоро" text, which Stage 3 replaces. |
| `src/screens/TodayScreen.tsx` | B.3. Uses a `FlatList` of `TaskCard`s and shows the active-session badge. Tapping an Idle task calls `start` and navigates to Timer. Tapping another task opens its Timer view. While another task is active, the `start` error (`AS-05`) is shown as a friendly message. |
| `src/screens/TimerScreen.tsx` | B.3. **It must not render any control that maps to COMPLETE before `remaining = 0`.** The Pause button is disabled with a label once the budget is spent. "+5 хв" is disabled at the limit. It shows the remaining time `mm:ss` with `accessibilityLiveRegion="polite"` and announces each minute boundary and the COMPLETED / AUTO_RESUMED effects via `AccessibilityInfo.announceForAccessibility`. `activateKeepAwakeAsync` runs while Running. `BackHandler` navigates to Today without changing the state. The landscape layout comes from `useOrientation()`. |
| `App.tsx` | Opens `expoDb`, runs `migrate` + `seedIfEmpty`, creates the services, hydrates `timerStore`, then renders `AppServicesProvider` → `SafeAreaProvider` → `NavigationContainer` → `RootNavigator`. Shows a loading `AppText` until ready. |
| `test/helpers/renderWithApp.tsx` | Builds services on `createNodeDb()` + `createFakeClock()` and renders a screen inside the providers and a `NavigationContainer`. |
| Tests | `src/screens/__tests__/TodayScreen.test.tsx`, `TimerScreen.test.tsx`, `landscapeParity.inv08.test.tsx`; `src/state/__tests__/timerStore.test.ts`; `src/ui/__tests__/theme.inv10.test.ts`. |

**Acceptance criteria:**

1. **TimerScreen (INV-03):** there is no element with a label or text matching `/стоп|stop|завершити|finish/i` in any non-Completed state. Advancing the fake clock to `target − 1 ms` keeps "Покажи батькам" absent. At `target` it appears, along with the text "Очікує перевірки".
2. **Pause (INV-04):** pressing Pause and then advancing 5 min of fake clock and ticking leaves the screen Running. The Pause button then has `accessibilityState.disabled === true`.
3. **Add time:** "+5 хв" increases the remaining time by exactly 300 s. After 12 presses the button is disabled.
4. **INV-08:** `landscapeParity.inv08.test.tsx` renders the Timer in portrait, starts the session and advances 30 s, then re-renders with landscape dimensions (mocked `useWindowDimensions`). Remaining time, state and the pause budget are identical, and only the layout testID (`timer-layout-portrait` vs `timer-layout-landscape`) changes.
5. **Today:** it shows only non-archived tasks scheduled for today's weekday (fake wall clock). Status pills reflect the session rows. Starting a second task while one is Running shows the AS-05 message and does not navigate.
6. **Theme (INV-10):** `theme.inv10.test.ts` asserts that every `typography` value is ≥ 48 and that `MIN_TOUCH_DP ≥ 48`. A rendered `TapTarget` has a flattened style with `minHeight ≥ 48` and `minWidth ≥ 48`.
7. **Restart:** a `timerStore.hydrate()` after a simulated restart (new services on the same node DB) restores the Running screen.
8. All Stage 1 tests still pass. `tsc` is clean.

**Test commands:**

```bash
npm test -- --ci src/screens src/state src/ui
npm test -- --ci
npx tsc --noEmit
bash scripts/check-invariants.sh
```

**Out of scope:** real PIN entry, verification, task editing and statistics.

---

### Stage 3 — Tasks CRUD + parent PIN gate

**Goal:** Build local PIN auth (setup, verify, lockout, change), the parent session and guard, the verification and abandon flows, and the parent task management screens.

**Context needed:** sections A.2 (AS-08, AS-12, AS-13, AS-14, AS-18), B.2, B.3 and B.6 of this plan, plus INV-05, INV-06 and INV-09. Stage 1 and 2 contracts are additive-only.

**Dependencies:** none new. `@noble/hashes@^1` and `expo-crypto` were already installed in Stage 1.

**Files to create or modify:**

| File | Content |
|---|---|
| `src/services/auth/pinHash.ts` | `isValidPinFormat(pin)` → `/^\d{4}$/`. `hashPin(pin, salt: Uint8Array, iterations)` → hex via `pbkdf2(sha256, utf8(pin), salt, { c: iterations, dkLen: 32 })`. `verifyPin(pin, record)` uses a constant-time XOR compare over equal-length byte arrays. `PBKDF2_ITERATIONS = 50_000`. |
| `src/services/repos/authRepo.ts` | As in B.6. **It never stores or logs a plaintext PIN.** |
| `src/services/auth/authService.ts` | `createAuthService({ authRepo, clock, randomBytes = expoCrypto.getRandomBytes, iterations = PBKDF2_ITERATIONS })`. Lockout per AS-12, with the remaining time computed from `clock.now()`. On cold start, if `failed_attempts ≥ 5`, a 30 s lockout begins at the first `attempt`. Parent session per AS-14, with `touch()` called by guarded screens on interaction. Single-use `ParentToken` with `{ id, issuedAt }`, valid for 30 s and consumed once. `changePin(currentPin, newPin)` requires the current PIN. |
| `src/state/parentSessionStore.ts` | A zustand store: `isActive`, `lockoutRemainingMs`, and the actions `attempt(pin, intent)`, `exit()`, `touch()`. |
| `src/state/appServices.ts` | Wire `authService.consumeToken` into `timerService` (this replaces the Stage 1 stub). |
| `src/ui/components/PinPad.tsx` | Digits 0–9 and ⌫ as `TapTarget`s (≥ 48dp, AppText ≥ 48sp), 4 dot indicators with `accessibilityLabel` "Введено N з 4 цифр", and `onComplete(pin)`. Digit buttons are labelled "Цифра 1" and so on. TalkBack never reads typed digits back aloud. |
| `src/screens/PinSetupScreen.tsx` | Enter the PIN, then confirm it. A mismatch shows an error and resets. Shows the AS-13 no-recovery notice. On success it calls `navigation.reset` to `Today`. |
| `src/screens/PinGateScreen.tsx` | Replaces the stub. Shows the lockout countdown (monotonic) with the PinPad disabled. On success: `enterParent` → `replace('ParentHome')`; `verify` → `timerStore.verify(sessionId, token)` then back to Timer or Today with a green state; `abandon` → confirm dialog (TapTargets), then `timerStore.abandon`. |
| `src/navigation/ParentGuard.tsx` | As in B.2. It also listens for the session expiring while mounted and redirects. |
| `src/navigation/RootNavigator.tsx` | Initial route is `PinSetup` when `!authService.hasPin()`, otherwise `Today`. Adds the guarded parent screens. |
| `src/screens/ParentHomeScreen.tsx` | B.3. The awaiting-verification list. Each item has "Перевірити", which opens PinGate{verify}, and "Скасувати сесію" (AS-08), which opens PinGate{abandon}. |
| `src/screens/TaskListEditScreen.tsx`, `TaskEditScreen.tsx` | B.3. Validation through `validateTask`, with errors shown as `AppText`. Archive vs. delete per AS-18 (the UI shows "Архівувати" when the task has sessions). Reorder via `tasksRepo.move(id, 'up' \| 'down')`. |
| `src/state/timerStore.ts`, `src/screens/TimerScreen.tsx` | Add the `verify` and `abandon` actions. Completed "Покажи батькам" → PinGate{verify}. |
| Tests | `src/services/auth/__tests__/pinHash.test.ts`, `authService.test.ts`; `src/services/repos/__tests__/authRepo.test.ts`; `src/navigation/__tests__/parentGuard.inv05.test.tsx`; `src/screens/__tests__/verifyFlow.test.tsx`, `TaskEditScreen.test.tsx`, `PinSetupScreen.test.tsx`. |

**Acceptance criteria:**

1. **Hashing:** `pinHash.test.ts` checks against a known PBKDF2-HMAC-SHA256 test vector (password "password", salt "salt", c=1, dkLen 32 → `120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b`). A wrong PIN fails. The salt is 16 random bytes. Two setups of the same PIN produce different hashes.
2. **No plaintext:** after `setupPin('1234')`, no column of `parent_auth` contains the substring `1234` (`authRepo.test.ts`). No `console.*` call in `src/services/auth` receives the PIN (checked with `jest.spyOn(console, …)`).
3. **Lockout:** 5 wrong attempts → `lockoutRemainingMs ≈ 30000` and `attempt` returns `LOCKED` without hashing (spy). Advancing the fake monotonic clock 30 s → attempts are allowed again. A 6th failure → 60 s. **Mocking `Date.now` forward 1 h does not unlock** (INV-02). A correct PIN resets the counter.
4. **INV-05 guard:** `parentGuard.inv05.test.tsx` covers four cases. Navigating directly to `ParentHome`, `TaskListEdit`, `TaskEdit` or `Stats` without a session ends on `PinGate`. After a correct PIN, ParentHome renders. After 120 s of fake idle, or an AppState `background` event, the next render redirects to PinGate. `timerService.verify` with a missing, reused or expired token returns `PARENT_AUTH_REQUIRED` and the row stays `completed`.
5. **Verify flow:** `verifyFlow.test.tsx` runs start → advance to target → "Покажи батькам" → enter correct PIN → the TaskCard on Today shows "Перевірено" in the green style. A subsequent attempt to abandon or verify again leaves the row `verified` (INV-06). A wrong PIN leaves it `completed`.
6. **Child cannot reach parent features:** there is no navigation path from `Today` or `Timer` to a parent screen except through `PinGate`. This is asserted by iterating the guarded routes in the test.
7. **Task CRUD:** creating, editing and archiving reflect in `TodayScreen`. Validation errors show for an empty title, more than 60 characters, a target outside 1–120 and no weekdays. Deleting a task with sessions is impossible (archive only).
8. **INV-09:** no copy anywhere uses punishment or streak framing. `uk.ts` is reviewed, and TSC-14 is green.
9. All earlier tests pass. `tsc` is clean.

**Test commands:**

```bash
npm test -- --ci src/services/auth src/services/repos src/navigation src/screens
npm test -- --ci
npx tsc --noEmit
bash scripts/check-invariants.sh
```

**Out of scope:** the statistics UI and the release pipeline.

---

### Stage 4 — Statistics + accessibility + polish (+ release plumbing)

**Goal:** Build parent statistics, run a full accessibility pass (INV-10 and TalkBack), add landscape polish, error handling and an embedded-JS debug APK, and build the release script that produces the GitHub Release.

**Context needed:** sections B.3, B.6 and E of this plan, plus INV-01, INV-08, INV-09 and INV-10.

**Dependencies:** none new.

**Files to create or modify:**

| File | Content |
|---|---|
| `src/domain/stats/aggregate.ts` | Pure functions. `summarizeWeek(rows, weekDates: string[])` returns `{ days: { localDate, verified, focusedMinutes }[], totalVerified, totalMinutes }`, filling missing days with 0. `perTask(rows)` sorts by minutes descending. Minutes use `Math.floor(ms / 60000)`. **There is no streak computation.** |
| `src/services/stats/statsService.ts` | Uses `sessionsRepo.rangeStats` plus a per-task query. The week is Mon–Sun via `wallClock.addDays` and `weekdayIndex`. Only `verified` sessions count. Archived tasks still appear with "(архів)". |
| `src/ui/components/StatBar.tsx` | A View bar with the value label always shown as text and a combined `accessibilityLabel` such as "Понеділок: 2 завдання, 35 хвилин". It doesn't rely on color alone. |
| `src/screens/StatsScreen.tsx` | B.3, guarded by `ParentGuard`. In landscape it shows a two-column layout. The empty state reads "Ще немає перевірених завдань цього тижня". |
| `src/ui/components/ErrorBoundary.tsx` | Catches render errors and shows "Щось пішло не так" with a "Спробувати ще" `TapTarget`. It doesn't report errors anywhere (no network). Wraps the navigator in `App.tsx`. |
| `src/screens/*` (polish) | Every interactive element goes through `TapTarget`, and every text through `AppText`. `accessibilityRole="header"` on titles. Focus order is logical. Desk-Clock landscape layouts exist for Today and ParentHome too. `accessibilityLiveRegion` is used sparingly, with announcements at most once per minute on Timer. |
| `plugins/withBundledDebugJs.js` | `withAppBuildGradle`: idempotently inserts `debuggableVariants = []` inside the `react { }` block of `android/app/build.gradle` so `assembleDebug` embeds `index.android.bundle` (AS-17). It is added to `app.json` `plugins`. |
| `scripts/release-apk.sh` | `set -euo pipefail`. Args: `<tag>` (for example `v0.1.0`) and an optional `<pr-number>`. Steps: run section E steps 1–7 in order, copy the APK to `dist/focuskid-<tag>-debug.apk`, `gh release create <tag> dist/focuskid-<tag>-debug.apk --title "FocusKid <tag>" --notes-file <generated notes> --prerelease`, and print the asset URL. If a PR number is given, `gh pr comment <pr> --body "📦 APK: <url>"`. It refuses to run if the working tree is dirty or the tag already exists. |
| `package.json` | Adds `"release:apk": "bash scripts/release-apk.sh"`. |
| `.github/workflows/ci.yml` | On `pull_request`, run `npm ci`, `npm test -- --ci`, `npx tsc --noEmit` and `bash scripts/check-invariants.sh`. This is CI infrastructure only and doesn't touch the app's network posture. No APK build in CI. |
| `README.md` | New file: what the app is, the dev commands, the release procedure (section E), and the no-PIN-recovery note. |
| Tests | `src/domain/stats/__tests__/aggregate.test.ts`; `src/services/stats/__tests__/statsService.test.ts`; `src/screens/__tests__/StatsScreen.test.tsx`; `src/ui/__tests__/a11y.inv10.test.tsx`, `contrast.test.ts`; `test/config/bundledDebugJs.test.ts`; extend `src/screens/__tests__/landscapeParity.inv08.test.tsx` to cover Today, Stats and PinGate. |

**Acceptance criteria:**

1. **Stats correctness:** with fixture sessions (verified, completed, abandoned, across 9 days), only verified sessions inside Mon–Sun of the given week are counted, missing days show 0, and minutes are floored. `aggregate.ts` exports nothing named `*streak*`.
2. **Stats gate (INV-05):** `StatsScreen` without a parent session redirects to PinGate (it is included in `parentGuard.inv05.test.tsx`).
3. **INV-10 a11y audit:** `a11y.inv10.test.tsx` renders **every** screen in every relevant state through `renderWithApp`. It walks the tree and asserts three things. Every node with `onPress` has a non-empty `accessibilityLabel` and an `accessibilityRole`. Every pressable's flattened style has `minWidth ≥ 48` and `minHeight ≥ 48`. Every `Text` node's flattened `fontSize ≥ 48`.
4. **Contrast:** `contrast.test.ts` computes WCAG relative luminance for every text/background pair in `theme.ts` and asserts a ratio ≥ 4.5.
5. **INV-08:** landscape parity holds for Timer, Today, Stats and PinGate. A typed partial PIN survives rotation.
6. **Debug APK is self-contained:** `bundledDebugJs.test.ts` applies the plugin transform to a fixture `build.gradle` and asserts `debuggableVariants = []` appears exactly once, including after a second application.
7. **APK:** section E steps 1–7 succeed locally. A manual smoke test on an emulator or device in **airplane mode** walks through PIN setup → start task → pause → auto-resume → complete → verify → stats. Record the result in the PR description.
8. The whole of section D is green, including TSC-4, TSC-19 and TSC-20 after the release step.

**Test commands:**

```bash
npm test -- --ci src/domain/stats src/services/stats src/screens src/ui test/config
npm test -- --ci
npx tsc --noEmit
bash scripts/check-invariants.sh
bash scripts/release-apk.sh v0.1.0 <PR_NUMBER>   # only after explicit go-ahead; publishes externally
```

**Known risk R-1.** A debug build without INTERNET can't reach Metro, so React Native dev-support should fall back to the embedded bundle. If the APK shows a red "Could not connect to development server" screen instead, extend `withBundledDebugJs.js` so that `MainApplication`'s `getUseDeveloperSupport()` returns `false` (via `withMainApplication`), and re-verify. Do not "fix" this by adding the INTERNET permission back.

---

## D. TSC table (Technical Success Criteria)

Run every command from the repository root. Commands are written without `|` characters so they can be copied verbatim out of the table. TSC-4, TSC-19 and TSC-20 require that the build and release steps in section E have run. `scripts/check-invariants.sh` runs the static rows.

| ID | Covers | Criterion -- verify: command |
|---|---|---|
| TSC-1 | Tests | The whole Jest suite (unit, integration, UI) passes with no failures or skipped suites -- verify: `npm test -- --ci` |
| TSC-2 | TypeScript | The project type-checks cleanly with `strict: true` set in tsconfig.json -- verify: `npx tsc --noEmit && grep -qE '"strict":\s*true' tsconfig.json` |
| TSC-3 | INV-01 | `app.json` blocks `android.permission.INTERNET` and never requests it -- verify: `node -e "const a=require('./app.json').expo.android;const b=a.blockedPermissions ?? [];const p=a.permissions ?? [];process.exit(b.includes('android.permission.INTERNET') && !p.includes('android.permission.INTERNET') ? 0 : 1)"` |
| TSC-4 | INV-01 | The merged AndroidManifest that is packaged into the debug APK contains no INTERNET permission -- verify: `test -d android/app/build/intermediates/merged_manifests/debug && ! grep -rq "android.permission.INTERNET" android/app/build/intermediates/merged_manifests/debug` |
| TSC-5 | INV-01 | No networking, analytics, telemetry, ads or IAP dependency, and no network API usage in source -- verify: `! grep -qF -e '"firebase"' -e '@react-native-firebase/' -e '@sentry/' -e 'sentry-expo' -e '"axios"' -e '"expo-updates"' -e '"expo-notifications"' -e '"expo-network"' -e '@react-native-community/netinfo' -e 'google-mobile-ads' -e 'react-native-iap' -e 'expo-in-app-purchases' -e '@segment/' -e 'mixpanel' -e '@amplitude/' package.json && ! grep -rnE -e "\bfetch\(" -e "XMLHttpRequest" -e "new WebSocket\(" src App.tsx` |
| TSC-6 | INV-02 | No wall-clock duration math anywhere in app code. `Date` is constructed only in `wallClock.ts`, and the monotonic clock is `performance.now()` -- verify: `! grep -rnE --exclude-dir=__tests__ -e "Date\.now\(" -e "\.getTime\(\)" -e "performance\.timeOrigin" src App.tsx && ! grep -rnF --exclude-dir=__tests__ --exclude=wallClock.ts "new Date(" src App.tsx && grep -qF "performance.now()" src/services/clock/monotonic.ts` |
| TSC-7 | INV-02 | Behaviour: the timer and lockout ignore wall-clock jumps and never gain time on a backwards step -- verify: `npm test -- --ci src/services/clock src/domain/timer/__tests__/elapsed.test.ts src/services/timer src/services/auth/__tests__/authService.test.ts` |
| TSC-8 | INV-03 | The child can't reach Completed or Verified before the target time, and the Timer UI has no stop or finish control -- verify: `npm test -- --ci src/domain/timer/__tests__/fsm.inv03.test.ts src/domain/timer/__tests__/fsm.transitions.test.ts src/screens/__tests__/TimerScreen.test.tsx` |
| TSC-9 | INV-04 | Pause is capped at 5 min per session with exact auto-resume, and further pauses are rejected -- verify: `npm test -- --ci src/domain/timer/__tests__/fsm.inv04.test.ts` |
| TSC-10 | INV-05 | Parent screens, statistics, verification and abandon require a valid local PIN. The PIN is PBKDF2-hashed and never stored in plaintext -- verify: `npm test -- --ci src/navigation/__tests__/parentGuard.inv05.test.tsx src/services/auth src/services/repos/__tests__/authRepo.test.ts src/screens/__tests__/verifyFlow.test.tsx` |
| TSC-11 | INV-06 | Verified is final at both the FSM level and the SQLite trigger level -- verify: `npm test -- --ci src/domain/timer/__tests__/fsm.inv06.test.ts src/services/db/__tests__/verifiedImmutable.inv06.test.ts` |
| TSC-12 | INV-07 | `expo-sqlite` is the only persistence. There are no alternative storage dependencies or APIs, and the schema migrates correctly -- verify: `grep -qF '"expo-sqlite"' package.json && ! grep -qF -e '@react-native-async-storage/' -e 'react-native-mmkv' -e '"realm"' -e 'watermelondb' -e 'expo-secure-store' -e 'expo-file-system' package.json && ! grep -rnF -e "AsyncStorage" -e "localStorage" src && npm test -- --ci src/services/db src/services/repos` |
| TSC-13 | INV-08 | Both orientations are enabled, and rotation preserves timer, PIN and stats state -- verify: `grep -qF '"orientation": "default"' app.json && npm test -- --ci src/screens/__tests__/landscapeParity.inv08.test.tsx` |
| TSC-14 | INV-09 | No streak penalties, ads, paywalls or purchases in code or copy -- verify: `! grep -rniF --exclude-dir=__tests__ -e streak -e paywall -e purchase -e subscription -e advert -e admob -e реклам -e підписк -e штраф src` |
| TSC-15 | INV-10 | Every typography token is ≥ 48sp, there are no raw `fontSize` literals outside the theme, and contrast is ≥ 4.5:1 -- verify: `! grep -rnE --exclude=theme.ts --exclude-dir=__tests__ "fontSize:\s*[0-9]" src App.tsx && npm test -- --ci src/ui/__tests__/theme.inv10.test.ts src/ui/__tests__/contrast.test.ts` |
| TSC-16 | INV-10 | Every touch target is ≥ 48×48dp with a TalkBack label and role, and pressables are rendered only through `TapTarget` -- verify: `! grep -rlE --include=*.tsx --exclude=TapTarget.tsx -e "<Pressable\b" -e "<Touchable[A-Za-z]*\b" -e "<Button\b" src && npm test -- --ci src/ui/__tests__/a11y.inv10.test.tsx` |
| TSC-17 | Distribution | No APK or AAB is tracked in git, and generated native dirs and artifacts are ignored -- verify: `test -z "$(git ls-files '*.apk' '*.aab')" && grep -qxF '*.apk' .gitignore && grep -qxF 'android/' .gitignore && grep -qxF 'dist/' .gitignore` |
| TSC-18 | INV-01 | The no-INTERNET config plugin and the embedded-JS plugin are registered and their transforms are unit-tested -- verify: `grep -qF './plugins/withNoInternet' app.json && grep -qF './plugins/withBundledDebugJs' app.json && npm test -- --ci test/config` |
| TSC-19 | Build | The debug APK is produced by Gradle -- verify: `test -s android/app/build/outputs/apk/debug/app-debug.apk` |
| TSC-20 | Distribution | The APK is published as an asset of the GitHub Release for the tag -- verify: `gh release download v0.1.0 --pattern 'focuskid-v0.1.0-debug.apk' --dir /tmp/fk-release-verify --clobber` |

TSC-19 and TSC-20 succeed only when the artifact exists. `gh release download` exits non-zero if no asset matches the pattern.

**Coverage matrix:**

| Invariant | TSC rows |
|---|---|
| INV-01 | 3, 4, 5, 18 |
| INV-02 | 6, 7 |
| INV-03 | 8 |
| INV-04 | 9 |
| INV-05 | 10 |
| INV-06 | 11 |
| INV-07 | 12 |
| INV-08 | 13 |
| INV-09 | 14 |
| INV-10 | 15, 16 |
| Tests | 1 |
| Strict TypeScript | 2 |
| Binary hygiene | 17 |
| Build | 19 |
| Release | 20 |

---

## E. Definition of done

The project, and each stage at its own scope, is **done** only when all of the following hold. Steps 1–4 apply to every stage PR. Steps 1–10 apply to the final Stage 4 delivery.

**Prerequisites** on the build machine:

- Node LTS (≥ 20) and npm
- JDK 17
- Android SDK with `ANDROID_HOME` set (platform and build-tools matching the Expo SDK)
- `gh` authenticated with push and release rights on the repo

| # | Gate | Command | Pass condition |
|---|---|---|---|
| 1 | Clean install | `npm ci` | exit 0 |
| 2 | **Tests green** | `npm test -- --ci` | exit 0, 0 failed (TSC-1) |
| 3 | **tsc clean** | `npx tsc --noEmit` | exit 0, no diagnostics, `strict: true` (TSC-2) |
| 4 | Static invariants | `bash scripts/check-invariants.sh` | every line `PASS` (no `FAIL`). `SKIP` is allowed only for rows belonging to a later stage. |
| 5 | **Native project generation** | `npx expo prebuild --platform android --clean` | exit 0. `android/` is generated, not committed (TSC-17). |
| 6 | **Gradle debug build** | `cd android && ./gradlew assembleDebug; cd ..` | `BUILD SUCCESSFUL`, `android/app/build/outputs/apk/debug/app-debug.apk` exists (TSC-19) |
| 7 | Shipped manifest has no INTERNET | TSC-4 command | exit 0 |
| 8 | Airplane-mode smoke test | Install with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` on an emulator or device with networking off | Full loop works (Stage 4 AC-7). The result is written in the PR. |
| 9 | **APK in a GitHub Release** | `mkdir -p dist && cp android/app/build/outputs/apk/debug/app-debug.apk dist/focuskid-v0.1.0-debug.apk && gh release create v0.1.0 dist/focuskid-v0.1.0-debug.apk --title "FocusKid v0.1.0" --notes "Offline debug build. Tests green, tsc clean, no INTERNET permission." --prerelease` (or `bash scripts/release-apk.sh v0.1.0 <PR>`) | Release exists, and TSC-20 downloads `focuskid-v0.1.0-debug.apk` |
| 10 | Link posted to the PR | `gh pr comment <PR> --body "📦 APK: $(gh release view v0.1.0 --json assets --jq '.assets[0].url')"` | Comment is visible on the PR. The APK is **not** committed (TSC-17). |

**Additional done conditions:**

- Every TSC in section D is green, which means all of INV-01 to INV-10 are covered.
- `VISION.md` is unchanged: `git diff --exit-code main -- VISION.md` exits 0.
- Every ⚠ assumption (AS-08) has been called out in the PR description for product-owner acknowledgement.
- **Publishing is outward-facing.** Steps 9–10 create public artifacts, so the executing agent needs the repository owner's explicit go-ahead for the specific tag before running them. If a tag already exists, bump it (for example `v0.1.1`) and never overwrite a published release.


## Today visibility and destructive-action clarification (2026-10-25)

- [x] Capture context services in TaskEdit and PinGate and pass them to every screen refreshToday call.
- [x] Regress context-only Save against seeded + newly created Friday tasks, without remounting Today.
- [x] Keep mutually exclusive archive/delete actions and explain each using localized scalable captions.
- Schema, invariant definitions, timer transitions and authorization rules unchanged.
- Validation and RED/GREEN evidence: `docs/evidence/today-preserve-*.log`.
- Native screenshot verification at 320/366/413dp remains unavailable: no adb/device in this environment. Caption uses unrestricted wrapping within the existing scrollable form and semantic AppText tokens.
