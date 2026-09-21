import { describe, expect, it } from 'vitest';
import { BladeSim, LIBRARY_LOOKS, SIMULATED_LOOKS } from '../src';

const N = 132;
const led = (f: Float32Array, i: number): [number, number, number] => [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]];
const lum = (f: Float32Array, i: number) => f[i * 3] + f[i * 3 + 1] + f[i * 3 + 2];
/** Run the simulator from t0 to t1 at 60 fps and return the last frame. */
function run(sim: BladeSim, t0: number, t1: number): Float32Array {
  let f = sim.frame(t0);
  for (let t = t0; t <= t1; t += 1000 / 60) f = sim.frame(t);
  return f;
}

describe('blade simulator', () => {
  it('covers every look in the library', () => {
    expect([...SIMULATED_LOOKS].sort()).toEqual(LIBRARY_LOOKS.map((l) => l.id).sort());
    for (const l of LIBRARY_LOOKS) {
      const sim = new BladeSim(l.id, 24);
      sim.setOn(true);
      const f = run(sim, 0, 1500);
      expect(f.every((v) => v >= 0 && v <= 1 && Number.isFinite(v)), l.id).toBe(true);
    }
  });

  it('a steady blade is dark when off, wipes out from the hilt in the ignition time, and ends fully lit', () => {
    const sim = new BladeSim('hw_blade', N);
    expect(run(sim, 0, 100).every((v) => v === 0)).toBe(true);
    sim.setOn(true);
    sim.frame(1000);
    const half = sim.frame(1150); // halfway through a 300 ms wipe
    expect(led(half, 10)).toEqual([0, 0, 1]);
    expect(lum(half, N - 10)).toBe(0);
    expect(lum(half, 60)).toBeGreaterThan(0);
    expect(lum(half, 72)).toBe(0);
    const lit = sim.frame(1400);
    expect(led(lit, N - 1)).toEqual([0, 0, 1]);
  });

  it('honours the preset arguments: base colour and a slower ignition', () => {
    const sim = new BladeSim('hw_blade', N);
    sim.setArgs(new Map([[1, '65535,0,0'], [5, '1200']]));
    sim.setOn(true);
    sim.frame(0);
    const f = sim.frame(300); // a quarter of the way through 1200 ms
    expect(led(f, 5)).toEqual([1, 0, 0]);
    expect(lum(f, 40)).toBe(0);
  });

  it('retraction pulls the blade back in from the tip', () => {
    const sim = new BladeSim('hw_blade', N);
    sim.setOn(true); run(sim, 0, 1000);
    sim.setOn(false); sim.frame(1001);
    const f = sim.frame(1251); // halfway through 500 ms
    expect(lum(f, 5)).toBeGreaterThan(0);
    expect(lum(f, N - 5)).toBe(0);
    expect(run(sim, 1252, 1600).every((v) => v === 0)).toBe(true);
  });

  it('a clash is a localised white bump that fades in a quarter second', () => {
    const sim = new BladeSim('hw_blade', N);
    sim.setOn(true); run(sim, 0, 1000);
    sim.trigger('clash', 0.5);
    const hit = sim.frame(1001).slice(); // frame() reuses its buffer
    expect(hit[66 * 3]).toBeGreaterThan(0.9); // red channel lifted toward white at the hit
    expect(hit[5 * 3]).toBe(0); // the hilt end is untouched
    const later = sim.frame(1130);
    expect(later[66 * 3]).toBeLessThan(hit[66 * 3]);
    expect(sim.frame(1300)[66 * 3]).toBe(0);
  });

  it('a blast ring travels outward from where it landed', () => {
    const sim = new BladeSim('hw_blade', N);
    sim.setOn(true); run(sim, 0, 1000);
    sim.trigger('blast', 0.5);
    sim.frame(1001);
    const early = sim.frame(1020).slice();
    const later = sim.frame(1100);
    const peak = (f: Float32Array) => { let best = 0; let at = -1; for (let i = 66; i < N; i++) if (f[i * 3] > best) { best = f[i * 3]; at = i; } return at; };
    expect(peak(later)).toBeGreaterThan(peak(early));
    expect(run(sim, 1101, 1400)[80 * 3]).toBe(0);
  });

  it('lockup holds while active and lets go afterwards', () => {
    const sim = new BladeSim('hw_blade', N);
    sim.setOn(true); run(sim, 0, 1000);
    sim.setLockup('normal');
    const at = Math.round((16000 / 32768) * N); // a level blade is met in the middle
    expect(run(sim, 1001, 2500)[at * 3]).toBeGreaterThan(0.8);
    sim.setLockup(null);
    expect(run(sim, 2501, 3000)[at * 3]).toBe(0);
  });

  it('swing flare brightens with speed; pulsing moves between its two colours; fire burns', () => {
    const swing = new BladeSim('hw_swing', N);
    swing.setOn(true); const still = run(swing, 0, 1000)[60 * 3];
    swing.setSwing(500); const fast = run(swing, 1001, 1100)[60 * 3];
    expect(still).toBe(0);
    expect(fast).toBeGreaterThan(0.7);

    const pulse = new BladeSim('hw_pulse', N);
    pulse.setOn(true);
    const greens: number[] = [];
    for (let t = 0; t < 3000; t += 50) greens.push(pulse.frame(t)[60 * 3 + 1]);
    expect(Math.max(...greens)).toBeGreaterThan(0.9);
    expect(Math.min(...greens.slice(10))).toBeLessThan(0.1);

    const fire = new BladeSim('hw_fire', N);
    fire.setOn(true);
    const f = run(fire, 0, 3000);
    let lit = 0; for (let i = 0; i < N; i++) if (lum(f, i) > 0.05) lit++;
    expect(lit).toBeGreaterThan(N / 2);
  });

  it('an accent fades in with the blade and a resting crystal pulses in its off colour', () => {
    const accent = new BladeSim('hw_accent', 1);
    accent.setOn(true);
    expect(lum(accent.frame(0), 0)).toBe(0);
    const mid = accent.frame(150)[2];
    expect(mid).toBeGreaterThan(0.4); expect(mid).toBeLessThan(0.6);
    expect(accent.frame(400)[2]).toBe(1);

    const crystal = new BladeSim('hw_crystal', 1);
    const blues: number[] = [];
    for (let t = 0; t < 4000; t += 50) blues.push(crystal.frame(t)[2]);
    expect(Math.max(...blues)).toBeGreaterThan(0.1);
    expect(Math.max(...blues)).toBeLessThan(0.2); // Rgb<0,0,40> at most
    expect(Math.min(...blues)).toBeLessThan(0.01);
  });

  it('stardust sparks appear and fade; the heartbeat beats twice per cycle; the scanner travels', () => {
    const dust = new BladeSim('hw_stardust', N);
    dust.setOn(true);
    let sparked = 0;
    for (let t = 0; t < 3000; t += 1000 / 60) { const f = dust.frame(t); if (t > 600) for (let i = 0; i < N; i++) if (f[i * 3] > 0.5) { sparked++; break; } }
    expect(sparked).toBeGreaterThan(20); // red only appears where a white spark is
    expect(sparked).toBeLessThan(160);

    const heart = new BladeSim('hw_heartbeat', 1);
    heart.setOn(true); run(heart, 0, 1000);
    const reds: number[] = [];
    for (let t = 1260; t < 1260 + 1260; t += 10) reds.push(heart.frame(t)[0]);
    let peaks = 0;
    for (let i = 1; i < reds.length - 1; i++) if (reds[i] > 0.9 && reds[i] >= reds[i - 1] && reds[i] > reds[i + 1]) peaks++;
    expect(peaks).toBe(2);
    expect(Math.min(...reds)).toBeLessThan(0.2);

    const scan = new BladeSim('hw_scanner', 40);
    scan.setOn(true);
    const brightest = (f: Float32Array) => { let at = 0; for (let i = 1; i < 40; i++) if (f[i * 3] > f[at * 3]) at = i; return at; };
    const seen = new Set<number>();
    for (let t = 0; t < 2000; t += 50) seen.add(brightest(scan.frame(t)));
    expect(seen.size).toBeGreaterThan(15);
  });

  it('the emitter flare stays at the hilt and the current runs faster in a swing', () => {
    const flare = new BladeSim('hw_emitter', N);
    flare.setOn(true);
    const f = run(flare, 0, 1500);
    expect(f[0]).toBeGreaterThan(0.5); // white over blue at the first LED
    expect(f[60 * 3]).toBe(0);

    const changes = (swing: number) => {
      const sim = new BladeSim('hw_current', N, 3);
      sim.setOn(true); sim.setSwing(swing); run(sim, 0, 1000);
      let prev = sim.frame(1001)[60 * 3 + 1]; let total = 0;
      for (let t = 1017; t < 2000; t += 1000 / 60) { const v = sim.frame(t)[60 * 3 + 1]; total += Math.abs(v - prev); prev = v; }
      return total;
    };
    expect(changes(450)).toBeGreaterThan(changes(0) * 3);
  });

  it('unfold opens from the middle; the spark rides the ignition edge; horizon follows the tilt', () => {
    const unfold = new BladeSim('hw_unfold', N);
    unfold.setOn(true); unfold.frame(0);
    const half = unfold.frame(150).slice();
    expect(lum(half, 66)).toBeGreaterThan(0);
    expect(lum(half, 5)).toBe(0);
    expect(lum(half, N - 5)).toBe(0);
    expect(lum(unfold.frame(400), 5)).toBeGreaterThan(0);
    unfold.setOn(false); unfold.frame(1000);
    const closing = unfold.frame(1250).slice();
    expect(lum(closing, 66)).toBeGreaterThan(0);
    expect(lum(closing, 5)).toBe(0);

    const spark = new BladeSim('hw_sparktip', N);
    spark.setOn(true); spark.frame(0);
    const f = spark.frame(150);
    let edge = 0; for (let i = 0; i < N; i++) if (f[i * 3 + 2] > 0.5) edge = i;
    expect(f[(edge - 1) * 3]).toBeGreaterThan(0.5); // white at the leading edge of a blue blade
    expect(f[10 * 3]).toBe(0); // plain blue behind it

    const horizon = new BladeSim('hw_horizon', N);
    horizon.setOn(true); horizon.setAngle(-90);
    expect(led(run(horizon, 0, 600), 60)).toEqual([0, 0, 1]);
    horizon.setAngle(90);
    expect(led(run(horizon, 601, 700), 60)).toEqual([1, 0, 0]);
  });

  it('gravity: liquid pools at the low end, bands run downhill, a lockup slides with the tilt, a twist blends', () => {
    const green = (f: Float32Array, i: number) => f[i * 3 + 1];
    const liquid = new BladeSim('hw_liquid', N);
    liquid.setOn(true); liquid.setAngle(-80);
    let f = run(liquid, 0, 600).slice();
    expect(green(f, N - 5)).toBeGreaterThan(0.9); // pointing down: the second colour is in the tip
    expect(green(f, 5)).toBe(0);
    liquid.setAngle(80);
    f = run(liquid, 601, 700).slice();
    expect(green(f, 5)).toBeGreaterThan(0.9); // raised: it has run back to the hilt
    expect(green(f, N - 5)).toBe(0);
    liquid.setAngle(0);
    f = run(liquid, 701, 800).slice();
    expect(green(f, 5)).toBeGreaterThan(0.3); expect(green(f, N - 5)).toBeGreaterThan(0.3); // level: spread along it

    // Follow a band: with the blade down the pattern moves toward the tip, raised it moves toward the hilt.
    const shift = (deg: number) => {
      const sim = new BladeSim('hw_gravity', N, 5);
      sim.setOn(true); sim.setAngle(deg); run(sim, 0, 1000);
      const a = Array.from(sim.frame(1001)).filter((_, i) => i % 3 === 1);
      const b = Array.from(sim.frame(1006)).filter((_, i) => i % 3 === 1);
      let best = 0; let bestErr = Infinity;
      for (let d = -8; d <= 8; d++) { let err = 0; for (let i = 20; i < N - 20; i++) err += (a[i] - b[i + d]) ** 2; if (err < bestErr) { bestErr = err; best = d; } }
      return best;
    };
    expect(shift(-90)).toBeGreaterThan(0);
    expect(shift(90)).toBeLessThan(0);
    expect(shift(0)).toBe(0);

    const peak = (deg: number) => {
      const sim = new BladeSim('hw_blade', N);
      sim.setOn(true); sim.setAngle(deg); run(sim, 0, 1000); sim.setLockup('normal');
      const g = run(sim, 1001, 1500); let at = 0; for (let i = 1; i < N; i++) if (g[i * 3] > g[at * 3]) at = i; return at;
    };
    expect(peak(80)).toBeLessThan(peak(0)); // raised: met near the hilt
    expect(peak(0)).toBeGreaterThan(50);

    const twist = new BladeSim('hw_twist', N);
    twist.setOn(true);
    expect(led(run(twist, 0, 600), 60)).toEqual([0, 0, 1]);
    twist.setTwist(90);
    expect(run(twist, 601, 700)[60 * 3]).toBe(1);
    twist.setTwist(45);
    const half = run(twist, 701, 800)[60 * 3];
    expect(half).toBeGreaterThan(0.4); expect(half).toBeLessThan(0.6);
  });

  it('is deterministic for a given seed', () => {
    const a = new BladeSim('hw_unstable', 40, 7); const b = new BladeSim('hw_unstable', 40, 7);
    a.setOn(true); b.setOn(true);
    expect(Array.from(run(a, 0, 500))).toEqual(Array.from(run(b, 0, 500)));
  });
});
