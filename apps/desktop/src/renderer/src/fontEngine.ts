// Plays a ProffieOS sound font the way the saber does, from decoded wavs in memory.
//
// Polyphonic fonts: the hum loops from ignition to retraction with `out` and `in` played over its ends; clashes,
// blasts, stabs and force sounds are layered on top; a lockup plays its begin sound then loops its hold sound until
// the end sound. Monophonic fonts (poweron / hum / poweroff / clash) get the same treatment with their names, which
// is close enough for a listen. Swings use SmoothSwing V2 (sound/smooth_swing_v2.h): a low and a high swing sound
// loop in step with the hum, and turning the blade rotates a pair of transition windows through the swing angle;
// what you hear is the pair crossfaded by where the window sits, at a volume set by swing speed, while the hum ducks.
// Fonts without SmoothSwing play a whole swing sound each time the blade passes a swing speed, as hybrid_font.h
// StartSwing does. smoothsw.ini and config.ini are honoured for the numbers that matter.
//
// Ignition and retraction follow hybrid_font.h: a preon sound plays first with the blade still off, `out` is
// chained to start the moment it ends, and only then does the blade ignite (SB_Preon, Loop, SB_On). On retraction
// `in` plays and `pstoff` follows it, and EFFECT_POSTOFF is raised when `in` ends (SB_Off, Loop). A fast on (a
// style's FAST_ON, a preset change while lit) skips preon and prefers `fastout`; a fast off skips pstoff.
//
// The rules are ported from ProffieOS 8.10 (GPL-3.0, as Hiltwright is). The engine decides which sound plays, when
// and how loud; the sound itself goes through an AudioBackend, Web Audio in the app and a fake in the tests.

export interface FontFiles { name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string> }

/** A decoded sound. An AudioBuffer is one. */
export interface Clip { readonly duration: number }

export interface PlayOptions { loop?: boolean; offset?: number; at?: number; onEnd?: () => void }

/** One player of sounds, as one of the saber's wav players: one sound at a time, with its own volume. */
export interface Voice {
  /** `at` is a backend time to start at, for sounds chained end to end as the saber's wav players do. */
  play(clip: Clip, opts?: PlayOptions): void;
  /** Silent now; a linear rise to full starting `after` seconds from now and taking `seconds`. */
  fadeInAt(after: number, seconds: number): void;
  setVolume(v: number, ramp?: number): void;
  readonly volume: number;
  readonly playing: boolean;
  stop(): void;
  fadeAndStop(seconds: number): void;
}

/** Where sounds are played. The engine only talks to this, so it can run without a browser. */
export interface AudioBackend {
  /** The audio clock, in seconds, that `PlayOptions.at` refers to. */
  readonly time: number;
  /** A wall clock in milliseconds, as performance.now(). */
  nowMs(): number;
  createVoice(volume?: number): Voice;
  setMasterVolume(v: number): void;
  resume(): void;
  close(): void;
}

const EFFECT_ALIASES: Record<string, string[]> = {
  out: ['out', 'poweron'], in: ['in', 'poweroff', 'pwroff'], clash: ['clsh', 'clash'], blast: ['blst', 'blaster'],
  stab: ['stab', 'clsh', 'clash'], force: ['force'], font: ['font', 'boot'], boot: ['boot'],
  swingl: ['swingl', 'lswing'], swingh: ['swingh', 'hswing'],
  preon: ['preon'], pstoff: ['pstoff'], fastout: ['fastout'],
};

/** Sort a font's file names into effects: `clsh03.wav` and `clsh/003.wav` are both the third clash. */
export function groupSounds(names: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const keys = new Map<string, [number, number]>();
  for (const n of names) {
    const m = /^(?:([a-z]+)\/)?(?:(\d+)\/)?([a-z]+)?(\d*)\.wav$/i.exec(n.replace(/\\/g, '/'));
    if (!m) continue;
    const effect = (m[3] && !/^\d+$/.test(m[3]) ? m[3] : m[1])?.toLowerCase();
    if (!effect) continue;
    // Effect::Scan numbers a file by the digits after the name (or the folder's number, with `NNN` sub files after it).
    // A file with no number is the one after the last numbered file (Effect::GetName, n = max_file_ + 1).
    const [first, second] = m[2] ? [m[2], m[4]] : [m[4], ''];
    (out[effect] ??= []).push(n);
    keys.set(n, [first === '' ? Infinity : Number(first), second === '' ? 0 : Number(second)]);
  }
  // ProffieOS picks file n of an effect by number, so tr2 comes before tr10; a text sort would put tr10 first.
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const k of Object.keys(out)) out[k].sort((a, b) => { const x = keys.get(a)!; const y = keys.get(b)!; return x[0] === y[0] ? x[1] - y[1] || text(a, b) : x[0] < y[0] ? -1 : 1; });
  return out;
}

/** A config.ini value by its name in any letter case, as ConfigFile::SetVariable compares names (config_file.h, strcasecmp). */
function iniValue(map: Record<string, string>, key: string): string | undefined {
  const k = Object.keys(map).find((x) => x.toLowerCase() === key.toLowerCase());
  return k == null ? undefined : map[k];
}

/**
 * The names to look for an effect's sounds under, in the order the firmware prefers them. The hum is `humm` when the
 * font has one, else `hum` (hybrid_font.h getHum), except in a monophonic-hum font, where the firmware plays the
 * `hum` files explicitly (SB_On: PlayMonophonic(&SFX_poweron, &SFX_hum)).
 */
export function effectAliases(effect: string, has: (effect: string) => boolean): string[] {
  if (effect === 'hum') return fontKind(has).monophonicHum ? ['hum'] : ['humm', 'hum'];
  return EFFECT_ALIASES[effect] ?? [effect];
}

function num(map: Record<string, string>, key: string, def: number): number { const v = Number(map[key]); return Number.isFinite(v) ? v : def; }
/** As the firmware's ConfigFile reads a variable: the name in any case (strcasecmp). */
function numAnyCase(map: Record<string, string>, key: string, def: number): number {
  const k = Object.keys(map).find((x) => x.toLowerCase() === key.toLowerCase());
  return k == null ? def : num(map, k, def);
}

/**
 * What kind of font this is, as hybrid_font.h Activate2 guesses it. `monophonicHum`: the hum is played by the same
 * player as the effects (no `in`/`out`, but `poweron`, `poweroff`, `pwroff` or `blast`). `guessMonophonic`: and it
 * has monophonic effects too (`clash`, `blaster` or `swing`) without a plecter `humm`, so effects replace the hum.
 */
export function fontKind(has: (effect: string) => boolean): { monophonicHum: boolean; guessMonophonic: boolean } {
  let monophonicHum = has('in') || has('out') ? false : has('poweron') || has('poweroff') || has('pwroff') || has('blast');
  let guessMonophonic = false;
  if (monophonicHum && (has('clash') || has('blaster') || has('swing'))) {
    if (has('humm')) monophonicHum = false; // plecter polyphonic
    else guessMonophonic = true;
  }
  return { monophonicHum, guessMonophonic };
}

export type LockupKind = 'lock' | 'drag' | 'melt' | 'lb';

/**
 * The begin, loop and end effects of a lockup, by exact effect name, as hybrid_font.h SB_BeginLockup and
 * SB_EndLockup choose them. Melt falls back to drag and then to lockup; lightning block falls back to lockup.
 * With no begin sound the loop plays from the start. With no end sound the lockup ends with `clash` (the firmware's
 * SFX_clash: monophonic-named clash files only), and when the font has none of those nothing plays.
 */
export function lockupSounds(kind: LockupKind, has: (effect: string) => boolean): { once: string; loop: string; end: string } {
  let once: string | null = null; let loop: string | null = null; let end: string | null = null;
  const pick = (e: string) => (has(e) ? e : null);
  // SB_BeginLockup
  if (kind === 'lb') { once = pick('bgnlb'); loop = pick('lb'); }
  if (kind === 'melt') { once = pick('bgnmelt'); loop = pick('melt'); }
  if (kind === 'melt' || kind === 'drag') { once ??= pick('bgndrag'); loop ??= pick('drag'); }
  once ??= pick('bgnlock');
  loop ??= has('lockup') ? 'lockup' : 'lock';
  once ??= loop;
  // SB_EndLockup
  if (kind === 'lb') end = pick('endlb');
  if (kind === 'melt') end = pick('endmelt');
  if (kind === 'melt' || kind === 'drag') end ??= pick('enddrag');
  end ??= pick('endlock') ?? 'clash';
  return { once, loop, end };
}

/** config.ini's swing numbers for fonts without SmoothSwing, with ProffieOS's defaults (hybrid_font.h FontConfigFile). */
export interface PlainSwingConfig {
  /** ProffieOSSwingSpeedThreshold, degrees per second: a swing starts above it. Default 250. */
  threshold: number;
  /** ProffieOSSwingLowerThreshold, degrees per second: the swing is over at or below it. Default 200. */
  lowerThreshold: number;
  /** ProffieOSSlashAccelerationThreshold, radians per second per second: a slash above it. Default 130. */
  slashThreshold: number;
  /** ProffieOSSwingOverlap: the fraction of a swing that plays before another may start. Default 0.5. */
  overlap: number;
  /** ProffieOSSwingVolumeSharpness. Default 0.5. */
  sharpness: number;
  /** ProffieOSMaxSwingVolume: the swing's volume at the threshold. Default 2. */
  maxVolume: number;
  /** ProffieOSMinSwingAcceleration and ProffieOSMaxSwingAcceleration: pick the swing file by acceleration. Default 0, off. */
  minAccel: number; maxAccel: number;
}

export function plainSwingConfig(ini: Record<string, string>): PlainSwingConfig {
  return {
    threshold: numAnyCase(ini, 'ProffieOSSwingSpeedThreshold', 250),
    lowerThreshold: numAnyCase(ini, 'ProffieOSSwingLowerThreshold', 200),
    slashThreshold: numAnyCase(ini, 'ProffieOSSlashAccelerationThreshold', 130),
    overlap: numAnyCase(ini, 'ProffieOSSwingOverlap', 0.5),
    sharpness: numAnyCase(ini, 'ProffieOSSwingVolumeSharpness', 0.5),
    maxVolume: numAnyCase(ini, 'ProffieOSMaxSwingVolume', 2),
    minAccel: numAnyCase(ini, 'ProffieOSMinSwingAcceleration', 0),
    maxAccel: numAnyCase(ini, 'ProffieOSMaxSwingAcceleration', 0),
  };
}

export interface PlainSwingStep {
  swinging: boolean;
  /** Fade the current swing out over this many seconds and let go of it. */
  fadeOut?: number;
  /** Let go of the current swing, leaving it to play out. */
  release?: boolean;
  /** Start a swing: an accent swing or slash on its own player, or (monophonic) a swing in place of the hum. */
  start?: 'slsh' | 'swng' | 'swing' | 'mono';
  /** A file to choose for the swing by acceleration, from 0 to 1 (Effect::SelectFloat), when the config asks. */
  select?: number;
  /** The volume to bring the swing player to, when one is playing (SetSwingVolume). */
  swingVolume?: number;
  humVolume: number;
}

/**
 * One motion update of a font without SmoothSwing: hybrid_font.h StartSwing and SetSwingVolume. `player` is the
 * swing playing on its own player, if any, with its position and length in seconds. `has` says which effects the
 * font has.
 */
export function plainSwingStep(
  s: { swinging: boolean; speed: number; accel: number; player: { pos: number; length: number; playing: boolean } | null; guessMonophonic: boolean },
  cfg: PlainSwingConfig, has: (effect: string) => boolean,
): PlainSwingStep {
  const out: PlainSwingStep = { swinging: s.swinging, humVolume: 1 };
  let player = s.player;
  if (s.speed > cfg.threshold) {
    if (!s.guessMonophonic) {
      // Avoid overlapping swings: once ProffieOSSwingOverlap of it has played, fade it out over what is left.
      if (player && player.length > 0 && player.pos / player.length >= cfg.overlap) {
        out.fadeOut = Math.max(0, player.length - player.pos);
        player = null;
      }
      if (!player && !out.swinging) {
        out.start = s.accel > cfg.slashThreshold && has('slsh') ? 'slsh' : has('swng') ? 'swng' : 'swing';
        if (cfg.maxAccel > cfg.minAccel) out.select = (s.accel - cfg.minAccel) / cfg.maxAccel;
        out.swinging = true;
      }
    } else if (!out.swinging) {
      out.start = 'mono';
      out.swinging = true;
    }
    // SetSwingVolume: the swing started just now counts, as EFFECT_ACCENT_SWING sets swing_player_ at once.
    const strength = Math.min(1, s.speed / cfg.threshold);
    if (!s.guessMonophonic && (player || out.start)) out.swingVolume = Math.pow(strength, cfg.sharpness) * cfg.maxVolume;
  } else if (s.speed <= cfg.lowerThreshold) {
    out.swinging = false;
    if (player) out.release = true;
  }
  if (!out.swinging) out.humVolume = 0.99 + Math.max(0, Math.min(2.3, s.speed / 200));
  return out;
}

class WebAudioVoice implements Voice {
  private gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  constructor(private ctx: AudioContext, dest: AudioNode, volume = 1) { this.gain = ctx.createGain(); this.gain.gain.value = volume; this.gain.connect(dest); }
  play(clip: Clip, opts: PlayOptions = {}): void {
    const buf = clip as AudioBuffer;
    this.stop();
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = !!opts.loop;
    s.connect(this.gain);
    s.onended = () => { if (this.src === s) { this.src = null; opts.onEnd?.(); } };
    s.start(opts.at ?? 0, opts.offset != null && opts.offset > 0 ? opts.offset % buf.duration : 0);
    this.src = s;
  }
  fadeInAt(after: number, seconds: number): void {
    const t = this.ctx.currentTime + after;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(1, t + Math.max(0.01, seconds));
  }
  setVolume(v: number, ramp = 0.02): void { const t = this.ctx.currentTime; this.gain.gain.cancelScheduledValues(t); this.gain.gain.setTargetAtTime(Math.max(0, v), t, ramp); }
  get volume(): number { return this.gain.gain.value; }
  get playing(): boolean { return this.src !== null; }
  stop(): void { if (this.src) { try { this.src.onended = null; this.src.stop(); } catch { /* already stopped */ } this.src = null; } }
  fadeAndStop(seconds: number): void { const s = this.src; if (!s) return; this.setVolume(0, seconds / 3); setTimeout(() => { if (this.src === s) this.stop(); }, seconds * 1000 + 50); }
}

export class WebAudioBackend implements AudioBackend {
  readonly ctx = new AudioContext();
  private master: GainNode;
  constructor() { this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination); }
  get time(): number { return this.ctx.currentTime; }
  nowMs(): number { return performance.now(); }
  createVoice(volume = 1): Voice { return new WebAudioVoice(this.ctx, this.master, volume); }
  setMasterVolume(v: number): void { this.master.gain.value = v; }
  resume(): void { void this.ctx.resume(); }
  close(): void { void this.ctx.close(); }
  decode(data: ArrayBuffer): Promise<AudioBuffer> { return this.ctx.decodeAudioData(data); }
}

type Chosen = { buf: Clip; alias: string; index: number };

export interface FontEngineOptions {
  backend: AudioBackend;
  /** Decoded sounds by file name. May still be filling while `ready` is pending. */
  buffers: Map<string, Clip>;
  ready?: Promise<void>;
  /** A number in [0, 1), as Math.random, for picking files. */
  random?: () => number;
}

export class FontEngine {
  private audio: AudioBackend;
  private buffers: Map<string, Clip>;
  private random: () => number;
  private groups: Record<string, string[]> = {};
  private hum: Voice; private lock: Voice; private swingA: Voice; private swingB: Voice;
  private fx: Voice[] = [];
  private on = false;
  private humStartMs = 0;
  private humFadeDoneAt = 0;
  // SmoothSwing V2 state
  private sw = { on: false, state: 'off' as 'off' | 'on' | 'out', A: { mid: 0, width: 0, sep: 180 }, B: { mid: 0, width: 0, sep: 180 }, aIsLow: true, lastPick: -1e9 };
  private cfg = { sensitivity: 450, ducking: 75, sharpness: 1.75, threshold: 20, t1: 45, t2: 160, sepL2H: 180, sepH2L: 180, maxVol: 3, accentThreshold: 0 };
  // Plain swings (no SmoothSwing): hybrid_font.h swinging_ and swing_player_.
  private plain: { swinging: boolean; player: { voice: Voice; startedAt: number; length: number } | null; lastSpeed: number | null };
  private plainCfg: PlainSwingConfig;
  private plainVoices: Voice[] = [];
  /** From config.ini: ProffieOSHumDelay is ms after ignition; humstart is ms before the END of the ignition sound. */
  private humDelayMs = -1;
  private humStartBeforeEndMs = 0;
  private readonly ini: Record<string, string>;
  private readonly humAliases: string[];
  private readonly ready: Promise<void>;
  readonly name: string;
  /** Effects replace the hum, as in a monophonic font (hybrid_font.h guess_monophonic_). */
  readonly monophonic: boolean;
  readonly hasSmoothSwing: boolean;
  /** Plays whole swing sounds (swng, swing or slsh files) because it has no SmoothSwing. */
  readonly hasPlainSwings: boolean;
  /** The font has a force sound (force.wav, forceNN.wav or force/): many fonts have none. */
  get hasForce(): boolean { return this.count('force') > 0; }

  constructor(font: FontFiles, opts: FontEngineOptions) {
    this.name = font.name;
    this.audio = opts.backend;
    this.buffers = opts.buffers;
    this.ready = opts.ready ?? Promise.resolve();
    this.random = opts.random ?? Math.random;
    this.groups = groupSounds(Object.keys(font.files));
    const has = (e: string) => !!this.groups[e]?.length;
    this.humAliases = effectAliases('hum', has);
    this.monophonic = fontKind(has).guessMonophonic;
    // prop_base.h SetPreset: lswing (plecter naming) always means SmoothSwing V2; swingl does unless smoothsw.ini
    // says Version=0.
    this.hasSmoothSwing = has('lswing') || (has('swingl') && num(font.smoothsw, 'Version', 2) !== 0);
    this.hasPlainSwings = !this.hasSmoothSwing && (has('swng') || has('swing') || has('slsh'));
    const s = font.smoothsw;
    this.cfg = { sensitivity: num(s, 'SwingSensitivity', 450), ducking: num(s, 'MaximumHumDucking', 75), sharpness: num(s, 'SwingSharpness', 1.75), threshold: num(s, 'SwingStrengthThreshold', 20), t1: num(s, 'Transition1Degrees', 45), t2: num(s, 'Transition2Degrees', 160), sepL2H: num(s, 'Low2HighSeparationDegrees', 180), sepH2L: num(s, 'High2LowSeparationDegrees', 180), maxVol: num(s, 'MaxSwingVolume', 3), accentThreshold: num(s, 'AccentSwingSpeedThreshold', 0) };
    this.ini = font.ini;
    this.plainCfg = plainSwingConfig(font.ini);
    this.plain = { swinging: false, player: null, lastSpeed: null };
    this.humDelayMs = num(font.ini, 'ProffieOSHumDelay', -1);
    // FontConfigFile: CONFIG_VARIABLE2(humStart, 100), found in any letter case.
    this.humStartBeforeEndMs = numAnyCase(font.ini, 'humStart', 100);
    this.hum = this.audio.createVoice(); this.lock = this.audio.createVoice();
    this.swingA = this.audio.createVoice(0); this.swingB = this.audio.createVoice(0);
    for (let i = 0; i < 6; i++) this.fx.push(this.audio.createVoice());
    for (let i = 0; i < 3; i++) this.plainVoices.push(this.audio.createVoice());
  }

  /** Decode every file. Slow for a big font, so it reports progress. */
  static async load(font: FontFiles, onProgress?: (done: number, total: number) => void): Promise<FontEngine> {
    let resolveReady!: () => void;
    const backend = new WebAudioBackend();
    const buffers = new Map<string, Clip>();
    const engine = new FontEngine(font, { backend, buffers, ready: new Promise<void>((r) => { resolveReady = r; }) });
    const names = Object.keys(font.files);
    let done = 0;
    for (const n of names) {
      try { buffers.set(n, await backend.decode(font.files[n].slice(0))); } catch { /* not a wav the browser can read */ }
      onProgress?.(++done, names.length);
    }
    resolveReady();
    return engine;
  }

  private rand(n: number): number { return Math.min(n - 1, Math.floor(this.random() * n)); }

  /**
   * A sound for `effect`, and which file it was. After `prev`, the same-numbered file when the font's config.ini
   * pairs `prev` with it (`ProffieOS.SFX.preon.paired=1`) and both have as many files, as Effect::GetFollowing does. `exact`
   * takes the effect by its firmware name alone, without falling back to the other naming.
   */
  private choose(effect: string, prev?: { alias: string; index: number } | null, exact = false): Chosen | null {
    for (const alias of exact ? [effect] : this.aliases(effect)) {
      const list = this.groups[alias];
      if (!list?.length) continue;
      // FontConfigFile::iterateVariables names it `ProffieOS.SFX.<effect>.paired`; Effect::GetFollowing keeps the number.
      const paired = prev && Number(iniValue(this.ini, `ProffieOS.SFX.${prev.alias}.paired`)) > 0.5 && this.groups[prev.alias]?.length === list.length;
      const index = paired ? prev.index : this.rand(list.length);
      const buf = this.buffers.get(list[index]);
      if (buf) return { buf, alias, index };
    }
    return null;
  }
  private aliases(effect: string): string[] { return effect === 'hum' ? this.humAliases : EFFECT_ALIASES[effect] ?? [effect]; }
  private pick(effect: string): Clip | null {
    for (const alias of this.aliases(effect)) {
      const list = this.groups[alias];
      if (list?.length) { const b = this.buffers.get(list[this.rand(list.length)]); if (b) return b; }
    }
    return null;
  }
  private pickIndexed(effect: string, index: number): Clip | null {
    for (const alias of this.aliases(effect)) { const list = this.groups[alias]; if (list?.length) return this.buffers.get(list[index % list.length]) ?? null; }
    return null;
  }
  private count(effect: string): number { for (const alias of this.aliases(effect)) { const list = this.groups[alias]; if (list?.length) return list.length; } return 0; }
  private has = (effect: string): boolean => !!this.groups[effect]?.length;
  private freeFx(): Voice { return this.fx.find((v) => !v.playing && v !== this.outV && v !== this.pstoffV) ?? this.fx[0]; }
  private freeFxExcept(not: Voice): Voice { return this.fx.find((v) => !v.playing && v !== not) ?? this.fx.find((v) => v !== not) ?? this.fx[0]; }

  get isOn(): boolean { return this.on; }
  setVolume(v: number): void { this.audio.setMasterVolume(Math.max(0, Math.min(1, v))); }

  /** The font's name sound, as when a preset is chosen. */
  announce(): void { void this.ready.then(() => { const b = this.pick('font'); if (b) this.freeFx().play(b); }); }

  /** Voices for preon and the ignition sound chained after it, and for in and the pstoff chained after it. */
  private preonV: Voice | null = null;
  private outV: Voice | null = null;
  private pending: { out: Chosen | null; scheduled: boolean } | null = null;
  private pstoffV: Voice | null = null;

  /**
   * The owner asked for ignition (prop_base On): play preon if the font has one and chain the ignition sound to
   * its end. Returns how long preon lasts (0 without one: ignite at once) and how long the ignition sound is, both
   * in seconds, so the blade can wait for preon and styles can read WavLen. Call ignite() when the blade lights.
   */
  preon(): { preon: number; out: number } {
    if (this.on) return { preon: 0, out: 0 };
    this.audio.resume();
    this.cancelPreon();
    const pre = this.choose('preon');
    const out = this.choose('out', pre);
    if (!pre) { this.pending = { out, scheduled: false }; return { preon: 0, out: out?.buf.duration ?? 0 }; }
    this.preonV = this.freeFx(); this.preonV.setVolume(1, 0.001); this.preonV.play(pre.buf);
    if (out) { this.outV = this.freeFxExcept(this.preonV); this.outV.setVolume(1, 0.001); this.outV.play(out.buf, { at: this.audio.time + pre.buf.duration }); }
    this.pending = { out, scheduled: true };
    return { preon: pre.buf.duration, out: out?.buf.duration ?? 0 };
  }

  /** Turned off before preon finished (OFF_CANCEL_PREON). */
  cancelPreon(): void {
    if (!this.pending) return;
    if (this.pending.scheduled) { this.preonV?.stop(); this.outV?.stop(); }
    this.pending = null; this.preonV = null; this.outV = null;
  }

  /**
   * The blade lights (SB_On). After preon() the ignition sound is already chosen, and already playing when preon
   * came first; otherwise this is a fast on (a style's FAST_ON, a preset change while lit), which uses `fastout`
   * when the font has it.
   */
  ignite(): void {
    if (this.on) return;
    this.on = true;
    this.audio.resume();
    const pending = this.pending; this.pending = null; this.preonV = null; this.outV = null;
    let out: Clip | null = null;
    if (pending) {
      out = pending.out?.buf ?? null;
      if (out && !pending.scheduled) this.freeFx().play(out);
    } else {
      out = this.pick('fastout') ?? this.pick('out');
      if (out) this.freeFx().play(out);
    }
    const hum = this.pick('hum');
    if (hum) {
      // As the firmware does (hybrid_font.h SB_On): the hum starts at once, silent, and fades in over 0.2 s from
      // `hum_start_`, which is ignition, or ignition + ProffieOSHumDelay, or `humstart` ms before the ignition
      // sound ends. With a `humm` file the fade lasts the whole ignition sound instead.
      const outMs = out ? out.duration * 1000 : 0;
      let delay = 0;
      const humm = this.humAliases[0] === 'humm' && this.has('humm');
      if (humm && out) delay = 0;
      else if (this.humDelayMs >= 0) delay = this.humDelayMs;
      else if (this.humStartBeforeEndMs > 0 && out) { const d = outMs - this.humStartBeforeEndMs; if (d > 0 && d < 30000) delay = d; }
      const fade = humm && out ? out.duration : 0.2;
      this.humStartMs = this.audio.nowMs();
      this.hum.setVolume(0, 0.001);
      this.hum.play(hum, { loop: true });
      this.hum.fadeInAt(delay / 1000, fade);
      this.humFadeDoneAt = this.audio.nowMs() + delay + fade * 1000;
    }
    this.plain = { swinging: false, player: null, lastSpeed: null };
    this.sw.on = true; this.sw.state = 'off';
    this.pickRandomSwing(true);
  }

  /**
   * The blade goes out (SB_Off). A polyphonic font plays `in` and the hum fades over 0.2 s; a monophonic one plays
   * `poweroff` and the hum fades over its length. Unless `fast`, `pstoff` is chained to the end of `in`. Returns the
   * retraction sound's length and, when pstoff follows, its length: EFFECT_POSTOFF is due when the first ends.
   */
  retract(fast = false): { in: number; postoff: number } {
    if (!this.on) return { in: 0, postoff: 0 };
    this.on = false;
    this.endLockup();
    const inn = this.choose('in');
    let postoff = 0;
    if (inn) {
      this.freeFx().play(inn.buf);
      const poly = inn.alias === 'in';
      this.hum.fadeAndStop(poly ? 0.2 : inn.buf.duration);
      // ProffieOS chains pstoff only after SFX_in, the polyphonic retraction.
      const pst = poly && !fast ? this.choose('pstoff', inn) : null;
      if (pst) {
        this.pstoffV = this.freeFx(); this.pstoffV.setVolume(1, 0.001);
        this.pstoffV.play(pst.buf, { at: this.audio.time + inn.buf.duration });
        postoff = pst.buf.duration;
      }
    } else this.hum.fadeAndStop(0.2);
    this.sw.on = false; this.swingA.fadeAndStop(0.2); this.swingB.fadeAndStop(0.2);
    // hybrid_font.h SB_Off: the plain swing playing fades out over 0.3 s.
    if (this.plain.player) { this.plain.player.voice.fadeAndStop(0.3); this.plain.player = null; }
    this.plain.swinging = false;
    return { in: inn?.buf.duration ?? 0, postoff };
  }

  /** A style's transition sound: trNN.wav or tr/NNN/000.wav, as EFFECT_TRANSITION_SOUND with that number plays it. */
  transition(n: number): void {
    if (n < 0 || n >= this.count('tr')) return;
    const b = this.pickIndexed('tr', n);
    if (b) this.freeFx().play(b);
  }

  effect(kind: 'clash' | 'blast' | 'stab' | 'force'): void {
    if (!this.on && kind !== 'force') return;
    const b = this.pick(kind);
    if (b) this.freeFx().play(b);
  }

  private lockKind: LockupKind | null = null;
  /** The file the lockup is playing, for an end sound paired with it (hybrid_font.h getNext(lock_player_, end)). */
  private lockNow: Chosen | null = null;
  beginLockup(kind: LockupKind): void {
    if (!this.on || this.lockKind) return;
    this.lockKind = kind;
    const sounds = lockupSounds(kind, this.has);
    const once = this.choose(sounds.once, null, true); const loop = this.choose(sounds.loop, null, true);
    if (!loop) return;
    this.lock.setVolume(1, 0.01);
    if (once && sounds.once !== sounds.loop) {
      this.lockNow = once;
      this.lock.play(once.buf, { onEnd: () => { if (!this.lock.playing && this.lockKind === kind) { this.lockNow = loop; this.lock.play(loop.buf, { loop: true }); } } });
    } else { this.lockNow = loop; this.lock.play(loop.buf, { loop: true }); }
  }
  endLockup(): void {
    if (!this.lockKind) return;
    const sounds = lockupSounds(this.lockKind, this.has);
    const end = this.choose(sounds.end, this.lockNow, true);
    this.lockKind = null; this.lockNow = null;
    // hybrid_font.h SB_EndLockup: the lockup fades over 0.3 s, or 3 ms when an end sound plays.
    this.lock.fadeAndStop(end ? 0.003 : 0.3);
    if (end) this.freeFx().play(end.buf);
  }

  /** The hum's position, so a swing pair starts in step with it as ProffieOS does (humstart=1 fonts). */
  private humPos(): number { const now = this.audio.nowMs(); return Math.max(0, this.hum.playing ? (now - this.humStartMs) / 1000 : now / 1000); }

  private pickRandomSwing(force = false): void {
    if (!this.sw.on || !this.hasSmoothSwing) return;
    const now = this.audio.nowMs();
    if (!force && this.swingA.playing && now - this.sw.lastPick < 1000) return;
    this.sw.lastPick = now;
    const n = Math.min(this.count('swingl'), this.count('swingh'));
    if (!n) return;
    const i = this.rand(n);
    const lo = this.pickIndexed('swingl', i); const hi = this.pickIndexed('swingh', i);
    if (!lo || !hi) return;
    const start = this.humPos();
    this.swingA.setVolume(0, 0.005); this.swingB.setVolume(0, 0.005);
    this.sw.aIsLow = this.random() < 0.5;
    this.swingA.play(this.sw.aIsLow ? lo : hi, { loop: true, offset: start });
    this.swingB.play(this.sw.aIsLow ? hi : lo, { loop: true, offset: start });
    const t1 = this.random() * 50 + 10;
    this.sw.A = { mid: t1, width: this.cfg.t1, sep: this.sw.aIsLow ? this.cfg.sepL2H : this.cfg.sepH2L };
    this.sw.B = { mid: t1 + this.sw.A.sep, width: this.cfg.t2, sep: this.sw.aIsLow ? this.cfg.sepH2L : this.cfg.sepL2H };
  }

  /**
   * Feed the blade's turn rate, degrees per second, every frame. With SmoothSwing this is SmoothSwing V2's
   * SB_Motion: the swing angle advances the transition windows, the pair crossfades through them, and the hum ducks
   * with swing strength. Without, it is hybrid_font.h SB_Motion and StartSwing.
   */
  motion(speed: number, dtSeconds: number): void {
    if (!this.on) return;
    if (!this.hasSmoothSwing) { this.plainMotion(speed, dtSeconds); return; }
    let humVolume = 1;
    const c = this.cfg; const sw = this.sw;
    const swap = () => { const t = sw.A; sw.A = sw.B; sw.B = t; const va = this.swingA; this.swingA = this.swingB; this.swingB = va; sw.aIsLow = !sw.aIsLow; };
    switch (sw.state) {
      case 'off':
        if (!this.swingA.playing || !this.swingB.playing) this.pickRandomSwing();
        if (speed < c.threshold) break;
        sw.state = 'on';
      // falls through
      case 'on':
        if (speed >= c.threshold * 0.9) {
          const strength = Math.min(1, speed / c.sensitivity);
          sw.A.mid -= speed * dtSeconds;
          while (sw.A.mid + sw.A.width / 2 < 0) { sw.B.mid = sw.A.mid + sw.A.sep; swap(); }
          const begin = sw.A.mid - sw.A.width / 2;
          const mixab = begin < 0 ? Math.max(0, Math.min(1, -begin / sw.A.width)) : 0;
          let mixhum = Math.pow(strength, c.sharpness);
          humVolume = 1 - (mixhum * c.ducking) / 100;
          mixhum *= c.maxVol;
          this.swingA.setVolume(mixhum * mixab);
          this.swingB.setVolume(mixhum * (1 - mixab));
          break;
        }
        this.swingA.setVolume(0); this.swingB.setVolume(0);
        sw.state = 'out';
      // falls through
      case 'out':
        this.pickRandomSwing();
        sw.state = 'off';
    }
    if (this.audio.nowMs() >= this.humFadeDoneAt) this.hum.setVolume(humVolume);
  }

  /** hybrid_font.h SB_Motion for a font without SmoothSwing: StartSwing, then the hum's volume. */
  private plainMotion(speed: number, dt: number): void {
    // SB_Motion: no swings while a lockup plays on a font with monophonic `lockup` files.
    if (this.lockKind && this.has('lockup')) return;
    // fusor.swing_accel, radians per second per second; here from the change in turn rate between frames.
    const accel = this.plain.lastSpeed == null || dt <= 0 ? 0 : (Math.abs(speed - this.plain.lastSpeed) / dt) * (Math.PI / 180);
    this.plain.lastSpeed = speed;
    const p = this.plain.player;
    const player = p ? { pos: this.audio.time - p.startedAt, length: p.length, playing: p.voice.playing } : null;
    const step = plainSwingStep({ swinging: this.plain.swinging, speed, accel, player, guessMonophonic: this.monophonic }, this.plainCfg, this.has);
    this.plain.swinging = step.swinging;
    if (step.fadeOut != null && p) { p.voice.fadeAndStop(step.fadeOut); this.plain.player = null; }
    if (step.release) this.plain.player = null;
    if (step.start === 'mono') {
      // PlayMonophonic(&SFX_swing, &SFX_hum): the swing takes the hum's place, then the hum comes back.
      const swing = this.chooseSelected('swing', step.select); const hum = this.pick('hum');
      if (swing && hum) this.hum.play(swing, { onEnd: () => { if (!this.hum.playing && this.on) this.hum.play(hum, { loop: true }); } });
    } else if (step.start) {
      // EFFECT_ACCENT_SWING plays swng, else swing; EFFECT_ACCENT_SLASH plays slsh.
      const swing = this.chooseSelected(step.start, step.select);
      if (swing) {
        const v = this.plainVoices.find((x) => !x.playing && x !== this.plain.player?.voice) ?? this.plainVoices[0];
        v.setVolume(1, 0.001); v.play(swing);
        this.plain.player = { voice: v, startedAt: this.audio.time, length: swing.duration };
      }
    }
    // SetSwingVolume: a swing that has finished is let go of.
    const cur = this.plain.player;
    if (cur && !cur.voice.playing && !step.start) this.plain.player = null;
    else if (cur && step.swingVolume != null) cur.voice.setVolume(step.swingVolume, 0.04 / 3);
    if (this.audio.nowMs() >= this.humFadeDoneAt) this.hum.setVolume(step.humVolume);
  }

  /** A file of `effect`, picked by `select` from 0 to 1 when given (Effect::SelectFloat), else at random. */
  private chooseSelected(effect: string, select?: number): Clip | null {
    const list = this.groups[effect];
    if (!list?.length) return null;
    const i = select == null ? this.rand(list.length) : Math.max(0, Math.min(list.length - 1, Math.floor(list.length * select)));
    return this.buffers.get(list[i]) ?? null;
  }

  dispose(): void { this.hum.stop(); this.lock.stop(); this.swingA.stop(); this.swingB.stop(); for (const v of this.fx) v.stop(); for (const v of this.plainVoices) v.stop(); this.audio.close(); }
}
