import { Db } from '../db/Db';

export interface ParentAuth {
  id: number;
  algo: string;
  iterations: number;
  saltHex: string;
  hashHex: string;
  failedAttempts: number;
  updatedAt: string;
}

interface ParentAuthRow {
  id: number;
  algo: string;
  iterations: number;
  salt_hex: string;
  hash_hex: string;
  failed_attempts: number;
  updated_at: string;
}

export interface AuthRepo {
  get(): Promise<ParentAuth | null>;
  upsert(
    record: { saltHex: string; hashHex: string; iterations: number },
    nowIso: string
  ): Promise<void>;
  setFailedAttempts(count: number, nowIso: string): Promise<void>;
}

function mapRow(row: ParentAuthRow): ParentAuth {
  return {
    id: row.id,
    algo: row.algo,
    iterations: row.iterations,
    saltHex: row.salt_hex,
    hashHex: row.hash_hex,
    failedAttempts: row.failed_attempts,
    updatedAt: row.updated_at,
  };
}

export function createAuthRepo(db: Db): AuthRepo {
  return {
    async get(): Promise<ParentAuth | null> {
      const row = await db.get<ParentAuthRow>(
        `SELECT id, algo, iterations, salt_hex, hash_hex, failed_attempts, updated_at
         FROM parent_auth
         WHERE id = 1;`
      );
      return row ? mapRow(row) : null;
    },

    async upsert(
      record: { saltHex: string; hashHex: string; iterations: number },
      nowIso: string
    ): Promise<void> {
      await db.run(
        `INSERT INTO parent_auth (id, algo, iterations, salt_hex, hash_hex, failed_attempts, updated_at)
         VALUES (1, 'pbkdf2-sha256', ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           algo = 'pbkdf2-sha256',
           iterations = excluded.iterations,
           salt_hex = excluded.salt_hex,
           hash_hex = excluded.hash_hex,
           failed_attempts = 0,
           updated_at = excluded.updated_at;`,
        [record.iterations, record.saltHex, record.hashHex, nowIso]
      );
    },

    async setFailedAttempts(count: number, nowIso: string): Promise<void> {
      await db.run(
        `UPDATE parent_auth
         SET failed_attempts = ?, updated_at = ?
         WHERE id = 1;`,
        [count, nowIso]
      );
    },
  };
}
