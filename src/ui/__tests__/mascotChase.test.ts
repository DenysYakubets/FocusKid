/** @jest-environment node */
import { chaseStep, CHASE_TAU_MS, clampMascotPosition, emissionPoint, MascotBounds, speedToBubble } from '../components/MascotFloating';

const bounds: MascotBounds = {
  width: 366,
  height: 800,
  insets: { top: 24, bottom: 20, left: 8, right: 12 },
};
const size = 72;

describe('mascot chase math', () => {
  it('clamps fully inside the inset bounds and preserves an in-range point', () => {
    expect(clampMascotPosition({ x: -1000, y: 9000 }, bounds, size)).toEqual({ x: 8, y: 708 });
    expect(clampMascotPosition({ x: 1000, y: -1000 }, bounds, size)).toEqual({ x: 282, y: 24 });
    expect(clampMascotPosition({ x: 80, y: 200 }, bounds, size)).toEqual({ x: 80, y: 200 });
  });

  it('keeps a moving 200-frame chase inside bounds when each smoothed frame is clamped', () => {
    let pos = { x: -500, y: 1200 };
    for (let i = 0; i < 200; i += 1) {
      const target = { x: i % 2 ? 500 : -500, y: i % 3 ? -300 : 1200 };
      pos = clampMascotPosition(chaseStep(pos, target, 16), bounds, size);
      expect(pos.x).toBeGreaterThanOrEqual(8);
      expect(pos.x).toBeLessThanOrEqual(282);
      expect(pos.y).toBeGreaterThanOrEqual(24);
      expect(pos.y).toBeLessThanOrEqual(708);
    }
  });

  it('uses exponential lag and converges monotonically without overshoot', () => {
    const oneStep = chaseStep({ x: 0, y: 0 }, { x: 100, y: 0 }, CHASE_TAU_MS);
    expect(100 - oneStep.x).toBeGreaterThan(30);
    expect(100 - oneStep.x).toBeLessThan(45);
    expect(chaseStep({ x: 3, y: 4 }, { x: 100, y: 50 }, 0)).toEqual({ x: 3, y: 4 });

    let pos = { x: 0, y: 0 };
    let previous = 0;
    for (let i = 0; i < 30; i += 1) {
      pos = chaseStep(pos, { x: 100, y: 100 }, 50);
      expect(pos.x).toBeGreaterThanOrEqual(previous);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(100);
      expect(pos.y).toBeLessThanOrEqual(100);
      previous = pos.x;
    }
  });
});

describe('mascot thrust math', () => {
  it('emits at the edge opposite motion and preserves a stationary point', () => {
    expect(emissionPoint({ x: 20, y: 20 }, { x: 0, y: -2 }, 8)).toEqual({ x: 20, y: 28 });
    expect(emissionPoint({ x: 20, y: 20 }, { x: -3, y: 0 }, 8)).toEqual({ x: 28, y: 20 });
    expect(emissionPoint({ x: 20, y: 20 }, { x: 0, y: 0 }, 8)).toEqual({ x: 20, y: 20 });
  });

  it('scales bubbles up and spawns faster with speed, while zero speed disables spawning', () => {
    const idle = speedToBubble(0);
    const slow = speedToBubble(60);
    const fast = speedToBubble(600);
    expect(idle.radiusScale).toBe(0);
    expect(idle.spawnIntervalMs).toBe(Number.POSITIVE_INFINITY);
    expect(slow.radiusScale).toBeLessThan(fast.radiusScale);
    expect(slow.spawnIntervalMs).toBeGreaterThan(fast.spawnIntervalMs);
  });
});
