import * as SQLite from 'expo-sqlite';
import { Db, RunResult, SqlParam } from './Db';

export async function openExpoDb(dbName = 'focuskid.db'): Promise<Db> {
  const expoDb = await SQLite.openDatabaseAsync(dbName);
  await expoDb.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  const wrap = (db: SQLite.SQLiteDatabase): Db => ({
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async run(sql: string, params: readonly SqlParam[] = []): Promise<RunResult> {
      const res = await db.runAsync(sql, ...(params as SQLite.SQLiteBindValue[]));
      return {
        changes: res.changes,
        lastInsertRowId: res.lastInsertRowId,
      };
    },
    async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
      const res = await db.getAllAsync<T>(sql, ...(params as SQLite.SQLiteBindValue[]));
      return res;
    },
    async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
      const res = await db.getFirstAsync<T>(sql, ...(params as SQLite.SQLiteBindValue[]));
      return res ?? null;
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await fn(wrap(db));
      });
      return result;
    },
  });

  return wrap(expoDb);
}
