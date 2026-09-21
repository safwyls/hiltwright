import { describe, expect, it } from 'vitest';
import { Steer } from '../src/renderer/src/steer';

const OPTS = { yawPerPixel: 0.35, pitchPerPixel: 0.3, follow: 16, minPitch: -85, maxPitch: 85 };
const settle = (s: Steer, each?: (s: Steer) => void) => { for (let i = 0; i < 120; i++) { s.step(1 / 60); each?.(s); } };

describe('steering the saber directly', () => {
  it('left and right swing the tip in an arc parallel to the floor: its height and the tilt never change', () => {
    const s = new Steer(60, 42, OPTS);
    const height = s.dir[1];
    s.dragBy(400, 0);
    let peak = 0;
    settle(s, (x) => { expect(x.dir[1]).toBeCloseTo(height, 9); expect(x.tilt).toBeCloseTo(42, 9); peak = Math.max(peak, x.turnRate); });
    expect(s.yaw).toBeCloseTo(60 + 400 * 0.35, 3);
    expect(peak).toBeGreaterThan(200); // a quick drag reads as a real swing
    expect(s.turnRate).toBeLessThan(1);
  });

  it('dragging right turns clockwise seen from above: from pointing away, the tip goes to the right', () => {
    const s = new Steer(0, 0, OPTS);
    expect(s.dir[2]).toBeCloseTo(-1); // away from the viewer's side
    s.dragBy(90 / 0.35, 0); settle(s);
    expect(s.dir[0]).toBeCloseTo(1, 2);
  });

  it('up and down change only the tilt, and stop short of straight up or down', () => {
    const s = new Steer(60, 42, OPTS);
    s.dragBy(0, -100); settle(s);
    expect(s.tilt).toBeCloseTo(72, 2);
    expect(s.yaw).toBe(60);
    s.dragBy(0, -5000); settle(s);
    expect(s.tilt).toBeCloseTo(85, 2);
    s.dragBy(0, 99999); settle(s);
    expect(s.tilt).toBeCloseTo(-85, 2);
  });
});
