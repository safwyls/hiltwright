// A layer read as what it paints, where on the blade, and when: the card the full style editor shows instead of the
// raw template tree.
//
// The card is a view, not a copy. Reading a layer finds paths to the slots that matter (the colour, the spot's
// position, the lockup's transitions) and never rewrites anything, so a layer that is only looked at prints exactly as
// it was pasted. Editing a slot replaces that one node; switching the shape or the trigger rebuilds just the wrapper.
// Layers the card does not recognise stay trees.

import { CATALOGUE, cloneNode, defaultFor, newNode, paramFor, parseStyle, type Kind, type Node } from './styleTree';

export type Path = number[];

export const at = (n: Node | undefined, p: Path): Node | undefined => p.reduce<Node | undefined>((m, i) => m?.args[i], n);

/** A copy of `n` with the node at `p` replaced. The last step may be one past the end: that appends the argument. */
export function setAt(n: Node, p: Path, v: Node): Node {
  if (!p.length) return v;
  const [i, ...rest] = p;
  const args = n.args.slice();
  args[i] = setAt(args[i] ?? { name: '', args: [] }, rest, v);
  return { name: n.name, args };
}

const num = (v: number): Node => ({ name: String(Math.round(v)), args: [] });
const int = (v: number): Node => ({ name: 'Int', args: [num(v)] });
const isBare = (n: Node | undefined): boolean => !!n && /^-?\d+$/.test(n.name) && !n.args.length;
/** The value of `5`, `Int<5>`, or null. */
const fixedOf = (n: Node | undefined): number | null => (!n ? null : isBare(n) ? Number(n.name) : n.name === 'Int' && n.args.length === 1 && isBare(n.args[0]) ? Number(n.args[0].name) : null);

// ---------------- numbers that can follow the saber ----------------

export type SensorKey = 'angle' | 'swing' | 'twist' | 'sound' | 'battery';
export interface Sensor { name: string; lo: string; hi: string; names: string[]; make: string; rising: string }
/** What a number can follow, and how the two ends of its range read. Blade angle is 0 pointing down, full pointing up. */
export const SENSORS: Record<SensorKey, Sensor> = {
  angle: { name: 'Blade angle', lo: 'Pointing down', hi: 'Pointing up', names: ['BladeAngle', 'BladeAngleX'], make: 'BladeAngle<>', rising: 'the blade points up' },
  swing: { name: 'Swing speed', lo: 'Held still', hi: 'Fast swing', names: ['SwingSpeed', 'SwingSpeedX'], make: 'SwingSpeed<400>', rising: 'you swing faster' },
  twist: { name: 'Twist', lo: 'Untwisted', hi: 'Twisted', names: ['TwistAngle'], make: 'TwistAngle<>', rising: 'you twist the hilt' },
  sound: { name: 'Sound level', lo: 'Quiet', hi: 'Loud', names: ['NoisySoundLevel', 'SmoothSoundLevel', 'NoisySoundLevelCompat'], make: 'SmoothSoundLevel', rising: 'the sound gets louder' },
  battery: { name: 'Battery', lo: 'Empty', hi: 'Full', names: ['BatteryLevel'], make: 'BatteryLevel', rising: 'the battery charges' },
};
const sensorOf = (n: Node | undefined): SensorKey | null => (n ? (Object.keys(SENSORS) as SensorKey[]).find((k) => SENSORS[k].names.includes(n.name)) ?? null : null);

/**
 * The stretch of a sensor's own range that a following number responds over, in the sensor's units: blade angle in
 * 0 (pointing down) .. 32768 (pointing up) from BladeAngle<MIN,MAX>, swing in degrees a second from SwingSpeed<MAX>
 * (full at MAX). Below the window the number holds its first value, above it the second. Null when the sensor has no
 * window, or one written as something other than plain numbers.
 */
export type SensorWindow = [number, number];
function windowOf(n: Node): SensorWindow | null {
  const k = sensorOf(n);
  const vals = n.args.map(fixedOf);
  if (vals.some((v) => v == null)) return null;
  if (k === 'angle') return [vals[0] ?? 0, vals[1] ?? 32768];
  if (k === 'swing') return vals.length ? [0, vals[0]!] : null;
  return null;
}
/** The sensor node for a window, keeping the one it had when nothing changed. */
function sensorNode(sensor: SensorKey, window: SensorWindow | null | undefined, prev: Node | undefined): Node {
  if (prev && sensorOf(prev) === sensor) {
    const w = windowOf(prev);
    if (!window || (w && w[0] === window[0] && w[1] === window[1])) return cloneNode(prev);
  }
  if (sensor === 'angle' && window) return window[0] === 0 && window[1] === 32768 ? parseStyle('BladeAngle<>') : { name: 'BladeAngle', args: [num(window[0]), num(window[1])] };
  if (sensor === 'swing' && window) return { name: 'SwingSpeed', args: [num(window[1])] };
  return parseStyle(SENSORS[sensor].make);
}
/** The window a sensor starts with when a number first follows it. */
export const defaultWindow = (sensor: SensorKey): SensorWindow | null => windowOf(parseStyle(SENSORS[sensor].make));

/** A number slot: a fixed value, one that follows a sensor between two values (Scale<Sensor, Int<a>, Int<b>>), or anything else. */
export type NumView = { mode: 'fixed'; value: number } | { mode: 'follow'; sensor: SensorKey; from: number; to: number; window: SensorWindow | null } | { mode: 'other' };

export function numView(n: Node | undefined): NumView {
  const v = fixedOf(n);
  if (v != null) return { mode: 'fixed', value: v };
  const direct = sensorOf(n);
  if (direct) return { mode: 'follow', sensor: direct, from: 0, to: 32768, window: windowOf(n!) }; // BladeAngle<> on its own is its whole range
  if (n?.name === 'Scale' && n.args.length === 3) {
    const sensor = sensorOf(n.args[0]); const from = fixedOf(n.args[1]); const to = fixedOf(n.args[2]);
    if (sensor && from != null && to != null) return { mode: 'follow', sensor, from, to, window: windowOf(n.args[0]) };
  }
  return { mode: 'other' };
}

/** The node for a number view. Keeps the sensor node it had (SwingSpeed<100> stays SwingSpeed<100>); `bare` for INTEGER slots. */
export function numNode(v: NumView, prev: Node | undefined, bare = false): Node {
  if (v.mode === 'fixed') return bare ? num(v.value) : int(v.value);
  if (v.mode === 'follow') {
    const prevSensor = prev?.name === 'Scale' ? prev.args[0] : prev && sensorOf(prev) ? prev : undefined;
    const s = sensorNode(v.sensor, v.window, prevSensor);
    if (v.from === 0 && v.to === 32768 && prev && sensorOf(prev)) return s; // it was the sensor on its own, and still is
    return { name: 'Scale', args: [s, int(v.from), int(v.to)] };
  }
  return prev ? cloneNode(prev) : int(0);
}

// ---------------- what a plain number means ----------------

/**
 * The unit a number parameter is in, and where it is bounded: ProffieOS takes whole numbers everywhere, and the same
 * 300 is 300 ms in TrFade, a stripe width in Stripes and 1% of the blade in a Bump. `fraction` is the 0 to 32768 scale
 * functions work on (32768 is all the way); it may run past either end on purpose, so it is not clamped.
 */
export type UnitKind = 'fraction' | 'angle' | 'ms' | 'mhz' | 'promille' | 'percent' | 'rpm' | 'channel' | 'degps' | 'degps2' | 'impact' | 'count' | 'wavewidth';

/**
 * ProffieOS's wave and blast "size" is a sharpness: the wave shows while |distance| * SIZE stays under 32 of 32768, so
 * it reaches 32 / SIZE of the blade either side and a bigger SIZE is a narrower wave. As a width, in % either side:
 */
export const waveWidth = (size: number): number => (size > 0 ? Math.round(3200 / size) : 100);
/** The SIZE that gives a wave `width` % of the blade either side. */
export const waveSize = (width: number): number => Math.max(1, Math.round(3200 / Math.max(1, width)));
export interface NumberUnit { kind: UnitKind; min?: number; max?: number }

const UNIT_BY_TEMPLATE: Record<string, NumberUnit | null> = {
  'BladeAngle.MIN': { kind: 'angle' }, 'BladeAngle.MAX': { kind: 'angle' }, 'BladeAngleX.MIN': { kind: 'angle' }, 'BladeAngleX.MAX': { kind: 'angle' },
  'SwingSpeed.MAX': { kind: 'degps', min: 1 }, 'SwingSpeedX.MAX': { kind: 'degps', min: 1 },
  'SwingAcceleration.MAX': { kind: 'degps2', min: 1 }, 'SwingAccelerationX.MAX': { kind: 'degps2', min: 1 }, 'TwistAcceleration.MAX': { kind: 'degps2', min: 1 },
  'ClashImpactF.MIN': { kind: 'impact', min: 0 }, 'ClashImpactF.MAX': { kind: 'impact', min: 0 }, 'ClashImpactFX.MIN': { kind: 'impact', min: 0 }, 'ClashImpactFX.MAX': { kind: 'impact', min: 0 },
  'Rgb.R': { kind: 'channel', min: 0, max: 255 }, 'Rgb.G': { kind: 'channel', min: 0, max: 255 }, 'Rgb.B': { kind: 'channel', min: 0, max: 255 },
  'Rgb16.R': { kind: 'channel', min: 0, max: 65535 }, 'Rgb16.G': { kind: 'channel', min: 0, max: 65535 }, 'Rgb16.B': { kind: 'channel', min: 0, max: 65535 },
  'ClampF.MIN': { kind: 'fraction' }, 'ClampF.MAX': { kind: 'fraction' }, 'TrBlink.WIDTH': { kind: 'fraction' }, 'TrBlinkX.WIDTH': { kind: 'fraction' },
  // Look like fractions, are not: stripe widths and speeds, blast wave sizes, where an effect happens (-1 is nowhere).
  'StripesX.WIDTH': null, 'StripesX.SPEED': null, 'HardStripesX.WIDTH': null, 'HardStripesX.SPEED': null,
  // Named SPEED, but it is TrWaveX's WAVE_MS: how long the wave takes to cross the blade, so bigger is slower.
  'ResponsiveBlastL.SPEED': { kind: 'ms', min: 1 }, 'ResponsiveBlastWaveL.SPEED': { kind: 'ms', min: 1 },
  'TrDoEffectAlwaysX.LOCATION': null, 'TrDoEffect.LOCATION': null, 'TrDoEffectAlways.LOCATION': null,
  // Wave and blast sizes: sharpness, shown as the width they give (waveWidth).
  'ResponsiveBlastL.SIZE': { kind: 'wavewidth', min: 1 }, 'ResponsiveBlastWaveL.SIZE': { kind: 'wavewidth', min: 1 },
  'Blast.WAVE_SIZE': { kind: 'wavewidth', min: 1 }, 'BlastL.WAVE_SIZE': { kind: 'wavewidth', min: 1 }, 'BlastF.WAVE_SIZE': { kind: 'wavewidth', min: 1 },
  'TrWaveX.WAVE_SIZE': { kind: 'wavewidth', min: 1 }, 'TrSparkX.SPARK_SIZE': { kind: 'wavewidth', min: 1 },
  'TrWipeSparkTip.SIZE': null, 'TrWipeInSparkTip.SIZE': null,
};
/** What a number parameter means, or null for a plain number with no known unit. */
export function numberUnit(template: string, param: string, kind: Kind): NumberUnit | null {
  const key = `${template}.${param}`;
  if (key in UNIT_BY_TEMPLATE) return UNIT_BY_TEMPLATE[key];
  if (/MILLIHZ/i.test(param)) return { kind: 'mhz', min: 0 };
  if (/MILLIS|(^|_)MS$|^FADE$|^DELAY$/i.test(param)) return { kind: 'ms', min: 0 };
  if (/PROMILLE/i.test(param)) return { kind: 'promille', min: 0, max: 1000 };
  if (/PERCENT/i.test(param)) return { kind: 'percent', min: 0, max: 100 };
  if (/rpm/i.test(param)) return { kind: 'rpm', min: 0 };
  if (/^(N|I|INCREMENT|bits)$/.test(param)) return { kind: 'count', min: 0 };
  if (/^(CONDITION|SPEED|PULSE|RESET_PULSE|WAVNUM|SELECTION|ALLOW_DISABLE)$/i.test(param)) return null;
  if (kind === 'FUNCTION' || /^POSITION$/.test(param)) return { kind: 'fraction' };
  return null;
}

// ---------------- colours ----------------

const hex2 = (x: number): string => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
/** The hex of a plain colour (Rgb<r,g,b> or a named colour like White), or null. */
export function colourHex(n: Node | undefined): string | null {
  if (!n) return null;
  if (n.name === 'Rgb' && n.args.length === 3 && n.args.every(isBare)) return '#' + n.args.map((a) => hex2(Number(a.name))).join('');
  const e = CATALOGUE[n.name];
  if (e && e.kind === 'COLOR' && !e.params.length && !n.args.length) { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(e.doc); if (m) return '#' + m.slice(1, 4).map((x) => hex2(Number(x))).join(''); }
  return null;
}
const rgb = (hex: string): Node => { const v = parseInt(hex.slice(1), 16); return { name: 'Rgb', args: [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(num) }; };

/** A colour slot that is one plain colour, possibly wrapped as a live setting (RgbArg<LOCKUP_COLOR_ARG, White>). */
export interface ColourView { hex: string; arg: string | null }
export function colourView(n: Node | undefined): ColourView | null {
  if (n?.name === 'RgbArg' && n.args.length === 2) { const hex = colourHex(n.args[1]); return hex ? { hex, arg: n.args[0].name } : null; }
  const hex = colourHex(n);
  return hex ? { hex, arg: null } : null;
}
/** The node for a colour view. A named colour stays named while its value is unchanged. */
export function colourNode(v: ColourView, prev: Node | undefined): Node {
  const inner = prev?.name === 'RgbArg' ? prev.args[1] : prev;
  const leaf = inner && colourHex(inner) === v.hex ? cloneNode(inner) : rgb(v.hex);
  return v.arg ? { name: 'RgbArg', args: [{ name: v.arg, args: [] }, leaf] } : leaf;
}

// ---------------- transitions ----------------

/** The transitions the card offers by name. Each takes a time; the X forms take it as a function. */
export const TR_CHOICES: [string, string][] = [
  ['TrInstant', 'Instant'], ['TrFade', 'Fade'], ['TrSmoothFade', 'Smooth fade'], ['TrWipe', 'Wipe, hilt to tip'], ['TrWipeIn', 'Wipe, tip to hilt'],
  ['TrCenterWipe', 'Wipe out from the middle'], ['TrCenterWipeIn', 'Wipe in to the middle'],
];
const LIVE_TIME: Record<string, 'ignition' | 'retraction'> = { IgnitionTime: 'ignition', RetractionTime: 'retraction' };

/** A transition that is one of TR_CHOICES with a plain time, or a live ignition/retraction time (TrWipeX<IgnitionTime<300>>). */
export interface TrView { base: string; ms: number | null; live: 'ignition' | 'retraction' | null; x: boolean }
export function trView(n: Node | undefined): TrView | null {
  if (!n) return null;
  if (n.name === 'TrInstant' && !n.args.length) return { base: 'TrInstant', ms: null, live: null, x: false };
  const x = /X$/.test(n.name); const base = x ? n.name.slice(0, -1) : n.name;
  if (!TR_CHOICES.some(([t]) => t === base) || n.args.length !== 1) return null;
  const a = n.args[0];
  if (!x) return isBare(a) ? { base, ms: Number(a.name), live: null, x } : null;
  const f = fixedOf(a);
  if (f != null && !isBare(a)) return { base, ms: f, live: null, x };
  const live = LIVE_TIME[a.name];
  if (live && a.args.length <= 1 && (!a.args.length || isBare(a.args[0]))) return { base, ms: a.args.length ? Number(a.args[0].name) : Number(CATALOGUE[a.name]?.params[0]?.default ?? 0), live, x };
  return null;
}
/** The node for a transition, keeping the form it had: plain, X with Int<>, or X with the live time. */
export function trNode(v: TrView, prev: TrView | null): Node {
  if (v.base === 'TrInstant') return { name: 'TrInstant', args: [] };
  const ms = Math.max(0, Math.round(v.ms ?? 300));
  const hasX = !!CATALOGUE[v.base + 'X'];
  if (prev?.live && hasX) return { name: v.base + 'X', args: [{ name: prev.live === 'ignition' ? 'IgnitionTime' : 'RetractionTime', args: [num(ms)] }] };
  if (prev?.x && hasX) return { name: v.base + 'X', args: [int(ms)] };
  return { name: v.base, args: [num(ms)] };
}

// ---------------- effects and lockups ----------------

export const EFFECT_VALUES = 'CLASH BLAST FORCE STAB BOOT LOCKUP_BEGIN LOCKUP_END DRAG_BEGIN DRAG_END PREON POSTOFF IGNITION RETRACTION CHANGE NEWFONT BLADEIN BLADEOUT LOW_BATTERY POWERSAVE BATTERY_LEVEL VOLUME_LEVEL ACCENT_SWING ACCENT_SLASH SPIN ON FAST_ON QUOTE SECONDARY_IGNITION SECONDARY_RETRACTION OFF FAST_OFF OFF_CLASH NEXT_QUOTE INTERACTIVE_PREON INTERACTIVE_BLAST TRACK BEGIN_BATTLE_MODE END_BATTLE_MODE BEGIN_AUTO_BLAST END_AUTO_BLAST ALT_SOUND TRANSITION_SOUND SOUND_LOOP STUN FIRE CLIP_IN CLIP_OUT RELOAD MODE RANGE EMPTY FULL JAM UNJAM PLI_ON PLI_OFF DESTRUCT BOOM USER1 USER2 USER3 USER4 USER5 USER6 USER7 USER8'.split(' ').map((e) => `EFFECT_${e}`);
export const LOCKUP_VALUES = ['NORMAL', 'DRAG', 'MELT', 'LIGHTNING_BLOCK', 'ARMED', 'AUTOFIRE'].map((l) => `SaberBase::LOCKUP_${l}`);

/** What the preview should do to show a layer off: raise an effect, or hold a lockup for a moment. */
export interface Cue {
  effect?: string; lockup?: 'normal' | 'drag' | 'melt' | 'lb';
  /** Hold the saber this way: tilt in degrees from level (-90 pointing down), swing in degrees a second, twist in degrees. */
  pose?: Pose;
  /** Keep the effect showing for a moment, as while a Where control is being dragged. */
  hold?: boolean;
}
export interface Pose { tilt?: number; swing?: number; twist?: number }
const LOCKUP_CUE: Record<string, Cue['lockup']> = { NORMAL: 'normal', DRAG: 'drag', MELT: 'melt', LIGHTNING_BLOCK: 'lb' };
const cueFor = (enumName: string | undefined): Cue | null => {
  if (!enumName) return null;
  const m = /LOCKUP_([A-Z_]+)$/.exec(enumName);
  if (m && !/^(BEGIN|END)$/.test(m[1])) return LOCKUP_CUE[m[1]] ? { lockup: LOCKUP_CUE[m[1]] } : null;
  return /^(SaberBase::)?EFFECT_/.test(enumName) ? { effect: enumName.replace(/^SaberBase::/, '') } : null;
};

// ---------------- reading a layer ----------------

export type Shape = 'whole' | 'spot' | 'hilt' | 'tip' | 'custom';
export type Where =
  | { shape: 'whole'; strength?: Path } // AlphaL<C, number> is the whole blade, see-through
  | { shape: 'spot'; pos: Path; size: Path }
  | { shape: 'hilt' | 'tip'; pos: Path; soft: Path }
  | { shape: 'custom'; mask: Path };
export type WhenType = 'always' | 'effect' | 'lockup';
export type When = { type: 'always' } | { type: 'effect'; effect: Path; inTr: Path; outTr: Path } | { type: 'lockup'; lockup: Path; inTr: Path; outTr: Path };

export type Role = 'what' | 'where' | 'when' | 'tuning';
export interface Slot { i: number; path: Path; param: string; label: string; kind: Kind; def: string | null; doc: string; role: Role; blade: boolean; present: boolean; /** One of a variadic tail: can be removed. */ extra: boolean }

/**
 * Two of a template's parameters that are the ends of one sensor reading in its definition: ResponsiveDragL's SIZE1
 * and SIZE2 are Scale<TwistAngle<>, SIZE1, SIZE2>. The card shows them as one reacting number. A `curve` is the nested
 * case, ResponsiveClashL's Scale<BladeAngle<>, TOP, BOTTOM> where TOP itself follows the blade angle: shown as where
 * the effect lands at three tilts.
 */
export interface Pair { a: number; b: number; sensor: SensorKey; window: SensorWindow | null; label: string; role: Role; shape: 'pair' | 'curve' }

export type LayerCard =
  /** Built from a trigger, a shape and a colour: every slot is laid out as What / Where / When. */
  | { form: 'composed'; body: Path; colour: Path; where: Where; when: When }
  /** One catalogue template, its parameters sorted into What / Where / When / tuning. */
  | { form: 'template'; template: string; slots: Slot[]; when: string; pairs: Pair[] }
  /** Anything else: edited as a tree. */
  | { form: 'tree' };


function readBody(n: Node, p: Path): { colour: Path; where: Where } {
  if (n.name === 'AlphaL' && n.args.length >= 2) {
    const mask = n.args[1];
    if (mask.name === 'Bump' && mask.args.length >= 1) return { colour: [...p, 0], where: { shape: 'spot', pos: [...p, 1, 0], size: [...p, 1, 1] } };
    // SmoothStep's width says which way it faces by its sign; a width that reacts must keep one sign at both ends.
    const wv = numView(mask.args[1]);
    const w = wv.mode === 'fixed' ? wv.value : wv.mode === 'follow' && Math.sign(wv.from) === Math.sign(wv.to) ? wv.from : 0;
    if (mask.name === 'SmoothStep' && mask.args.length === 2 && w) return { colour: [...p, 0], where: { shape: w > 0 ? 'tip' : 'hilt', pos: [...p, 1, 0], soft: [...p, 1, 1] } };
    if (numView(mask).mode !== 'other') return { colour: [...p, 0], where: { shape: 'whole', strength: [...p, 1] } };
    return { colour: [...p, 0], where: { shape: 'custom', mask: [...p, 1] } };
  }
  return { colour: p, where: { shape: 'whole' } };
}

/** Read a layer (one argument of Layers<> after the base) as a card. */
export function readLayer(n: Node): LayerCard {
  let when: When = { type: 'always' }; let body: Path = [];
  if (n.name === 'LockupTrL' && n.args.length >= 4 && /LOCKUP_/.test(n.args[3].name)) { when = { type: 'lockup', inTr: [1], outTr: [2], lockup: [3] }; body = [0]; }
  else if (n.name === 'TransitionEffectL' && n.args.length === 2 && n.args[0].name === 'TrConcat' && n.args[0].args.length === 3 && /EFFECT_/.test(n.args[1].name)) { when = { type: 'effect', inTr: [0, 0], outTr: [0, 2], effect: [1] }; body = [0, 1]; }
  const b = at(n, body)!;
  const { colour, where } = readBody(b, body);
  if (when.type !== 'always' || b.name === 'AlphaL' || colourView(b)) return { form: 'composed', body, colour, where, when };
  return readTemplate(n);
}

/** Read the base (the first argument of Layers<>): a plain colour, a template like AudioFlicker, or a tree. */
export function readBase(n: Node): LayerCard {
  if (colourView(n)) return { form: 'composed', body: [], colour: [], where: { shape: 'whole' }, when: { type: 'always' } };
  return readTemplate(n);
}

// Parameter names the card files under Where, and clearer words for the common effect layers' parameters.
const WHERE_PARAM = /^(TOP|BOTTOM|SIZE\d?|LOCATION|POS(ITION)?|BUMP_.*|WIDTH|HUMP_.*|START|END)$/i;
const BLADE_PARAM = /^(TOP|BOTTOM|SIZE\d?|LOCATION|POS(ITION)?|BUMP_.*|HUMP_WIDTH|START|END|ALPHA)$/i;
const PARAM_LABELS: Record<string, string> = {
  COLOR: 'Colour', TR1: 'Comes in', TR2: 'Goes out', BeginTr: 'Comes in', EndTr: 'Goes out', OutTr: 'Ignition', InTr: 'Retraction', OFF: 'When off', ALLOW_DISABLE: 'Power down when retracted',
  TOP: 'Position, pointing down', BOTTOM: 'Position, pointing up', SIZE: 'Size', CONDITION: 'Only while (1 is always)', EFFECT: 'Effect', LOCKUP_TYPE: 'Lockup', A: 'First colour', B: 'Second colour',
  'Mix.F': 'Mix by', 'Mix.B': 'Colour', 'StripesX.COLORS': 'Colour', 'Stripes.COLORS': 'Colour', 'StripesX.WIDTH': 'Stripe width', 'Gradient.COLORS': 'Colour', 'AudioFlicker.A': 'Quiet', 'AudioFlicker.B': 'Loud', 'ResponsiveDragL.SIZE1': 'Size, untwisted', 'ResponsiveDragL.SIZE2': 'Size, twisted', 'ResponsiveMeltL.SIZE1': 'Size, untwisted', 'ResponsiveMeltL.SIZE2': 'Size, twisted',
  'ResponsiveBlastL.SIZE': 'Wave width', 'ResponsiveBlastWaveL.SIZE': 'Wave width', 'ResponsiveBlastL.SPEED': 'Wave travel time', 'ResponsiveBlastWaveL.SPEED': 'Wave travel time', 'ResponsiveBlastL.FADE': 'Fade out', 'ResponsiveBlastWaveL.FADE': 'Fade out', WAVE_SIZE: 'Wave width', SPARK_SIZE: 'Spark width',
  'ResponsiveStabL.SIZE1': 'Size, pointing down', 'ResponsiveStabL.SIZE2': 'Size, pointing up', LOCATION: 'Reaches to', FADE: 'Fade (ms)', SPEED: 'Speed', FADEOUT_MS: 'Fade out (ms)', WAVE_MS: 'Wave time (ms)',
  COLOR1: 'First colour', COLOR2: 'Second colour', PULSE_MILLIS: 'Pulse (ms)', BLAST: 'Colour', LOCKUP: 'Colour', CLASH_COLOR: 'Colour', CLASH_MILLIS: 'Flash (ms)', CLASH_WIDTH_PERCENT: 'Width (%)',
};
export const paramLabel = (template: string, param: string): string =>
  PARAM_LABELS[`${template}.${param}`] ?? PARAM_LABELS[param] ?? param.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
// What a parameter does, where the label alone cannot say it (the catalogue's own docs are mostly empty).
const PARAM_DOCS: Record<string, string> = {
  // inout_helper.h: with ALLOW_DISABLE, an off, dark blade reports OPAQUE_BLACK_UNTIL_IGNITION and the saber cuts its power.
  ALLOW_DISABLE: 'Saves battery: once the blade has retracted and its "When off" colour is black, the saber cuts power to its LEDs until the next ignition.',
};

/** Plain words for when a template's effect shows. */
export function templateWhen(template: string, effect?: string): string {
  if (effect) return `On each ${effect.replace(/^(SaberBase::)?EFFECT_/, '').replace(/_/g, ' ').toLowerCase()}`;
  if (/InOut/.test(template)) return 'Ignition and retraction';
  if (/TransitionPulse/.test(template)) return 'Each time its pulse fires';
  if (/LightningBlock/.test(template)) return 'During a lightning block';
  if (/Drag/.test(template)) return 'During a drag';
  if (/Melt/.test(template)) return 'During a melt';
  if (/Lockup/.test(template)) return 'During a lockup';
  if (/Clash/.test(template)) return 'On each clash';
  if (/Stab/.test(template)) return 'On each stab';
  if (/Blast/.test(template)) return 'On each blast';
  return 'Always';
}

function readTemplate(n: Node): LayerCard {
  const e = CATALOGUE[n.name];
  if (!e || e.kind !== 'COLOR' || n.name === 'Layers' || n.name === 'TrConcat') return { form: 'tree' };
  const slots: Slot[] = [];
  const fixed = e.variadic ? e.params.length - 1 : e.params.length;
  const count = Math.max(e.variadic ? Math.max(fixed + 1, n.args.length) : fixed, n.args.length);
  for (let i = 0; i < count; i++) {
    const p = paramFor(e, i);
    if (!p) return { form: 'tree' }; // more arguments than the template takes: leave it as written
    const role: Role = p.kind === 'COLOR' ? 'what' : p.kind === 'TRANSITION' || p.kind === 'EFFECT' || p.kind === 'LOCKUP_TYPE' ? 'when' : WHERE_PARAM.test(p.name) ? 'where' : 'tuning';
    slots.push({ i, path: [i], param: p.name, label: paramLabel(n.name, p.name), kind: p.kind, def: p.default, doc: PARAM_DOCS[`${n.name}.${p.name}`] ?? PARAM_DOCS[p.name] ?? p.doc, role, blade: BLADE_PARAM.test(p.name), present: i < n.args.length, extra: e.variadic && i >= fixed && n.args.length > fixed + 1 });
  }
  const effectSlot = slots.find((s) => s.kind === 'EFFECT');
  return { form: 'template', template: n.name, slots, when: templateWhen(n.name, effectSlot ? (n.args[effectSlot.i]?.name ?? effectSlot.def ?? undefined) : undefined), pairs: readPairs(n, slots) };
}

// ---------------- paired parameters ----------------

const aliasPairCache = new Map<string, { a: number; b: number; sensor: SensorKey; window: SensorWindow | null }[]>();
/** Where a template's definition feeds two of its parameters to Scale<Sensor, P, Q>. */
function aliasPairs(template: string): { a: number; b: number; sensor: SensorKey; window: SensorWindow | null }[] {
  const hit = aliasPairCache.get(template); if (hit) return hit;
  const e = CATALOGUE[template]; const out: { a: number; b: number; sensor: SensorKey; window: SensorWindow | null }[] = [];
  let body: Node | null = null;
  try { body = e?.alias ? parseStyle(e.alias) : null; } catch { body = null; }
  const index = (n: Node): number => (n.args.length ? -1 : e.params.findIndex((p) => p.name === n.name));
  const walk = (n: Node) => {
    if (n.name === 'Scale' && n.args.length === 3) {
      const sensor = sensorOf(n.args[0]); const a = index(n.args[1]); const b = index(n.args[2]);
      if (sensor && a >= 0 && b >= 0 && a !== b && !out.some((x) => x.a === a || x.b === b)) out.push({ a, b, sensor, window: windowOf(n.args[0]) });
    }
    n.args.forEach(walk);
  };
  if (body) walk(body);
  aliasPairCache.set(template, out);
  return out;
}
/** A parameter's value as written, or its default when left out. */
export const paramValue = (n: Node, i: number): Node | undefined => {
  if (n.args[i]) return n.args[i];
  const d = CATALOGUE[n.name] && paramFor(CATALOGUE[n.name], i)?.default;
  try { return d ? parseStyle(d) : undefined; } catch { return undefined; }
};
function pairLabel(template: string, a: string, b: string, curve: boolean): string {
  if (curve) return 'Where it lands';
  if (/^TOP$/.test(a) && /^BOTTOM$/.test(b)) return 'Position';
  const [la, lb] = [paramLabel(template, a), paramLabel(template, b)];
  const common = la.split(',')[0];
  return common === lb.split(',')[0] ? common : `${la} / ${lb}`;
}
function readPairs(n: Node, slots: Slot[]): Pair[] {
  const out: Pair[] = [];
  for (const p of aliasPairs(n.name)) {
    const sa = slots[p.a]; const sb = slots[p.b];
    if (!sa || !sb) continue;
    const va = numView(paramValue(n, p.a)); const vb = numView(paramValue(n, p.b));
    let shape: Pair['shape'] | null = null;
    if (va.mode === 'fixed' && vb.mode === 'fixed') shape = 'pair';
    else if (curveFits(p, va, vb)) shape = 'curve';
    if (shape) out.push({ ...p, label: pairLabel(n.name, sa.param, sb.param, shape === 'curve'), role: sa.role, shape });
  }
  return out;
}

/** The ends of a pair as they stand. */
export function pairEnds(n: Node, p: Pair): { from: number; to: number } {
  const a = numView(paramValue(n, p.a)); const b = numView(paramValue(n, p.b));
  return { from: a.mode === 'fixed' ? a.value : 0, to: b.mode === 'fixed' ? b.value : 0 };
}
/** Set argument `i`, filling any defaulted arguments before it so the positions stay right. */
export function setParam(n: Node, i: number, v: Node): Node {
  const e = CATALOGUE[n.name];
  const c = cloneNode(n);
  while (c.args.length < i) { const p = e && paramFor(e, c.args.length); c.args.push(defaultFor(p?.kind ?? 'FUNCTION', p?.default)); }
  c.args[i] = v;
  return c;
}
export const setPairEnds = (n: Node, p: Pair, from: number, to: number): Node => setParam(setParam(n, p.a, int(from)), p.b, int(to));

// ---- the nested case: where it lands at three tilts ----

/** Blade angle, 0 pointing down to 1 pointing up, through a BladeAngle<MIN,MAX> window: 0..1 across the window, held outside it. */
const through = (a: number, w: SensorWindow | null): number => { const [lo, hi] = w ?? [0, FULL]; return hi <= lo ? (a * FULL >= hi ? 1 : 0) : Math.max(0, Math.min(1, (a * FULL - lo) / (hi - lo))); };
const FULL = 32768;
function curveFits(p: { sensor: SensorKey; window: SensorWindow | null }, va: NumView, vb: NumView): boolean {
  const outerWhole = !p.window || (p.window[0] === 0 && p.window[1] === FULL);
  return p.sensor === 'angle' && outerWhole && va.mode === 'follow' && va.sensor === 'angle' && !!va.window && va.window[0] >= 0 && vb.mode === 'fixed' && through(0.5, va.window) > 0;
}
/** Where a curve pair puts the effect at tilt `a` (0 pointing down, 1 pointing up), in blade units. */
export function curveAt(n: Node, p: Pair, a: number): number {
  const top = numView(paramValue(n, p.a)); const bottom = numView(paramValue(n, p.b));
  if (top.mode !== 'follow' || bottom.mode !== 'fixed') return 0;
  const t = top.from + (top.to - top.from) * through(a, top.window);
  return t + (bottom.value - t) * through(a, p.window);
}
/** The three checkpoints of a curve pair: pointing down, level, pointing up. */
export const curvePoints = (n: Node, p: Pair): { down: number; level: number; up: number } => ({ down: Math.round(curveAt(n, p, 0)), level: Math.round(curveAt(n, p, 0.5)), up: Math.round(curveAt(n, p, 1)) });
/**
 * Set a curve pair from its three checkpoints. Pointing up is the second parameter; pointing down and level fix the
 * first one's two ends (it keeps its own tilt window), so the checkpoints read back exactly as they were set.
 */
export function setCurvePoints(n: Node, p: Pair, pts: { down: number; level: number; up: number }): Node {
  const topNode = paramValue(n, p.a); const top = numView(topNode);
  if (top.mode !== 'follow') return n;
  const clamp = (v: number) => Math.round(v); // the hidden in-between value may run past the tip: only where it lands must stay on the blade
  const t0 = through(0, top.window); const t5 = through(0.5, top.window); const s5 = through(0.5, p.window);
  const topLevel = s5 < 1 ? (pts.level - pts.up * s5) / (1 - s5) : pts.level; // where TOP must be at level for the effect to land at pts.level
  // TOP(a) = from + (to - from) * through(a): solve from pointing down (through 0 is 0 unless the window starts above it) and level.
  const to = t5 === t0 ? topLevel : clamp(pts.down + (topLevel - pts.down) / (t5 - t0) * (1 - t0));
  const from = t0 >= 1 ? pts.down : clamp((pts.down - to * t0) / (1 - t0));
  return setParam(setParam(n, p.a, numNode({ ...top, from, to }, topNode)), p.b, int(pts.up));
}

// ---- unpacking a template, to change what a pair reacts to ----

/**
 * A template written out as its definition with the arguments put in: ResponsiveClashL<White> becomes
 * TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Scale<BladeAngle<>,...>,Int<10000>>>,TrFade<200>>,EFFECT_CLASH>.
 * The same C++ once compiled, but every part of it is now open to edit. `mark` is filled with the path each parameter
 * landed at, for the first place it appears. Null when the template has no definition to unpack.
 */
export function unpackTemplate(n: Node, mark?: Map<string, Path>): Node | null {
  const e = CATALOGUE[n.name];
  if (!e?.alias || e.variadic) return null;
  let body: Node;
  try { body = parseStyle(e.alias); } catch { return null; }
  const put = (m: Node, path: Path): Node => {
    const i = m.args.length ? -1 : e.params.findIndex((p) => p.name === m.name);
    if (i >= 0) {
      const v = paramValue(n, i);
      if (!v) throw new Error(`no value for ${m.name}`);
      if (mark && !mark.has(m.name)) mark.set(m.name, path);
      return cloneNode(v);
    }
    return { name: m.name, args: m.args.map((a, k) => put(a, [...path, k])) };
  };
  try { return put(body, []); } catch { return null; }
}

/**
 * Make a pair react to another sensor. The template fixes the sensor in its definition, so it is unpacked first; the
 * pair's Scale then becomes Scale<new sensor, from, to>, starting from the values it had at its two ends.
 */
export function unlockPair(n: Node, p: Pair, sensor: SensorKey): Node | null {
  const e = CATALOGUE[n.name];
  const marks = new Map<string, Path>();
  const open = unpackTemplate(n, marks);
  const at_ = marks.get(e.params[p.a].name);
  if (!open || !at_ || at_.length === 0) return null;
  const scalePath = at_.slice(0, -1); // the parameter sat at Scale<Sensor, P, Q>'s second argument
  const ends = p.shape === 'curve' ? (() => { const c = curvePoints(n, p); return { from: c.down, to: c.up }; })() : pairEnds(n, p);
  return setAt(open, scalePath, numNode({ mode: 'follow', sensor, from: ends.from, to: ends.to, window: defaultWindow(sensor) }, undefined));
}

// ---------------- changing the shape or the trigger ----------------

const bodyOf = (layer: Node, card: Extract<LayerCard, { form: 'composed' }>): Node => cloneNode(at(layer, card.body)!);

/** The layer with its body given a new shape. The colour, and a position that still fits, carry over. */
export function setShape(layer: Node, card: Extract<LayerCard, { form: 'composed' }>, shape: Exclude<Shape, 'custom'>): Node {
  const colour = cloneNode(at(layer, card.colour)!);
  const w = card.where;
  const pos = w.shape === 'spot' || w.shape === 'hilt' || w.shape === 'tip' ? cloneNode(at(layer, w.pos)!) : null;
  // A bare colour is only right as the base, or inside a transition or lockup; on its own in the stack it does not compile.
  const body: Node =
    shape === 'whole' ? (card.when.type === 'always' ? { name: 'AlphaL', args: [colour, int(FULL)] } : colour)
    : shape === 'spot' ? { name: 'AlphaL', args: [colour, { name: 'Bump', args: [pos ?? int(16384), int(8000)] }] }
    : { name: 'AlphaL', args: [colour, { name: 'SmoothStep', args: [pos ?? int(shape === 'tip' ? 26000 : 6000), int(shape === 'tip' ? 2000 : -2000)] }] };
  return setAt(layer, card.body, body);
}

/** The layer shown whole-blade but see-through: wraps a bare colour as AlphaL<C, strength> the first time. */
export function setStrength(layer: Node, card: Extract<LayerCard, { form: 'composed' }>, strength: Node): Node {
  if (card.where.shape === 'whole' && card.where.strength) return setAt(layer, card.where.strength, strength);
  return setAt(layer, card.body, { name: 'AlphaL', args: [bodyOf(layer, card), strength] });
}

/** The layer with a new trigger: always on, on an effect, or during a lockup. Transitions carry over. */
export function setWhen(layer: Node, card: Extract<LayerCard, { form: 'composed' }>, type: WhenType): Node {
  const body = bodyOf(layer, card);
  const w = card.when;
  const inTr = w.type !== 'always' ? cloneNode(at(layer, w.inTr)!) : { name: 'TrInstant', args: [] };
  const outTr = w.type !== 'always' ? cloneNode(at(layer, w.outTr)!) : { name: 'TrFade', args: [num(300)] };
  if (type === 'always') return colourView(body) ? { name: 'AlphaL', args: [body, int(FULL)] } : body; // see setShape: a bare colour cannot stand alone in the stack
  if (type === 'lockup') return { name: 'LockupTrL', args: [body, inTr, outTr, { name: w.type === 'lockup' ? at(layer, w.lockup)!.name : 'SaberBase::LOCKUP_NORMAL', args: [] }] };
  return { name: 'TransitionEffectL', args: [{ name: 'TrConcat', args: [inTr, body, outTr] }, { name: w.type === 'effect' ? at(layer, w.effect)!.name : 'EFFECT_BLAST', args: [] }] };
}

// ---------------- words ----------------

const enumWord = (v: string): string => v.replace(/^(SaberBase::)?(EFFECT_|LOCKUP_)/, '').replace(/_/g, ' ').toLowerCase();
const pctOf = (v: number): number => Math.round((v / 32768) * 100);

/** A sentence part: plain text, or a value the sentence should make stand out. */
export type Words = (string | { b: string })[];

function movement(n: Node | undefined, what: 'pos' | 'size', shape: Shape): string {
  const v = numView(n);
  if (v.mode !== 'follow') return '';
  const s = SENSORS[v.sensor];
  if (what === 'pos') {
    if (v.sensor === 'angle' && shape === 'spot' && v.from > v.to) return ' It runs toward whichever end of the blade is lower.';
    return ` It moves toward the ${v.to > v.from ? 'tip' : 'hilt'} as ${s.rising}.`;
  }
  return ` It gets ${v.to > v.from ? (shape === 'whole' ? 'stronger' : 'bigger') : shape === 'whole' ? 'fainter' : 'smaller'} as ${s.rising}.`;
}

/** What a composed layer does, in a sentence or two. `colourName` names a plain colour (White) or null for a pattern. */
export function describeComposed(layer: Node, card: Extract<LayerCard, { form: 'composed' }>, colourName: (hex: string) => string): Words {
  const cv = colourView(at(layer, card.colour));
  const col = cv ? colourName(cv.hex).toLowerCase() : 'a pattern';
  const w = card.where; const t = card.when;
  const trig: Words = t.type === 'lockup' ? [' while you hold a ', { b: `${enumWord(at(layer, t.lockup)!.name)} lockup` }] : t.type === 'effect' ? [' on each ', { b: enumWord(at(layer, t.effect)!.name) }] : [];
  const reach = (p: Path): string => { const v = numView(at(layer, p)); return v.mode === 'fixed' ? `${pctOf(v.value)}% of the way up` : 'a point that moves'; };
  let lead: Words;
  if (w.shape === 'whole') lead = [t.type === 'always' ? 'Paints the whole blade ' : 'The whole blade turns ', { b: col }];
  else if (w.shape === 'spot') lead = ['Paints a ', { b: col }, ' spot'];
  else if (w.shape === 'tip') lead = ['Paints ', { b: col }, ` from the tip down to ${reach(w.pos)}`];
  else if (w.shape === 'hilt') lead = ['Paints ', { b: col }, ` from the hilt up to ${reach(w.pos)}`];
  else lead = ['Paints ', { b: col }, ' in a shape of its own'];
  const moves = w.shape === 'spot' ? movement(at(layer, w.pos), 'pos', 'spot') + movement(at(layer, w.size), 'size', 'spot')
    : w.shape === 'whole' && w.strength ? movement(at(layer, w.strength), 'size', 'whole')
    : w.shape === 'hilt' || w.shape === 'tip' ? movement(at(layer, w.pos), 'pos', w.shape) : '';
  return [...lead, ...trig, '.', moves];
}

/** A default name for a composed layer: Lockup spot, Clash flash, Tip glow. */
export function composedName(layer: Node, card: Extract<LayerCard, { form: 'composed' }>): string {
  const t = card.when; const s = card.where.shape;
  const noun = s === 'spot' ? 'spot' : s === 'tip' ? 'tip' : s === 'hilt' ? 'glow at the hilt' : s === 'custom' ? 'shape' : t.type === 'always' ? 'colour' : 'flash';
  const lead = t.type === 'lockup' ? enumWord(at(layer, t.lockup)!.name).replace(/^normal$/, 'lockup') : t.type === 'effect' ? enumWord(at(layer, t.effect)!.name) : s === 'tip' ? 'glowing' : '';
  const name = `${lead} ${noun}`.trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** What the preview should do to show this layer off, or null for a layer that is always on. */
export function layerCue(layer: Node, card: LayerCard): Cue | null {
  if (card.form === 'composed') {
    const t = card.when;
    return t.type === 'lockup' ? cueFor(at(layer, t.lockup)?.name) : t.type === 'effect' ? cueFor(at(layer, t.effect)?.name) : null;
  }
  if (card.form === 'template') {
    const eff = card.slots.find((s) => s.kind === 'EFFECT' || s.kind === 'LOCKUP_TYPE');
    if (eff) return cueFor(layer.args[eff.i]?.name ?? eff.def ?? undefined);
    // The effect layers name their trigger: ResponsiveClashL is a clash, ResponsiveDragL a drag lockup.
    const t = card.template;
    if (/LightningBlock/.test(t)) return { lockup: 'lb' };
    if (/Drag/.test(t)) return { lockup: 'drag' };
    if (/Melt/.test(t)) return { lockup: 'melt' };
    if (/Lockup/.test(t)) return { lockup: 'normal' };
    if (/Clash/.test(t)) return { effect: 'EFFECT_CLASH' };
    if (/Stab/.test(t)) return { effect: 'EFFECT_STAB' };
    if (/Blast/.test(t)) return { effect: 'EFFECT_BLAST' };
  }
  return null;
}

// ---------------- starting points ----------------

// Layers whose defaults paint nothing (a sequence of one instant step, a mix with no colours): what they start as when
// added, so something shows on the blade and the card has something to edit.
const LAYER_STARTS: Record<string, string> = {
  TransitionEffectL: 'TransitionEffectL<TrConcat<TrInstant,White,TrFade<300>>,EFFECT_CLASH>',
  MultiTransitionEffectL: 'MultiTransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<8000>>>,TrFade<300>>,EFFECT_BLAST,3>',
  TransitionPulseL: 'TransitionPulseL<TrConcat<TrInstant,White,TrFade<300>>,ThresholdPulseF<SwingSpeed<400>,Int<24000>>>',
  TransitionLoopL: 'TransitionLoopL<TrConcat<TrFade<800>,AlphaL<White,Int<12000>>,TrFade<800>>>',
  TransitionLoopWhileL: 'TransitionLoopWhileL<TrConcat<TrFade<600>,AlphaL<White,Int<12000>>,TrFade<600>>,TrFade<300>,Int<1>>',
  SequenceL: 'SequenceL<White,100,16,0b1010100000000000>',
  AlphaMixL: 'AlphaMixL<Sin<Int<20>>,Red,Blue>',
  // These aliases take their numbers as types (Int<N>); the catalogue lists the slots as plain numbers, which does not compile.
  BlinkingL: 'BlinkingL<White,Int<500>,Int<500>>',
  BrownNoiseFlickerL: 'BrownNoiseFlickerL<White,Int<300>>',
  PulsingL: 'PulsingL<White,Int<1000>>',
  StrobeL: 'StrobeL<White,Int<15>,Int<1>>',
};
/** A new layer of `name` to add to a stack: its defaults, or a starting point that shows something where they would not. */
export function newLayer(name: string): Node {
  if (LAYER_STARTS[name]) return parseStyle(LAYER_STARTS[name]);
  const n = newNode(name);
  const e = CATALOGUE[name]; const last = e?.params[e.params.length - 1];
  if (e?.variadic && last?.kind === 'COLOR') while (n.args.length < e.params.length + 1) n.args.push({ name: n.args.length === e.params.length ? 'White' : 'Blue', args: [] });
  return n;
}


/** Layers to start from in the add-a-layer picker, each one a composed card. */
export const RECIPES: { name: string; description: string; code: string }[] = [
  { name: 'Lockup spot', description: 'A spot while you hold a lockup, running to the lower end and growing with swing.', code: 'LockupTrL<AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Scale<SwingSpeed<100>,Int<9000>,Int<14000>>>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>' },
  { name: 'Flash on an effect', description: 'The whole blade flashes a colour and fades back, on any effect you pick.', code: 'TransitionEffectL<TrConcat<TrInstant,White,TrFade<300>>,EFFECT_FORCE>' },
  { name: 'Spot on an effect', description: 'A spot that lights on an effect and fades out.', code: 'TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<8000>>>,TrFade<300>>,EFFECT_CLASH>' },
  { name: 'Glowing tip', description: 'A colour at the tip, always on.', code: 'AlphaL<Orange,SmoothStep<Int<29000>,Int<2000>>>' },
  { name: 'Swing glow', description: 'The blade shifts toward a colour the faster you swing.', code: 'AlphaL<White,Scale<SwingSpeed<400>,Int<0>,Int<20000>>>' },
];
