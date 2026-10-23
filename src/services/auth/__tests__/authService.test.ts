/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { createAuthRepo } from '../../repos/authRepo';
import { createAuthService } from '../authService';
import * as pinHashModule from '../pinHash';

describe('authService', () => {
  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  it('sets up PIN, verifies, and never logs plaintext PIN to console.*', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);

    const logSpy = jest.spyOn(console, 'log');
    const warnSpy = jest.spyOn(console, 'warn');
    const errorSpy = jest.spyOn(console, 'error');

    const service = createAuthService({
      authRepo,
      clock,
      wall: fakeWall,
      iterations: 50_000,
    });

    expect(await service.hasPin()).toBe(false);

    const pin = '4321';
    const ok = await service.setupPin(pin);
    expect(ok).toBe(true);
    expect(await service.hasPin()).toBe(true);

    const verifyRes = await service.attempt(pin);
    expect(verifyRes).toBe('SUCCESS');

    // Ensure PIN was never passed to console
    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(pin);
        }
      }
      spy.mockRestore();
    }
  });

  it('implements lockout per AS-12 and monotonic clock independence from Date.now', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);

    const service = createAuthService({
      authRepo,
      clock,
      wall: fakeWall,
      iterations: 50_000,
    });

    await service.setupPin('1234');

    // 4 wrong attempts -> returns INVALID
    for (let i = 0; i < 4; i++) {
      const res = await service.attempt('9999');
      expect(res).toBe('INVALID');
      expect(service.lockoutRemainingMs()).toBe(0);
    }

    // 5th wrong attempt -> triggers 30s lockout and returns LOCKED
    const fifth = await service.attempt('9999');
    expect(fifth).toBe('LOCKED');
    expect(service.lockoutRemainingMs()).toBe(30_000);

    // While locked: attempt returns LOCKED without hashing (spy)
    const spy = jest.spyOn(pinHashModule, 'verifyPin');
    const lockedRes = await service.attempt('1234');
    expect(lockedRes).toBe('LOCKED');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    // Mocking Date.now forward 1 hour does NOT unlock (INV-02)
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() + 3600_000;
      expect(service.lockoutRemainingMs()).toBe(30_000);
      expect(await service.attempt('1234')).toBe('LOCKED');
    } finally {
      Date.now = originalDateNow;
    }

    // Advancing monotonic clock 30s -> unlocked
    clock.advance(30_000);
    expect(service.lockoutRemainingMs()).toBe(0);

    // 6th failure -> 60s lockout
    const sixth = await service.attempt('9999');
    expect(sixth).toBe('LOCKED');
    expect(service.lockoutRemainingMs()).toBe(60_000);

    // Advance 60s -> unlocked
    clock.advance(60_000);
    expect(service.lockoutRemainingMs()).toBe(0);

    // Correct PIN resets counter
    const correctRes = await service.attempt('1234');
    expect(correctRes).toBe('SUCCESS');
    expect(service.lockoutRemainingMs()).toBe(0);

    const dbRecord = await authRepo.get();
    expect(dbRecord?.failedAttempts).toBe(0);
  });

  it('locks for 30s on cold start if failed_attempts >= 5', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(5000);

    // Pre-populate DB with 5 failed attempts
    await authRepo.upsert(
      {
        saltHex: 'a'.repeat(32),
        hashHex: 'b'.repeat(64),
        iterations: 50_000,
      },
      fakeWall.nowIso()
    );
    await authRepo.setFailedAttempts(5, fakeWall.nowIso());

    const coldService = createAuthService({
      authRepo,
      clock,
      wall: fakeWall,
    });

    const spy = jest.spyOn(pinHashModule, 'verifyPin');
    const res = await coldService.attempt('1234');
    expect(res).toBe('LOCKED');
    expect(coldService.lockoutRemainingMs()).toBe(30_000);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('manages parent session: 120s monotonic inactivity and touch', () => {
    const clock = createFakeClock(10_000);
    const service = createAuthService({
      authRepo: {} as any,
      clock,
      wall: fakeWall,
    });

    expect(service.isParentSessionActive()).toBe(false);

    service.startParentSession();
    expect(service.isParentSessionActive()).toBe(true);

    // Advance 100s -> still active
    clock.advance(100_000);
    expect(service.isParentSessionActive()).toBe(true);

    // Touch at 100s
    service.touch();

    // Advance 100s more -> still active because touch reset the 120s timer
    clock.advance(100_000);
    expect(service.isParentSessionActive()).toBe(true);

    // Advance 121s without touch -> expired
    clock.advance(121_000);
    expect(service.isParentSessionActive()).toBe(false);

    // Manual exit
    service.startParentSession();
    expect(service.isParentSessionActive()).toBe(true);
    service.endParentSession();
    expect(service.isParentSessionActive()).toBe(false);
  });

  it('manages single-use ParentToken: 30s lifetime and consumed once', () => {
    const clock = createFakeClock(1000);
    const service = createAuthService({
      authRepo: {} as any,
      clock,
      wall: fakeWall,
    });

    const token = service.issueToken();
    expect(token).toBeDefined();
    expect(token.id).toBeTruthy();
    expect(token.issuedAt).toBe(1000);

    // Valid initially
    const firstConsume = service.consumeToken(token);
    expect(firstConsume).toBe(true);

    // Second consume fails (reused)
    const secondConsume = service.consumeToken(token);
    expect(secondConsume).toBe(false);

    // Expired token (> 30s)
    const expiredToken = service.issueToken();
    clock.advance(30_001);
    expect(service.consumeToken(expiredToken)).toBe(false);

    // Invalid / missing token
    expect(service.consumeToken(null)).toBe(false);
    expect(service.consumeToken(undefined)).toBe(false);
    expect(service.consumeToken({})).toBe(false);
  });

  it('changes PIN successfully requiring current PIN', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);

    const service = createAuthService({
      authRepo,
      clock,
      wall: fakeWall,
      iterations: 50_000,
    });

    await service.setupPin('1111');

    // Wrong current PIN fails
    const badChange = await service.changePin('0000', '2222');
    expect(badChange).toBe(false);
    expect(await service.attempt('1111')).toBe('SUCCESS');

    // Correct current PIN succeeds
    const goodChange = await service.changePin('1111', '2222');
    expect(goodChange).toBe(true);

    // Old PIN fails, new PIN works
    expect(await service.attempt('1111')).toBe('INVALID');
    expect(await service.attempt('2222')).toBe('SUCCESS');
  });

  it('prunes expired tokens and attempt() does not issue orphan tokens (F8)', async () => {
    const db = createNodeDb();
    await migrate(db);
    const authRepo = createAuthRepo(db);
    const clock = createFakeClock(1000);

    const service = createAuthService({
      authRepo,
      clock,
      wall: fakeWall,
      iterations: 50_000,
    });

    await service.setupPin('1234');
    expect(service.activeTokenCount()).toBe(0);

    service.issueToken();
    expect(service.activeTokenCount()).toBe(1);

    clock.advance(30_001);
    service.issueToken();
    expect(service.activeTokenCount()).toBe(1);

    const countBeforeAttempt = service.activeTokenCount();
    const res = await service.attempt('1234');
    expect(res).toBe('SUCCESS');
    expect(service.activeTokenCount()).toBe(countBeforeAttempt);
  });
});
