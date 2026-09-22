// Plays a ProffieOS sound font the way the saber does, from decoded wavs in memory.
//
// Polyphonic fonts: the hum loops from ignition to retraction with `out` and `in` played over its ends; clashes,
// blasts, stabs and force sounds are layered on top; a lockup plays its begin sound then loops its hold sound until
// the end sound. Monophonic fonts (poweron / hum / poweroff / clash) get the same treatment with their names, which
// is close enough for a listen. Swings use SmoothSwing V2 (sound/smooth_swing_v2.h): a low and a high swing sound
// loop in step with the hum, and turning the blade rotates a pair of transition windows through the swing angle;
// what you hear is the pair crossfaded by where the window sits, at a volume set by swing speed, while the hum ducks.
// smoothsw.ini and config.ini are honoured for the numbers that matter.

export interface FontFiles { name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string> }

const EFFECT_ALIASES: Record<string, string[]> = {
  hum: ['hum', 'humm'], out: ['out', 'poweron'], in: ['in', 'poweroff'], clash: ['clsh', 'clash'], blast: ['blst', 'blaster'],
  stab: ['stab', 'clsh', 'clash'], force: ['force'], font: ['font', 'boot'], boot: ['boot'],
  lock: ['lock', 'lockup'], bgnlock: ['bgnlock'], endlock: ['endlock'],
  drag: ['drag', 'lock', 'lockup'], bgndrag: ['bgndrag', 'bgnlock'], enddrag: ['enddrag', 'endlock'],
  lb: ['lb', 'lock', 'lockup'], bgnlb: ['bgnlb', 'bgnlock'], endlb: ['endlb', 'endlock'],
  swingl: ['swingl', 'lswing'], swingh: ['swingh', 'hswing'], swng: ['swng', 'swing'],
};

/** Sort a font's file names into effects: `clsh03.wav` and `clsh/003.wav` are both the third clash. */
export function groupSounds(names: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const n of names) {
    const m = /^(?:([a-z]+)\/)?([a-z]+)?(\d*)\.wav$/i.exec(n.replace(/\\/g, '/'));
    if (!m) continue;
    const effect = (m[2] && !/^\d+$/.test(m[2]) ? m[2] : m[1])?.toLowerCase();
    if (!effect) continue;
    (out[effect] ??= []).push(n);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

function num(map: Record<string, string>, key: string, def: number): number { const v = Number(map[key]); return Number.isFinite(v) ? v : def; }

class Voice {
  private gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  constructor(private ctx: AudioContext, dest: AudioNode, volume = 1) { this.gain = ctx.createGain(); this.gain.gain.value = volume; this.gain.connect(dest); }
  play(buf: AudioBuffer, opts: { loop?: boolean; offset?: number; onEnd?: () => void } = {}): void {
    this.stop();
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = !!opts.loop;
    s.connect(this.gain);
    s.onended = () => { if (this.src === s) { this.src = null; opts.onEnd?.(); } };
    s.start(0, opts.offset != null && opts.offset > 0 ? opts.offset % buf.duration : 0);
    this.src = s;
  }
  /** Play `once`, then loop `loop` from where `once` ends, as the saber's PlayOnce + PlayLoop does. */
  playThenLoop(once: AudioBuffer, loop: AudioBuffer): void {
    this.play(once, { onEnd: () => { if (this.src === null) this.play(loop, { loop: true }); } });
  }
  /** Silent now; a linear rise to full starting `after` seconds from now and taking `seconds`. */
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
  /** Position in the current buffer, for starting swings in step with the hum. */
  startedAt = 0;
}

export class FontEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private groups: Record<string, string[]> = {};
  private hum: Voice; private lock: Voice; private swingA: Voice; private swingB: Voice;
  private fx: Voice[] = [];
  private on = false;
  private humStart = 0;
  private humStartMs = 0;
  private humFadeDoneAt = 0;
  // SmoothSwing V2 state
  private sw = { on: false, state: 'off' as 'off' | 'on' | 'out', A: { mid: 0, width: 0, sep: 180 }, B: { mid: 0, width: 0, sep: 180 }, aIsLow: true, lastPick: -1e9 };
  private cfg = { sensitivity: 450, ducking: 75, sharpness: 1.75, threshold: 20, t1: 45, t2: 160, sepL2H: 180, sepH2L: 180, maxVol: 3, accentThreshold: 0 };
  /** From config.ini: ProffieOSHumDelay is ms after ignition; humstart is ms before the END of the ignition sound. */
  private humDelayMs = -1;
  private humStartBeforeEndMs = 0;
  readonly name: string;
  readonly monophonic: boolean;
  readonly hasSmoothSwing: boolean;

  constructor(font: FontFiles, private readonly ready: Promise<void>) {
    this.name = font.name;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    this.groups = groupSounds(Object.keys(font.files));
    this.monophonic = !this.groups.hum && !!this.groups.humm ? false : !this.groups.out && !!this.groups.poweron;
    this.hasSmoothSwing = !!(this.groups.swingl || this.groups.lswing);
    const s = font.smoothsw;
    this.cfg = { sensitivity: num(s, 'SwingSensitivity', 450), ducking: num(s, 'MaximumHumDucking', 75), sharpness: num(s, 'SwingSharpness', 1.75), threshold: num(s, 'SwingStrengthThreshold', 20), t1: num(s, 'Transition1Degrees', 45), t2: num(s, 'Transition2Degrees', 160), sepL2H: num(s, 'Low2HighSeparationDegrees', 180), sepH2L: num(s, 'High2LowSeparationDegrees', 180), maxVol: num(s, 'MaxSwingVolume', 3), accentThreshold: num(s, 'AccentSwingSpeedThreshold', 0) };
    this.humDelayMs = num(font.ini, 'ProffieOSHumDelay', -1);
    this.humStartBeforeEndMs = num(font.ini, 'humstart', 0);
    this.hum = new Voice(this.ctx, this.master); this.lock = new Voice(this.ctx, this.master);
    this.swingA = new Voice(this.ctx, this.master, 0); this.swingB = new Voice(this.ctx, this.master, 0);
    for (let i = 0; i < 6; i++) this.fx.push(new Voice(this.ctx, this.master));
  }

  /** Decode every file. Slow for a big font, so it reports progress. */
  static async load(font: FontFiles, onProgress?: (done: number, total: number) => void): Promise<FontEngine> {
    let resolveReady!: () => void;
    const engine = new FontEngine(font, new Promise<void>((r) => { resolveReady = r; }));
    const names = Object.keys(font.files);
    let done = 0;
    for (const n of names) {
      try { engine.buffers.set(n, await engine.ctx.decodeAudioData(font.files[n].slice(0))); } catch { /* not a wav the browser can read */ }
      onProgress?.(++done, names.length);
    }
    resolveReady();
    return engine;
  }

  private pick(effect: string): AudioBuffer | null {
    for (const alias of EFFECT_ALIASES[effect] ?? [effect]) {
      const list = this.groups[alias];
      if (list?.length) { const b = this.buffers.get(list[Math.floor(Math.random() * list.length)]); if (b) return b; }
    }
    return null;
  }
  private pickIndexed(effect: string, index: number): AudioBuffer | null {
    for (const alias of EFFECT_ALIASES[effect] ?? [effect]) { const list = this.groups[alias]; if (list?.length) return this.buffers.get(list[index % list.length]) ?? null; }
    return null;
  }
  private count(effect: string): number { for (const alias of EFFECT_ALIASES[effect] ?? [effect]) { const list = this.groups[alias]; if (list?.length) return list.length; } return 0; }
  private freeFx(): Voice { return this.fx.find((v) => !v.playing) ?? this.fx[0]; }

  get isOn(): boolean { return this.on; }
  setVolume(v: number): void { this.master.gain.value = Math.max(0, Math.min(1, v)); }

  /** The font's name sound, as when a preset is chosen. */
  announce(): void { void this.ready.then(() => { const b = this.pick('font'); if (b) this.freeFx().play(b); }); }

  ignite(): void {
    if (this.on) return;
    this.on = true;
    void this.ctx.resume();
    const out = this.pick('out'); const hum = this.pick('hum');
    if (out) this.freeFx().play(out);
    if (hum) {
      // As the firmware does (hybrid_font.h SB_On): the hum starts at once, silent, and fades in over 0.2 s from
      // `hum_start_`, which is ignition, or ignition + ProffieOSHumDelay, or `humstart` ms before the ignition
      // sound ends. With a `humm` file the fade lasts the whole ignition sound instead.
      const outMs = out ? out.duration * 1000 : 0;
      let delay = 0;
      if (this.groups.humm && out) delay = 0;
      else if (this.humDelayMs >= 0) delay = this.humDelayMs;
      else if (this.humStartBeforeEndMs > 0 && out) { const d = outMs - this.humStartBeforeEndMs; if (d > 0 && d < 30000) delay = d; }
      const fade = this.groups.humm && out ? out.duration : 0.2;
      this.humStartMs = performance.now();
      this.hum.setVolume(0, 0.001);
      this.hum.play(hum, { loop: true });
      this.hum.fadeInAt(delay / 1000, fade);
      this.humFadeDoneAt = performance.now() + delay + fade * 1000;
    }
    this.sw.on = true; this.sw.state = 'off';
    this.pickRandomSwing(true);
  }

  retract(): void {
    if (!this.on) return;
    this.on = false;
    this.endLockup();
    const inn = this.pick('in');
    if (inn) this.freeFx().play(inn);
    this.hum.fadeAndStop(inn ? Math.min(0.6, inn.duration) : 0.3);
    this.sw.on = false; this.swingA.fadeAndStop(0.2); this.swingB.fadeAndStop(0.2);
  }

  effect(kind: 'clash' | 'blast' | 'stab' | 'force'): void {
    if (!this.on && kind !== 'force') return;
    const b = this.pick(kind);
    if (b) this.freeFx().play(b);
  }

  private lockKind: 'lock' | 'drag' | 'lb' | null = null;
  beginLockup(kind: 'lock' | 'drag' | 'lb'): void {
    if (!this.on || this.lockKind) return;
    this.lockKind = kind;
    const once = this.pick(`bgn${kind}`); const loop = this.pick(kind);
    if (!loop) return;
    this.lock.setVolume(1, 0.01);
    if (once) this.lock.playThenLoop(once, loop); else this.lock.play(loop, { loop: true });
  }
  endLockup(): void {
    if (!this.lockKind) return;
    const end = this.pick(`end${this.lockKind}`);
    this.lockKind = null;
    this.lock.stop();
    if (end) this.freeFx().play(end);
  }

  /** The hum's position, so a swing pair starts in step with it as ProffieOS does (humstart=1 fonts). */
  private humPos(): number { return Math.max(0, this.hum.playing ? (performance.now() - this.humStartMs) / 1000 : performance.now() / 1000); }

  private pickRandomSwing(force = false): void {
    if (!this.sw.on || !this.hasSmoothSwing) return;
    const now = performance.now();
    if (!force && this.swingA.playing && now - this.sw.lastPick < 1000) return;
    this.sw.lastPick = now;
    const n = Math.min(this.count('swingl'), this.count('swingh'));
    if (!n) return;
    const i = Math.floor(Math.random() * n);
    const lo = this.pickIndexed('swingl', i); const hi = this.pickIndexed('swingh', i);
    if (!lo || !hi) return;
    const start = this.humPos();
    this.swingA.setVolume(0, 0.005); this.swingB.setVolume(0, 0.005);
    this.sw.aIsLow = Math.random() < 0.5;
    this.swingA.play(this.sw.aIsLow ? lo : hi, { loop: true, offset: start });
    this.swingB.play(this.sw.aIsLow ? hi : lo, { loop: true, offset: start });
    const t1 = Math.random() * 50 + 10;
    this.sw.A = { mid: t1, width: this.cfg.t1, sep: this.sw.aIsLow ? this.cfg.sepL2H : this.cfg.sepH2L };
    this.sw.B = { mid: t1 + this.sw.A.sep, width: this.cfg.t2, sep: this.sw.aIsLow ? this.cfg.sepH2L : this.cfg.sepL2H };
  }

  /**
   * Feed the blade's turn rate, degrees per second, every frame. This is SmoothSwing V2's SB_Motion: the swing angle
   * advances the transition windows, the pair crossfades through them, and the hum ducks with swing strength.
   */
  motion(speed: number, dtSeconds: number): void {
    if (!this.on || !this.hasSmoothSwing) return;
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
    if (performance.now() >= this.humFadeDoneAt) this.hum.setVolume(humVolume);
  }

  dispose(): void { this.hum.stop(); this.lock.stop(); this.swingA.stop(); this.swingB.stop(); for (const v of this.fx) v.stop(); void this.ctx.close(); }
}
