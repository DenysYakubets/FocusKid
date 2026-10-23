import { Db } from '../db/Db';

export type SessionStatus = 'running' | 'paused' | 'completed' | 'verified' | 'abandoned';

export interface SessionRow {
  id: number;
  taskId: number;
  localDate: string;
  status: SessionStatus;
  targetMs: number;
  addedMs: number;
  elapsedRunMs: number;
  pausedTotalMs: number;
  pauseCount: number;
  startedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

interface DbSessionRow {
  id: number;
  task_id: number;
  local_date: string;
  status: SessionStatus;
  target_ms: number;
  added_ms: number;
  elapsed_run_ms: number;
  paused_total_ms: number;
  pause_count: number;
  started_at: string;
  completed_at: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface SessionEventRow {
  id: number;
  sessionId: number;
  event: string;
  fromState: string;
  toState: string;
  runMs: number;
  createdAt: string;
}

export interface RangeStat {
  localDate: string;
  verified: number;
  runMs: number;
}

function mapSession(row: DbSessionRow): SessionRow {
  return {
    id: row.id,
    taskId: row.task_id,
    localDate: row.local_date,
    status: row.status,
    targetMs: row.target_ms,
    addedMs: row.added_ms,
    elapsedRunMs: row.elapsed_run_ms,
    pausedTotalMs: row.paused_total_ms,
    pauseCount: row.pause_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
  };
}

export interface SessionsRepo {
  insertRunning(session: {
    taskId: number;
    localDate: string;
    targetMs: number;
    startedAt: string;
    updatedAt: string;
  }): Promise<SessionRow>;
  checkpoint(
    id: number,
    elapsedRunMs: number,
    pausedTotalMs: number,
    updatedAt: string
  ): Promise<void>;
  setStatus(
    id: number,
    status: SessionStatus,
    extra: {
      addedMs?: number;
      elapsedRunMs?: number;
      pausedTotalMs?: number;
      pauseCount?: number;
      completedAt?: string | null;
      verifiedAt?: string | null;
      updatedAt: string;
    }
  ): Promise<void>;
  getActive(): Promise<SessionRow | null>;
  getTodayForTask(taskId: number, localDate: string): Promise<SessionRow | null>;
  listCompleted(): Promise<SessionRow[]>;
  get(id: number): Promise<SessionRow | null>;
  appendEvent(event: {
    sessionId: number;
    event: string;
    fromState: string;
    toState: string;
    runMs: number;
    createdAt: string;
  }): Promise<void>;
  rangeStats(startDate: string, endDate: string): Promise<RangeStat[]>;
}

export function createSessionsRepo(db: Db): SessionsRepo {
  return {
    async insertRunning(session): Promise<SessionRow> {
      const res = await db.run(
        `INSERT INTO sessions (task_id, local_date, status, target_ms, added_ms, elapsed_run_ms, paused_total_ms, pause_count, started_at, updated_at)
         VALUES (?, ?, 'running', ?, 0, 0, 0, 0, ?, ?);`,
        [session.taskId, session.localDate, session.targetMs, session.startedAt, session.updatedAt]
      );

      const created = await this.get(res.lastInsertRowId);
      if (!created) {
        throw new Error(`Failed to retrieve newly created session ${res.lastInsertRowId}`);
      }
      return created;
    },

    async checkpoint(
      id: number,
      elapsedRunMs: number,
      pausedTotalMs: number,
      updatedAt: string
    ): Promise<void> {
      await db.run(
        `UPDATE sessions SET elapsed_run_ms = ?, paused_total_ms = ?, updated_at = ? WHERE id = ?;`,
        [elapsedRunMs, pausedTotalMs, updatedAt, id]
      );
    },

    async setStatus(id: number, status: SessionStatus, extra): Promise<void> {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`Session ${id} not found`);
      }

      const addedMs = extra.addedMs !== undefined ? extra.addedMs : existing.addedMs;
      const elapsedRunMs =
        extra.elapsedRunMs !== undefined ? extra.elapsedRunMs : existing.elapsedRunMs;
      const pausedTotalMs =
        extra.pausedTotalMs !== undefined ? extra.pausedTotalMs : existing.pausedTotalMs;
      const pauseCount =
        extra.pauseCount !== undefined ? extra.pauseCount : existing.pauseCount;
      const completedAt =
        extra.completedAt !== undefined ? extra.completedAt : existing.completedAt;
      const verifiedAt =
        extra.verifiedAt !== undefined ? extra.verifiedAt : existing.verifiedAt;

      await db.run(
        `UPDATE sessions
         SET status = ?, added_ms = ?, elapsed_run_ms = ?, paused_total_ms = ?, pause_count = ?, completed_at = ?, verified_at = ?, updated_at = ?
         WHERE id = ?;`,
        [
          status,
          addedMs,
          elapsedRunMs,
          pausedTotalMs,
          pauseCount,
          completedAt,
          verifiedAt,
          extra.updatedAt,
          id,
        ]
      );
    },

    async getActive(): Promise<SessionRow | null> {
      const row = await db.get<DbSessionRow>(
        `SELECT * FROM sessions WHERE status IN ('running', 'paused') LIMIT 1;`
      );
      return row ? mapSession(row) : null;
    },

    async getTodayForTask(taskId: number, localDate: string): Promise<SessionRow | null> {
      const row = await db.get<DbSessionRow>(
        `SELECT * FROM sessions WHERE task_id = ? AND local_date = ? AND status <> 'abandoned' LIMIT 1;`,
        [taskId, localDate]
      );
      return row ? mapSession(row) : null;
    },

    async listCompleted(): Promise<SessionRow[]> {
      const rows = await db.all<DbSessionRow>(
        `SELECT * FROM sessions WHERE status = 'completed' ORDER BY id ASC;`
      );
      return rows.map(mapSession);
    },

    async get(id: number): Promise<SessionRow | null> {
      const row = await db.get<DbSessionRow>(`SELECT * FROM sessions WHERE id = ?;`, [id]);
      return row ? mapSession(row) : null;
    },

    async appendEvent(event): Promise<void> {
      await db.run(
        `INSERT INTO session_events (session_id, event, from_state, to_state, run_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          event.sessionId,
          event.event,
          event.fromState,
          event.toState,
          event.runMs,
          event.createdAt,
        ]
      );
    },

    async rangeStats(startDate: string, endDate: string): Promise<RangeStat[]> {
      const rows = await db.all<{ local_date: string; verified: number; run_ms: number }>(
        `SELECT local_date, COUNT(*) AS verified, SUM(elapsed_run_ms) AS run_ms
         FROM sessions
         WHERE status = 'verified' AND local_date BETWEEN ? AND ?
         GROUP BY local_date;`,
        [startDate, endDate]
      );
      return rows.map((r) => ({
        localDate: r.local_date,
        verified: Number(r.verified),
        runMs: Number(r.run_ms),
      }));
    },
  };
}
