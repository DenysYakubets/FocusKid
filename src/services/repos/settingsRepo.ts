import { Db } from '../db/Db';
import { WallClock } from '../clock/wallClock';

export interface SettingsRepo {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * C5: the app's settings/preferences store — a key/value table on top of the
 * one SQLite database (INV-07 allows no other storage). `updated_at` comes
 * from the wall clock (INV-02 forbids `Date` in app code).
 */
export function createSettingsRepo(db: Db, wall: WallClock): SettingsRepo {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.get<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?;',
        [key]
      );
      return row?.value ?? null;
    },

    async set(key: string, value: string): Promise<void> {
      await db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [key, value, wall.nowIso()]
      );
    },
  };
}