/** @jest-environment node */
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { migrate } from '../../db/migrations';
import { createAuthRepo } from '../authRepo';

describe('authRepo', () => {
  it('stores and retrieves parent_auth record, never containing plaintext PIN', async () => {
    const db = createNodeDb();
    await migrate(db);
    const repo = createAuthRepo(db);

    expect(await repo.get()).toBeNull();

    const pin = '1234';
    // Dummy 32-char hex salt and 64-char hex hash (matching DB length check constraints)
    const saltHex = 'a'.repeat(32);
    const hashHex = 'b'.repeat(64);
    const nowIso = '2026-10-23T10:00:00.000Z';

    await repo.upsert(
      {
        saltHex,
        hashHex,
        iterations: 50_000,
      },
      nowIso
    );

    const record = await repo.get();
    expect(record).not.toBeNull();
    expect(record?.iterations).toBe(50_000);
    expect(record?.saltHex).toBe(saltHex);
    expect(record?.hashHex).toBe(hashHex);
    expect(record?.failedAttempts).toBe(0);

    // Assert INV-05: no column in parent_auth contains the substring '1234'
    const rawRow = await db.get<Record<string, unknown>>(`SELECT * FROM parent_auth WHERE id = 1;`);
    expect(rawRow).toBeDefined();
    for (const [key, value] of Object.entries(rawRow!)) {
      expect(String(value)).not.toContain(pin);
    }

    // Test setFailedAttempts
    await repo.setFailedAttempts(3, '2026-10-23T10:05:00.000Z');
    const updated = await repo.get();
    expect(updated?.failedAttempts).toBe(3);

    // Upserting again resets failedAttempts to 0
    await repo.upsert(
      {
        saltHex: 'c'.repeat(32),
        hashHex: 'd'.repeat(64),
        iterations: 55_000,
      },
      '2026-10-23T10:10:00.000Z'
    );
    const reUpserted = await repo.get();
    expect(reUpserted?.iterations).toBe(55_000);
    expect(reUpserted?.failedAttempts).toBe(0);
  });
});
