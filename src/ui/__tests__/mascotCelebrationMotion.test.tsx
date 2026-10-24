/**
 * Round-1 HIGH (reduced-motion race) + round-1 LOW (a11y label) RED tests for
 * MascotCelebration.
 *
 * `NODE_ENV=production` for this file: the component's `NODE_ENV !== 'test'`
 * gate closes the flight under jest, and that gate is exactly what kept the
 * race out of the round-1 suite. With motion allowed, the pre-fix component
 * commits the 1800ms arc in the mount effect BEFORE the async
 * `AccessibilityInfo.isReduceMotionEnabled()` answer lands, so:
 *   - reduce-motion users still got the flight (onFinished never fired), and
 *   - the arc started while the answer was still in flight.
 * @jest-environment node
 */
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, cleanup } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import {
  CELEBRATION_TEST_ID,
  MascotCelebration,
} from '../components/MascotCelebration';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

const ORIGINAL_ENV = process.env.NODE_ENV;
let parallelSpy: jest.SpyInstance;

async function renderCelebration(onFinished: () => void) {
  const db = createNodeDb();
  const clock = createFakeClock(1000);
  return renderWithApp(<MascotCelebration onFinished={onFinished} />, {
    db,
    clock,
    wall: systemWallClock,
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('C9 - MascotCelebration reduced motion + a11y (round-1 findings)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Decorative motion gate must be OPEN here — closed is the jest default
    // and it is what masked the round-1 HIGH race.
    process.env.NODE_ENV = 'production';
    parallelSpy = jest.spyOn(Animated, 'parallel');
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    jest.restoreAllMocks();
    cleanup();
  });

  it('round-1 HIGH: commits no animation until the reduce-motion answer resolves, then flies when motion is allowed', async () => {
    let resolveQuery!: (enabled: boolean) => void;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveQuery = resolve;
        })
      );

    const onFinished = jest.fn();
    const screen = await renderCelebration(onFinished);
    await flush();

    // The answer is still in flight: nothing may be committed yet — no arc,
    // and the parent is not told the celebration is over either.
    expect(parallelSpy).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();

    // Motion allowed -> the flight starts only now.
    await act(async () => {
      resolveQuery(false);
      await Promise.resolve();
    });
    expect(parallelSpy).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();

    screen.unmount();
  });

  it('round-1 HIGH: reduce-motion ON -> no flight at all, but the parent still settles (onFinished fires)', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    const onFinished = jest.fn();
    const screen = await renderCelebration(onFinished);
    await flush();

    expect(parallelSpy).not.toHaveBeenCalled();
    expect(onFinished).toHaveBeenCalledTimes(1);

    screen.unmount();
  });

  it('round-1 LOW: the overlay is exposed to assistive tech with the celebration label', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    const screen = await renderCelebration(jest.fn());
    const overlay = screen.getByTestId(CELEBRATION_TEST_ID);

    expect(overlay.props.accessibilityLabel).toBe(uk.mascot.celebrationLabel);
    expect(overlay.props.accessible).toBe(true);
    // Non-blocking stays (INV-04 gentle): touches pass straight through.
    expect(overlay.props.pointerEvents).toBe('box-none');

    await flush();
    screen.unmount();
  });
});