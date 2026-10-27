export const V1_SQL = `
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
CREATE UNIQUE INDEX ux_sessions_one_active ON sessions ((1)) WHERE status IN ('running', 'paused');

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
`;

/**
 * V2 (owner item F1): the `iterations >= 50000` CHECK forced an expensive PIN
 * verification. SQLite cannot alter a CHECK constraint, so the single-row table
 * is rebuilt with `iterations >= 1`; row data (including legacy 50k records) is
 * copied verbatim and verified with its stored cost exactly as before.
 */
const V2_SQL = `
CREATE TABLE parent_auth_v2 (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  algo             TEXT    NOT NULL DEFAULT 'pbkdf2-sha256',
  iterations       INTEGER NOT NULL CHECK (iterations >= 1),
  salt_hex         TEXT    NOT NULL CHECK (length(salt_hex) = 32),
  hash_hex         TEXT    NOT NULL CHECK (length(hash_hex) = 64),
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  updated_at       TEXT    NOT NULL
);
INSERT INTO parent_auth_v2 (id, algo, iterations, salt_hex, hash_hex, failed_attempts, updated_at)
  SELECT id, algo, iterations, salt_hex, hash_hex, failed_attempts, updated_at FROM parent_auth;
DROP TABLE parent_auth;
ALTER TABLE parent_auth_v2 RENAME TO parent_auth;
`;

/**
 * V3 (owner item C4): parent task creation gains a 'Скільки разів на день'
 * (times-per-day) field. `target_per_day` defaults to 1 (range 1..10) so every
 * existing task keeps its current behaviour (complete once per day).
 */
const V3_SQL = `
ALTER TABLE tasks ADD COLUMN target_per_day INTEGER NOT NULL DEFAULT 1
  CHECK (target_per_day BETWEEN 1 AND 10);
`;

/**
 * V4 (C5): child settings key/value store. SQLite is the app's only storage
 * (INV-07 / TSC-12 — no alternative key-value dependency), so the mascot
 * choice (and any future preference) persists here.
 */
const V4_SQL = `
CREATE TABLE settings (
  key        TEXT PRIMARY KEY CHECK (length(trim(key)) BETWEEN 1 AND 64),
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * V5 (round-1 HIGH C4): `target_per_day` needs up to N non-abandoned sessions
 * per task per local day, and N-per-day cannot be expressed as a UNIQUE index
 * (N varies per row) — so the one-per-day partial index is dropped and the rule
 * is enforced in the service layer (`timerService.doStart` →
 * SESSION_LIMIT_REACHED_TODAY). `ux_sessions_one_active` (AS-05) is untouched.
 */
const V5_SQL = `
DROP INDEX ux_sessions_task_day;
`;

/**
 * V6 (C8): seed the jingle preferences from `docs/JINGLE_DESIGN.md` §3.1 so
 * every install starts with an explicit default instead of relying on the
 * store's fallback. Key/value rows only (no column add), idempotent by virtue
 * of INSERT OR IGNORE — `updated_at` uses SQLite's UTC ISO-8601 with
 * milliseconds, the same contract as the `WallClock.nowIso()` writes.
 */
const V6_SQL = `
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('@focuskid/jingle_volume', '0.5', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('@focuskid/jingle_enabled', 'true', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`;

/** V7 adds a validated category with a neutral default for existing tasks. */
const V7_SQL = `
ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('homework','reading','sport','other'));
`;

const V8_SQL = `ALTER TABLE sessions ADD COLUMN indefinite_pause INTEGER NOT NULL DEFAULT 0 CHECK (indefinite_pause IN (0,1));`;

export const MIGRATIONS: readonly string[] = [
  V1_SQL,
  V2_SQL,
  V3_SQL,
  V4_SQL,
  V5_SQL,
  V6_SQL,
  V7_SQL,
  V8_SQL,
];
