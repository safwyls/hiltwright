import { describe, expect, it } from 'vitest';
import { Wield, handOnArc, type Vec } from '../src/renderer/src/wield';

const OPTS = { length: 0.92, chest: [0, 1.08, 0.5] as Vec, stiffness: 70, damping: 9.5, handSpeed: 22 };
const run = (w: Wield, seconds: number, each?: (w: Wield, t: number) => void) => { for (let t = 0; t < seconds; t += 1 / 60) { w.step(1 / 60); each?.(w, t); } };

describe('wielding a saber by the hilt', () => {
  it('rests pointing away from the chest: up when the hand is high, down when it is low', () => {
    const w = new Wield([0.1, 1.0, 0], OPTS);
    w.handTarget = [0.1, 1.9, 0]; run(w, 3);
    const high = w.tilt;
    w.handTarget = [0.9, 0.4, 0]; run(w, 3);
    expect(high).toBeGreaterThan(50);
    expect(w.tilt).toBeLessThan(0);
    expect(w.turnRate).toBeLessThan(2); // and it has come to rest
  });

  it('a quick move of the hand makes the blade trail, then swing through and past, then settle', () => {
    const w = new Wield([-0.6, 1.0, 0], OPTS);
    run(w, 1);
    w.handTarget = [0.6, 1.0, 0]; // a fast cut to the right
    let peak = 0; let trailed = false; let passed = false;
    const restX = () => { const dx = w.hand[0] - OPTS.chest[0]; const dy = w.hand[1] - OPTS.chest[1]; const dz = w.hand[2] - OPTS.chest[2]; return dx / Math.hypot(dx, dy, dz); };
    run(w, 2.5, () => {
      peak = Math.max(peak, w.turnRate);
      if (w.dir[0] < restX() - 0.15) trailed = true; // the tip is behind where the wrist wants it
      if (trailed && w.dir[0] > restX() + 0.03) passed = true; // and later ahead of it
    });
    expect(trailed).toBe(true);
    expect(passed).toBe(true);
    expect(peak).toBeGreaterThan(250); // a real swing by the firmware's measure
    expect(peak).toBeLessThan(2500);
    expect(w.turnRate).toBeLessThan(3);
  });

  it('a sweep from left to right carries the blade through forward, level, not up and over', () => {
    const w = new Wield(handOnArc(-0.8, 1.3, 0.8, 0.32), OPTS);
    run(w, 2);
    const startTilt = w.tilt;
    expect(w.dir[0]).toBeLessThan(-0.5); // out to the left
    let highest = -90; let forwardMost = 0; let x = -0.8;
    run(w, 4, () => { x = Math.min(0.8, x + 1.6 / 180); w.handTarget = handOnArc(x, 1.3, 0.8, 0.32); highest = Math.max(highest, w.tilt); forwardMost = Math.min(forwardMost, w.dir[2]); });
    expect(w.dir[0]).toBeGreaterThan(0.5); // and ends out to the right
    expect(forwardMost).toBeLessThan(-0.85); // having pointed almost straight into the room on the way
    expect(highest).toBeLessThan(startTilt + 15); // without rising overhead
  });

  it('takes a different blade length and keeps the tip at it', () => {
    const w = new Wield([0.1, 1.3, 0], OPTS);
    run(w, 1);
    w.setLength(0.6);
    w.handTarget = [0.6, 1.0, 0]; run(w, 2);
    // dir is unit and the tip sits exactly 0.6 from the hand: turnRate settled means the rod length held through the swing
    expect(Math.hypot(...w.dir)).toBeCloseTo(1, 6);
    expect(w.turnRate).toBeLessThan(3);
  });

  it('keeps the blade its length and never blows up, even with a wild hand and long frames', () => {
    const w = new Wield([0, 1, 0], OPTS);
    for (let i = 0; i < 600; i++) {
      w.handTarget = [Math.sin(i * 1.7) * 1.1, 1 + Math.cos(i * 2.3) * 0.8, 0];
      w.step(i % 50 === 0 ? 0.05 : 1 / 60);
      expect(Math.hypot(...w.dir)).toBeCloseTo(1, 6);
      expect(Number.isFinite(w.turnRate)).toBe(true);
    }
  });
});
