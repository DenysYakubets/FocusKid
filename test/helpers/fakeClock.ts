import { MonotonicClock } from '../../src/services/clock/monotonic';

export interface FakeClock extends MonotonicClock {
  now(): number;
  advance(ms: number): void;
}

export function createFakeClock(start = 1000): FakeClock {
  let currentTime = start;
  return {
    now(): number {
      return currentTime;
    },
    advance(ms: number): void {
      currentTime += ms;
    },
  };
}
