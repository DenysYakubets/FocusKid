/** @jest-environment node */
import { createFakeClock } from '../../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../../test/helpers/nodeDb';
import { WallClock } from '../../clock/wallClock';
import { migrate } from '../../db/migrations';
import { createAuthRepo } from '../../repos/authRepo';
import { createAuthService } from '../authService';

jest.mock('@noble/hashes/utils', () => {
  const actual = jest.requireActual('@noble/hashes/utils');
  return {
    ...actual,
    randomBytes: () => {
      throw new Error('crypto.getRandomValues must be defined');
    },
  };
});

describe('issueTokenDevice', () => {
  const fakeWall: WallClock = {
    todayLocalDate: () => '2026-10-23',
    weekdayIndex: () => 4,
    addDays: (d) => d,
    nowIso: () => '2026-10-23T10:00:00.000Z',
  };

  it('issues token using injectable randomBytes without throwing even when noble randomBytes throws', async () => {
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

    const t = service.issueToken();
    expect(t.id).toMatch(/^[0-9a-f]{32}$/);
    expect(() => service.issueToken()).not.toThrow();
  });
});
