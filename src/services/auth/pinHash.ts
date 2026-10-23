import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export const PBKDF2_ITERATIONS = 50_000;

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
