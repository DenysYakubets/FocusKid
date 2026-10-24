import { getRandomBytes } from 'expo-crypto';
import {
  bytesToHex,
  hexToBytes,
  randomBytes as nobleRandomBytes,
} from '@noble/hashes/utils';
import { MonotonicClock } from '../clock/monotonic';
import { WallClock, systemWallClock } from '../clock/wallClock';
import { AuthRepo } from '../repos/authRepo';
import { hashPin, isValidPinFormat, PBKDF2_ITERATIONS, verifyPin } from './pinHash';

export interface ParentToken {
  id: string;
  issuedAt: number;
}

export type AuthAttemptResult = 'SUCCESS' | 'INVALID' | 'LOCKED';

export interface AuthService {
  hasPin(): Promise<boolean>;
  setupPin(pin: string): Promise<boolean>;
  changePin(currentPin: string, newPin: string): Promise<boolean>;
  attempt(pin: string): Promise<AuthAttemptResult>;
  failedAttempts(): Promise<number>;
  lockoutRemainingMs(now?: number): number;
  isParentSessionActive(now?: number): boolean;
  startParentSession(): void;
  touch(now?: number): void;
  endParentSession(): void;
  issueToken(): ParentToken;
  consumeToken(token: unknown): boolean;
  activeTokenCount(): number;
}

export interface CreateAuthServiceOptions {
  authRepo: AuthRepo;
  clock: MonotonicClock;
  wall?: WallClock;
  randomBytes?: (byteCount: number) => Uint8Array;
  iterations?: number;
}

function defaultRandomBytes(byteCount: number): Uint8Array {
  try {
    return getRandomBytes(byteCount);
  } catch {
    return nobleRandomBytes(byteCount);
  }
}

export const MAX_FAILED_ATTEMPTS = 5;

function getLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < MAX_FAILED_ATTEMPTS) return 0;
  const exponent = failedAttempts - MAX_FAILED_ATTEMPTS;
  const duration = 30_000 * Math.pow(2, exponent);
  return Math.min(900_000, duration);
}

export function createAuthService(options: CreateAuthServiceOptions): AuthService {
  const {
    authRepo,
    clock,
    wall = systemWallClock,
    randomBytes = defaultRandomBytes,
    iterations = PBKDF2_ITERATIONS,
  } = options;

  let lockedUntilMonotonic: number | null = null;
  let isColdStart = true;

  let sessionActive = false;
  let lastActivityMonotonic = 0;

  const activeTokens = new Map<string, number>();

  function lockoutRemainingMs(now?: number): number {
    if (lockedUntilMonotonic === null) {
      return 0;
    }
    const current = now ?? clock.now();
    const remaining = lockedUntilMonotonic - current;
    if (remaining <= 0) {
      lockedUntilMonotonic = null;
      return 0;
    }
    return remaining;
  }

  function pruneExpiredTokens(now: number): void {
    for (const [id, issuedAt] of activeTokens.entries()) {
      const age = now - issuedAt;
      if (age < 0 || age > 30_000) {
        activeTokens.delete(id);
      }
    }
  }

  function issueToken(): ParentToken {
    const now = clock.now();
    pruneExpiredTokens(now);
    const id = bytesToHex(randomBytes(16));
    activeTokens.set(id, now);
    return { id, issuedAt: now };
  }

  function consumeToken(token: unknown): boolean {
    const now = clock.now();
    pruneExpiredTokens(now);
    if (!token || typeof token !== 'object') {
      return false;
    }
    const t = token as ParentToken;
    if (typeof t.id !== 'string' || typeof t.issuedAt !== 'number') {
      return false;
    }
    if (!activeTokens.has(t.id)) {
      return false;
    }
    const issuedAt = activeTokens.get(t.id)!;
    activeTokens.delete(t.id);

    const age = now - issuedAt;
    if (age < 0 || age > 30_000) {
      return false;
    }
    return true;
  }

  async function attempt(pin: string): Promise<AuthAttemptResult> {
    if (lockoutRemainingMs() > 0) {
      return 'LOCKED';
    }

    const record = await authRepo.get();
    if (!record) {
      return 'INVALID';
    }

    if (isColdStart) {
      isColdStart = false;
      if (record.failedAttempts >= 5) {
        const duration = getLockoutDurationMs(record.failedAttempts);
        lockedUntilMonotonic = clock.now() + Math.max(30_000, duration);
        return 'LOCKED';
      }
    }

    const isMatch = verifyPin(pin, record);

    if (isMatch) {
      lockedUntilMonotonic = null;
      if (record.iterations === iterations && record.algo === 'pbkdf2-sha256') {
        await authRepo.setFailedAttempts(0, wall.nowIso());
      } else {
        // F1 lazy migration: a record written with the old 50k cost is re-hashed
        // onto the fast cost right here (the PIN is known only at this moment),
        // so every later gate entry verifies in a few milliseconds.
        await authRepo.upsert(
          {
            saltHex: record.saltHex,
            hashHex: hashPin(pin, hexToBytes(record.saltHex), iterations),
            iterations,
          },
          wall.nowIso()
        );
      }
      return 'SUCCESS';
    } else {
      const nextFailures = record.failedAttempts + 1;
      await authRepo.setFailedAttempts(nextFailures, wall.nowIso());
      if (nextFailures >= 5) {
        const duration = getLockoutDurationMs(nextFailures);
        lockedUntilMonotonic = clock.now() + duration;
        return 'LOCKED';
      }
      return 'INVALID';
    }
  }

  return {
    async hasPin(): Promise<boolean> {
      const record = await authRepo.get();
      return record !== null;
    },

    async setupPin(pin: string): Promise<boolean> {
      if (!isValidPinFormat(pin)) {
        return false;
      }
      const saltBytes = randomBytes(16);
      const saltHex = bytesToHex(saltBytes);
      const hashHex = hashPin(pin, saltBytes, iterations);

      await authRepo.upsert({ saltHex, hashHex, iterations }, wall.nowIso());
      lockedUntilMonotonic = null;
      isColdStart = false;
      return true;
    },

    async changePin(currentPin: string, newPin: string): Promise<boolean> {
      if (!isValidPinFormat(newPin)) {
        return false;
      }
      const attemptRes = await attempt(currentPin);
      if (attemptRes !== 'SUCCESS') {
        return false;
      }
      return this.setupPin(newPin);
    },

    async failedAttempts(): Promise<number> {
      const record = await authRepo.get();
      return record?.failedAttempts ?? 0;
    },

    attempt,
    lockoutRemainingMs,

    isParentSessionActive(now?: number): boolean {
      if (!sessionActive) return false;
      const current = now ?? clock.now();
      if (current - lastActivityMonotonic > 120_000) {
        sessionActive = false;
        return false;
      }
      return true;
    },

    startParentSession(): void {
      sessionActive = true;
      lastActivityMonotonic = clock.now();
    },

    touch(now?: number): void {
      if (sessionActive) {
        lastActivityMonotonic = now ?? clock.now();
      }
    },

    endParentSession(): void {
      sessionActive = false;
    },

    issueToken,
    consumeToken,
    activeTokenCount(): number {
      return activeTokens.size;
    },
  };
}
