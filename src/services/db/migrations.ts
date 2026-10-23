import { Db } from './Db';
import { MIGRATIONS } from './schema';

export async function migrate(db: Db): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row ? row.user_version : 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i]!;
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.exec(`PRAGMA user_version = ${i + 1};`);
    });
  }
}
