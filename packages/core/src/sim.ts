// Blade simulator: what ProffieOS would put on each LED, frame by frame, for Hiltwright's looks.
//
// This is a port of the per-LED maths of the ProffieOS building blocks the look library uses (Layers, AlphaL, Mix,
// Sin, Gradient, Rainbow, Stripes, StyleFire, BrownNoiseF, RandomPerLEDF, Bump, SmoothStep, BlastF, SimpleClashL,
// TransitionEffectL, LockupTrL, InOutTrL with wipe and fade transitions), using the same 0..32768 fixed-point
// conventions and the same tables, so timing, shapes and blending match the firmware. Two inputs are modelled
// because a desk has no saber in it: the sound level (AudioFlicker, lightning block) is modelled, and motion (swing
// speed, blade tilt, twist) is whatever the caller sets, which is how the preview's motion pad drives it. ProffieOS is GPL-3.0; this file is a derivative of its style headers.

export type RGB = [number, number, number]; // 0..65535 per channel, linear, as Color16
type Ctx = {
  now: number; // ms
  n: number;
  rnd: (n: number) => number;
  on: boolean;
  args: Map<number, string>;
  effects: { type: EffectType; at: number; pos: number }[];
  lockup: LockupType | null;
  lockupPos: number;
  swing: number; // degrees per second
  sound: number; // 0..32768, NoisySoundLevel-like
  battery: number; // 0..32768
  angle: number; // 0 pointing straight down, 16384 level, 32768 straight up
  twist: number; // degrees the hilt is rolled about the blade's axis
};
export type EffectType = 'clash' | 'blast' | 'stab';
export type LockupType = 'normal' | 'drag' | 'lb';

interface ColorFn { run(c: Ctx): void; get(led: number): RGB }
interface IntFn { run(c: Ctx): void; get(led: number): number } // 0..32768
interface LayerFn { run(c: Ctx): void; get(led: number): { c: RGB; a: number } } // a: 0..32768

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const SIN = new Int16Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.round(16384 * Math.sin((2 * Math.PI * i) / 1024));
const HUMP = [255, 255, 252, 247, 240, 232, 222, 211, 199, 186, 173, 159, 145, 132, 119, 106, 94, 82, 72, 62, 53, 45, 38, 32, 26, 22, 18, 14, 11, 9, 7, 5, 0];

const mixRGB = (a: RGB, b: RGB, f: number): RGB => { // f: 0..32768 of b
  const g = 32768 - f;
  return [(a[0] * g + b[0] * f) / 32768, (a[1] * g + b[1] * f) / 32768, (a[2] * g + b[2] * f) / 32768];
};
const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [65535, 65535, 65535];
const rgb8 = (r: number, g: number, b: number): RGB => [r * 257, g * 257, b * 257];

// ---------- colours and functions ----------

const solid = (c: RGB): ColorFn => ({ run() {}, get: () => c });

/** RgbArg<N, default>: the preset's argument word when present, else the compiled default. */
function rgbArg(n: number, def: RGB): ColorFn {
  let cur = def;
  return {
    run(c) {
      const w = c.args.get(n);
      const m = w ? /^(\d+),(\d+),(\d+)$/.exec(w.trim()) : null;
      cur = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : def;
    },
    get: () => cur,
  };
}

/** IntArg-backed times: IgnitionTime<def> is argument 5, RetractionTime<def> is argument 26; 0 means "use the default". */
function timeArg(n: number, def: number): (c: Ctx) => number {
  return (c) => { const v = Number(c.args.get(n)); return Number.isFinite(v) && v > 0 ? v : def; };
}

const constInt = (v: number): IntFn => ({ run() {}, get: () => v });

/** Sin<Int<rpm>>: 0..32768, advancing with real time. */
function sinF(rpm: number): IntFn {
  let pos = 0; let last = -1; let val = 0;
  return {
    run(c) {
      const delta = last < 0 ? 0 : c.now - last;
      last = c.now;
      pos = (pos + (delta / 60000) * rpm) % 1;
      val = Math.trunc((SIN[Math.floor(pos * 1024)] / 32768 + 0.5) * 32768);
    },
    get: () => val,
  };
}

/** PulsingF<ms>: sin + 16384, one cycle per `ms`. */
function pulsingF(ms: number): IntFn {
  let pos = 0; let last = -1; let val = 0;
  return {
    run(c) { const d = last < 0 ? 0 : c.now - last; last = c.now; pos = (pos + d / ms) % 1; val = SIN[Math.floor(pos * 1024)] + 16384; },
    get: () => val,
  };
}

/** BrownNoiseF<Int<grade>>: a random walk restarted each frame and stepped once per LED. */
function brownNoise(grade: number): IntFn {
  let mix = 0; let rnd: Ctx['rnd'] = () => 0;
  return {
    run(c) { rnd = c.rnd; mix = rnd(32768); },
    get() { mix = clamp(mix + rnd(grade * 2 + 1) - grade, 0, 32768); return mix; },
  };
}

/** SlowNoise<speed>: a random walk stepped once per elapsed millisecond. */
function slowNoise(speed: number): IntFn {
  let value = -1; let last = 0;
  return {
    run(c) {
      if (value < 0) { value = c.rnd(32768); last = c.now; }
      let delta = Math.round(c.now - last);
      if (delta > 100) delta = 1;
      last = c.now;
      while (delta-- > 0) value = clamp(value + (c.rnd(speed * 2 + 1) - speed), 0, 32768);
    },
    get: () => value,
  };
}

/** Saw<Int<rpm>>: 0..32768 ramp, then back to 0. */
function saw(rpm: number): IntFn {
  let pos = 0; let last = -1;
  return { run(c) { const d = last < 0 ? 0 : c.now - last; last = c.now; pos = (pos + (d / 60000) * rpm) % 1; }, get: () => Math.trunc(pos * 32768) };
}

/** HumpFlickerF<width>: 0 at a spot that moves to a random LED every frame, rising to 32768 `width` LEDs away. */
function humpFlicker(width: number): IntFn {
  let pos = 0;
  return { run(c) { pos = c.rnd(c.n); }, get: (led) => clamp(Math.trunc((Math.abs(led - pos) * 32768) / width), 0, 32768) };
}

/** BladeAngle<>: where the blade points, 0 down to 32768 up. */
const bladeAngle = (min = 0, max = 32768): IntFn => { let v = 16384; return { run(c) { v = clamp(Math.trunc(((c.angle - min) * 32768) / (max - min)), 0, 32768); }, get: () => v }; };

/** TwistAngle<2>: 0 with the hilt flat, 32768 a quarter turn either way, and back again by a half turn. */
const twistAngle = (): IntFn => {
  let v = 0;
  return { run(c) { const a = Math.trunc((c.twist / 180) * 32768); let x = (((a * 2) % 65536) + 65536) % 65536; if (x >= 32768) x = 65536 - x; v = x; }, get: () => v };
};

/** RandomF: one random value per frame, the same for every LED. */
const randomF = (): IntFn => { let v = 0; return { run(c) { v = c.rnd(32768); }, get: () => v }; };

/** SparkleF<chance, intensity>: sparks land at random, then spread into their neighbours and fade, every 10 ms. */
function sparkleF(chancePromille = 300, intensity = 1024): IntFn {
  let sparks: Int32Array | null = null; let last = -1e9;
  return {
    run(c) {
      let cur: Int32Array = sparks && sparks.length === c.n + 4 ? sparks : new Int32Array(c.n + 4);
      if (c.now - last > 200) last = c.now - 10;
      while (c.now - last >= 10) {
        last += 10;
        const next = new Int32Array(cur.length);
        for (let i = 2; i < c.n + 2; i++) next[i] = ((cur[i - 1] + cur[i + 1]) * 200 + cur[i] * 570) >> 10;
        cur = next;
        if (c.rnd(1000) < chancePromille) { const at = c.rnd(c.n) + 2; cur[at] = Math.min(32767, cur[at] + intensity); }
      }
      sparks = cur;
    },
    get: (led) => clamp(sparks ? sparks[led + 2] : 0, 0, 256) << 7,
  };
}

const randomPerLed = (): IntFn => { let rnd: Ctx['rnd'] = () => 0; return { run(c) { rnd = c.rnd; }, get: () => rnd(32768) }; };
const swingSpeed = (max: number): IntFn => { let v = 0; return { run(c) { v = clamp(Math.trunc((c.swing / max) * 32768), 0, 32768); }, get: () => v }; };
const soundCompat = (): IntFn => { let v = 0; return { run(c) { v = c.sound; }, get: () => v }; };
const batteryLevel = (): IntFn => { let v = 0; return { run(c) { v = c.battery; }, get: () => v }; };
/** Scale<F, lo, hi>. */
const scale = (f: IntFn, lo: number, hi: number): IntFn => ({ run(c) { f.run(c); }, get: (led) => lo + Math.trunc((f.get(led) * (hi - lo)) / 32768) });

/** Bump<pos, widthFraction>: the firmware's hump table, including its 6-bit interpolation quirk. */
function bump(pos: IntFn, fraction: IntFn): IntFn {
  let mult = 1; let location = -10000;
  return {
    run(c) {
      pos.run(c); fraction.run(c);
      const fr = fraction.get(0);
      if (fr === 0) { mult = 1; location = -10000; return; }
      mult = Math.trunc((32 * 2.0 * 128 * 32768) / fr / c.n);
      location = Math.trunc((pos.get(0) * c.n * mult) / 32768);
    },
    get(led) {
      const dist = Math.abs(led * mult - location);
      const p = dist >> 7;
      if (p >= HUMP.length - 1) return 0;
      const m = dist & 0x3f;
      return HUMP[p] * (128 - m) + HUMP[p + 1] * m;
    },
  };
}

/** SmoothStep<pos, width>. */
function smoothStep(pos: IntFn, width: IntFn): IntFn {
  let mult = 0; let location = 0;
  return {
    run(c) {
      pos.run(c); width.run(c);
      const w = width.get(0);
      if (w === 0) { mult = 32768; location = c.n * pos.get(0); } else { mult = Math.trunc((32768 * 32768) / w / c.n); location = Math.trunc((32768 * pos.get(0)) / w) - 16384; }
    },
    get(led) {
      const x = led * mult - location;
      if (x < 0) return 0;
      if (x > 32768) return 32768;
      return Math.trunc((Math.trunc((x * x) / 16384) * (3 * 16384 - x)) / 32768);
    },
  };
}

// ---------- colour sources ----------

const mix = (f: IntFn, a: ColorFn, b: ColorFn): ColorFn => ({ run(c) { f.run(c); a.run(c); b.run(c); }, get: (led) => mixRGB(a.get(led), b.get(led), f.get(led)) });

function gradient(colors: ColorFn[]): ColorFn {
  let mul = 0;
  return {
    run(c) { for (const x of colors) x.run(c); mul = Math.trunc(((colors.length - 1) << 15) / Math.max(1, c.n - 1)); },
    get(led) {
      const x = led * mul;
      const i = x >> 15;
      return mixRGB(colors[Math.min(i, colors.length - 1)].get(led), colors[Math.min(i + 1, colors.length - 1)].get(led), x & 0x7fff);
    },
  };
}

function rainbow(): ColorFn {
  let m = 0;
  return {
    run(c) { m = Math.trunc(c.now); },
    get(led) {
      const ch = (off: number) => Math.min(65535, Math.max(0, SIN[(m * 3 + led * 50 + off) & 0x3ff] << 2));
      return [ch(0), ch(Math.trunc(1024 / 3)), ch(Math.trunc((1024 * 2) / 3))];
    },
  };
}

/** Stripes<width, speed, colours...>: sine-weighted bands sliding along the blade. */
function stripes(width: number | IntFn, speed: number | IntFn, colors: ColorFn[]): ColorFn {
  let m = 0; let last = -1; let mult = 0;
  const wf = typeof width === 'number' ? constInt(width) : width;
  const sf = typeof speed === 'number' ? constInt(speed) : speed;
  const period = colors.length * 341;
  return {
    run(c) {
      for (const x of colors) x.run(c);
      wf.run(c); sf.run(c);
      const deltaMicros = last < 0 ? 0 : (c.now - last) * 1000;
      last = c.now;
      const span = period * 1024;
      m = (((m + Math.trunc((deltaMicros * sf.get(0)) / 333)) % span) + span) % span;
      mult = Math.trunc((50000 * 1024) / Math.max(1, wf.get(0)));
    },
    get(led) {
      const p0 = ((m + led * mult) >> 10) % period;
      const out: RGB = [0, 0, 0];
      for (const base of [p0, p0 + period]) {
        let p = base;
        for (const col of colors) {
          if (p > 0 && p < 512) {
            const t = col.get(led); const w = SIN[p];
            out[0] = clamp(out[0] + ((t[0] * w) / 16384), 0, 65535);
            out[1] = clamp(out[1] + ((t[1] * w) / 16384), 0, 65535);
            out[2] = clamp(out[2] + ((t[2] * w) / 16384), 0, 65535);
          }
          p -= 341;
        }
      }
      return out;
    },
  };
}

interface FireCfg { base: number; rand: number; cooling: number }
/** StyleFire<c1, c2, delay, speed, norm, clash, lock, off>: a heat column updated every 10 ms. */
function styleFire(c1: ColorFn, c2: ColorFn, speed: number, norm: FireCfg, clashCfg: FireCfg, lock: FireCfg, off: FireCfg): ColorFn {
  let heat: Uint16Array | null = null; let lastUpdate = -1e9; let n = 0; let seenClash = -1;
  return {
    run(c) {
      c1.run(c); c2.run(c);
      n = c.n;
      if (!heat || heat.length !== n + speed + 3) heat = new Uint16Array(n + speed + 3);
      // The firmware steps the fire every 10 ms and runs far faster than that; a 60 fps preview has to catch up.
      if (c.now - lastUpdate > 200) lastUpdate = c.now - 10;
      while (c.now - lastUpdate >= 10) {
        lastUpdate += 10;
        let cfg = off;
        const clash = c.effects.find((e) => e.type === 'clash' && e.at > seenClash);
        if (clash) { seenClash = clash.at; cfg = clashCfg; } else if (c.on) cfg = c.lockup ? lock : norm;
        for (let i = 0; i < speed; i++) heat[n + i] = cfg.base + c.rnd(c.rnd(c.rnd(cfg.rand)));
        for (let i = 0; i < n; i++) {
          const x = (heat[i + speed - 1] * 3 + heat[i + speed] * 10 + heat[i + speed + 1] * 3) >> 4;
          heat[i] = clamp(x - c.rnd(cfg.cooling), 0, 65535);
        }
      }
    },
    get(led) {
      const h = heat ? heat[n - 1 - led] : 0;
      // Color16::mix takes 0..256.
      const m8 = (a: RGB, b: RGB, f: number) => mixRGB(a, b, f * 128);
      if (h < 256) return m8(BLACK, c1.get(led), h);
      if (h < 512) return m8(c1.get(led), c2.get(led), h - 256);
      if (h < 768) return m8(c2.get(led), WHITE, h - 512);
      return WHITE;
    },
  };
}

// ---------- layers ----------

const opaque = (col: ColorFn): LayerFn => ({ run(c) { col.run(c); }, get: (led) => ({ c: col.get(led), a: 32768 }) });
/** AlphaL<COLOR, F>. COLOR may itself carry alpha (AlphaL<AlphaL<..>, F> multiplies). */
const alphaL = (col: ColorFn | LayerFn, f: IntFn): LayerFn => ({
  run(c) { col.run(c); f.run(c); },
  get(led) {
    const x = col.get(led);
    const inner = Array.isArray(x) ? { c: x as RGB, a: 32768 } : (x as { c: RGB; a: number });
    return { c: inner.c, a: Math.trunc((inner.a * f.get(led)) / 32768) };
  },
});

/** Layers<BASE, L...> as a colour: each layer painted over the result with its alpha. */
function layers(base: ColorFn, ...ls: LayerFn[]): ColorFn {
  return {
    run(c) { base.run(c); for (const l of ls) l.run(c); },
    get(led) {
      let out = base.get(led);
      for (const l of ls) { const x = l.get(led); if (x.a > 0) out = mixRGB(out, x.c, clamp(x.a, 0, 32768)); }
      return out;
    },
  };
}

/** BlastF<200, 100, 400>: a ring spreading from each blast, fading over FADEOUT_MS. */
function blastL(col: ColorFn, fadeoutMs = 200, waveSize = 100, waveMs = 400): LayerFn {
  let ctx: Ctx | null = null;
  return {
    run(c) { col.run(c); ctx = c; },
    get(led) {
      const c = ctx!; let m = 0;
      for (const b of c.effects) {
        if (b.type !== 'blast') continue;
        const T = (c.now - b.at) * 1000;
        const M = 1000 - Math.trunc(T / fadeoutMs);
        if (M <= 0) continue;
        const dist = Math.abs(b.pos - led / c.n);
        const N = Math.trunc(Math.abs(dist - T / (waveMs * 1000)) * waveSize);
        if (N <= 31) m += Math.trunc((HUMP[N] * M) / 1000);
      }
      return { c: col.get(led), a: Math.min(m << 7, 32768) };
    },
  };
}

/** SimpleClashL<COLOR, 40>: the whole blade for CLASH_MILLIS. */
function simpleClashL(col: ColorFn, ms = 40): LayerFn {
  let active = false;
  return {
    run(c) { col.run(c); active = c.effects.some((e) => e.type === 'clash' && c.now - e.at <= ms); },
    get: (led) => ({ c: col.get(led), a: active ? 32768 : 0 }),
  };
}

type Spark = { color: ColorFn; size: number; center: number };
type Tr = { kind: 'instant' } | { kind: 'fade' | 'wipe' | 'wipein' | 'center' | 'centerin'; ms: number | ((c: Ctx) => number); spark?: Spark };
/** Fraction of B showing on `led`, `t` ms into transition `tr` (0..32768), or null when it has finished. */
function trMix(tr: Tr, t: number, led: number, c: Ctx): number | null {
  if (tr.kind === 'instant') return null;
  const ms = typeof tr.ms === 'function' ? tr.ms(c) : tr.ms;
  if (t >= ms) return null;
  if (tr.kind === 'fade') return Math.trunc((t / ms) * 32768);
  if (tr.kind === 'center' || tr.kind === 'centerin') {
    // TrCenterWipeX opens a range from the middle; TrCenterWipeInX closes one from both ends.
    const p = t / ms; const end = 256 * c.n; const mid = c.n * 128;
    const lo0 = led * 256; const hi0 = lo0 + 256;
    const [from, to] = tr.kind === 'center' ? [mid - mid * p, mid + (end - mid) * p] : [mid * p, end - (end - mid) * p];
    const overlap = clamp(Math.min(hi0, to) - Math.max(lo0, from), 0, 256);
    return (tr.kind === 'center' ? overlap : 256 - overlap) * 128;
  }
  const fade = (t / ms) * 256 * c.n;
  const lo = led * 256; const hi = lo + 256;
  const size = tr.kind === 'wipe' ? clamp(Math.min(hi, fade) - lo, 0, 256) : clamp(hi - Math.max(lo, 256 * c.n - fade), 0, 256);
  return size * 128;
}
/** TrSparkX joined to a wipe: how much of the spark colour sits on `led`, `t` ms in (0..32768). */
function sparkMix(tr: Tr, t: number, led: number, c: Ctx): number {
  if (tr.kind === 'instant' || !tr.spark) return 0;
  const ms = typeof tr.ms === 'function' ? tr.ms(c) : tr.ms;
  if (t >= ms) return 0;
  const offset = Math.trunc((t / ms) * 32768);
  const dist = Math.abs(tr.spark.center - Math.trunc((led * 32768) / c.n));
  const N = (Math.abs(dist - offset) * tr.spark.size) >> 15;
  return N < 32 ? HUMP[N] << 7 : 0;
}
const trMs = (tr: Tr, c: Ctx) => (tr.kind === 'instant' ? 0 : typeof tr.ms === 'function' ? tr.ms(c) : tr.ms);

/** TransitionEffectL<TrConcat<TR1, LAYER, TR2>, EFFECT>: in over TR1, out over TR2, once per effect. */
function effectL(type: EffectType, tr1: Tr, layer: LayerFn, tr2: Tr): LayerFn {
  let ctx: Ctx | null = null; let since = -1;
  return {
    run(c) { layer.run(c); ctx = c; const e = [...c.effects].reverse().find((x) => x.type === type); since = e ? c.now - e.at : -1; },
    get(led) {
      const c = ctx!; const x = layer.get(led);
      if (since < 0) return { c: x.c, a: 0 };
      const d1 = trMs(tr1, c);
      if (since < d1) return { c: x.c, a: Math.trunc((x.a * (trMix(tr1, since, led, c) ?? 32768)) / 32768) };
      const f2 = trMix(tr2, since - d1, led, c);
      return { c: x.c, a: f2 == null ? 0 : Math.trunc((x.a * (32768 - f2)) / 32768) };
    },
  };
}

/** LockupTrL<LAYER, TR1, TR2, TYPE>: in over TR1 when the lockup starts, held, out over TR2 when it ends. */
function lockupL(type: LockupType, layer: LayerFn, tr1: Tr, tr2: Tr): LayerFn {
  let ctx: Ctx | null = null; let began = -1; let ended = -1; let was = false;
  return {
    run(c) {
      layer.run(c); ctx = c;
      const active = c.lockup === type;
      if (active && !was) { began = c.now; ended = -1; }
      if (!active && was) ended = c.now;
      was = active;
    },
    get(led) {
      const c = ctx!; const x = layer.get(led);
      if (was) { const f = trMix(tr1, c.now - began, led, c); return { c: x.c, a: f == null ? x.a : Math.trunc((x.a * f) / 32768) }; }
      if (ended < 0) return { c: x.c, a: 0 };
      const f = trMix(tr2, c.now - ended, led, c);
      return { c: x.c, a: f == null ? 0 : Math.trunc((x.a * (32768 - f)) / 32768) };
    },
  };
}

/**
 * TransitionLoopL<TrConcat<TR, COLOR, TR, COLOR, ..., TR>>: from transparent through each colour and back to
 * transparent, over and over. A fade blends its two ends; a delay holds the earlier one.
 */
function loopL(segs: { kind: 'fade' | 'delay'; ms: number }[], nodes: ColorFn[]): LayerFn {
  let start = -1; let t = 0;
  const total = segs.reduce((a, x) => a + x.ms, 0);
  return {
    run(c) { for (const n of nodes) n.run(c); if (start < 0) start = c.now; t = (c.now - start) % total; },
    get(led) {
      let at = t; let i = 0;
      while (i < segs.length - 1 && at >= segs[i].ms) { at -= segs[i].ms; i++; }
      const from = i === 0 ? null : nodes[i - 1].get(led);
      const to = i === segs.length - 1 ? null : nodes[i].get(led);
      if (segs[i].kind === 'delay') return { c: from ?? BLACK, a: from ? 32768 : 0 };
      const f = Math.trunc((at / segs[i].ms) * 32768);
      if (!from) return { c: to ?? BLACK, a: to ? f : 0 };
      if (!to) return { c: from, a: 32768 - f };
      return { c: mixRGB(from, to, f), a: 32768 };
    },
  };
}

/** InOutTrL<OUT_TR, IN_TR, OFF>: OFF covers the blade while off, wiped or faded away on ignition and back on retraction. */
function inOutL(outTr: Tr, inTr: Tr, off: ColorFn = solid(BLACK)): LayerFn {
  let ctx: Ctx | null = null; let was = false; let changed = -1e9;
  const sparks = [outTr, inTr].flatMap((t) => (t.kind !== 'instant' && t.spark ? [t.spark.color] : []));
  return {
    run(c) { off.run(c); for (const s of sparks) s.run(c); ctx = c; if (c.on !== was) { was = c.on; changed = c.now; } },
    get(led) {
      const c = ctx!; const t = c.now - changed;
      const tr = was ? outTr : inTr;
      const f = trMix(tr, t, led, c);
      const a = was ? (f == null ? 0 : 32768 - f) : (f == null ? 32768 : f);
      const m = sparkMix(tr, t, led, c);
      if (m <= 0 || tr.kind === 'instant' || !tr.spark) return { c: off.get(led), a };
      // The spark is painted over the off colour: one layer with both, alpha 1 - (1 - a)(1 - m).
      const alpha = 32768 - Math.trunc(((32768 - a) * (32768 - m)) / 32768);
      const under = (a * (32768 - m)) / 32768;
      const o = off.get(led); const s = tr.spark.color.get(led);
      return { c: [(o[0] * under + s[0] * m) / alpha, (o[1] * under + s[1] * m) / alpha, (o[2] * under + s[2] * m) / alpha], a: alpha };
    },
  };
}

// ---------- the looks, mirroring lookLibrary.ts line for line ----------

const base = (r = 0, g = 0, b = 255) => rgbArg(1, rgb8(r, g, b));
const alt = (r: number, g: number, b: number) => rgbArg(2, rgb8(r, g, b));
const ign = timeArg(5, 300);
const ret = timeArg(26, 500);
/**
 * Where clashes, lockups and the lightning block land. The firmware has no touch sensor: it places them from the
 * blade's tilt, Scale<BladeAngle<>, TOP, BOTTOM> with TOP = Scale<BladeAngle<0,16000>, 4000, 26000> and BOTTOM = 6000,
 * so a raised blade is hit near the hilt and a lowered one further out.
 */
const hitPos = (): IntFn => {
  let v = 16000;
  return {
    run(c) {
      const low = clamp(Math.trunc((c.angle * 32768) / 16000), 0, 32768);
      const top = 4000 + Math.trunc((low * (26000 - 4000)) / 32768);
      v = top + Math.trunc((c.angle * (6000 - top)) / 32768);
    },
    get: () => v,
  };
};

function hwFx(b: ColorFn, inOut: LayerFn = inOutL({ kind: 'wipe', ms: ign }, { kind: 'wipein', ms: ret })): ColorFn {
  const lbColor = rgbArg(15, rgb8(160, 200, 255));
  const s1 = slowNoise(2100); const s2 = slowNoise(2200); const s3 = slowNoise(2300); const s4 = slowNoise(2000);
  const b1 = bump(scale(s1, 3000, 16000), scale(brownNoise(10), 7000, 11500));
  const b2 = bump(scale(s2, 26000, 8000), scale(soundCompat(), 8000, 12000));
  const gate: IntFn = { run(c) { s4.run(c); }, get: () => (s4.get(0) < 12000 ? 32768 : 0) };
  const snd = soundCompat();
  const b3size: IntFn = { run(c) { gate.run(c); snd.run(c); }, get: () => (gate.get(0) ? 7000 - Math.trunc((snd.get(0) * 7000) / 32768) : 0) };
  const b3 = bump(scale(s3, 20000, 30000), b3size);
  // LayerFunctions<A, B, C>: 1 - (1-a)(1-b)(1-c).
  const lbShape: IntFn = { run(c) { b1.run(c); b2.run(c); b3.run(c); }, get(led) { let inv = 32768; for (const f of [b1, b2, b3]) inv = Math.trunc((inv * (32768 - Math.min(32768, f.get(led)))) / 32768); return 32768 - inv; } };
  return layers(b,
    blastL(rgbArg(9, WHITE)),
    effectL('clash', { kind: 'instant' }, alphaL(rgbArg(10, WHITE), bump(hitPos(), constInt(10000))), { kind: 'fade', ms: 250 }),
    lockupL('normal', alphaL(rgbArg(11, WHITE), bump(hitPos(), scale(swingSpeed(100), 9000, 14000))), { kind: 'instant' }, { kind: 'fade', ms: 300 }),
    lockupL('lb', alphaL(lbColor, lbShape), { kind: 'instant' }, { kind: 'instant' }),
    lockupL('drag', alphaL(rgbArg(13, rgb8(255, 180, 60)), smoothStep(constInt(32000), constInt(6000))), { kind: 'instant' }, { kind: 'instant' }),
    effectL('stab', { kind: 'wipein', ms: 600 }, alphaL(rgbArg(16, rgb8(255, 120, 0)), smoothStep(constInt(32000), constInt(11000))), { kind: 'wipe', ms: 600 }),
    inOut);
}

/** Mix<Int<f>, Black, COLOR>: COLOR at f/32768 of its brightness. */
const dim = (f: number, col: ColorFn): ColorFn => mix(constInt(f), solid(BLACK), col);

const SIM_LOOKS: Record<string, () => ColorFn> = {
  hw_blade: () => hwFx(base()),
  hw_hum: () => hwFx(layers(base(), alphaL(alt(0, 0, 128), soundCompat()))),
  hw_pulse: () => hwFx(mix(sinF(24), base(), alt(0, 255, 255))),
  hw_unstable: () => hwFx(layers(base(255, 0, 0), alphaL(alt(255, 80, 0), brownNoise(300)), alphaL(alphaL(solid(BLACK), constInt(14000)), randomPerLed()))),
  hw_fire: () => hwFx(styleFire(base(255, 0, 0), alt(255, 255, 0), 6, { base: 10, rand: 1000, cooling: 2 }, { base: 2, rand: 1000, cooling: 5 }, { base: 0, rand: 0, cooling: 10 }, { base: 0, rand: 0, cooling: 10 })),
  hw_stripes: () => hwFx(stripes(3500, -1800, [base(), mix(constInt(11000), solid(BLACK), base()), alt(0, 160, 255)])),
  hw_swing: () => hwFx(layers(base(), alphaL(rgbArg(18, WHITE), scale(swingSpeed(500), 0, 28000)))),
  hw_tip: () => hwFx(gradient([base(), base(), base(), alt(255, 255, 255)])),
  hw_rainbow: () => hwFx(rainbow()),
  hw_film: () => hwFx(layers(base(), alphaL(dim(21000, base()), randomF()))),
  hw_surge: () => hwFx(stripes(9000, -3000, [base(), base(), base(), base(), base(), alt(140, 200, 255)])),
  hw_stardust: () => hwFx(layers(base(), alphaL(alt(255, 255, 255), sparkleF(300, 1024)))),
  hw_lava: () => hwFx(layers(base(255, 30, 0),
    alphaL(alt(255, 160, 0), bump(scale(sinF(5), 3000, 29000), constInt(18000))),
    alphaL(alt(255, 160, 0), bump(scale(sinF(8), 30000, 6000), constInt(12000))),
    alphaL(alt(255, 160, 0), bump(scale(sinF(3), 10000, 24000), constInt(9000))))),
  hw_emitter: () => hwFx(layers(base(), alphaL(rgbArg(20, WHITE), smoothStep(scale(soundCompat(), 1200, 5200), constInt(-5000))))),
  hw_aurora: () => hwFx(mix(smoothStep(scale(sinF(7), -6000, 38000), constInt(26000)), base(0, 255, 90), alt(140, 0, 255))),
  hw_current: () => hwFx(stripes(9000, scale(swingSpeed(450), -500, -5000), [base(0, 80, 255), dim(14000, base(0, 80, 255)), alt(0, 255, 255)])),
  hw_dark: () => hwFx(layers(stripes(2600, -3400, [base(255, 255, 255), dim(9000, base(255, 255, 255)), base(255, 255, 255), dim(18000, base(255, 255, 255))]),
    alphaL(alphaL(solid(BLACK), constInt(9000)), randomPerLed()))),
  hw_embers: () => hwFx(layers(alt(255, 140, 0), alphaL(base(255, 20, 0), humpFlicker(45)))),
  hw_horizon: () => hwFx(mix(bladeAngle(), base(), alt(255, 0, 0))),
  hw_core: () => hwFx(layers(base(), alphaL(alt(255, 255, 255), bump(constInt(16384), scale(sinF(20), 3000, 26000))))),
  hw_tracer: () => hwFx(layers(base(),
    alphaL(alt(255, 255, 255), bump(saw(38), constInt(5000))),
    alphaL(alt(255, 255, 255), bump(saw(23), constInt(8000))),
    alphaL(alt(255, 255, 255), bump(saw(61), constInt(3500))))),
  hw_split: () => hwFx(mix(smoothStep(scale(swingSpeed(400), 16384, 27000), constInt(5000)), base(), alt(255, 0, 0))),
  hw_barber: () => hwFx(stripes(5000, -700, [base(255, 0, 0), alt(255, 255, 255)])),
  hw_static: () => hwFx(layers(base(), alphaL(alphaL(solid(BLACK), constInt(26000)), randomPerLed()), alphaL(alphaL(solid(BLACK), constInt(16000)), brownNoise(400)))),
  hw_resonance: () => hwFx(layers(dim(3500, base()), alphaL(base(), bump(constInt(16384), scale(soundCompat(), 6000, 60000))))),
  hw_comet: () => hwFx(layers(base(), alphaL(rgbArg(18, WHITE), smoothStep(scale(swingSpeed(500), 36000, 12000), constInt(9000))))),
  hw_weave: () => hwFx(layers(stripes(7000, -1500, [base(), dim(8000, base())]), alphaL(stripes(9000, 1900, [alt(0, 255, 255), base()]), constInt(14000)))),
  hw_sparktip: () => hwFx(base(), inOutL(
    { kind: 'wipe', ms: ign, spark: { color: rgbArg(7, WHITE), size: 400, center: 0 } },
    { kind: 'wipein', ms: ret, spark: { color: rgbArg(28, WHITE), size: 400, center: 32768 } })),
  hw_unfold: () => hwFx(base(), inOutL({ kind: 'center', ms: ign }, { kind: 'centerin', ms: ret })),
  hw_liquid: () => hwFx(mix(bladeAngle(9000, 23768),
    mix(smoothStep(constInt(18000), constInt(5000)), base(), alt(0, 255, 200)),
    mix(smoothStep(constInt(14700), constInt(-5000)), base(), alt(0, 255, 200)))),
  hw_gravity: () => hwFx(stripes(6000, scale(bladeAngle(), -1200, 1200), [base(), dim(11000, base()), alt(0, 160, 255)])),
  hw_twist: () => hwFx(mix(twistAngle(), base(), alt(255, 0, 200))),
  hw_accent: () => layers(base(), inOutL({ kind: 'fade', ms: ign }, { kind: 'fade', ms: ret })),
  hw_crystal: () => layers(mix(sinF(18), base(), mix(constInt(9000), solid(BLACK), base())), simpleClashL(rgbArg(10, WHITE)),
    inOutL({ kind: 'fade', ms: ign }, { kind: 'fade', ms: ret }, mix(pulsingF(3500), rgbArg(31, rgb8(0, 0, 40)), solid(BLACK)))),
  hw_spark: () => layers(solid(BLACK), blastL(rgbArg(9, WHITE)), simpleClashL(rgbArg(10, WHITE)), inOutL({ kind: 'instant' }, { kind: 'instant' })),
  hw_battery: () => layers(mix(batteryLevel(), solid(rgb8(255, 0, 0)), solid(rgb8(0, 255, 0))),
    inOutL({ kind: 'instant' }, { kind: 'instant' }, mix(batteryLevel(), solid(rgb8(60, 0, 0)), solid(rgb8(0, 60, 0))))),
  hw_heartbeat: () => layers(dim(4000, base(255, 0, 0)),
    loopL([{ kind: 'fade', ms: 70 }, { kind: 'fade', ms: 170 }, { kind: 'fade', ms: 70 }, { kind: 'fade', ms: 300 }, { kind: 'delay', ms: 650 }],
      [base(255, 0, 0), dim(4000, base(255, 0, 0)), base(255, 0, 0), dim(4000, base(255, 0, 0))]),
    inOutL({ kind: 'fade', ms: ign }, { kind: 'fade', ms: ret }, mix(pulsingF(4000), dim(2500, base(255, 0, 0)), solid(BLACK)))),
  hw_scanner: () => layers(solid(BLACK), alphaL(base(255, 0, 0), bump(sinF(32), constInt(11000))), inOutL({ kind: 'instant' }, { kind: 'instant' })),
  hw_meter: () => layers(solid(BLACK),
    alphaL(gradient([base(0, 255, 0), base(0, 255, 0), alt(255, 0, 0)]), smoothStep(scale(soundCompat(), 1000, 36000), constInt(-3000))),
    inOutL({ kind: 'instant' }, { kind: 'instant' })),
  hw_motor: () => layers(solid(WHITE), inOutL({ kind: 'instant' }, { kind: 'instant' })),
};

/** Ids of the looks that can be simulated. Pasted looks cannot: their C++ is not interpreted. */
export const SIMULATED_LOOKS: readonly string[] = Object.keys(SIM_LOOKS);

/** A deterministic random source, so the same seed and the same calls give the same blade. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class BladeSim {
  private readonly style: ColorFn;
  private readonly ctx: Ctx;
  private readonly rand: () => number;
  private soundWalk = 0.3;
  readonly leds: Float32Array;

  constructor(readonly lookId: string, readonly numLeds: number, seed = 1) {
    const make = SIM_LOOKS[lookId];
    if (!make) throw new Error(`No simulator for look ${lookId}`);
    this.style = make();
    this.rand = mulberry32(seed);
    this.ctx = { now: 0, n: numLeds, rnd: (n) => (n > 0 ? Math.floor(this.rand() * n) : 0), on: false, args: new Map(), effects: [], lockup: null, lockupPos: -1, swing: 0, sound: 0, battery: 26000, angle: 16384, twist: 0 };
    this.leds = new Float32Array(numLeds * 3);
  }

  get isOn(): boolean { return this.ctx.on; }
  setArgs(args: Map<number, string>): void { this.ctx.args = args; }
  setOn(on: boolean): void { this.ctx.on = on; }
  /** Swing speed in degrees per second (a hard swing is 400 to 600). */
  setSwing(degPerSec: number): void { this.ctx.swing = Math.max(0, degPerSec); }
  /** Where the blade points, in degrees: -90 straight down, 0 level, 90 straight up. */
  setAngle(degrees: number): void { this.ctx.angle = clamp(Math.round(((degrees + 90) / 180) * 32768), 0, 32768); }
  /** How far the hilt is rolled about the blade's axis, in degrees. */
  setTwist(degrees: number): void { this.ctx.twist = degrees; }
  setBattery(fraction: number): void { this.ctx.battery = clamp(Math.round(fraction * 32768), 0, 32768); }
  /** A one-shot effect at `pos` along the blade (0 hilt, 1 tip). */
  trigger(type: EffectType, pos = 0.5): void { this.pending.push({ type, pos: clamp(pos, 0, 1) }); }
  setLockup(type: LockupType | null, pos = 0.5): void { this.ctx.lockup = type; this.ctx.lockupPos = type ? clamp(pos, 0, 1) : this.ctx.lockupPos; }
  private pending: { type: EffectType; pos: number }[] = [];

  /** Advance to `nowMs` and compute every LED. Values are linear 0..1, three per LED. */
  frame(nowMs: number): Float32Array {
    const c = this.ctx;
    c.now = nowMs;
    for (const p of this.pending) { c.effects.push({ type: p.type, at: nowMs, pos: p.pos }); if (p.type === 'clash') c.lockupPos = p.pos; }
    this.pending = [];
    c.effects = c.effects.filter((e) => nowMs - e.at < 3000);
    // Modelled sound level: a hum that wanders, louder with motion and during effects, silent when off.
    this.soundWalk = clamp(this.soundWalk + (this.rand() - 0.5) * 0.25, 0.08, 0.6);
    const loud = c.effects.some((e) => nowMs - e.at < 250) || c.lockup ? 0.35 : 0;
    c.sound = c.on ? clamp(Math.round(32768 * (this.soundWalk * (0.5 + this.rand()) + c.swing / 1500 + loud)), 0, 32768) : 0;
    this.style.run(c);
    for (let i = 0; i < c.n; i++) {
      const v = this.style.get(i);
      this.leds[i * 3] = clamp(v[0], 0, 65535) / 65535;
      this.leds[i * 3 + 1] = clamp(v[1], 0, 65535) / 65535;
      this.leds[i * 3 + 2] = clamp(v[2], 0, 65535) / 65535;
    }
    return this.leds;
  }
}
