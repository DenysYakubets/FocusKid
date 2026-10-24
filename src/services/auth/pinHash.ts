import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Owner item F1: PIN verification must feel instant (<200ms). The previous
 * 50 000-iteration cost blocked Hermes for ~430ms on a desktop CPU and ~5s on
 * the owner's phone (Hermes has no JIT), which read as a freeze right after the
 * correct PIN was entered. This is a local-only kid app (INV-01, no network), so
 * a cheap salted PBKDF2/SHA-256 cost keeps the VISION.md algorithm contract
 * (`pbkdf2-sha256`) while making verification effectively instant.
 *
 * Records written by older builds carry `iterations = 50000`; `authService`
 * still verifies them with their stored cost and then lazily re-hashes them onto
 * this fast cost on the first successful entry (see attempt()).
 */
export const PBKDF2_ITERATIONS = 1_000;

/** Cost used by pre-fix builds (kept for lazy migration + tests). */
export const LEGACY_PBKDF2_ITERATIONS = 50_000;

export interface AuthRecord {
  saltHex: string;
  hashHex: string;
  iterations: number;
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function hashPin(
  pin: string,
  salt: Uint8Array | string,
  iterations: number = PBKDF2_ITERATIONS
): string {
  const saltBytes = typeof salt === 'string' ? utf8ToBytes(salt) : salt;
  const pinBytes = utf8ToBytes(pin);
  const derived = pbkdf2(sha256, pinBytes, saltBytes, { c: iterations, dkLen: 32 });
  return bytesToHex(derived);
}

export function verifyPin(pin: string, record: AuthRecord): boolean {
  if (!isValidPinFormat(pin)) {
    return false;
  }
  const saltBytes = hexToBytes(record.saltHex);
  const expectedBytes = hexToBytes(record.hashHex);
  const computedBytes = pbkdf2(sha256, utf8ToBytes(pin), saltBytes, {
    c: record.iterations,
    dkLen: 32,
  });

  if (computedBytes.length !== expectedBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    const b1 = computedBytes[i] ?? 0;
    const b2 = expectedBytes[i] ?? 0;
    diff |= b1 ^ b2;
  }
  return diff === 0;
}