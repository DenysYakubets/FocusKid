export type SqlParam = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<RunResult>;
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
