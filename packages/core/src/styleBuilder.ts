// The style editor's model: a blade look as a stack of plain-language blocks.
//
// A style is a base pattern, effect layers on top of it in order, and the way it ignites and retracts. Every block
// has a name a saber owner would use, a few knobs, and colours. Each block knows two things about itself, kept side
// by side so they cannot drift: the ProffieOS C++ it becomes (built from the same templates as the look library)
// and the simulator it runs as (built from the simulator's own primitives). Colours are standard edit-mode
// arguments, so a built look's colours can be changed live on the saber like any library look.

import { scanStyleArgs, type LookDef } from './looks';
import { prims, type ColorFn, type LayerFn, type Tr } from './sim';

export type Knob = { key: string; label: string; kind: 'number'; min: number; max: number; step: number; unit?: string; hint?: string }
  | { key: string; label: string; kind: 'color'; arg: number; hint?: string }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[]; hint?: string };

export interface BlockDef {
  kind: string;
  name: string;
  description: string;
  knobs: Knob[];
  defaults: Record<string, number | string>;
}

export interface Block { kind: string; params: Record<string, number | string> }
export interface StyleDoc {
  version: 1;
  name: string;
  base: Block;
  effects: Block[];
  ignition: Block;
  retraction: Block;
}

const hex = (v: string | number) => String(v);
const rgbOf = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h) ?? ['', 'ffffff']; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const ARG_NAMES: Record<number, string> = { 1: 'BASE_COLOR_ARG', 2: 'ALT_COLOR_ARG', 7: 'IGNITION_COLOR_ARG', 9: 'BLAST_COLOR_ARG', 10: 'CLASH_COLOR_ARG', 11: 'LOCKUP_COLOR_ARG', 13: 'DRAG_COLOR_ARG', 15: 'LB_COLOR_ARG', 16: 'STAB_COLOR_ARG', 18: 'SWING_COLOR_ARG', 20: 'EMITTER_COLOR_ARG', 28: 'RETRACTION_COLOR_ARG', 31: 'OFF_COLOR_ARG', 33: 'ALT_COLOR2_ARG', 34: 'ALT_COLOR3_ARG' };
/** RgbArg<ARG, Rgb<r,g,b>> for a colour knob. */
const rgbArg = (arg: number, h: string) => { const [r, g, b] = rgbOf(h); return `RgbArg<${ARG_NAMES[arg]}, Rgb<${r},${g},${b}>>`; };
const simArg = (arg: number, h: string) => { const [r, g, b] = rgbOf(h); return prims.rgbArg(arg, prims.rgb8(r, g, b)); };
const num = (p: Record<string, number | string>, k: string, d: number) => { const v = Number(p[k]); return Number.isFinite(v) ? v : d; };

const colour = (key: string, label: string, arg: number, hint?: string): Knob => ({ key, label, kind: 'color', arg, hint });
const number = (key: string, label: string, min: number, max: number, step: number, unit?: string, hint?: string): Knob => ({ key, label, kind: 'number', min, max, step, unit, hint });

interface BaseImpl extends BlockDef { cpp: (p: Record<string, number | string>) => string; sim: (p: Record<string, number | string>) => ColorFn }
interface LayerImpl extends BlockDef { cpp: (p: Record<string, number | string>) => string; sim: (p: Record<string, number | string>) => LayerFn }
type TimeFn = ReturnType<typeof prims.timeArg>;
interface TrImpl extends BlockDef { cpp: (p: Record<string, number | string>, timeArg: string, dir: 'in' | 'out') => string; sim: (p: Record<string, number | string>, ms: TimeFn, dir: 'in' | 'out') => Tr }

const ign = prims.timeArg(5, 300);
const ret = prims.timeArg(26, 500);

// ---------------- base patterns ----------------

export const BASES: BaseImpl[] = [
  {
    kind: 'steady', name: 'Steady', description: 'A clean, even blade in one colour.',
    knobs: [colour('base', 'Colour', 1)], defaults: { base: '#0000ff' },
    cpp: (p) => rgbArg(1, hex(p.base)), sim: (p) => simArg(1, hex(p.base)),
  },
  {
    kind: 'pulse', name: 'Pulsing', description: 'A slow swell between two colours.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Second colour', 2), number('rpm', 'Speed', 4, 90, 1, ' per min', 'Swells per minute')], defaults: { base: '#0000ff', alt: '#00ffff', rpm: 24 },
    cpp: (p) => `Mix<Sin<Int<${num(p, 'rpm', 24)}>>, ${rgbArg(1, hex(p.base))}, ${rgbArg(2, hex(p.alt))}>`,
    sim: (p) => prims.mix(prims.sinF(num(p, 'rpm', 24)), simArg(1, hex(p.base)), simArg(2, hex(p.alt))),
  },
  {
    kind: 'hum', name: 'Humming', description: 'Breathes with the sound font: dips toward the second colour as the hum rises and falls.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Quiet colour', 2)], defaults: { base: '#0000ff', alt: '#000080' },
    cpp: (p) => `AudioFlicker<${rgbArg(1, hex(p.base))}, ${rgbArg(2, hex(p.alt))}>`,
    sim: (p) => prims.layers(simArg(1, hex(p.base)), prims.alphaL(simArg(2, hex(p.alt)), prims.soundCompat())),
  },
  {
    kind: 'unstable', name: 'Unstable', description: 'Restless drifts of a hotter colour with dark sparks crawling through it.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Hot colour', 2), number('grade', 'Restlessness', 50, 1200, 10, '', 'How fast the hot patches drift'), number('depth', 'Sparks', 0, 30000, 500, '', 'How dark the sparks are')], defaults: { base: '#ff0000', alt: '#ff5000', grade: 300, depth: 14000 },
    cpp: (p) => `Layers<${rgbArg(1, hex(p.base))}, BrownNoiseFlickerL<${rgbArg(2, hex(p.alt))}, Int<${num(p, 'grade', 300)}>>, RandomPerLEDFlickerL<AlphaL<Black, Int<${num(p, 'depth', 14000)}>>>>`,
    sim: (p) => prims.layers(simArg(1, hex(p.base)), prims.alphaL(simArg(2, hex(p.alt)), prims.brownNoise(num(p, 'grade', 300))), prims.alphaL(prims.alphaL(prims.solid(prims.BLACK), prims.constInt(num(p, 'depth', 14000))), prims.randomPerLed())),
  },
  {
    kind: 'fire', name: 'Fire', description: 'Flames climbing the blade, from the colour at the root to the hot colour in the licks. The heaviest to run.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Hot colour', 2), number('speed', 'Climb', 2, 10, 1, '', 'How fast the flames rise')], defaults: { base: '#ff0000', alt: '#ffff00', speed: 6 },
    cpp: (p) => `StyleFire<${rgbArg(1, hex(p.base))}, ${rgbArg(2, hex(p.alt))}, 0, ${num(p, 'speed', 6)}, FireConfig<10,1000,2>, FireConfig<2,1000,5>, FireConfig<0,0,10>, FireConfig<0,0,10>>`,
    sim: (p) => prims.styleFire(simArg(1, hex(p.base)), simArg(2, hex(p.alt)), num(p, 'speed', 6), { base: 10, rand: 1000, cooling: 2 }, { base: 2, rand: 1000, cooling: 5 }, { base: 0, rand: 0, cooling: 10 }, { base: 0, rand: 0, cooling: 10 }),
  },
  {
    kind: 'stripes', name: 'Energy flow', description: 'Bands of light and shadow streaming along the blade.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Band colour', 2), number('width', 'Band width', 1000, 14000, 250, '', 'Wider bands, fewer of them'), number('speed', 'Flow', -5000, 5000, 100, '', 'Toward the tip when negative, toward the hilt when positive')], defaults: { base: '#0000ff', alt: '#00a0ff', width: 3500, speed: -1800 },
    cpp: (p) => `StripesX<Int<${num(p, 'width', 3500)}>, Int<${num(p, 'speed', -1800)}>, ${rgbArg(1, hex(p.base))}, Mix<Int<11000>, Black, ${rgbArg(1, hex(p.base))}>, ${rgbArg(2, hex(p.alt))}>`,
    sim: (p) => prims.stripes(num(p, 'width', 3500), num(p, 'speed', -1800), [simArg(1, hex(p.base)), prims.dim(11000, simArg(1, hex(p.base))), simArg(2, hex(p.alt))]),
  },
  {
    kind: 'gradient', name: 'Two-tone', description: 'One colour at the hilt blending to another at the tip.',
    knobs: [colour('base', 'Hilt colour', 1), colour('alt', 'Tip colour', 2)], defaults: { base: '#0000ff', alt: '#ffffff' },
    cpp: (p) => `Gradient<${rgbArg(1, hex(p.base))}, ${rgbArg(2, hex(p.alt))}>`,
    sim: (p) => prims.gradient([simArg(1, hex(p.base)), simArg(2, hex(p.alt))]),
  },
  {
    kind: 'rainbow', name: 'Rainbow', description: 'The whole spectrum rolling along the blade. No colours to set.',
    knobs: [], defaults: {},
    cpp: () => 'Rainbow', sim: () => prims.rainbow(),
  },
  {
    kind: 'lava', name: 'Lava lamp', description: 'Soft blobs of a second colour drifting up and down the blade.',
    knobs: [colour('base', 'Colour', 1), colour('alt', 'Blob colour', 2)], defaults: { base: '#ff1e00', alt: '#ffa000' },
    cpp: (p) => `Layers<${rgbArg(1, hex(p.base))}, AlphaL<${rgbArg(2, hex(p.alt))}, Bump<Scale<Sin<Int<5>>, Int<3000>, Int<29000>>, Int<18000>>>, AlphaL<${rgbArg(2, hex(p.alt))}, Bump<Scale<Sin<Int<8>>, Int<30000>, Int<6000>>, Int<12000>>>, AlphaL<${rgbArg(2, hex(p.alt))}, Bump<Scale<Sin<Int<3>>, Int<10000>, Int<24000>>, Int<9000>>>>`,
    sim: (p) => prims.layers(simArg(1, hex(p.base)), prims.alphaL(simArg(2, hex(p.alt)), prims.bump(prims.scale(prims.sinF(5), 3000, 29000), prims.constInt(18000))), prims.alphaL(simArg(2, hex(p.alt)), prims.bump(prims.scale(prims.sinF(8), 30000, 6000), prims.constInt(12000))), prims.alphaL(simArg(2, hex(p.alt)), prims.bump(prims.scale(prims.sinF(3), 10000, 24000), prims.constInt(9000)))),
  },
  {
    kind: 'horizon', name: 'Horizon', description: 'The colour follows where the blade points: one colour toward the ground, the other toward the sky.',
    knobs: [colour('base', 'Down colour', 1), colour('alt', 'Up colour', 2)], defaults: { base: '#0000ff', alt: '#ff0000' },
    cpp: (p) => `Mix<BladeAngle<>, ${rgbArg(1, hex(p.base))}, ${rgbArg(2, hex(p.alt))}>`,
    sim: (p) => prims.mix(prims.bladeAngle(), simArg(1, hex(p.base)), simArg(2, hex(p.alt))),
  },
];

// ---------------- effect layers ----------------

export const EFFECTS: LayerImpl[] = [
  {
    kind: 'blast', name: 'Blaster deflect', description: 'A ring of colour spreads from where a bolt lands and fades.',
    knobs: [colour('color', 'Colour', 9), number('fade', 'Fade', 100, 1000, 50, ' ms'), number('size', 'Ring size', 40, 300, 10, '', 'Bigger numbers make a tighter ring')], defaults: { color: '#ffffff', fade: 200, size: 100 },
    cpp: (p) => `BlastL<${rgbArg(9, hex(p.color))}, ${num(p, 'fade', 200)}, ${num(p, 'size', 100)}, 400>`,
    sim: (p) => prims.blastL(simArg(9, hex(p.color)), num(p, 'fade', 200), num(p, 'size', 100), 400),
  },
  {
    kind: 'clash', name: 'Clash', description: 'A flash where the blade is hit, placed by the tilt, fading out.',
    knobs: [colour('color', 'Colour', 10), number('fade', 'Fade', 50, 800, 25, ' ms')], defaults: { color: '#ffffff', fade: 250 },
    cpp: (p) => `ResponsiveClashL<${rgbArg(10, hex(p.color))}, TrInstant, TrFade<${num(p, 'fade', 250)}>>`,
    sim: (p) => prims.effectL('clash', { kind: 'instant' }, prims.alphaL(simArg(10, hex(p.color)), prims.bump(prims.hitPos(), prims.constInt(10000))), { kind: 'fade', ms: num(p, 'fade', 250) }),
  },
  {
    kind: 'lockup', name: 'Lockup', description: 'A held glow where the blades meet, sized by how hard you push.',
    knobs: [colour('color', 'Colour', 11), number('fade', 'Release fade', 50, 800, 25, ' ms')], defaults: { color: '#ffffff', fade: 300 },
    cpp: (p) => `ResponsiveLockupL<${rgbArg(11, hex(p.color))}, TrInstant, TrFade<${num(p, 'fade', 300)}>>`,
    sim: (p) => prims.lockupL('normal', prims.alphaL(simArg(11, hex(p.color)), prims.bump(prims.hitPos(), prims.scale(prims.swingSpeed(100), 9000, 14000))), { kind: 'instant' }, { kind: 'fade', ms: num(p, 'fade', 300) }),
  },
  {
    kind: 'drag', name: 'Drag', description: 'The tip glows while dragged along the ground.',
    knobs: [colour('color', 'Colour', 13)], defaults: { color: '#ffb43c' },
    cpp: (p) => `ResponsiveDragL<${rgbArg(13, hex(p.color))}>`,
    sim: (p) => prims.lockupL('drag', prims.alphaL(simArg(13, hex(p.color)), prims.smoothStep(prims.constInt(32000), prims.constInt(6000))), { kind: 'instant' }, { kind: 'instant' }),
  },
  {
    kind: 'lightning', name: 'Lightning block', description: 'Wandering crackles along the blade while blocking Force lightning.',
    knobs: [colour('color', 'Colour', 15)], defaults: { color: '#a0c8ff' },
    cpp: (p) => `ResponsiveLightningBlockL<${rgbArg(15, hex(p.color))}>`,
    sim: (p) => prims.lightningL(simArg(15, hex(p.color))),
  },
  {
    kind: 'stab', name: 'Stab', description: 'The tip lights when the blade is thrust, and the glow slides back.',
    knobs: [colour('color', 'Colour', 16)], defaults: { color: '#ff7800' },
    cpp: (p) => `ResponsiveStabL<${rgbArg(16, hex(p.color))}>`,
    sim: (p) => prims.effectL('stab', { kind: 'wipein', ms: 600 }, prims.alphaL(simArg(16, hex(p.color)), prims.smoothStep(prims.constInt(32000), prims.constInt(11000))), { kind: 'wipe', ms: 600 }),
  },
  {
    kind: 'swing', name: 'Swing flare', description: 'The blade washes toward a colour the harder you swing.',
    knobs: [colour('color', 'Colour', 18), number('max', 'Full at', 200, 900, 50, '°/s', 'Swing speed for the full effect'), number('amount', 'Strength', 4000, 32768, 1000, '')], defaults: { color: '#ffffff', max: 500, amount: 28000 },
    cpp: (p) => `AlphaL<${rgbArg(18, hex(p.color))}, Scale<SwingSpeed<${num(p, 'max', 500)}>, Int<0>, Int<${num(p, 'amount', 28000)}>>>`,
    sim: (p) => prims.alphaL(simArg(18, hex(p.color)), prims.scale(prims.swingSpeed(num(p, 'max', 500)), 0, num(p, 'amount', 28000))),
  },
  {
    kind: 'emitter', name: 'Emitter flare', description: 'A hot glow where the blade leaves the hilt, swelling with the sound.',
    knobs: [colour('color', 'Colour', 20), number('reach', 'Reach', 2000, 12000, 250, '', 'How far up the blade it can climb')], defaults: { color: '#ffffff', reach: 5200 },
    cpp: (p) => `AlphaL<${rgbArg(20, hex(p.color))}, SmoothStep<Scale<NoisySoundLevel, Int<1200>, Int<${num(p, 'reach', 5200)}>>, Int<-5000>>>`,
    sim: (p) => prims.alphaL(simArg(20, hex(p.color)), prims.smoothStep(prims.scale(prims.soundCompat(), 1200, num(p, 'reach', 5200)), prims.constInt(-5000))),
  },
  {
    kind: 'sparkle', name: 'Stardust', description: 'Pinpoints of colour flare up at random and melt away.',
    knobs: [colour('color', 'Colour', 33), number('chance', 'How often', 50, 1000, 25, '', 'Sparks per second, roughly, at 100 per hundred'), number('intensity', 'Brightness', 200, 4000, 100, '')], defaults: { color: '#ffffff', chance: 300, intensity: 1024 },
    cpp: (p) => `SparkleL<${rgbArg(33, hex(p.color))}, ${num(p, 'chance', 300)}, ${num(p, 'intensity', 1024)}>`,
    sim: (p) => prims.alphaL(simArg(33, hex(p.color)), prims.sparkleF(num(p, 'chance', 300), num(p, 'intensity', 1024))),
  },
  {
    kind: 'core', name: 'Core pulse', description: 'A glow in the middle that swells toward both ends and draws back.',
    knobs: [colour('color', 'Colour', 33), number('rpm', 'Speed', 4, 60, 1, ' per min')], defaults: { color: '#ffffff', rpm: 20 },
    cpp: (p) => `AlphaL<${rgbArg(33, hex(p.color))}, Bump<Int<16384>, Scale<Sin<Int<${num(p, 'rpm', 20)}>>, Int<3000>, Int<26000>>>>`,
    sim: (p) => prims.alphaL(simArg(33, hex(p.color)), prims.bump(prims.constInt(16384), prims.scale(prims.sinF(num(p, 'rpm', 20)), 3000, 26000))),
  },
  {
    kind: 'tip', name: 'Hot tip', description: 'A second colour over the last stretch of the blade.',
    knobs: [colour('color', 'Colour', 34), number('length', 'How much', 2000, 20000, 500, '', 'How far down from the tip')], defaults: { color: '#ffffff', length: 8000 },
    cpp: (p) => `AlphaL<${rgbArg(34, hex(p.color))}, SmoothStep<Int<${32768 - num(p, 'length', 8000)}>, Int<${Math.round(num(p, 'length', 8000) * 0.6)}>>>`,
    sim: (p) => prims.alphaL(simArg(34, hex(p.color)), prims.smoothStep(prims.constInt(32768 - num(p, 'length', 8000)), prims.constInt(Math.round(num(p, 'length', 8000) * 0.6)))),
  },
];

// ---------------- ignition and retraction ----------------

export const TRANSITIONS: TrImpl[] = [
  { kind: 'wipe', name: 'Wipe', description: 'Lights from the hilt to the tip; goes out from the tip back down.', knobs: [], defaults: {},
    cpp: (_p, t, dir) => (dir === 'in' ? `TrWipeX<${t}>` : `TrWipeInX<${t}>`), sim: (_p, ms, dir) => ({ kind: dir === 'in' ? 'wipe' : 'wipein', ms }) },
  { kind: 'spark', name: 'Spark tip', description: 'A wipe with a bright spark racing along the leading edge.', knobs: [colour('color', 'Spark colour', 7)], defaults: { color: '#ffffff' },
    cpp: (p, t, dir) => (dir === 'in' ? `TrWipeSparkTipX<${rgbArg(7, hex(p.color))}, ${t}>` : `TrWipeInSparkTipX<${rgbArg(28, hex(p.color))}, ${t}>`),
    sim: (p, ms, dir) => ({ kind: dir === 'in' ? 'wipe' : 'wipein', ms, spark: { color: simArg(dir === 'in' ? 7 : 28, hex(p.color)), size: 400, center: dir === 'in' ? 0 : 32768 } }) },
  { kind: 'centre', name: 'From the middle', description: 'Opens from the middle toward both ends; closes from both ends back to the middle.', knobs: [], defaults: {},
    cpp: (_p, t, dir) => (dir === 'in' ? `TrCenterWipeX<${t}>` : `TrCenterWipeInX<${t}>`), sim: (_p, ms, dir) => ({ kind: dir === 'in' ? 'center' : 'centerin', ms }) },
  { kind: 'fade', name: 'Fade', description: 'The whole blade fades up or down at once.', knobs: [], defaults: {},
    cpp: (_p, t) => `TrFadeX<${t}>`, sim: (_p, ms) => ({ kind: 'fade', ms }) },
  { kind: 'instant', name: 'Instant', description: 'On or off in one frame.', knobs: [], defaults: {},
    cpp: () => 'TrInstant', sim: () => ({ kind: 'instant' }) },
];

export const BLOCKS: Record<'base' | 'effect' | 'transition', BlockDef[]> = { base: BASES, effect: EFFECTS, transition: TRANSITIONS };

export function newBlock(def: BlockDef): Block { return { kind: def.kind, params: { ...def.defaults } }; }

/** A fresh style: a steady blue blade with the usual effects and a plain wipe. */
export function defaultStyle(name = 'My look'): StyleDoc {
  const e = (k: string) => newBlock(EFFECTS.find((x) => x.kind === k)!);
  return { version: 1, name, base: newBlock(BASES[0]), effects: [e('blast'), e('clash'), e('lockup'), e('lightning'), e('drag'), e('stab')], ignition: newBlock(TRANSITIONS[0]), retraction: newBlock(TRANSITIONS[0]) };
}

const find = <T extends BlockDef>(list: T[], kind: string): T => list.find((b) => b.kind === kind) ?? list[0];

/** The C++ alias for a style: `using <alias> = Layers<...>;`. */
export function styleToCpp(doc: StyleDoc, alias: string): string {
  const base = find(BASES, doc.base.kind).cpp(doc.base.params);
  const layers = doc.effects.map((b) => find(EFFECTS, b.kind).cpp(b.params));
  const inTr = find(TRANSITIONS, doc.ignition.kind).cpp(doc.ignition.params, 'IgnitionTime<300>', 'in');
  const outTr = find(TRANSITIONS, doc.retraction.kind).cpp(doc.retraction.params, 'RetractionTime<500>', 'out');
  const parts = [base, ...layers, `InOutTrL<${inTr}, ${outTr}>`];
  return `using ${alias} = Layers<\n  ${parts.join(',\n  ')}>;`;
}

/** The simulator for a style, as a factory the sim registry takes. */
export function styleToSim(doc: StyleDoc): () => ColorFn {
  return () => {
    const base = find(BASES, doc.base.kind).sim(doc.base.params);
    const layers = doc.effects.map((b) => find(EFFECTS, b.kind).sim(b.params));
    const inTr = find(TRANSITIONS, doc.ignition.kind).sim(doc.ignition.params, ign, 'in');
    const outTr = find(TRANSITIONS, doc.retraction.kind).sim(doc.retraction.params, ret, 'out');
    return prims.layers(base, ...layers, prims.inOutL(inTr, outTr));
  };
}

export const aliasFor = (id: string) => `Hw_${id.replace(/[^A-Za-z0-9_]/g, '_')}`;

/** A style as a look the rest of Hiltwright understands: slot code, alias define, live arguments and defaults. */
export function styleToLook(doc: StyleDoc, id: string): LookDef {
  const alias = aliasFor(id);
  const define = styleToCpp(doc, alias);
  const scanned = scanStyleArgs(define);
  const baseHex = typeof doc.base.params.base === 'string' ? doc.base.params.base : doc.base.kind === 'rainbow' ? '#ff00ff' : '#0000ff';
  const alt = typeof doc.base.params.alt === 'string' ? doc.base.params.alt : undefined;
  const summary = [find(BASES, doc.base.kind).name, ...doc.effects.map((b) => find(EFFECTS, b.kind).name.toLowerCase())].join(', ');
  return {
    id, name: doc.name, source: 'built', by: 'you', code: `StylePtr<${alias}>()`, header: null, roles: ['main', 'side'],
    args: scanned.args, defaults: scanned.defaults, preview: baseHex, ...(alt ? { preview2: alt } : {}),
    description: `Built in the style editor: ${summary}.`, define, usesFx: false, style: doc,
  };
}

export function isStyleDoc(v: unknown): v is StyleDoc {
  const d = v as StyleDoc;
  return !!d && d.version === 1 && typeof d.name === 'string' && !!d.base && Array.isArray(d.effects) && !!d.ignition && !!d.retraction;
}
