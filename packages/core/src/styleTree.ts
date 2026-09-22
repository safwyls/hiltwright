// ProffieOS style expressions as trees: parse, print, look up in the catalogue, and run on the simulator.
//
// A style is a template expression: `Layers<Red, ResponsiveClashL<White, TrInstant, TrFade<200>>, ...>`. The tree
// editor works on that shape directly, with the catalogue (generated from the OS source) telling it what each name
// takes and gives. The evaluator turns a tree into the simulator's own building blocks; templates it does not know
// are skipped (a layer that paints nothing, a function that returns its first argument) and reported, so the preview
// is honest about what it is not showing.

import catalogueJson from './proffieCatalogue';
import { CLASH_G, prims, type ColorFn, type IntFn, type LayerFn, type SimEffect } from './sim';
import { scanStyleArgs, type LookDef } from './looks';

export type Kind = 'COLOR' | 'FUNCTION' | 'TRANSITION' | 'INTEGER' | 'EFFECT' | 'LOCKUP_TYPE' | 'OTHER';
export interface CatParam { name: string; kind: Kind; default: string | null; doc: string }
export interface CatEntry { name: string; kind: Kind; params: CatParam[]; doc: string; file: string; variadic: boolean; internal?: boolean; alias?: string }
export const CATALOGUE: Record<string, CatEntry> = catalogueJson as unknown as Record<string, CatEntry>;

export interface Node { name: string; args: Node[] }

// ---------------- parse and print ----------------

export function parseStyle(text: string): Node {
  let i = 0;
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const node = (): Node => {
    ws();
    const m = /^-?[A-Za-z0-9_:]+(?:\.\.\.)?/.exec(src.slice(i)); // NAME... is a parameter pack inside an alias body
    if (!m) throw new Error(`Expected a name at ${i}: "${src.slice(i, i + 20)}"`);
    i += m[0].length;
    const n: Node = { name: m[0], args: [] };
    ws();
    if (src[i] === '<') {
      i++; ws();
      if (src[i] === '>') { i++; return n; }
      for (;;) {
        n.args.push(node()); ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '>') { i++; break; }
        throw new Error(`Expected , or > at ${i}: "${src.slice(i, i + 20)}"`);
      }
    }
    // `StylePtr<X>()` and a trailing `()` are the slot wrapper, not part of the style.
    ws(); if (src.startsWith('()', i)) i += 2;
    return n;
  };
  let root = node();
  ws();
  if (src[i] === ',') { i++; ws(); } // a trailing comma, as copied out of a presets array
  if (i < src.length) throw new Error(`Unexpected text after the style: "${src.slice(i, i + 20)}"`);
  if (root.name === 'StylePtr' && root.args.length === 1) root = root.args[0];
  return root;
}

export function printStyle(n: Node, indent = 0): string {
  if (!n.args.length) return CATALOGUE[n.name]?.params.length ? `${n.name}<>` : n.name; // a template with every parameter defaulted still needs its <>
  const inner = n.args.map((a) => printStyle(a, indent + 1));
  const oneLine = `${n.name}<${inner.join(',')}>`;
  if (oneLine.length < 70 && !inner.some((s) => s.includes('\n'))) return oneLine;
  const pad = '  '.repeat(indent + 1);
  return `${n.name}<\n${inner.map((s) => pad + s).join(',\n')}>`;
}

export const cloneNode = (n: Node): Node => ({ name: n.name, args: n.args.map(cloneNode) });

/** What a node yields: its catalogue kind, or a guess from its shape. */
export function kindOf(n: Node): Kind {
  if (/^-?\d+$/.test(n.name)) return 'INTEGER';
  if (/^(EFFECT_|SaberBase::EFFECT_)/.test(n.name)) return 'EFFECT';
  if (/^(LOCKUP_|SaberBase::LOCKUP_)/.test(n.name)) return 'LOCKUP_TYPE';
  if (/_ARG$/.test(n.name)) return 'INTEGER';
  const e = CATALOGUE[n.name];
  if (e) return e.kind;
  if (/^Tr/.test(n.name)) return 'TRANSITION';
  return 'OTHER';
}

/** The parameter a node's i-th argument fills, allowing for variadic tails. */
export function paramFor(entry: CatEntry, i: number): CatParam | null {
  // TrConcat alternates transitions with the colours they pass through; TrSelect picks by a function first.
  if (entry.name === 'TrConcat') return i % 2 === 0 ? { name: 'TRANSITION', kind: 'TRANSITION', default: null, doc: 'The next step' } : { name: 'COLOR', kind: 'COLOR', default: null, doc: 'What it passes through on the way' };
  if (entry.name === 'TrSelect' && i === 0) return { name: 'SELECTION', kind: 'FUNCTION', default: null, doc: 'Which transition to run' };
  if (i < entry.params.length) return entry.params[i];
  if (entry.variadic && entry.params.length) return entry.params[entry.params.length - 1];
  return null;
}

/** A node that fills a parameter of `kind` with something sensible. */
export function defaultFor(kind: Kind, def?: string | null): Node {
  if (def) { try { return parseStyle(def); } catch { /* fall through */ } }
  switch (kind) {
    case 'COLOR': return { name: 'White', args: [] };
    case 'FUNCTION': return { name: 'Int', args: [{ name: '16384', args: [] }] };
    case 'TRANSITION': return { name: 'TrInstant', args: [] };
    case 'INTEGER': return { name: '300', args: [] };
    case 'EFFECT': return { name: 'EFFECT_CLASH', args: [] };
    case 'LOCKUP_TYPE': return { name: 'SaberBase::LOCKUP_NORMAL', args: [] };
    default: return { name: 'Int', args: [{ name: '0', args: [] }] };
  }
}

/** A fresh node of `name` with every parameter filled from its default or a sensible stand-in. */
export function newNode(name: string): Node {
  const e = CATALOGUE[name];
  if (!e) return { name, args: [] };
  return { name, args: e.params.filter((p) => !e.variadic || p !== e.params[e.params.length - 1] || e.params.length === 1).map((p) => defaultFor(p.kind, p.default)) };
}

// ---------------- run on the simulator ----------------
//
// The evaluator mirrors the firmware's shape. A colour or layer is run once per frame then read per LED; a
// transition has begin/run/done and getColor(a, b, led) exactly as transitions/base.h defines it; a `using` alias in
// the catalogue is expanded by substituting its arguments, so ResponsiveClashL, TransitionEffect, TrWipeSparkTip and
// the rest need no code of their own and behave as the compiler would build them. Only the primitive classes are
// written out here. Anything unknown paints nothing (or passes its first argument through) and is reported.

type Ctx = Parameters<IntFn['run']>[0];
type RGB = [number, number, number];
type Px = { c: RGB; a: number };
const TRANSPARENT: Px = { c: [0, 0, 0], a: 0 };

export interface EvalReport { unsupported: string[]; approximate: string[] }

const NAMED_ARGS: Record<string, number> = { BASE_COLOR_ARG: 1, ALT_COLOR_ARG: 2, STYLE_OPTION_ARG: 3, IGNITION_OPTION_ARG: 4, IGNITION_TIME_ARG: 5, IGNITION_DELAY_ARG: 6, IGNITION_COLOR_ARG: 7, IGNITION_POWER_UP_ARG: 8, BLAST_COLOR_ARG: 9, CLASH_COLOR_ARG: 10, LOCKUP_COLOR_ARG: 11, LOCKUP_POSITION_ARG: 12, DRAG_COLOR_ARG: 13, DRAG_SIZE_ARG: 14, LB_COLOR_ARG: 15, STAB_COLOR_ARG: 16, MELT_SIZE_ARG: 17, SWING_COLOR_ARG: 18, SWING_OPTION_ARG: 19, EMITTER_COLOR_ARG: 20, EMITTER_SIZE_ARG: 21, PREON_COLOR_ARG: 22, PREON_OPTION_ARG: 23, PREON_SIZE_ARG: 24, RETRACTION_OPTION_ARG: 25, RETRACTION_TIME_ARG: 26, RETRACTION_DELAY_ARG: 27, RETRACTION_COLOR_ARG: 28, RETRACTION_POWER_DOWN_ARG: 29, POSTOFF_COLOR_ARG: 30, OFF_COLOR_ARG: 31, OFF_OPTION_ARG: 32, ALT_COLOR2_ARG: 33, ALT_COLOR3_ARG: 34, STYLE_OPTION2_ARG: 35, STYLE_OPTION3_ARG: 36, IGNITION_OPTION2_ARG: 37, RETRACTION_OPTION2_ARG: 38 };

/** A literal number, `Int<N>`, an argument name, or the default. */
const num = (n: Node | undefined, d: number): number => {
  if (!n) return d;
  const v = Number(n.name);
  if (Number.isFinite(v)) return v;
  if (n.name in NAMED_ARGS) return NAMED_ARGS[n.name];
  if (n.name === 'Int' && n.args.length === 1) return num(n.args[0], d);
  if (n.name === 'IntArg' && n.args.length === 2) return num(n.args[1], d);
  return d;
};
const P = prims;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const HUMP = [255, 255, 252, 247, 240, 232, 222, 211, 199, 186, 173, 159, 145, 132, 119, 106, 94, 82, 72, 62, 53, 45, 38, 32, 26, 22, 18, 14, 11, 9, 7, 5, 0];

/** MixColors for premultiplied-in-spirit layers: alpha blends linearly, colour by the alpha each side carries. */
function mixPx(a: Px, b: Px, f: number, shift: number): Px {
  const x = f / (1 << shift);
  if (x <= 0) return a;
  if (x >= 1) return b;
  const wa = a.a * (1 - x); const wb = b.a * x; const alpha = wa + wb;
  if (alpha <= 0) return TRANSPARENT;
  return { c: [(a.c[0] * wa + b.c[0] * wb) / alpha, (a.c[1] * wa + b.c[1] * wb) / alpha, (a.c[2] * wa + b.c[2] * wb) / alpha], a: alpha };
}
const scalePx = (p: Px, alpha: number): Px => ({ c: p.c, a: Math.trunc((p.a * clamp(alpha, 0, 32768)) / 32768) });
/** Color16::rotate: hue turned by `angle`, where 16384 is 60 degrees. */
function rotateRGB(c: RGB, angle: number): RGB {
  if (!angle) return c;
  const [r, g, b] = c; const MAX = Math.max(r, g, b); const MIN = Math.min(r, g, b); const C = MAX - MIN;
  if (C === 0) return c;
  let H = r === MAX ? (16384 * (g - b)) / C : g === MAX ? (16384 * (b - r)) / C + 32768 : (16384 * (r - g)) / C + 65536;
  H = (((H + angle) % 98304) + 98304) % 98304;
  const sector = Math.floor(H / 16384); const X = C * (1 - Math.abs(((H / 16384) % 2) - 1));
  const [r1, g1, b1] = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][sector];
  return [r1 + MIN, g1 + MIN, b1 + MIN];
}

/** Expand a catalogue `using` alias: its body with the node's arguments (or the parameter defaults) substituted. */
function expandAlias(n: Node): Node | null {
  const e = CATALOGUE[n.name];
  if (!e?.alias) return null;
  let body: Node;
  try { body = parseStyle(e.alias); } catch { return null; }
  const bind = new Map<string, Node | Node[]>();
  e.params.forEach((p, i) => {
    if (e.variadic && i === e.params.length - 1) { bind.set(p.name, n.args.slice(i)); return; }
    if (n.args[i]) bind.set(p.name, n.args[i]);
    else if (p.default) { try { bind.set(p.name, substitute(parseStyle(p.default), bind)); } catch { /* left unbound */ } }
  });
  return substitute(body, bind);
}
function substitute(n: Node, bind: Map<string, Node | Node[]>): Node {
  const b = bind.get(n.name);
  if (b && !Array.isArray(b) && n.args.length === 0) return cloneNode(b);
  const args: Node[] = [];
  for (const a of n.args) {
    if (a.name.endsWith('...')) { const list = bind.get(a.name.slice(0, -3)); if (Array.isArray(list)) args.push(...list.map(cloneNode)); }
    else args.push(substitute(a, bind));
  }
  return { name: n.name, args };
}

interface TrFn { begin(): void; run(c: Ctx): void; done(): boolean; get(led: number, a: Px, b: Px): Px }
type Detector = { run(c: Ctx): boolean; pos: number; wavnum: number; strength: number; at: number };

export function evaluateStyle(root: Node): { make: () => ColorFn; report: EvalReport } {
  const unsupported = new Set<string>(); const approximate = new Set<string>();
  const skip = (n: Node) => { unsupported.add(n.name); };
  const approx = (name: string) => { approximate.add(name); };
  /** Lockup types the style answers itself (LockupTrL), which the built-in LockupL then leaves alone. */
  const handledLockups = new Set<string>();
  /** A clash detector also answers stabs unless the style handles stabs itself, as OneshotEffectDetector does. */
  const handlesStab = (function scan(n: Node): boolean { return /EFFECT_STAB$/.test(n.name) || n.args.some(scan); })(root);
  let depth = 0;
  const guard = <T,>(f: () => T, fallback: () => T): T => { if (++depth > 200) { depth--; return fallback(); } try { return f(); } finally { depth--; } };

  // ---- layers and colours: everything is a LayerFn inside; a ColorFn view is provided where the caller wants one ----
  const opaque = (col: ColorFn): LayerFn => P.opaque(col);
  const asColor = (l: LayerFn): ColorFn & { layer: LayerFn } => Object.assign({ run(c: Ctx) { l.run(c); }, get(led: number) { return l.get(led).c; } }, { layer: l });
  const solid = (c: RGB): LayerFn => opaque(P.solid(c));
  const white = () => solid(P.WHITE);

  const layer = (n: Node | undefined): LayerFn => guard(() => layerImpl(n), white);
  const color = (n: Node | undefined): ColorFn & { layer: LayerFn } => asColor(layer(n));

  function layerImpl(n: Node | undefined): LayerFn {
    if (!n) return white();
    const a = n.args; const e = CATALOGUE[n.name];
    switch (n.name) {
      case 'Rgb': return solid([num(a[0], 0) * 257, num(a[1], 0) * 257, num(a[2], 0) * 257]);
      case 'Rgb16': return solid([num(a[0], 0), num(a[1], 0), num(a[2], 0)]);
      case 'RgbArg': { const def = color(a[1]).get(0); return opaque(P.rgbArg(num(a[0], 1), def)); }
      case 'Black': return solid(P.BLACK);
      case 'White': return white();
      case 'Transparent': return { run() {}, get: () => TRANSPARENT };
      case 'Layers': { const ls = a.map(layer); if (!ls.length) return white(); return { run(c) { for (const l of ls) l.run(c); }, get(led) { let p = ls[0].get(led); for (let k = 1; k < ls.length; k++) p = over(p, ls[k].get(led)); return p; } }; }
      case 'BrownNoiseFlicker': return layer({ name: 'Layers', args: [a[0] ?? { name: 'White', args: [] }, { name: 'BrownNoiseFlickerL', args: [a[1] ?? { name: 'White', args: [] }, { name: String(num(a[2], 100) * 128), args: [] }] }] }); // its alias multiplies, which the expander cannot
      case 'AlphaL': { const l = layer(a[0]); const f = fn(a[1], 32768); return { run(c) { l.run(c); f.run(c); }, get: (led) => { const alpha = f.get(led); return alpha <= 0 ? TRANSPARENT : scalePx(l.get(led), alpha); } }; }
      case 'AlphaMixL': { const f = fn(a[0], 32768); const cols = a.slice(1).map(layer); return { run(c) { f.run(c); for (const x of cols) x.run(c); }, get(led) { const alpha = f.get(led); if (alpha <= 0 || !cols.length) return TRANSPARENT; return scalePx(mixN(cols, alpha, led), alpha); } }; }
      case 'Mix': { const f = fn(a[0], 0); const cols = a.slice(1).map(layer); return { run(c) { f.run(c); for (const x of cols) x.run(c); }, get: (led) => (cols.length ? mixN(cols, f.get(led), led) : TRANSPARENT) }; }
      case 'ColorSelect': { const f = fn(a[0], 0); const cols = a.slice(2).map(layer); return { run(c) { f.run(c); for (const x of cols) x.run(c); }, get: (led) => (cols.length ? cols[clamp(Math.floor((f.get(led) * cols.length) / 32769), 0, cols.length - 1)].get(led) : TRANSPARENT) }; }
      case 'ColorChange': return layer(a[1]);
      case 'Gradient': return opaque(P.gradient(a.map(color)));
      case 'Rainbow': return opaque(P.rainbow());
      case 'StripesX': return opaque(P.stripes(fn(a[0], 3000), fn(a[1], -1000), a.slice(2).map(color)));
      case 'HardStripesX': return opaque(P.stripes(fn(a[0], 3000), fn(a[1], -1000), a.slice(2).map(color)));
      case 'BrownNoiseFlickerL': return alphaOf(layer(a[0]), P.brownNoise(num(a[1], 12800)));
      case 'RandomL': return alphaOf(layer(a[0]), P.randomF());
      case 'RandomPerLEDFlickerL': return alphaOf(layer(a[0]), P.randomPerLed());
      case 'HumpFlickerL': return alphaOf(layer(a[0]), P.humpFlicker(num(a[1], 20)));
      case 'HumpFlickerFX': return alphaOf(layer(a[0]), P.humpFlicker(num(a[1], 20)));
      case 'SparkleL': return alphaOf(layer(a[0]), P.sparkleF(num(a[1], 300), num(a[2], 1024)));
      case 'StyleFire': { const cfg = (x: Node | undefined, d: [number, number, number]) => ({ base: num(x?.args[0], d[0]), rand: num(x?.args[1], d[1]), cooling: num(x?.args[2], d[2]) }); return opaque(P.styleFire(color(a[0]), color(a[1]), num(a[3], 2), cfg(a[4], [0, 2000, 5]), cfg(a[5], [3000, 0, 0]), cfg(a[6], [0, 5000, 10]), cfg(a[7], [0, 0, 5]))); }
      case 'BlastL': return P.blastL(color(a[0]), num(a[1], 200), num(a[2], 100), num(a[3], 400));
      case 'SimpleClashL': return P.simpleClashL(color(a[0]), num(a[1], 40));
      case 'Cylon': return opaque(P.layers(color(a[0]), P.alphaL(color(a[1]), P.bump(P.sinF(num(a[3], 60)), P.constInt(num(a[2], 50) * 328)))));
      case 'RotateColorsX': { const f = fn(a[0], 0); const l = layer(a[1]); return { run(c) { f.run(c); l.run(c); }, get(led) { const p = l.get(led); return { c: rotateRGB(p.c, (f.get(led) & 0x7fff) * 3), a: p.a }; } }; }
      case 'InOutHelperX': return opaque(P.layers(color(a[0]), inOutTrL(trWipeX(fn(a[1], 300)), trWipeInX(fn(a[2], 500)), a[3] ? layer(a[3]) : solid(P.BLACK))));
      case 'InOutTrL': return inOutTrL(tr(a[0]), tr(a[1]), a[2] ? layer(a[2]) : solid(P.BLACK));
      case 'LockupTrL': return lockupTrL(layer(a[0]), tr(a[1]), tr(a[2]), a[3], a[4] ? fn(a[4], 1) : P.constInt(1));
      case 'TransitionEffectL': return transitionEffectL(() => tr(a[0]), a[1], 1);
      case 'MultiTransitionEffectL': return transitionEffectL(() => tr(a[0]), a[1], num(a[2], 3));
      case 'TransitionLoopL': { const t = tr(a[0]); let began = false; return { run(c) { if (!began || t.done()) { t.begin(); began = true; } t.run(c); }, get: (led) => t.get(led, TRANSPARENT, TRANSPARENT) }; }
      case 'EffectSequence': { const det = detector(a[0]); const cols = a.slice(1).map(layer); let n = -1; return { run(c) { if (det.run(c)) n = (n + 1) % Math.max(1, cols.length); for (const x of cols) x.run(c); }, get: (led) => (cols.length ? cols[Math.max(0, n)].get(led) : TRANSPARENT) }; }
      case 'ColorSequence': { const ms = Math.max(1, num(a[0], 1000)); const cols = a.slice(1).map(layer); let last = -1; let n = 0; return { run(c) { if (last < 0) last = c.now; if (c.now - last > ms) { if (c.now - last > ms * 10) { n = 0; last = c.now; } else { n = (n + 1) % Math.max(1, cols.length); last += ms; } } for (const x of cols) x.run(c); }, get: (led) => (cols.length ? cols[n].get(led) : TRANSPARENT) }; }
      case 'ColorCycle': return colorCycle(layer(a[0]), num(a[1], 100), num(a[2], 60), a[3] ? layer(a[3]) : layer(a[0]), num(a[4], num(a[1], 100)), num(a[5], num(a[2], 60)), Math.max(1, num(a[6], 1)), a[7] ? layer(a[7]) : solid(P.BLACK));
      case 'LockupL': return lockupL(layer(a[0]), a[1] ? layer(a[1]) : null, fn(a[2], 32768), a[3] ? fn(a[3], 0) : P.smoothStep(P.constInt(28671), P.constInt(4096)), a[4] ? fn(a[4], 0) : fn(parseStyle('LayerFunctions<Bump<Scale<SlowNoise<Int<2000>>,Int<3000>,Int<16000>>,Scale<BrownNoiseF<Int<10>>,Int<14000>,Int<8000>>>,Bump<Scale<SlowNoise<Int<2300>>,Int<26000>,Int<8000>>,Scale<NoisySoundLevel,Int<5000>,Int<10000>>>,Bump<Scale<SlowNoise<Int<2300>>,Int<20000>,Int<30000>>,Scale<IsLessThan<SlowNoise<Int<1500>>,Int<8000>>,Scale<NoisySoundLevel,Int<5000>,Int<0>>,Int<0>>>>'), 0));
      case 'LocalizedClashL': { const col = layer(a[0]); const ms = num(a[1], 40); const width = Math.max(1, num(a[2], 50)); const det = detector(a[3] ?? { name: 'EFFECT_CLASH', args: [] }); let on = false; let mult = 1; let where = 0; return { run(c) { col.run(c); if (det.run(c)) { on = true; mult = Math.trunc((32 * 2 * 102400) / width / c.n); where = det.pos * c.n * mult; } else on = c.now - det.at < ms; }, get(led) { if (!on) return TRANSPARENT; const dist = Math.trunc(Math.abs(led * mult - where) / 1024); return dist < 32 ? scalePx(col.get(led), HUMP[dist] * 128) : TRANSPARENT; } }; }
      case 'Remap': { const f = fn(a[0], 0); const col = layer(a[1]); let n = 1; return { run(c) { f.run(c); col.run(c); n = c.n; }, get(led) { let pos = clamp(f.get(led) * n, 0, n * 32768 - 1); const frac = pos & 0x7fff; pos = clamp(pos >> 15, 0, n - 1); return mixPx(col.get(pos), col.get(Math.min(pos + 1, n - 1)), frac, 15); } }; }
      case 'PixelateX': { const col = layer(a[0]); const nF = fn(a[1], 2); let lastLed = -1e9; let lastPx = TRANSPARENT; return { run(c) { col.run(c); nF.run(c); lastLed = -1e9; }, get(led) { if (Math.abs(led - lastLed) >= nF.get(led)) { lastLed = led; lastPx = col.get(led); } return lastPx; } }; }
      case 'TransitionLoopWhileL': { const loop = tr(a[0]); const end = tr(a[1]); const cond = fn(a[2], 1); let run = false; let ending = false; return { run(c) { cond.run(c); const on = cond.get(0) > 0; if (!run && on) { run = true; loop.begin(); } if (run && !on && !ending) { ending = true; end.begin(); } if (run) { if (loop.done()) loop.begin(); loop.run(c); if (ending) { end.run(c); if (end.done()) { ending = false; run = false; } } } }, get(led) { if (!run) return TRANSPARENT; let px = loop.get(led, TRANSPARENT, TRANSPARENT); if (ending) px = end.get(led, px, TRANSPARENT); return px; } }; }
      case 'SyncAltToVarianceL': return { run() {}, get: () => TRANSPARENT };
      case 'TransitionPulseL': { const t = tr(a[0]); const pulse = fn(a[1], 0); let running = false; return { run(c) { pulse.run(c); if (pulse.get(0) > 0) { t.begin(); running = true; } if (running) { t.run(c); if (t.done()) running = false; } }, get: (led) => (running ? t.get(led, TRANSPARENT, TRANSPARENT) : TRANSPARENT) }; }
      default: {
        if (e && e.kind === 'COLOR' && e.params.length === 0 && e.doc.startsWith('rgb(')) { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(e.doc); if (m) return solid([Number(m[1]) * 257, Number(m[2]) * 257, Number(m[3]) * 257]); }
        const x = expandAlias(n);
        if (x) return layer(x);
        skip(n);
        return a.length && kindOf(a[0]) === 'COLOR' ? layer(a[0]) : white();
      }
    }
  }
  /** ColorCycle: a spinning arc of ON over OFF, widening and speeding up as the blade ignites; per styles/color_cycle.h. */
  const colorCycle = (off: LayerFn, offPct: number, offRpm: number, on: LayerFn, onPct: number, onRpm: number, fadeMs: number, base: LayerFn): LayerFn => {
    let fade = 0; let pos = 0; let last = -1; let start = 0; let end = 0; let n = 0; let fadeInt = 0;
    return {
      run(c) { off.run(c); on.run(c); base.run(c); const delta = last < 0 ? 1 : Math.max(0, c.now - last); last = c.now; let fd = delta / fadeMs; if (!c.on) fd = -fd; fade = clamp(fade + fd, 0, 1); const rpm = offRpm * (1 - fade) + onRpm * fade; const pct = offPct * (1 - fade) + onPct * fade; fadeInt = Math.trunc(16384 * fade); pos = (pos + (delta / 60000) * rpm) % 1; n = c.n * 16384; start = pos * n; if (pct >= 100) { start = 0; end = n; } else if (pct <= 0) { start = 0; end = 0; } else end = ((pos + pct / 100) % 1) * n; },
      get(led) { const lo = led * 16384; const hi = lo + 16384; const ov = (a: number, b: number) => clamp(Math.min(b, hi) - Math.max(a, lo), 0, 16384); const black = start <= end ? ov(start, end) : ov(0, end) + ov(start, n); return mixPx(base.get(led), mixPx(off.get(led), on.get(led), fadeInt, 14), black, 14); },
    };
  };
  /** LockupL: the plain lockup layer, which steps aside for any lockup type a LockupTrL in the style handles. */
  const lockupL = (lock: LayerFn, drag: LayerFn | null, lockShape: IntFn, dragShape: IntFn, lbShape: IntFn): LayerFn => {
    let l: string | null = null; let single = false;
    return {
      run(c) { lock.run(c); drag?.run(c); lockShape.run(c); dragShape.run(c); lbShape.run(c); l = c.lockup; single = c.n === 1; },
      get(led) { if (!l || handledLockups.has(l)) return TRANSPARENT; if (l === 'drag' || l === 'melt') { const blend = single ? 32768 : dragShape.get(led); return scalePx((drag ?? lock).get(led), blend); } return scalePx(lock.get(led), l === 'lb' ? lbShape.get(led) : lockShape.get(led)); },
    };
  };
  const alphaOf = (l: LayerFn, f: IntFn): LayerFn => ({ run(c) { l.run(c); f.run(c); }, get: (led) => scalePx(l.get(led), f.get(led)) });
  /** Mix<F, A, B, C...>: F sweeps across the list. */
  const mixN = (cols: LayerFn[], f: number, led: number): Px => {
    if (cols.length === 1) return cols[0].get(led);
    const x = clamp(f, 0, 32768) * (cols.length - 1); const i = Math.min(cols.length - 2, x >> 15);
    return mixPx(cols[i].get(led), cols[i + 1].get(led), x - (i << 15), 15);
  };

  // ---- effects, read off the simulator's bus the way OneshotEffectDetector does: the newest match, once ----
  const busName = (effect: Node | undefined): string => { const n = (effect?.name ?? 'EFFECT_NONE').replace(/^SaberBase::/, ''); return n === 'EFFECT_CLASH' ? 'clash' : n === 'EFFECT_BLAST' ? 'blast' : n === 'EFFECT_STAB' ? 'stab' : n; };
  const detector = (effect: Node | undefined): Detector => {
    const type = busName(effect); const any = type === 'EFFECT_NONE'; const alsoStab = type === 'clash' && !handlesStab;
    let lastSeq = 0;
    const d: Detector = { pos: 0.5, wavnum: -1, strength: 0, at: -1e9, run(c) {
      let found: SimEffect | null = null;
      for (const e of c.effects) if ((any || e.type === type || (alsoStab && e.type === 'stab')) && e.seq > lastSeq) found = e;
      if (!found) return false;
      lastSeq = found.seq; d.pos = found.pos; d.wavnum = found.wavnum; d.strength = found.strength; d.at = found.at;
      return true;
    } };
    return d;
  };
  /** Effects of a type still on the bus, newest first, for the wave functions that draw every recent one. */
  const recent = (c: Ctx, type: string): SimEffect[] => { const out: SimEffect[] = []; for (let i = c.effects.length - 1; i >= 0; i--) if (c.effects[i].type === type) out.push(c.effects[i]); return out; };

  const transitionEffectL = (make: () => TrFn, effect: Node | undefined, n: number): LayerFn => {
    const det = detector(effect);
    const slots = Array.from({ length: Math.max(1, n) }, () => ({ t: make(), on: false }));
    let next = 0;
    return {
      run(c) { if (det.run(c)) { const s = slots[next]; s.t.begin(); s.on = true; next = (next + 1) % slots.length; } for (const s of slots) if (s.on) { s.t.run(c); if (s.t.done()) s.on = false; } },
      get(led) { let ret = TRANSPARENT; for (let i = slots.length - 1; i >= 0; i--) { const s = slots[(i + next) % slots.length]; if (s.on) ret = over(ret, s.t.get(led, TRANSPARENT, TRANSPARENT)); } return ret; },
    };
  };
  /** `base << layer`: paint a layer over a pixel. */
  const over = (under: Px, top: Px): Px => { if (top.a >= 32768) return top; if (top.a <= 0) return under; const alpha = 32768 - Math.trunc(((32768 - under.a) * (32768 - top.a)) / 32768); const wu = (under.a * (32768 - top.a)) / 32768; return { c: [(under.c[0] * wu + top.c[0] * top.a) / alpha, (under.c[1] * wu + top.c[1] * top.a) / alpha, (under.c[2] * wu + top.c[2] * top.a) / alpha], a: alpha }; };

  /** TransitionHelper: a transition that reports whether it is still running and hands back B once finished. */
  const helper = (t: TrFn) => { let active = false; return { begin() { t.begin(); active = true; }, run(c: Ctx) { if (active) { t.run(c); if (t.done()) active = false; } }, active: () => active, get: (led: number, a: Px, b: Px) => (active ? t.get(led, a, b) : b) }; };

  const lockupTrL = (col: LayerFn, beginTr: TrFn, endTr: TrFn, typeNode: Node | undefined, condition: IntFn): LayerFn => {
    const s = (typeNode?.name ?? '').replace(/^SaberBase::/, '');
    const type = /MELT/.test(s) ? 'melt' : /DRAG/.test(s) ? 'drag' : /LIGHTNING/.test(s) ? 'lb' : 'normal';
    handledLockups.add(type);
    const b = helper(beginTr); const en = helper(endTr);
    let state: 'inactive' | 'active' | 'skipped' = 'inactive';
    return {
      run(c) {
        col.run(c); condition.run(c);
        const lock = c.lockup === type;
        if (state === 'inactive' && lock) { if (condition.get(0)) { state = 'active'; b.begin(); } else state = 'skipped'; }
        else if (state === 'active' && !lock) { en.begin(); state = 'inactive'; }
        else if (state === 'skipped' && !lock) state = 'inactive';
        b.run(c); en.run(c);
      },
      get(led) {
        if (!b.active() && !en.active()) return state === 'active' ? col.get(led) : TRANSPARENT;
        const on = col.get(led);
        return state === 'active' ? b.get(led, en.get(led, on, TRANSPARENT), on) : en.get(led, b.get(led, TRANSPARENT, on), TRANSPARENT);
      },
    };
  };
  const inOutTrL = (outTr: TrFn, inTr: TrFn, off: LayerFn): LayerFn => {
    const o = helper(outTr); const i = helper(inTr); let on = false; let first = true;
    return {
      run(c) { off.run(c); if (first) { on = c.on; first = false; } if (on !== c.on) { on = c.on; if (on) o.begin(); else i.begin(); } o.run(c); i.run(c); },
      get(led) {
        if (!o.active() && !i.active()) return on ? TRANSPARENT : off.get(led);
        const offc = off.get(led);
        return on ? o.get(led, i.get(led, TRANSPARENT, offc), TRANSPARENT) : i.get(led, o.get(led, offc, TRANSPARENT), offc);
      },
    };
  };

  // ---- functions ----
  const fn = (n: Node | undefined, d = 0, bare = false): IntFn => guard(() => fnImpl(n, d, bare), () => P.constInt(d));
  /** `bare`: the name came from stripping an SVF suffix, so do not expand it back into its adapter alias. */
  function fnImpl(n: Node | undefined, d: number, bare: boolean): IntFn {
    if (!n) return P.constInt(d);
    const a = n.args;
    switch (n.name) {
      case 'Int': return P.constInt(num(a[0], d));
      case 'IntArg': { const arg = num(a[0], 0); const def = num(a[1], d); let v = def; return { run(c) { const s = c.args.get(arg); const x = s == null || s === '~' ? NaN : Number(s); v = Number.isFinite(x) ? x : def; }, get: () => v }; }
      case 'Sin': return a[1] || a[2] ? scaleF(P.sinF(num(a[0], 60)), a[1], 0, a[2], 32768) : P.sinF(num(a[0], 60));
      case 'Saw': return a[1] || a[2] ? scaleF(P.saw(num(a[0], 60)), a[1], 0, a[2], 32768) : P.saw(num(a[0], 60));
      case 'PulsingF': return P.pulsingF(num(a[0], 1000));
      case 'Scale': return scaleF(fn(a[0], 0), a[1], 0, a[2], 32768);
      case 'SwingSpeed': return P.swingSpeed(num(a[0], 250));
      case 'BladeAngle': return P.bladeAngle(num(a[0], 0), num(a[1], 32768));
      case 'BladeAngleX': return P.bladeAngle(num(a[0], 0), num(a[1], 32768));
      case 'TwistAngle': return P.twistAngle();
      case 'NoisySoundLevel': case 'NoisySoundLevelCompat': case 'SoundLevel': case 'SmoothSoundLevel': approx('SoundLevel'); return P.soundCompat();
      case 'BatteryLevel': return P.batteryLevel();
      case 'Bump': return P.bump(fn(a[0], 16384), fn(a[1], 10000));
      case 'SmoothStep': return P.smoothStep(fn(a[0], 16384), fn(a[1], 8000));
      case 'BrownNoiseF': return P.brownNoise(num(a[0], 100));
      case 'SlowNoise': return P.slowNoise(num(a[0], 2000));
      case 'RandomF': return P.randomF();
      case 'RandomPerLEDF': return P.randomPerLed();
      case 'HumpFlickerF': case 'HumpFlickerFX': return P.humpFlicker(num(a[0], 20));
      case 'SparkleF': return P.sparkleF(num(a[0], 300), num(a[1], 1024));
      case 'StrobeF': { const freq = fn(a[0], 10); const ms = fn(a[1], 1); let on = false; let start = -1; return { run(c) { freq.run(c); ms.run(c); const f = Math.max(1, freq.get(0)); const m = ms.get(0); if (start < 0) start = c.now; const timeout = on ? m : 1000 / f; if (c.now - start > timeout) { start += timeout; if (c.now - start > m + 1000 / f) start = c.now; on = !on; } }, get: () => (on ? 32768 : 0) }; }
      case 'Ifon': { const on = fn(a[0], 0); const off = fn(a[1], 0); let isOn = false; return { run(c) { on.run(c); off.run(c); isOn = c.on; }, get: (led) => (isOn ? on.get(led) : off.get(led)) }; }
      case 'InOutFunc': { const out = num(a[0], 300); const inn = num(a[1], 500); let v = 0; let was = false; let changed = -1e9; let first = true; return { run(c) { if (first) { was = c.on; first = false; v = c.on ? 32768 : 0; } if (c.on !== was) { was = c.on; changed = c.now; } const t = c.now - changed; v = was ? clamp(Math.trunc((t * 32768) / Math.max(1, out)), 0, 32768) : 32768 - clamp(Math.trunc((t * 32768) / Math.max(1, inn)), 0, 32768); }, get: () => v }; }
      case 'Sum': { const fs = a.map((x) => fn(x, 0)); return { run(c) { for (const f of fs) f.run(c); }, get: (led) => fs.reduce((s, f) => s + f.get(led), 0) }; }
      case 'Mult': { const fs = a.map((x) => fn(x, 32768)); return { run(c) { for (const f of fs) f.run(c); }, get: (led) => fs.reduce((s, f) => Math.trunc((s * f.get(led)) / 32768), 32768) }; }
      case 'Subtract': { const x = fn(a[0], 0); const y = fn(a[1], 0); return { run(c) { x.run(c); y.run(c); }, get: (led) => x.get(led) - y.get(led) }; }
      case 'Divide': { const x = fn(a[0], 0); const y = fn(a[1], 1); return { run(c) { x.run(c); y.run(c); }, get: (led) => Math.trunc((x.get(led) * 32768) / (y.get(led) || 1)) }; }
      case 'Percentage': { const x = fn(a[0], 0); const pct = num(a[1], 100); return { run(c) { x.run(c); }, get: (led) => Math.trunc((x.get(led) * pct) / 100) }; }
      case 'IsLessThan': { const x = fn(a[0], 0); const y = fn(a[1], 0); return { run(c) { x.run(c); y.run(c); }, get: (led) => (x.get(led) < y.get(led) ? 32768 : 0) }; }
      case 'IsBetween': { const x = fn(a[0], 0); const lo = fn(a[1], 0); const hi = fn(a[2], 32768); return { run(c) { x.run(c); lo.run(c); hi.run(c); }, get: (led) => (x.get(led) >= lo.get(led) && x.get(led) <= hi.get(led) ? 32768 : 0) }; }
      case 'LayerFunctions': { const fs = a.map((x) => fn(x, 0)); return { run(c) { for (const f of fs) f.run(c); }, get(led) { let inv = 32768; for (const f of fs) inv = Math.trunc((inv * (32768 - clamp(f.get(led), 0, 32768))) / 32768); return 32768 - inv; } }; }
      case 'CenterDistF': { const centre = fn(a[0], 16384); let n = 132; return { run(c) { centre.run(c); n = c.n; }, get: (led) => Math.min(32768, Math.abs(Math.trunc((led * 32768) / n) - centre.get(led)) * 2) }; }
      case 'Variation': case 'AltF': case 'SyncAltToVarianceF': return P.constInt(0);
      case 'EffectPulseF': { const det = detector(a[0]); let v = 0; return { run(c) { v = det.run(c) ? 32768 : 0; }, get: () => v }; }
      case 'LockupPulseF': { const s = (a[0]?.name ?? '').replace(/^SaberBase::/, ''); const type = /MELT/.test(s) ? 'melt' : /DRAG/.test(s) ? 'drag' : /LIGHTNING/.test(s) ? 'lb' : 'normal'; let v = 0; return { run(c) { v = c.lockup === type ? 32768 : 0; }, get: () => v }; }
      case 'IncrementModuloF': { const pulse = fn(a[0], 0); const max = fn(a[1], 32768); const inc = fn(a[2], 1); let v = 0; return { run(c) { pulse.run(c); max.run(c); inc.run(c); if (pulse.get(0)) { const m = max.get(0); v = m ? (v + inc.get(0)) % m : 0; } }, get: () => v }; }
      case 'IncrementWithReset': { const pulse = fn(a[0], 0); const reset = fn(a[1], 0); const max = fn(a[2], 32768); const inc = fn(a[3], 1); let v = 0; return { run(c) { pulse.run(c); reset.run(c); max.run(c); inc.run(c); if (reset.get(0)) v = 0; if (pulse.get(0)) v = Math.min(v + inc.get(0), max.get(0)); }, get: () => v }; }
      case 'ThresholdPulseF': { const f = fn(a[0], 0); const th = fn(a[1], 32768); const hyst = fn(a[2], 66); let trig = false; let v = 0; return { run(c) { f.run(c); th.run(c); hyst.run(c); const x = f.get(0); const t = th.get(0); v = 0; if (trig) { if (x < (t * hyst.get(0)) / 100) trig = false; } else if (x >= t) { trig = true; v = 32768; } }, get: () => v }; }
      case 'HoldPeakF': { const f = fn(a[0], 0); const hold = fn(a[1], 1000); const speed = fn(a[2], 32768); let v = 0; let last = -1; let peakAt = -1e9; return { run(c) { f.run(c); hold.run(c); speed.run(c); const cur = f.get(0); const delta = last < 0 ? 0 : c.now - last; last = c.now; if (c.now - peakAt > hold.get(0)) v -= (delta * speed.get(0)) / 1000; if (cur > v) { v = cur; peakAt = c.now; } }, get: () => Math.round(v) }; }
      case 'ChangeSlowly': { const f = fn(a[0], 0); const speed = fn(a[1], 32768); let v = 0; let last = -1; return { run(c) { f.run(c); speed.run(c); const delta = ((last < 0 ? 0 : c.now - last) * speed.get(0)) / 1000; last = c.now; const t = f.get(0); if (delta > Math.abs(v - t)) v = t; else if (v < t) v += delta; else v -= delta; }, get: () => Math.round(v) }; }
      case 'Trigger': { const det = detector(a[0]); const ms = [fn(a[4], 0), fn(a[1], 300), fn(a[2], 300), fn(a[3], 300)]; let state = 4; let start = 0; let v = 0; return { run(c) { for (const m of ms) m.run(c); if (det.run(c)) { start = c.now; state = 0; } if (state === 4) { v = 0; return; } let t = c.now - start; for (;;) { const len = ms[state].get(0); if (t < len) { v = state === 1 ? Math.trunc((t * 32768) / len) : state === 2 ? 32768 : state === 3 ? 32768 - Math.trunc((t * 32768) / len) : 0; return; } state++; t -= len; start += len; if (state === 4) { v = 0; return; } } }, get: () => v }; }
      case 'TimeSinceEffect': { const det = detector(a[0]); let at = -1e9; let v = 1e9; return { run(c) { if (det.run(c)) at = det.at; v = Math.min(1e6, c.now - at); }, get: () => v }; }
      case 'OnSparkF': { const ms = fn(a[0], 200); let on = false; let onAt = -1e9; let v = 0; return { run(c) { ms.run(c); if (on !== c.on) { on = c.on; if (on) onAt = c.now; } const t = c.now - onAt; const m = ms.get(0); v = t < m ? 32768 - Math.trunc((32768 * t) / m) : 0; }, get: () => v }; }
      case 'BlinkingF': { const ms = fn(a[0], 1000); const pro = fn(a[1], 500); let start = -1; let v = 0; return { run(c) { ms.run(c); pro.run(c); const m = ms.get(0); if (m <= 0) { v = 0; return; } if (start < 0) start = c.now; let p = c.now - start; if (p > m) { if (p < m * 2) start += m; else start = c.now; p = c.now - start; } v = Math.trunc((p * 1000) / m) <= pro.get(0) ? 0 : 32768; }, get: () => v }; }
      case 'RandomBlinkF': { const mhz = fn(a[0], 1000); let last = -1e9; let bits: number[] = []; return { run(c) { mhz.run(c); if (c.now - last > 1e6 / Math.max(1, mhz.get(0))) { last = c.now; bits = Array.from({ length: c.n }, () => c.rnd(2)); } }, get: (led) => (bits[led] ?? 0) * 32768 }; }
      case 'SequenceF': { const perBit = Math.max(1, num(a[0], 100)); const bits = num(a[1], 16); const seq = a.slice(2).map((x) => num(x, 0)); let v = 0; return { run(c) { if (!seq.length) return; const bit = Math.trunc(c.now / perBit) % Math.min(bits, seq.length * 16); v = 32768 * ((seq[bit >> 4] >> (~bit & 0xf)) & 1); }, get: () => v }; }
      case 'RampF': { let n = 1; return { run(c) { n = c.n; }, get: (led) => Math.trunc((led * 32768) / n) }; }
      case 'LinearSectionF': { const pos = fn(a[0], 16384); const frac = fn(a[1], 16384); let lo = 0; let hi = 0; return { run(c) { pos.run(c); frac.run(c); const f = frac.get(0); const p = pos.get(0); const max = 32768 * c.n; lo = clamp((p - f / 2) * c.n, 0, max); hi = clamp((p + f / 2) * c.n, 0, max); }, get: (led) => clamp(Math.min(hi, led * 32768 + 32768) - Math.max(lo, led * 32768), 0, 32768) }; }
      case 'CircularSectionF': { const pos = fn(a[0], 16384); const frac = fn(a[1], 16384); let lo = 0; let hi = 0; let max = 0; return { run(c) { pos.run(c); frac.run(c); const f = frac.get(0); max = c.n * 32768; if (f >= 32768) { lo = 0; hi = max; } else if (f <= 0) { lo = 0; hi = 0; } else { const p = pos.get(0); lo = ((p + 32768 - f / 2) & 32767) * c.n; hi = ((p + f / 2) & 32767) * c.n; } }, get(led) { const l0 = led * 32768; const l1 = l0 + 32768; const ov = (x: number, y: number) => clamp(Math.min(y, l1) - Math.max(x, l0), 0, 32768); return lo <= hi ? ov(lo, hi) : ov(0, hi) + ov(lo, max); } }; }
      case 'IntSelect': { const f = fn(a[0], 0); const vals = a.slice(1).map((x) => num(x, 0)); let v = 0; return { run(c) { f.run(c); if (!vals.length) return; let x = f.get(0); while (x < 0) x += vals.length << 8; v = vals[x % vals.length]; }, get: () => v }; }
      case 'IntSelectX': { const f = fn(a[0], 0); const fs = a.slice(1).map((x) => fn(x, 0)); let k = 0; return { run(c) { f.run(c); for (const g of fs) g.run(c); if (fs.length) { let x = f.get(0); while (x < 0) x += fs.length << 8; k = x % fs.length; } }, get: (led) => (fs.length ? fs[k].get(led) : 0) }; }
      case 'ModF': { const f = fn(a[0], 0); const max = fn(a[1], 32768); return { run(c) { f.run(c); max.run(c); }, get(led) { const m = max.get(led); if (!m) return 0; const r = f.get(led) % m; return r < 0 ? r + m : r; } }; }
      case 'ClampF': { const f = fn(a[0], 0); const lo = num(a[1], 0); const hi = num(a[2], 32768); return { run(c) { f.run(c); }, get: (led) => clamp(f.get(led), lo, hi) }; }
      case 'ClampFX': { const f = fn(a[0], 0); const lo = fn(a[1], 0); const hi = fn(a[2], 32768); return { run(c) { f.run(c); lo.run(c); hi.run(c); }, get: (led) => clamp(f.get(led), lo.get(led), hi.get(led)) }; }
      case 'VolumeLevel': approx('VolumeLevel'); return P.constInt(26214);
      case 'WavNum': { const det = detector(a[0]); let v = 0; return { run(c) { if (det.run(c)) v = Math.max(0, det.wavnum); }, get: () => v }; }
      case 'BlastF': return blastF(num(a[0], 200), num(a[1], 100), num(a[2], 400), busName(a[3] ?? { name: 'EFFECT_BLAST', args: [] }));
      case 'BlastFadeoutF': { const fadeout = Math.max(1, num(a[0], 250)); const type = busName(a[1] ?? { name: 'EFFECT_BLAST', args: [] }); let v = 0; return { run(c) { let mix = 0; for (const e of recent(c, type)) { const M = 1000 - Math.trunc(((c.now - e.at) * 1000) / fadeout); if (M > 0) mix += Math.trunc((32768 * M) / 1000); } v = Math.min(mix, 32768); }, get: () => v }; }
      case 'OriginalBlastF': approx('OriginalBlastF'); return blastF(200, 100, 400, busName(a[0] ?? { name: 'EFFECT_BLAST', args: [] }));
      case 'SwingAccelerationX': case 'SwingAcceleration': { approx('SwingAcceleration'); const max = fn(a[0], 130); let v = 0; let lastSwing = 0; let last = -1; return { run(c) { max.run(c); const dt = last < 0 ? 0 : (c.now - last) / 1000; last = c.now; const acc = dt > 0 ? Math.abs(c.swing - lastSwing) / dt / 100 : 0; lastSwing = c.swing; v = clamp(Math.round((acc / Math.max(1, max.get(0))) * 32768), 0, 32768); }, get: () => v }; }
      case 'TwistAcceleration': { approx('TwistAcceleration'); const max = num(a[0], 90); let v = 0; let lastTwist = 0; let last = -1; return { run(c) { const dt = last < 0 ? 0 : (c.now - last) / 1000; last = c.now; const acc = dt > 0 ? Math.abs(c.twist - lastTwist) / dt / 10 : 0; lastTwist = c.twist; v = clamp(Math.round(((acc * 32768) / 360) / Math.max(1, max)), 0, 32768); }, get: () => v }; }
      case 'MarbleF': { approx('MarbleF'); const offset = fn(a[0], 0); const friction = fn(a[1], 3000); const accel = fn(a[2], 0); const gravity = fn(a[3], 32768); let pos = 0; let speed = 0; let last = -1; let v = 0; return { run(c) { offset.run(c); friction.run(c); accel.run(c); gravity.run(c); const dt = last < 0 ? 0.001 : Math.min(1, (c.now - last) / 1000); last = c.now; const rad = (pos + offset.get(0) / 32768) * Math.PI * 2; const tilt = ((c.angle - 16384) / 16384) * (Math.PI / 2); const downY = Math.cos(tilt); const downZ = -Math.sin(tilt); let acc = (downY * Math.sin(rad) + downZ * Math.cos(rad)) * (gravity.get(0) / 32768); acc += accel.get(0) / 32768; acc -= (speed * friction.get(0)) / 32768; speed += acc * dt; pos = (((pos + speed * dt) % 1) + 1) % 1; v = Math.trunc(pos * 32768); }, get: () => v }; }
      case 'WavLen': approx('WavLen'); return P.constInt(1000);
      case 'ClashImpactFX': { approx('ClashImpactF'); const lo = fn(a[0], 200); const hi = fn(a[1], 1600); let v = 0; let g = CLASH_G.soft; return { run(c) { lo.run(c); hi.run(c); for (const e of c.effects) if (e.type === 'clash' || e.type === 'stab') g = e.strength || g; v = clamp(Math.trunc(((g * 100 - lo.get(0)) * 32768) / Math.max(1, hi.get(0))), 0, 32768); }, get: () => v }; }
      case 'EffectPosition': { const det = detector(a[0]); let v = 0; return { run(c) { if (det.run(c)) v = Math.round(det.pos * 32768); }, get: () => v }; }
      case 'EffectRandomF': { const det = detector(a[0]); let v = 0; return { run(c) { if (det.run(c)) v = c.rnd(32768); }, get: () => v }; }
      case 'BendTimePowX': case 'ReverseTimeX': return fn(a[0], d); // the bend shapes the curve, not its length
      case 'SingleValueAdapter': return fn(a[0], d);
      default: {
        if (/^-?\d+$/.test(n.name)) return P.constInt(Number(n.name));
        if (/SVF$/.test(n.name)) return fn({ name: n.name.replace(/SVF$/, ''), args: a }, d, true);
        const x = bare ? null : expandAlias(n);
        if (x) return fn(x, d);
        skip(n);
        return a.length && kindOf(a[0]) === 'FUNCTION' ? fn(a[0], d) : P.constInt(d);
      }
    }
  }
  /** BlastF: every recent effect of the type as a travelling hump that fades; per functions/blast.h. */
  const blastF = (fadeout: number, size: number, waveMs: number, type: string): IntFn => {
    let n = 1; let list: SimEffect[] = []; let now = 0;
    return { run(c) { n = c.n; now = c.now; list = recent(c, type); }, get(led) { let mix = 0; for (const b of list) { const T = now - b.at; const M = 1000 - Math.trunc((T * 1000) / Math.max(1, fadeout)) ; if (M > 0) { const dist = Math.abs(b.pos - led / n); const N = Math.trunc(Math.abs(dist - T / waveMs) * size); if (N <= 32) mix += Math.trunc((HUMP[Math.min(N, 32)] * M) / 1000); } } return Math.min(mix << 7, 32768); } };
  };
  /** Scale<F, LO, HI> where LO and HI may themselves be functions. */
  const scaleF = (f: IntFn, lo: Node | undefined, dlo: number, hi: Node | undefined, dhi: number): IntFn => {
    const l = fn(lo, dlo); const h = fn(hi, dhi);
    return { run(c) { f.run(c); l.run(c); h.run(c); }, get: (led) => { const x = l.get(led); return x + Math.trunc((f.get(led) * (h.get(led) - x)) / 32768); } };
  };

  // ---- transitions, as transitions/base.h has them ----
  const trBase = (ms: IntFn) => {
    let restart = false; let start = 0; let len = 0; let now = 0;
    return {
      begin() { restart = true; },
      run(c: Ctx) { ms.run(c); now = c.now; if (restart) { start = c.now; len = Math.max(0, ms.get(0)); restart = false; } },
      done: () => len === 0, restarting: () => restart, start: () => start, now: () => now,
      update(scale: number) { if (len === 0) return scale; const t = now - start; if (t > len) { len = 0; return scale; } return Math.trunc((t * scale) / len); },
    };
  };
  const trInstant = (): TrFn => ({ begin() {}, run() {}, done: () => true, get: (_l, _a, b) => b });
  const trFadeX = (ms: IntFn, smooth = false): TrFn => { const b = trBase(ms); let fade = 0; return { begin: b.begin, done: b.done, run(c) { b.run(c); if (smooth) { const x = b.update(32768); fade = (((x * x) >> 14) * ((3 << 14) - x)) >> 16; } else fade = b.update(16384); }, get: (led, x, y) => mixPx(x, y, fade, 14) }; };
  const trDelayX = (ms: IntFn): TrFn => { const b = trBase(ms); return { begin: b.begin, done: b.done, run(c) { b.run(c); b.update(0); }, get: (_l, x, y) => (b.done() ? y : x) }; };
  const overlap = (lo: number, hi: number, led: number) => clamp(Math.min(hi, (led << 8) + 256) - Math.max(lo, led << 8), 0, 256);
  const trWipeX = (ms: IntFn): TrFn => { const b = trBase(ms); let fade = 0; return { begin: b.begin, done: b.done, run(c) { b.run(c); fade = b.update(256 * c.n); }, get: (led, x, y) => mixPx(x, y, overlap(0, fade, led), 8) }; };
  const trWipeInX = (ms: IntFn): TrFn => { const b = trBase(ms); let lo = 0; let hi = 0; return { begin: b.begin, done: b.done, run(c) { b.run(c); hi = 256 * c.n; lo = hi - b.update(hi); }, get: (led, x, y) => mixPx(x, y, overlap(lo, hi, led), 8) }; };
  const trCenterWipeX = (ms: IntFn, pos: IntFn, inward: boolean): TrFn => {
    const b = trBase(ms); let lo = 0; let hi = 0;
    return { begin: b.begin, done: b.done, run(c) { b.run(c); pos.run(c); const centre = (pos.get(0) * c.n) >> 7; const end = 256 * c.n; if (!inward) { const top = b.update(end - centre); const bottom = b.update(centre); lo = clamp(centre - bottom, 0, centre); hi = clamp(centre + top, centre, end); } else { const top = b.update(end - centre); const bottom = b.update(centre); lo = clamp(bottom, 0, centre); hi = clamp(end - top, centre, end); } }, get: (led, x, y) => (inward ? mixPx(x, y, 256 - overlap(lo, hi, led), 8) : mixPx(x, y, overlap(lo, hi, led), 8)) };
  };
  const trWaveX = (col: LayerFn, fadeout: IntFn, size: IntFn, waveMs: IntFn, centre: IntFn): TrFn => {
    const b = trBase(fadeout); let mix = 0; let offset = 0; let n = 1; let ctr = 16384; let sz = 100;
    return { begin: b.begin, done: b.done, run(c) { size.run(c); centre.run(c); waveMs.run(c); col.run(c); if (b.restarting()) { ctr = centre.get(0); sz = size.get(0); } b.run(c); mix = 32768 - b.update(32768); n = c.n; offset = Math.trunc(((c.now - b.start()) * 32768) / Math.max(1, waveMs.get(0))); },
      get(led, x) { const dist = Math.abs(ctr - Math.trunc((led * 32768) / n)); const N = (Math.abs(dist - offset) * sz) >> 15; const m = N < 32 ? (HUMP[N] * mix) >> 8 : 0; return mixPx(x, col.get(led), m, 15); } };
  };
  const trSparkX = (col: LayerFn, size: IntFn, ms: IntFn, centre: IntFn): TrFn => {
    const b = trBase(ms); let offset = 0; let n = 1; let ctr = 16384; let sz = 100;
    return { begin: b.begin, done: b.done, run(c) { size.run(c); centre.run(c); col.run(c); if (b.restarting()) { ctr = centre.get(0); sz = size.get(0); } b.run(c); offset = b.update(32768); n = c.n; },
      get(led, x) { const dist = Math.abs(ctr - Math.trunc((led * 32768) / n)); const N = (Math.abs(dist - offset) * sz) >> 15; const m = N < 32 ? HUMP[N] << 7 : 0; return mixPx(x, col.get(led), m, 15); } };
  };
  /**
   * TrConcat: transitions in order, with colours between them where the style puts them. ProffieOS nests TrConcat2
   * (transition, transition: both see the outer A and B) and TrConcat3 (transition, colour, transition) by position,
   * which comes to: each step runs from the nearest colour before it (else A) to the nearest colour after it (else B).
   */
  const trConcat = (parts: Node[]): TrFn => {
    const steps: { t: TrFn; before: LayerFn | null; after: LayerFn | null }[] = [];
    const mids: LayerFn[] = [];
    let pendingMid: LayerFn | null = null;
    for (const p of parts) {
      if (kindOf(p) === 'TRANSITION') { steps.push({ t: tr(p), before: pendingMid, after: null }); pendingMid = null; }
      else { const m = layer(p); mids.push(m); if (steps.length) steps[steps.length - 1].after = m; pendingMid = m; }
    }
    for (let k = steps.length - 2; k >= 0; k--) if (!steps[k].after) steps[k].after = steps[k + 1].after;
    for (let k = 1; k < steps.length; k++) if (!steps[k].before) steps[k].before = steps[k - 1].after ?? steps[k - 1].before;
    if (!steps.length) return trInstant();
    let i = 0; let running = false;
    return {
      begin() { i = 0; running = true; steps[0].t.begin(); },
      done: () => !running,
      run(c) { for (const m of mids) m.run(c); if (!running) return; while (true) { steps[i].t.run(c); if (!steps[i].t.done()) return; if (i + 1 >= steps.length) { running = false; return; } i++; steps[i].t.begin(); } },
      get(led, a, b) { if (!running) return b; const s = steps[i]; return s.t.get(led, s.before ? s.before.get(led) : a, s.after ? s.after.get(led) : b); },
    };
  };
  const trJoin = (trs: TrFn[], right: boolean): TrFn => ({
    begin() { for (const t of trs) t.begin(); }, done: () => trs.every((t) => t.done()), run(c) { for (const t of trs) t.run(c); },
    get(led, a, b) { if (!right) { let x = trs[0].get(led, a, b); for (let k = 1; k < trs.length; k++) x = trs[k].get(led, x, b); return x; } let y = trs[trs.length - 1]; let x = y.get(led, a, b); for (let k = trs.length - 2; k >= 0; k--) { y = trs[k]; x = y.get(led, a, x); } return x; },
  });
  const trExtendX = (ms: IntFn, t: TrFn): TrFn => { const b = trBase(ms); let extending = false; return { begin() { t.begin(); extending = false; }, done: () => extending && b.done(), run(c) { t.run(c); if (!extending && t.done()) { b.begin(); extending = true; } b.run(c); if (extending) b.update(0); }, get: (led, a, y) => t.get(led, a, y) }; };
  const trBlinkX = (ms: IntFn, n: number, width: IntFn): TrFn => { const b = trBase(ms); let blink = false; return { begin: b.begin, done: b.done, run(c) { b.run(c); width.run(c); blink = (b.update(32768 * n) & 0x7fff) < width.get(0); }, get: (_l, a, y) => (blink ? a : y) }; };
  const trBoingX = (ms: IntFn, n: number): TrFn => { const b = trBase(ms); let fade = 0; return { begin: b.begin, done: b.done, run(c) { b.run(c); fade = b.update(16384 * (n * 2 + 1)); if (fade & 0x4000) fade = 0x4000 - (fade & 0x3fff); fade &= 0x3fff; }, get: (led, a, y) => mixPx(a, y, fade, 14) }; };
  const trLoop = (t: TrFn): TrFn => ({ begin() { t.begin(); }, done: () => false, run(c) { if (t.done()) t.begin(); t.run(c); }, get: (led, a, b) => t.get(led, a, b) });
  const trPick = (trs: TrFn[], pick: (c: Ctx) => number): TrFn => { let sel = 0; let choose = false; return { begin() { choose = true; }, done: () => !choose && trs[sel].done(), run(c) { if (choose) { sel = clamp(pick(c), 0, trs.length - 1); trs[sel].begin(); choose = false; } trs[sel].run(c); }, get: (led, a, b) => trs[sel].get(led, a, b) }; };

  /** TrDoEffectX raises its effect when the transition begins (only while the blade is on; the Always variant regardless). */
  const trDoEffect = (t: TrFn, effect: string, wavnum: IntFn, location: IntFn, always: boolean): TrFn => {
    let begun = false; let finished = false;
    return {
      begin() { t.begin(); begun = true; finished = false; },
      done: () => finished || t.done(),
      run(c) { t.run(c); wavnum.run(c); location.run(c); let loc = location.get(0); if (loc === -1) loc = c.rnd(32768) / 32768; else loc /= 32768; if (begun) { if (always || c.on) c.doEffect(effect, loc, wavnum.get(0)); begun = false; } if (!always && !finished && !c.on && !c.powered) finished = true; },
      get: (led, x, y) => (finished ? y : t.get(led, x, y)),
    };
  };
  const tr = (n: Node | undefined): TrFn => guard(() => trImpl(n), trInstant);
  function trImpl(n: Node | undefined): TrFn {
    if (!n) return trInstant();
    const a = n.args;
    switch (n.name) {
      case 'TrInstant': return trInstant();
      case 'TrFadeX': return trFadeX(fn(a[0], 300));
      case 'TrSmoothFadeX': return trFadeX(fn(a[0], 300), true);
      case 'TrDelayX': return trDelayX(fn(a[0], 300));
      case 'TrWipeX': return trWipeX(fn(a[0], 300));
      case 'TrWipeInX': return trWipeInX(fn(a[0], 500));
      case 'TrCenterWipeX': return trCenterWipeX(fn(a[0], 300), fn(a[1], 16384), false);
      case 'TrCenterWipeInX': return trCenterWipeX(fn(a[0], 500), fn(a[1], 16384), true);
      case 'TrWaveX': return trWaveX(layer(a[0]), fn(a[1], 200), fn(a[2], 100), fn(a[3], 400), fn(a[4], 16384));
      case 'TrSparkX': return trSparkX(layer(a[0]), fn(a[1], 100), fn(a[2], 400), fn(a[3], 16384));
      case 'TrConcat': return trConcat(a);
      case 'TrJoin': return trJoin(a.map(tr), false);
      case 'TrJoinR': return trJoin(a.map(tr), true);
      case 'TrExtendX': return trExtendX(fn(a[0], 1000), tr(a[1]));
      case 'TrBlinkX': return trBlinkX(fn(a[0], 300), num(a[1], 3), fn(a[2], 16384));
      case 'TrBoingX': return trBoingX(fn(a[0], 300), num(a[1], 2));
      case 'TrLoop': return trLoop(tr(a[0]));
      case 'TrLoopNX': { const t = tr(a[1]); const nF = fn(a[0], 1); let loops = -1; return { begin() { t.begin(); loops = -1; }, done: () => loops === 0, run(c) { nF.run(c); if (loops < 0) loops = nF.get(0) + 1; if (loops > 0 && t.done()) { if (loops > 1) t.begin(); loops--; } t.run(c); }, get: (led, x, y) => t.get(led, x, y) }; }
      case 'TrRandom': return trPick(a.map(tr), (c) => c.rnd(a.length));
      case 'TrSelect': { const f = fn(a[0], 0); const trs = a.slice(1).map(tr); return trPick(trs, (c) => { f.run(c); return f.get(0); }); }
      case 'TrSequence': { let k = -1; return trPick(a.map(tr), () => { k = (k + 1) % a.length; return k; }); }
      case 'TrDoEffectX': case 'TrDoEffectAlwaysX': return trDoEffect(tr(a[0]), (a[1]?.name ?? 'EFFECT_NONE').replace(/^SaberBase::/, ''), fn(a[2], -1), fn(a[3], -1), n.name === 'TrDoEffectAlwaysX');
      case 'TrLoopUntil': { const pulse = fn(a[0], 0); const t = tr(a[1]); const out = tr(a[2]); let pulsed = false; return { begin() { t.begin(); pulsed = false; }, done: () => pulsed && out.done(), run(c) { pulse.run(c); if (t.done()) t.begin(); t.run(c); if (!pulsed && pulse.get(0)) { out.begin(); pulsed = true; } if (pulsed) out.run(c); }, get: (led, x, y) => (pulsed ? out.get(led, t.get(led, x, x), y) : t.get(led, x, x)) }; }
      default: {
        const x = expandAlias(n);
        if (x) return tr(x);
        skip(n);
        return trInstant();
      }
    }
  }

  // Build once to learn what is unsupported; the factory builds fresh state each time it is called.
  color(root);
  return { make: () => color(root), report: { unsupported: [...unsupported].sort(), approximate: [...approximate].sort() } };
}

// ---------------- as a saved look ----------------

/** A look kept as a tree: anything ProffieOS's Layers<> can express. */
export interface TreeDoc { version: 2; name: string; tree: Node }

export function isTreeDoc(v: unknown): v is TreeDoc {
  const d = v as TreeDoc;
  return !!d && d.version === 2 && typeof d.name === 'string' && !!d.tree && typeof d.tree.name === 'string' && Array.isArray(d.tree.args);
}

export const defaultTree = (): TreeDoc => ({ version: 2, name: 'My style', tree: parseStyle('Layers<RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>, ResponsiveClashL<RgbArg<CLASH_COLOR_ARG,White>>, ResponsiveBlastL<RgbArg<BLAST_COLOR_ARG,White>>, ResponsiveLockupL<RgbArg<LOCKUP_COLOR_ARG,White>,TrInstant,TrFade<100>>, InOutTrL<TrWipeX<IgnitionTime<300>>,TrWipeInX<RetractionTime<500>>>>') });

/** The C++ a saved tree compiles to. */
export const treeToCpp = (doc: TreeDoc, alias: string): string => `using ${alias} = ${printStyle(doc.tree)};`;

/** The simulator factory the sim registry takes. Unknown templates are skipped, see evaluateStyle. */
export const treeToSim = (doc: TreeDoc): (() => ColorFn) => evaluateStyle(doc.tree).make;

/** The first plain colour in the tree, for the gallery swatch. */
export function firstColour(n: Node): string | null {
  if (n.name === 'Rgb' && n.args.length === 3) return '#' + n.args.map((a) => Math.max(0, Math.min(255, Number(a.name) || 0)).toString(16).padStart(2, '0')).join('');
  const e = CATALOGUE[n.name];
  if (e && e.kind === 'COLOR' && !e.params.length) { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(e.doc); if (m) return '#' + m.slice(1, 4).map((x) => Number(x).toString(16).padStart(2, '0')).join(''); }
  for (const a of n.args) { const c = firstColour(a); if (c) return c; }
  return null;
}

/** A tree from a v1 block stack: the beginner editor's document opened in the tree editor. */
export function treeFromCpp(cpp: string, name: string): TreeDoc {
  const m = /^\s*using\s+\w+\s*=\s*([\s\S]*?);\s*$/.exec(cpp);
  return { version: 2, name, tree: parseStyle(m ? m[1] : cpp) };
}

/** The tree as a look for the library: the alias define is what gets compiled, the tree lets it be edited again. */
export function treeToLook(doc: TreeDoc, id: string, alias: string): LookDef {
  const define = treeToCpp(doc, alias);
  const scanned = scanStyleArgs(define);
  const layers = doc.tree.name === 'Layers' ? doc.tree.args.slice(1).map((a) => a.name.replace(/L$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()) : [doc.tree.name];
  return {
    id, name: doc.name, source: 'built', by: 'you', code: `StylePtr<${alias}>()`, header: null, roles: ['main', 'side'],
    args: scanned.args, defaults: scanned.defaults, preview: scanned.defaults[1] ?? firstColour(doc.tree) ?? '#0000ff',
    description: `Built in the style editor: ${layers.slice(0, 6).join(', ')}${layers.length > 6 ? ', ...' : ''}.`, define, usesFx: false, style: doc,
  };
}
