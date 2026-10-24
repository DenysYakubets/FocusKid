import { bytesToHex } from '@noble/hashes/utils';
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { createAuthRepo } from '../../repos/authRepo';
import { createAuthService } from '../authService';
import { hashPin, isValidPinFormat, PBKDF2_ITERATIONS, verifyPin } from '../pinHash';

const fakeWall: WallClock = {
  todayLocalDate: () => '2026-10-23',
  weekdayIndex: () => 4,
  addDays: (d) => d,
  nowIso: () => '2026-10-23T10:00:00.000Z',
};

describe('pinHash', () => {
  it('matches RFC 6070 PBKDF2-HMAC-SHA256 test vector', () => {
    // password="password", salt="salt", c=1, dkLen=32
    const hash = hashPin('password', 'salt', 1);
    expect(hash).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });

  it('validates 4-digit PIN format', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('0000')).toBe(true);
    expect(isValidPinFormat('9999')).toBe(true);

    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('12345')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('verifies correct PIN and rejects wrong PIN', () => {
    const saltBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const saltHex = bytesToHex(saltBytes);
    const hashHex = hashPin('1234', saltBytes, 1000);

    const record = {
      saltHex,
      hashHex,
      iterations: 1000,
    };

    expect(verifyPin('1234', record)).toBe(true);
    expect(verifyPin('0000', record)).toBe(false);
    expect(verifyPin('1235', record)).toBe(false);
    expect(verifyPin('123', record)).toBe(false);
  });

  it('produces different hashes for the same PIN with different 16-byte salts', () => {
    const salt1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const salt2 = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);

    const hash1 = hashPin('1234', salt1, 1000);
    const hash2 = hashPin('1234', salt2, 1000);

    expect(hash1).not.toBe(hash2);
  });

  it('defaults to the fast KDF cost (F1) and still derives a 64-char hash', () => {
    // Owner item F1: verification must be instant; 50 000 was the freeze.
    expect(PBKDF2_ITERATIONS).toBe(1_000);

    const salt = new Uint8Array(16).fill(3);
    const hash = hashPin('1234', salt);
    expect(hash).toHaveLength(64);
    expect(
      verifyPin('1234', {
        saltHex: bytesToHex(salt),
        hashHex: hash,
        iterations: PBKDF2_ITERATIONS,
      })
    ).toBe(true);
  });

  it('still verifies legacy 50 000-iteration records written by older builds', () => {
    const salt = new Uint8Array(16).fill(5);
    const legacy = {
      saltHex: bytesToHex(salt),
      hashHex: hashPin('4321', salt, 50_000),
      iterations: 50_000,
    };
    expect(verifyPin('4321', legacy)).toBe(true);
    expect(verifyPin('4322', legacy)).toBe(false);
  });

  it('round-trips through the database at the fast cost', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const service = createAuthService({ authRepo, clock: createFakeClock(1000), wall: fakeWall });

    await service.setupPin('2580');
    const record = await authRepo.get();
    expect(record?.iterations).toBe(PBKDF2_ITERATIONS);
    expect(await service.attempt('2580')).toBe('SUCCESS');
    expect(await service.attempt('2581')).toBe('INVALID');
  });
});