/** @jest-environment node */
import { bytesToHex } from '@noble/hashes/utils';
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { createAuthRepo } from '../../repos/authRepo';
import { createAuthService } from '../authService';
import { hashPin, PBKDF2_ITERATIONS, verifyPin } from '../pinHash';

const fakeWall: WallClock = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

/** Cost of the pre-fix record (owner's F1: the 5s freeze). */
const LEGACY_ITERATIONS = 50_000;

describe('F1 - instant PIN verification (cheap KDF, no artificial delay)', () => {
  jest.setTimeout(30000);

  it('default KDF cost is cheap and a single verify completes in well under 200ms', () => {
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(1000);

    const salt = new Uint8Array(16).fill(7);
    const record = {
      saltHex: bytesToHex(salt),
      hashHex: hashPin('1234', salt, PBKDF2_ITERATIONS),
      iterations: PBKDF2_ITERATIONS,
    };

    const started = performance.now();
    const ok = verifyPin('1234', record);
    const elapsed = performance.now() - started;

    expect(ok).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });

  it('setupPin persists the fast iteration count and attempt() succeeds fast', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const service = createAuthService({
      authRepo,
      clock: createFakeClock(1000),
      wall: fakeWall,
    });

    expect(await service.setupPin('1234')).toBe(true);

    const record = await authRepo.get();
    expect(record?.iterations).toBe(PBKDF2_ITERATIONS);

    const started = performance.now();
    expect(await service.attempt('1234')).toBe('SUCCESS');
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('still verifies a legacy 50k-iteration record, then re-hashes it onto the fast path', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);
    const service = createAuthService({ authRepo, clock, wall: fakeWall });

    // A record exactly as written by the pre-fix app (iterations >= 50000 CHECK).
    const salt = new Uint8Array(16).fill(9);
    await authRepo.upsert(
      {
        saltHex: bytesToHex(salt),
        hashHex: hashPin('1234', salt, LEGACY_ITERATIONS),
        iterations: LEGACY_ITERATIONS,
      },
      fakeWall.nowIso()
    );

    // First entry: correct PIN must still be accepted (INV-05 gate stays functional).
    expect(await service.attempt('1234')).toBe('SUCCESS');

    // ...and the stored record must now be on the fast cost.
    const migrated = await authRepo.get();
    expect(migrated?.iterations).toBe(PBKDF2_ITERATIONS);
    expect(migrated?.failedAttempts).toBe(0);

    // Every later entry is fast.
    const started = performance.now();
    expect(await service.attempt('1234')).toBe('SUCCESS');
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('keeps the lockout contract intact with the fast KDF (4 INVALID, 5th LOCKED)', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);
    const service = createAuthService({ authRepo, clock, wall: fakeWall });

    await service.setupPin('1234');

    for (let i = 0; i < 4; i++) {
      expect(await service.attempt('9999')).toBe('INVALID');
      expect(service.lockoutRemainingMs()).toBe(0);
    }
    expect(await service.attempt('9999')).toBe('LOCKED');
    expect(service.lockoutRemainingMs()).toBe(30_000);
    expect(await service.attempt('1234')).toBe('LOCKED');

    clock.advance(30_000);
    expect(await service.attempt('1234')).toBe('SUCCESS');
  });
});