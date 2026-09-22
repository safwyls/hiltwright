// ProffieOS style expressions as trees: parse, print, look up in the catalogue, and run on the simulator.
//
// A style is a template expression: `Layers<Red, ResponsiveClashL<White, TrInstant, TrFade<200>>, ...>`. The tree
// editor works on that shape directly, with the catalogue (generated from the OS source) telling it what each name
// takes and gives. The evaluator turns a tree into the simulator's own building blocks; templates it does not know
// are skipped (a layer that paints nothing, a function that returns its first argument) and reported, so the preview
// is honest about what it is not showing.

import catalogueJson from './proffieCatalogue';
import { prims, type ColorFn, type IntFn, type LayerFn, type Tr } from './sim';
import { scanStyleArgs, type LookDef } from './looks';

export type Kind = 'COLOR' | 'FUNCTION' | 'TRANSITION' | 'INTEGER' | 'EFFECT' | 'LOCKUP_TYPE' | 'OTHER';
export interface CatParam { name: string; kind: Kind; default: string | null; doc: string }
export interface CatEntry { name: string; kind: Kind; params: CatParam[]; doc: string; file: string; variadic: boolean; internal?: boolean }
export const CATALOGUE: Record<string, CatEntry> = catalogueJson as unknown as Record<string, CatEntry>;

export interface Node { name: string; args: Node[] }

// ---------------- parse and print ----------------

export function parseStyle(text: string): Node {
  let i = 0;
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const node = (): Node => {
    ws();
    const m = /^-?[A-Za-z0-9_:]+/.exec(src.slice(i));
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

export interface EvalReport { unsupported: string[] }

const NAMED_ARGS: Record<string, number> = { BASE_COLOR_ARG: 1, ALT_COLOR_ARG: 2, STYLE_OPTION_ARG: 3, IGNITION_OPTION_ARG: 4, IGNITION_TIME_ARG: 5, IGNITION_DELAY_ARG: 6, IGNITION_COLOR_ARG: 7, IGNITION_POWER_UP_ARG: 8, BLAST_COLOR_ARG: 9, CLASH_COLOR_ARG: 10, LOCKUP_COLOR_ARG: 11, LOCKUP_POSITION_ARG: 12, DRAG_COLOR_ARG: 13, DRAG_SIZE_ARG: 14, LB_COLOR_ARG: 15, STAB_COLOR_ARG: 16, MELT_SIZE_ARG: 17, SWING_COLOR_ARG: 18, SWING_OPTION_ARG: 19, EMITTER_COLOR_ARG: 20, EMITTER_SIZE_ARG: 21, PREON_COLOR_ARG: 22, PREON_OPTION_ARG: 23, PREON_SIZE_ARG: 24, RETRACTION_OPTION_ARG: 25, RETRACTION_TIME_ARG: 26, RETRACTION_DELAY_ARG: 27, RETRACTION_COLOR_ARG: 28, RETRACTION_POWER_DOWN_ARG: 29, POSTOFF_COLOR_ARG: 30, OFF_COLOR_ARG: 31, OFF_OPTION_ARG: 32, ALT_COLOR2_ARG: 33, ALT_COLOR3_ARG: 34, STYLE_OPTION2_ARG: 35, STYLE_OPTION3_ARG: 36 };

const int = (n: Node | undefined, d: number): number => { const v = n ? Number(n.name) : NaN; return Number.isFinite(v) ? v : (n && NAMED_ARGS[n.name]) ?? d; };
const P = prims;
const WHITE = P.solid(P.WHITE);

export function evaluateStyle(root: Node): { make: () => ColorFn; report: EvalReport } {
  const unsupported = new Set<string>();
  const skip = (n: Node) => { unsupported.add(n.name); };

  const color = (n: Node | undefined): ColorFn => {
    if (!n) return WHITE;
    const e = CATALOGUE[n.name];
    const a = n.args;
    switch (n.name) {
      case 'Rgb': case 'Rgb16': { const k = n.name === 'Rgb' ? 257 : 1; return P.solid([int(a[0], 0) * k, int(a[1], 0) * k, int(a[2], 0) * k]); }
      case 'RgbArg': { const c = color(a[1]); const def = c.get(0); return P.rgbArg(int(a[0], 1), def); }
      case 'Black': return P.solid(P.BLACK);
      case 'White': return WHITE;
      case 'Layers': return P.layers(color(a[0]), ...a.slice(1).map(layer));
      case 'Mix': { if (a.length === 3) return P.mix(fn(a[0]), color(a[1]), color(a[2])); const cols = a.slice(1).map(color); const f = fn(a[0]); return { run(c) { f.run(c); for (const x of cols) x.run(c); }, get(led) { const v = f.get(led) * (cols.length - 1); const i = Math.min(cols.length - 2, Math.floor(v / 32768)); return mixRGB(cols[i].get(led), cols[i + 1].get(led), v - i * 32768); } }; }
      case 'AlphaL': return layerAsColor(P.alphaL(color(a[0]), fn(a[1])));
      case 'Gradient': return P.gradient(a.map(color));
      case 'Rainbow': return P.rainbow();
      case 'Stripes': return P.stripes(int(a[0], 3000), int(a[1], -1000), a.slice(2).map(color));
      case 'StripesX': return P.stripes(fn(a[0]), fn(a[1]), a.slice(2).map(color));
      case 'Pulsing': return P.mix(P.pulsingF(int(a[2], 1000)), color(a[0]), color(a[1]));
      case 'AudioFlicker': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.soundCompat()));
      case 'AudioFlickerL': return layerAsColor(P.alphaL(color(a[0]), P.soundCompat()));
      case 'BrownNoiseFlicker': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.brownNoise(int(a[2], 100))));
      case 'BrownNoiseFlickerL': return layerAsColor(P.alphaL(color(a[0]), P.brownNoise(int(a[1], 100))));
      case 'RandomFlicker': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.randomF()));
      case 'RandomL': return layerAsColor(P.alphaL(color(a[0]), P.randomF()));
      case 'RandomPerLEDFlicker': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.randomPerLed()));
      case 'RandomPerLEDFlickerL': return layerAsColor(P.alphaL(color(a[0]), P.randomPerLed()));
      case 'HumpFlicker': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.humpFlicker(int(a[2], 20))));
      case 'HumpFlickerL': return layerAsColor(P.alphaL(color(a[0]), P.humpFlicker(int(a[1], 20))));
      case 'Sparkle': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.sparkleF(int(a[2], 300), int(a[3], 1024))));
      case 'SparkleL': return layerAsColor(P.alphaL(color(a[0]), P.sparkleF(int(a[1], 300), int(a[2], 1024))));
      case 'StyleFire': { const cfg = (x: Node | undefined, d: [number, number, number]) => ({ base: int(x?.args[0], d[0]), rand: int(x?.args[1], d[1]), cooling: int(x?.args[2], d[2]) }); return P.styleFire(color(a[0]), color(a[1]), int(a[3], 2), cfg(a[4], [0, 2000, 5]), cfg(a[5], [3000, 0, 0]), cfg(a[6], [0, 5000, 10]), cfg(a[7], [0, 0, 5])); }
      case 'Blast': return P.layers(color(a[0]), P.blastL(color(a[1]), int(a[2], 200), int(a[3], 100), int(a[4], 400)));
      case 'BlastL': return layerAsColor(P.blastL(color(a[0]), int(a[1], 200), int(a[2], 100), int(a[3], 400)));
      case 'ResponsiveBlastL': case 'ResponsiveBlastWaveL': return layerAsColor(P.blastL(color(a[0]), int(a[1]?.args[0], 400), int(a[2]?.args[0], 100), int(a[3]?.args[0], 400)));
      case 'ResponsiveBlastFadeL': return layerAsColor(P.blastL(color(a[0]), int(a[2]?.args[0], 400), 20, 1));
      case 'SimpleClash': return P.layers(color(a[0]), P.simpleClashL(color(a[1]), int(a[2], 40)));
      case 'SimpleClashL': return layerAsColor(P.simpleClashL(color(a[0]), int(a[1], 40)));
      case 'ResponsiveClashL': return layerAsColor(P.effectL('clash', tr(a[1]), P.alphaL(color(a[0]), P.bump(hitAt(a[3], a[4]), fn(a[5], 10000))), tr(a[2], 'fade', 200)));
      case 'ResponsiveLockupL': return layerAsColor(P.lockupL('normal', P.alphaL(color(a[0]), P.bump(hitAt(a[3], a[4]), a[5] ? fn(a[5]) : P.scale(P.swingSpeed(100), 9000, 14000))), tr(a[1]), tr(a[2])));
      case 'ResponsiveDragL': return layerAsColor(P.lockupL('drag', P.alphaL(color(a[0]), P.smoothStep(fn(a[5], 32000), scaleF(P.twistAngle(), a[3], 2000, a[4], 10000))), tr(a[1]), tr(a[2])));
      case 'ResponsiveMeltL': return layerAsColor(P.lockupL('drag', P.alphaL(a[0] ? color(a[0]) : P.mix(P.twistAngle(), P.solid(P.rgb8(255, 69, 0)), P.solid(P.rgb8(255, 0, 0))), P.smoothStep(fn(a[5], 30000), scaleF(P.twistAngle(), a[3], 4000, a[4], 10000))), tr(a[1], 'wipein', 600), tr(a[2], 'wipe', 600)));
      case 'ResponsiveLightningBlockL': return layerAsColor(P.lightningL(color(a[0])));
      case 'ResponsiveStabL': return layerAsColor(P.effectL('stab', tr(a[1], 'wipein', 600), P.alphaL(color(a[0]), P.smoothStep(fn(a[5], 32000), scaleF(P.bladeAngle(), a[3], 14000, a[4], 8000))), tr(a[2], 'wipe', 600)));
      case 'LockupTrL': return layerAsColor(P.lockupL(lockupKind(a[3]), layer(a[0]), tr(a[1]), tr(a[2])));
      case 'LockupL': return layerAsColor(P.lockupL(lockupKind(a[3]), layer(a[0]), tr(a[1]), tr(a[2])));
      case 'TransitionEffectL': { const t = a[0]; const kind = effectKind(a[1]); if (t?.name === 'TrConcat' && t.args.length >= 3 && kind) return layerAsColor(P.effectL(kind, tr(t.args[0]), layer(t.args[1]), tr(t.args[2]))); if (kind && t?.name === 'TrConcat' && t.args.length === 2) return layerAsColor(P.effectL(kind, tr(t.args[0]), layer(t.args[1]), { kind: 'instant' })); skip(n); return transparent(); }
      case 'TransitionLoopL': { const t = a[0]; if (t?.name === 'TrConcat') { const segs: { kind: 'fade' | 'delay'; ms: number }[] = []; const nodes: ColorFn[] = []; for (let i = 0; i < t.args.length; i++) { if (i % 2 === 0) { const s = t.args[i]; segs.push({ kind: s.name === 'TrDelay' || s.name === 'TrDelayX' ? 'delay' : 'fade', ms: int(s.args[0], 300) }); } else nodes.push(color(t.args[i])); } if (segs.length === nodes.length + 1) return layerAsColor(P.loopL(segs, nodes)); } skip(n); return transparent(); }
      case 'InOutTrL': return layerAsColor(P.inOutL(tr(a[0], 'wipe', 300), tr(a[1], 'wipein', 500), a[2] ? color(a[2]) : P.solid(P.BLACK)));
      case 'InOutHelper': case 'InOutHelperL': return P.layers(color(a[0]), P.inOutL({ kind: 'wipe', ms: int(a[1], 300) }, { kind: 'wipein', ms: int(a[2], 500) }, a[3] ? color(a[3]) : P.solid(P.BLACK)));
      case 'InOutHelperX': return P.layers(color(a[0]), P.inOutL({ kind: 'wipe', ms: dynMs(a[1], 300) }, { kind: 'wipein', ms: dynMs(a[2], 500) }));
      case 'Transparent': return transparent();
      case 'ColorSelect': { const f = fn(a[0]); const cols = a.slice(2).map(color); return { run(c) { f.run(c); for (const x of cols) x.run(c); }, get(led) { return cols[Math.min(cols.length - 1, Math.floor((f.get(led) * cols.length) / 32769))].get(led); } }; }
      case 'ColorChange': return color(a[1]);
      case 'Cylon': return P.layers(color(a[0]), P.alphaL(color(a[1]), P.bump(P.sinF(int(a[3], 60)), P.constInt(int(a[2], 50) * 328))));
      default:
        if (e && e.kind === 'COLOR' && e.params.length === 0 && e.doc.startsWith('rgb(')) { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(e.doc); if (m) return P.solid([Number(m[1]) * 257, Number(m[2]) * 257, Number(m[3]) * 257]); }
        skip(n);
        return a.length && kindOf(a[0]) === 'COLOR' ? color(a[0]) : WHITE;
    }
  };

  /** Scale<BladeAngle<>, TOP, BOTTOM> with the Responsive defaults when TOP/BOTTOM are left out: the simulator's hitPos. */
  const hitAt = (top: Node | undefined, bottom: Node | undefined): IntFn => (top || bottom ? scaleF(P.bladeAngle(), top, 16000, bottom, 6000) : P.hitPos());
  /** Scale<F, LO, HI> where LO and HI may themselves be functions. */
  const scaleF = (f: IntFn, lo: Node | undefined, dlo: number, hi: Node | undefined, dhi: number): IntFn => {
    const l = fn(lo, dlo); const h = fn(hi, dhi);
    return { run(c) { f.run(c); l.run(c); h.run(c); }, get: (led) => { const a = l.get(led); return a + Math.trunc((f.get(led) * (h.get(led) - a)) / 32768); } };
  };
  const mixRGB = (x: [number, number, number], y: [number, number, number], f: number): [number, number, number] => { const g = 32768 - f; return [(x[0] * g + y[0] * f) / 32768, (x[1] * g + y[1] * f) / 32768, (x[2] * g + y[2] * f) / 32768]; };
  const transparent = (): ColorFn & { layer: LayerFn } => { const l: LayerFn = { run() {}, get: () => ({ c: P.BLACK, a: 0 }) }; return Object.assign(P.solid(P.BLACK), { layer: l }); };
  const layerAsColor = (l: LayerFn): ColorFn & { layer: LayerFn } => Object.assign({ run(c: Parameters<LayerFn['run']>[0]) { l.run(c); }, get(led: number) { return l.get(led).c; } }, { layer: l });
  /** A layer: either something that carries alpha, or an opaque colour. */
  const layer = (n: Node | undefined): LayerFn => { const c = color(n) as ColorFn & { layer?: LayerFn }; return c.layer ?? P.opaque(c); };

  const fn = (n: Node | undefined, d = 0): IntFn => {
    if (!n) return P.constInt(d);
    const a = n.args;
    switch (n.name) {
      case 'Int': return P.constInt(int(a[0], d));
      case 'Sin': return a[1] || a[2] ? P.scale(P.sinF(int(a[0]?.args[0] ?? a[0], 60)), fn(a[1], 0).get(0), fn(a[2], 32768).get(0)) : P.sinF(int(a[0]?.args[0] ?? a[0], 60));
      case 'Saw': return a[1] || a[2] ? P.scale(P.saw(int(a[0]?.args[0] ?? a[0], 60)), fn(a[1], 0).get(0), fn(a[2], 32768).get(0)) : P.saw(int(a[0]?.args[0] ?? a[0], 60));
      case 'PulsingF': return P.pulsingF(int(a[0]?.args[0] ?? a[0], 1000));
      case 'Scale': return scaleF(fn(a[0]), a[1], 0, a[2], 32768);
      case 'SwingSpeed': return P.swingSpeed(int(a[0], 250));
      case 'BladeAngle': return P.bladeAngle(int(a[0], 0), int(a[1], 32768));
      case 'BladeAngleX': return P.bladeAngle(fn(a[0], 0).get(0), fn(a[1], 32768).get(0));
      case 'TwistAngle': return P.twistAngle();
      case 'NoisySoundLevel': case 'NoisySoundLevelCompat': case 'SoundLevel': case 'SmoothSoundLevel': return P.soundCompat();
      case 'BatteryLevel': return P.batteryLevel();
      case 'Bump': return P.bump(fn(a[0], 16384), fn(a[1], 10000));
      case 'SmoothStep': return P.smoothStep(fn(a[0], 16384), fn(a[1], 8000));
      case 'BrownNoiseF': return P.brownNoise(fn(a[0], 100).get(0));
      case 'SlowNoise': return P.slowNoise(fn(a[0], 2000).get(0));
      case 'RandomF': return P.randomF();
      case 'RandomPerLEDF': return P.randomPerLed();
      case 'HumpFlickerF': case 'HumpFlickerFX': return P.humpFlicker(n.name === 'HumpFlickerF' ? int(a[0], 20) : fn(a[0], 20).get(0));
      case 'SparkleF': return P.sparkleF(int(a[0], 300), int(a[1], 1024));
      case 'Ifon': { const on = fn(a[0]); const off = fn(a[1]); let isOn = false; return { run(c) { on.run(c); off.run(c); isOn = c.on; }, get: (led) => (isOn ? on.get(led) : off.get(led)) }; }
      case 'Sum': { const fs = a.map((x) => fn(x)); return { run(c) { for (const f of fs) f.run(c); }, get: (led) => fs.reduce((s, f) => s + f.get(led), 0) }; }
      case 'Mult': { const fs = a.map((x) => fn(x)); return { run(c) { for (const f of fs) f.run(c); }, get: (led) => fs.reduce((s, f) => Math.trunc((s * f.get(led)) / 32768), 32768) }; }
      case 'Subtract': { const x = fn(a[0]); const y = fn(a[1]); return { run(c) { x.run(c); y.run(c); }, get: (led) => x.get(led) - y.get(led) }; }
      case 'Percentage': { const x = fn(a[0]); const pct = int(a[1], 100); return { run(c) { x.run(c); }, get: (led) => Math.trunc((x.get(led) * pct) / 100) }; }
      case 'IsLessThan': { const x = fn(a[0]); const y = fn(a[1]); return { run(c) { x.run(c); y.run(c); }, get: (led) => (x.get(led) < y.get(led) ? 32768 : 0) }; }
      case 'IsBetween': { const x = fn(a[0]); const lo = fn(a[1]); const hi = fn(a[2]); return { run(c) { x.run(c); lo.run(c); hi.run(c); }, get: (led) => (x.get(led) >= lo.get(led) && x.get(led) <= hi.get(led) ? 32768 : 0) }; }
      case 'LayerFunctions': { const fs = a.map((x) => fn(x)); return { run(c) { for (const f of fs) f.run(c); }, get(led) { let inv = 32768; for (const f of fs) inv = Math.trunc((inv * (32768 - Math.min(32768, f.get(led)))) / 32768); return 32768 - inv; } }; }
      case 'CenterDistF': { const centre = fn(a[0], 16384); let n = 132; return { run(c) { centre.run(c); n = c.n; }, get: (led) => Math.min(32768, Math.abs(Math.trunc((led * 32768) / n) - centre.get(led)) * 2) }; }
      case 'Variation': case 'AltF': case 'SyncAltToVarianceF': return P.constInt(0);
      case 'IntArg': return P.constInt(int(a[1], 0));
      case 'WavLen': return P.constInt(1000);
      case 'ClashImpactF': case 'ClashImpactFX': return P.constInt(20000);
      default:
        if (/^-?\d+$/.test(n.name)) return P.constInt(Number(n.name));
        skip(n);
        return a.length && kindOf(a[0]) === 'FUNCTION' ? fn(a[0], d) : P.constInt(d);
    }
  };

  const tr = (n: Node | undefined, dk: 'wipe' | 'wipein' | 'fade' | 'instant' = 'instant', dms = 300): Tr => {
    if (!n) return dk === 'instant' ? { kind: 'instant' } : { kind: dk, ms: dms };
    const a = n.args;
    const ms = (i: number, d: number) => (n.name.endsWith('X') ? dynMs(a[i], d) : int(a[i], d));
    switch (n.name) {
      case 'TrInstant': return { kind: 'instant' };
      case 'TrFade': case 'TrFadeX': case 'TrSmoothFade': case 'TrSmoothFadeX': return { kind: 'fade', ms: ms(0, 300) };
      case 'TrWipe': case 'TrWipeX': return { kind: 'wipe', ms: ms(0, 300) };
      case 'TrWipeIn': case 'TrWipeInX': return { kind: 'wipein', ms: ms(0, 500) };
      case 'TrCenterWipe': case 'TrCenterWipeX': return { kind: 'center', ms: ms(0, 300) };
      case 'TrCenterWipeIn': case 'TrCenterWipeInX': return { kind: 'centerin', ms: ms(0, 500) };
      case 'TrWipeSparkTip': case 'TrWipeSparkTipX': return { kind: 'wipe', ms: ms(1, 300), spark: { color: color(a[0]), size: int(a[2], 400), center: 0 } };
      case 'TrWipeInSparkTip': case 'TrWipeInSparkTipX': return { kind: 'wipein', ms: ms(1, 500), spark: { color: color(a[0]), size: int(a[2], 400), center: 32768 } };
      case 'TrDelay': case 'TrDelayX': return { kind: 'fade', ms: ms(0, 300) };
      case 'TrConcat': return tr(a[0], dk, dms);
      case 'TrJoin': return tr(a[0], dk, dms);
      default: skip(n); return dk === 'instant' ? { kind: 'instant' } : { kind: dk, ms: dms };
    }
  };

  const dynMs = (n: Node | undefined, d: number): ((c: Parameters<IntFn['run']>[0]) => number) => { const f = fn(n, d); return (c) => { f.run(c); return f.get(0) || d; }; };
  const effectKind = (n: Node | undefined): 'clash' | 'blast' | 'stab' | null => { const s = n?.name ?? ''; return /CLASH/.test(s) ? 'clash' : /BLAST/.test(s) ? 'blast' : /STAB/.test(s) ? 'stab' : null; };
  const lockupKind = (n: Node | undefined): 'normal' | 'drag' | 'lb' => { const s = n?.name ?? ''; return /DRAG|MELT/.test(s) ? 'drag' : /LIGHTNING/.test(s) ? 'lb' : 'normal'; };

  // Build once to learn what is unsupported; the factory builds fresh state each time it is called.
  color(root);
  return { make: () => color(root), report: { unsupported: [...unsupported].sort() } };
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
