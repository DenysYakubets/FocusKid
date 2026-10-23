export interface MonotonicClock {
  now(): number;
}

export const systemMonotonicClock: MonotonicClock = {
  now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    const g = global as unknown as { nativePerformanceNow?: () => number };
    if (typeof g.nativePerformanceNow === 'function') {
      return g.nativePerformanceNow();
    }
    throw new Error('No monotonic clock available: performance.now and nativePerformanceNow are missing');
  },
};
