import Database from 'better-sqlite3';
import { Db, RunResult, SqlParam } from '../../src/services/db/Db';

export function createNodeDb(dbPath = ':memory:'): Db {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const wrap = (): Db => ({
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async run(sql: string, params: readonly SqlParam[] = []): Promise<RunResult> {
      const stmt = db.prepare(sql);
      const res = stmt.run(...params);
      return {
        changes: res.changes,
        lastInsertRowId: Number(res.lastInsertRowid),
      };
    },
    async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      const res = stmt.all(...params) as T[];
      return res;
    },
    async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
      const stmt = db.prepare(sql);
      const res = stmt.get(...params) as T | undefined;
      return res ?? null;
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await fn(wrap());
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  });

  return wrap();
}
