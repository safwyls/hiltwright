import { describe, expect, it } from 'vitest';
import {
  FontEngine, effectAliases, fontKind, groupSounds, lockupSounds, plainSwingConfig, plainSwingStep,
  type AudioBackend, type Clip, type PlayOptions, type Voice,
} from '../src/renderer/src/fontEngine';

// A stand-in for Web Audio: every voice remembers what it plays, at what volume, and can be told its sound ended.
interface FakeClip extends Clip { name: string }

class FakeVoice implements Voice {
  clip: FakeClip | null = null;
  opts: PlayOptions = {};
  volume: number;
  fadedOver: number | null = null;
  history: string[] = [];
  constructor(readonly id: number, volume: number) { this.volume = volume; }
  play(clip: Clip, opts: PlayOptions = {}): void { this.stop(); this.clip = clip as FakeClip; this.opts = opts; this.fadedOver = null; this.history.push(this.clip.name); }
  fadeIn: { after: number; seconds: number } | null = null;
  fadeInAt(after: number, seconds: number): void { this.volume = 0; this.fadeIn = { after, seconds }; }
  setVolume(v: number): void { this.volume = Math.max(0, v); }
  get playing(): boolean { return this.clip !== null; }
  stop(): void { this.clip = null; this.opts = {}; }
  fadeAndStop(seconds: number): void { if (this.clip) this.fadedOver = seconds; }
  /** The sound came to its end by itself. */
  end(): void { const cb = this.opts.onEnd; this.clip = null; this.opts = {}; cb?.(); }
}

class FakeBackend implements AudioBackend {
  time = 0;
  ms = 0;
  voices: FakeVoice[] = [];
  nowMs(): number { return this.ms; }
  createVoice(volume = 1): Voice { const v = new FakeVoice(this.voices.length, volume); this.voices.push(v); return v; }
  setMasterVolume(): void { /* not heard */ }
  resume(): void { /* always running */ }
  close(): void { /* nothing to close */ }
  /** Voices playing this file now. */
  playing(name: string): FakeVoice[] { return this.voices.filter((v) => v.clip?.name === name); }
  /** Every file played on any voice, in order of voice then time. */
  played(): string[] { return this.voices.flatMap((v) => v.history); }
}

/** A font from file names and their lengths in seconds (1 s unless given). */
function makeFont(files: Record<string, number> | string[], opts: { ini?: Record<string, string>; smoothsw?: Record<string, string>; random?: () => number } = {}) {
  const lens = Array.isArray(files) ? Object.fromEntries(files.map((f) => [f, 1])) : files;
  const backend = new FakeBackend();
  const buffers = new Map<string, Clip>(Object.entries(lens).map(([name, duration]) => [name, { name, duration } as FakeClip]));
  const font = { name: 'Test', files: Object.fromEntries(Object.keys(lens).map((n) => [n, new ArrayBuffer(0)])), ini: opts.ini ?? {}, smoothsw: opts.smoothsw ?? {} };
  const engine = new FontEngine(font, { backend, buffers, random: opts.random ?? (() => 0) });
  return { engine, backend };
}

const POLY = ['hum.wav', 'out01.wav', 'in01.wav', 'clsh01.wav', 'clsh02.wav', 'blst01.wav', 'font.wav'];

describe('grouping a font\'s files into effects', () => {
  it('reads flat names, numbered or not', () => {
    const g = groupSounds(['clsh02.wav', 'clsh01.wav', 'hum.wav', 'swingl1.wav', 'swingh1.wav', 'bgnlock.wav', 'config.ini', 'tr03.wav']);
    expect(g).toEqual({ clsh: ['clsh01.wav', 'clsh02.wav'], hum: ['hum.wav'], swingl: ['swingl1.wav'], swingh: ['swingh1.wav'], bgnlock: ['bgnlock.wav'], tr: ['tr03.wav'] });
  });

  it('reads a folder per effect, with or without the name repeated, and Windows separators', () => {
    const g = groupSounds(['clsh/001.wav', 'clsh/002.wav', 'hum/hum01.wav', 'blst\\blst01.wav', 'tr/000/000.wav', 'notes.txt']);
    expect(g.clsh).toEqual(['clsh/001.wav', 'clsh/002.wav']);
    expect(g.hum).toEqual(['hum/hum01.wav']);
    expect(g.blst).toEqual(['blst\\blst01.wav']);
    expect(g.tr).toEqual(['tr/000/000.wav']);
    expect(Object.keys(g).sort()).toEqual(['blst', 'clsh', 'hum', 'tr']);
  });

  it('guesses the kind of font as hybrid_font.h Activate2 does', () => {
    const kind = (names: string[]) => { const g = groupSounds(names); return fontKind((e) => !!g[e]); };
    expect(kind(POLY)).toEqual({ monophonicHum: false, guessMonophonic: false });
    expect(kind(['hum.wav', 'poweron.wav', 'poweroff.wav', 'clash1.wav', 'swing1.wav'])).toEqual({ monophonicHum: true, guessMonophonic: true });
    expect(kind(['humm.wav', 'poweron.wav', 'clash1.wav'])).toEqual({ monophonicHum: false, guessMonophonic: false }); // plecter
    expect(kind(['hum.wav', 'poweron.wav', 'clsh1.wav'])).toEqual({ monophonicHum: true, guessMonophonic: false }); // hybrid
  });
});

describe('choosing sounds per effect', () => {
  it('prefers polyphonic names and falls back to monophonic ones', () => {
    const { engine, backend } = makeFont([...POLY, 'clash1.wav', 'blaster1.wav']);
    engine.ignite();
    engine.effect('clash'); engine.effect('blast'); engine.effect('stab');
    expect(backend.played()).toEqual(expect.arrayContaining(['clsh01.wav', 'blst01.wav']));
    expect(backend.played()).not.toContain('clash1.wav');
    expect(backend.played()).not.toContain('blaster1.wav');
  });

  it('a stab without stab sounds is a clash; with them, its own', () => {
    const a = makeFont(POLY); a.engine.ignite(); a.engine.effect('stab');
    expect(a.backend.played()).toContain('clsh01.wav');
    const b = makeFont([...POLY, 'stab01.wav']); b.engine.ignite(); b.engine.effect('stab');
    expect(b.backend.played()).toContain('stab01.wav');
    expect(b.backend.played()).not.toContain('clsh01.wav');
  });

  it('picks among the files at random', () => {
    let r = 0.99;
    const { engine, backend } = makeFont(POLY, { random: () => r });
    engine.ignite(); engine.effect('clash');
    r = 0; engine.effect('clash');
    expect(backend.played().filter((n) => n.startsWith('clsh'))).toEqual(['clsh02.wav', 'clsh01.wav']);
  });

  it('plays no clash while off, but force does', () => {
    const { engine, backend } = makeFont([...POLY, 'force01.wav']);
    engine.effect('clash'); engine.effect('force');
    expect(backend.played()).toEqual(['force01.wav']);
  });

  it('says whether the font has a force sound, in any layout (the demo room says so when it has none)', () => {
    expect(makeFont(POLY).engine.hasForce).toBe(false);
    expect(makeFont([...POLY, 'force01.wav']).engine.hasForce).toBe(true);
    expect(makeFont([...POLY, 'force.wav']).engine.hasForce).toBe(true);
    expect(makeFont([...POLY, 'force/001.wav']).engine.hasForce).toBe(true);
    const silent = makeFont(POLY); silent.engine.ignite(); silent.engine.effect('force');
    expect(silent.backend.played().some((n) => /force/.test(n))).toBe(false);
  });

  it('plays the font\'s name sound when announced', async () => {
    const { engine, backend } = makeFont(POLY);
    engine.announce(); await Promise.resolve(); await Promise.resolve();
    expect(backend.played()).toEqual(['font.wav']);
  });
});

describe('ignition', () => {
  it('plays preon, chains out to its end, and lights the blade without playing out again', () => {
    const { engine, backend } = makeFont({ ...Object.fromEntries(POLY.map((n) => [n, 1])), 'preon01.wav': 1.5, 'out01.wav': 2 });
    backend.time = 10;
    expect(engine.preon()).toEqual({ preon: 1.5, out: 2 });
    const [pre] = backend.playing('preon01.wav'); const [out] = backend.playing('out01.wav');
    expect(pre).toBeDefined();
    expect(out.opts.at).toBe(11.5);
    expect(engine.isOn).toBe(false);
    engine.ignite();
    expect(engine.isOn).toBe(true);
    expect(backend.played().filter((n) => n === 'out01.wav')).toHaveLength(1);
    expect(backend.playing('hum.wav')[0].opts.loop).toBe(true);
  });

  it('without preon, out plays when the blade lights', () => {
    const { engine, backend } = makeFont(POLY);
    expect(engine.preon()).toEqual({ preon: 0, out: 1 });
    expect(backend.played()).toEqual([]);
    engine.ignite();
    expect(backend.played()).toEqual(expect.arrayContaining(['out01.wav', 'hum.wav']));
  });

  it('cancelling preon stops preon and the out queued after it', () => {
    const { engine, backend } = makeFont([...POLY, 'preon01.wav']);
    engine.preon(); engine.cancelPreon();
    expect(backend.playing('preon01.wav')).toEqual([]);
    expect(backend.playing('out01.wav')).toEqual([]);
  });

  it('a fast on skips preon and prefers fastout', () => {
    const { engine, backend } = makeFont([...POLY, 'preon01.wav', 'fastout01.wav']);
    engine.ignite();
    expect(backend.played()).toContain('fastout01.wav');
    expect(backend.played()).not.toContain('preon01.wav');
    expect(backend.played()).not.toContain('out01.wav');
  });

  it('a monophonic font ignites with poweron', () => {
    const { engine, backend } = makeFont(['hum.wav', 'poweron.wav', 'poweroff.wav', 'clash1.wav']);
    engine.ignite();
    expect(backend.played()).toEqual(expect.arrayContaining(['poweron.wav', 'hum.wav']));
  });
});

describe('retraction', () => {
  it('plays in, fades the hum over 0.2 s, and chains pstoff to the end of in', () => {
    const { engine, backend } = makeFont({ ...Object.fromEntries(POLY.map((n) => [n, 1])), 'in01.wav': 1.25, 'pstoff01.wav': 0.75 });
    engine.ignite();
    const hum = backend.playing('hum.wav')[0];
    backend.time = 5;
    expect(engine.retract()).toEqual({ in: 1.25, postoff: 0.75 });
    expect(backend.playing('in01.wav')).toHaveLength(1);
    expect(backend.playing('pstoff01.wav')[0].opts.at).toBe(6.25);
    expect(hum.fadedOver).toBe(0.2);
    expect(engine.isOn).toBe(false);
  });

  it('a fast off skips pstoff', () => {
    const { engine, backend } = makeFont([...POLY, 'pstoff01.wav']);
    engine.ignite();
    expect(engine.retract(true)).toEqual({ in: 1, postoff: 0 });
    expect(backend.played()).not.toContain('pstoff01.wav');
  });

  it('a monophonic font plays poweroff and the hum fades over its length', () => {
    const { engine, backend } = makeFont({ 'hum.wav': 1, 'poweron.wav': 1, 'poweroff.wav': 1.8, 'clash1.wav': 1, 'pstoff.wav': 1 });
    engine.ignite();
    const hum = backend.playing('hum.wav')[0];
    expect(engine.retract()).toEqual({ in: 1.8, postoff: 0 });
    expect(hum.fadedOver).toBe(1.8);
  });
});

describe('lockup sounds, as hybrid_font.h SB_BeginLockup and SB_EndLockup choose them', () => {
  const sounds = (kind: 'lock' | 'drag' | 'melt' | 'lb', names: string[]) => { const g = groupSounds(names); return lockupSounds(kind, (e) => !!g[e]); };
  const ALL = ['bgnlock.wav', 'lock.wav', 'endlock.wav', 'bgndrag.wav', 'drag.wav', 'enddrag.wav', 'bgnmelt.wav', 'melt.wav', 'endmelt.wav', 'bgnlb.wav', 'lb.wav', 'endlb.wav', 'clash1.wav'];

  it('each kind uses its own sounds when the font has them', () => {
    expect(sounds('lock', ALL)).toEqual({ once: 'bgnlock', loop: 'lock', end: 'endlock' });
    expect(sounds('drag', ALL)).toEqual({ once: 'bgndrag', loop: 'drag', end: 'enddrag' });
    expect(sounds('melt', ALL)).toEqual({ once: 'bgnmelt', loop: 'melt', end: 'endmelt' });
    expect(sounds('lb', ALL)).toEqual({ once: 'bgnlb', loop: 'lb', end: 'endlb' });
  });

  it('melt falls back to drag, then to lockup', () => {
    expect(sounds('melt', ['bgndrag.wav', 'drag.wav', 'enddrag.wav', 'lock.wav'])).toEqual({ once: 'bgndrag', loop: 'drag', end: 'enddrag' });
    expect(sounds('melt', ['bgnlock.wav', 'lock.wav', 'endlock.wav'])).toEqual({ once: 'bgnlock', loop: 'lock', end: 'endlock' });
    expect(sounds('melt', ['melt.wav', 'bgndrag.wav', 'endlock.wav'])).toEqual({ once: 'bgndrag', loop: 'melt', end: 'endlock' });
  });

  it('drag and lightning block fall back to lockup, lightning block never to drag', () => {
    expect(sounds('drag', ['bgnlock.wav', 'lock.wav', 'endlock.wav'])).toEqual({ once: 'bgnlock', loop: 'lock', end: 'endlock' });
    expect(sounds('lb', ['bgndrag.wav', 'drag.wav', 'enddrag.wav', 'lock.wav', 'endlock.wav'])).toEqual({ once: 'lock', loop: 'lock', end: 'endlock' });
  });

  it('without a begin sound the loop plays from the start; lockup is preferred to lock', () => {
    expect(sounds('lock', ['lock.wav'])).toEqual({ once: 'lock', loop: 'lock', end: 'clash' });
    expect(sounds('lock', ['lock.wav', 'lockup.wav'])).toEqual({ once: 'lockup', loop: 'lockup', end: 'clash' });
  });

  it('without an end sound every kind ends with a clash', () => {
    for (const kind of ['lock', 'drag', 'melt', 'lb'] as const) expect(sounds(kind, ['lock.wav']).end).toBe('clash');
  });
});

describe('lockups in the engine', () => {
  it('melt plays its begin sound, then loops its own melt sound, then its end sound', () => {
    const { engine, backend } = makeFont([...POLY, 'bgnmelt.wav', 'melt.wav', 'endmelt.wav', 'drag.wav']);
    engine.ignite();
    engine.beginLockup('melt');
    const [v] = backend.playing('bgnmelt.wav');
    v.end();
    expect(v.clip?.name).toBe('melt.wav');
    expect(v.opts.loop).toBe(true);
    engine.endLockup();
    expect(backend.playing('endmelt.wav')).toHaveLength(1);
    expect(v.fadedOver).toBe(0.003);
    expect(backend.played()).not.toContain('drag.wav');
  });

  it('melt without melt sounds plays drag', () => {
    const { engine, backend } = makeFont([...POLY, 'drag.wav', 'enddrag.wav']);
    engine.ignite(); engine.beginLockup('melt');
    expect(backend.playing('drag.wav')[0].opts.loop).toBe(true);
    engine.endLockup();
    expect(backend.played()).toContain('enddrag.wav');
  });

  it('a lockup without an end sound ends with a monophonic clash file', () => {
    const { engine, backend } = makeFont([...POLY, 'lock.wav', 'clash1.wav']);
    engine.ignite(); engine.beginLockup('lock');
    engine.endLockup();
    expect(backend.playing('clash1.wav')).toHaveLength(1);
  });

  it('with no end sound and no clash file the lockup fades out over 0.3 s', () => {
    const { engine, backend } = makeFont([...POLY, 'lock.wav']);
    engine.ignite(); engine.beginLockup('drag');
    const [v] = backend.playing('lock.wav');
    engine.endLockup();
    expect(v.fadedOver).toBe(0.3);
    expect(backend.played().filter((n) => n.startsWith('cl'))).toEqual([]);
  });

  it('a begin sound ending after the lockup ended does not start the loop', () => {
    const { engine, backend } = makeFont([...POLY, 'bgnlock.wav', 'lock.wav']);
    engine.ignite(); engine.beginLockup('lock');
    const [v] = backend.playing('bgnlock.wav');
    engine.endLockup(); v.end();
    expect(backend.playing('lock.wav')).toEqual([]);
  });
});

describe('plain swings (no SmoothSwing), as hybrid_font.h StartSwing', () => {
  const cfg = plainSwingConfig({});
  const has = (names: string[]) => (e: string) => names.includes(e);

  it('uses ProffieOS\'s defaults and reads config.ini in any case', () => {
    expect(cfg).toEqual({ threshold: 250, lowerThreshold: 200, slashThreshold: 130, overlap: 0.5, sharpness: 0.5, maxVolume: 2, minAccel: 0, maxAccel: 0 });
    expect(plainSwingConfig({ proffieosswingspeedthreshold: '300' }).threshold).toBe(300);
  });

  it('starts an accent swing above the threshold, once, at the swing volume', () => {
    const base = { swinging: false, accel: 0, player: null, guessMonophonic: false };
    expect(plainSwingStep({ ...base, speed: 240 }, cfg, has(['swng']))).toEqual({ swinging: false, humVolume: 0.99 + 1.2 });
    const s = plainSwingStep({ ...base, speed: 300 }, cfg, has(['swng']));
    expect(s).toEqual({ swinging: true, start: 'swng', swingVolume: 2, humVolume: 1 });
    // Still swinging with the swing playing: nothing new.
    const again = plainSwingStep({ ...base, swinging: true, speed: 300, player: { pos: 0.1, length: 1, playing: true } }, cfg, has(['swng']));
    expect(again.start).toBeUndefined();
    // Between the thresholds the swing goes on; at or below the lower one it is over.
    expect(plainSwingStep({ ...base, swinging: true, speed: 220 }, cfg, has(['swng'])).swinging).toBe(true);
    expect(plainSwingStep({ ...base, swinging: true, speed: 200 }, cfg, has(['swng'])).swinging).toBe(false);
  });

  it('prefers swng, then swing, and a slash when accelerating hard and the font has slsh', () => {
    const base = { swinging: false, speed: 300, player: null, guessMonophonic: false };
    expect(plainSwingStep({ ...base, accel: 0 }, cfg, has(['swing'])).start).toBe('swing');
    expect(plainSwingStep({ ...base, accel: 200 }, cfg, has(['swng', 'slsh'])).start).toBe('slsh');
    expect(plainSwingStep({ ...base, accel: 100 }, cfg, has(['swng', 'slsh'])).start).toBe('swng');
    expect(plainSwingStep({ ...base, accel: 200 }, cfg, has(['swng'])).start).toBe('swng');
  });

  it('fades a swing out once the overlap fraction has played', () => {
    const s = plainSwingStep({ swinging: true, speed: 300, accel: 0, player: { pos: 0.6, length: 1, playing: true }, guessMonophonic: false }, cfg, has(['swng']));
    expect(s.fadeOut).toBeCloseTo(0.4);
    expect(s.start).toBeUndefined();
  });

  it('in the engine: a swing plays each time the blade passes the swing speed', () => {
    const { engine, backend } = makeFont([...POLY, 'swng01.wav']);
    engine.ignite();
    backend.ms = 1200; // the hum has faded in (humStart 100 ms before the end of the 1 s out, then 0.2 s)
    engine.motion(300, 1 / 60);
    const [v] = backend.playing('swng01.wav');
    expect(v.volume).toBe(2);
    engine.motion(300, 1 / 60);
    expect(backend.played().filter((n) => n === 'swng01.wav')).toHaveLength(1);
    engine.motion(100, 1 / 60);
    expect(backend.playing('hum.wav')[0].volume).toBeCloseTo(1.49);
    v.end();
    engine.motion(300, 1 / 60);
    expect(backend.played().filter((n) => n === 'swng01.wav')).toHaveLength(2);
    expect(engine.hasPlainSwings).toBe(true);
    expect(engine.hasSmoothSwing).toBe(false);
  });

  it('in a monophonic font the swing takes the hum\'s place, then the hum returns', () => {
    const { engine, backend } = makeFont(['hum.wav', 'poweron.wav', 'poweroff.wav', 'clash1.wav', 'swing1.wav']);
    engine.ignite();
    const [hum] = backend.playing('hum.wav');
    engine.motion(300, 1 / 60);
    expect(hum.clip?.name).toBe('swing1.wav');
    hum.end();
    expect(hum.clip?.name).toBe('hum.wav');
    expect(hum.opts.loop).toBe(true);
  });

  it('a swingl font with smoothsw.ini Version=0 plays plain swings', () => {
    const { engine, backend } = makeFont([...POLY, 'swingl1.wav', 'swingh1.wav', 'swng01.wav'], { smoothsw: { Version: '0' } });
    expect(engine.hasSmoothSwing).toBe(false);
    engine.ignite(); engine.motion(300, 1 / 60);
    expect(backend.played()).toContain('swng01.wav');
    expect(backend.played()).not.toContain('swingl1.wav');
  });
});

describe('SmoothSwing V2', () => {
  it('plays a low and a high swing with the same number, together, and crossfades them with swing speed', () => {
    const { engine, backend } = makeFont([...POLY, 'swingl1.wav', 'swingl2.wav', 'swingh1.wav', 'swingh2.wav', 'swng01.wav'], { random: () => 0.6 });
    expect(engine.hasSmoothSwing).toBe(true);
    expect(engine.hasPlainSwings).toBe(false);
    engine.ignite();
    const low = backend.playing('swingl2.wav'); const high = backend.playing('swingh2.wav');
    expect(low).toHaveLength(1); expect(high).toHaveLength(1);
    expect(low[0].opts.loop && high[0].opts.loop).toBe(true);
    expect(backend.played()).not.toContain('swingl1.wav');
    backend.ms = 1200; // the hum has faded in
    engine.motion(450, 1 / 60); // full strength
    expect(low[0].volume + high[0].volume).toBeCloseTo(3); // MaxSwingVolume
    expect(backend.playing('hum.wav')[0].volume).toBeCloseTo(0.25); // MaximumHumDucking 75
    expect(backend.played()).not.toContain('swng01.wav'); // accent swings are not played with SmoothSwing
    engine.motion(0, 1 / 60);
    expect(low[0].volume + high[0].volume).toBe(0);
  });

  it('plecter lswing/hswing names count as SmoothSwing', () => {
    const { engine, backend } = makeFont([...POLY, 'lswing1.wav', 'hswing1.wav']);
    expect(engine.hasSmoothSwing).toBe(true);
    engine.ignite();
    expect(backend.played()).toEqual(expect.arrayContaining(['lswing1.wav', 'hswing1.wav']));
  });
});

describe('four details of hybrid_font.h, as ProffieOS has them', () => {
  const ignited = (files: Record<string, number> | string[], ini: Record<string, string> = {}) => {
    const { engine, backend } = makeFont(files, { ini });
    engine.ignite();
    const hum = backend.voices.find((v) => v.opts.loop && v.fadeIn);
    return { engine, backend, hum };
  };

  // FontConfigFile: CONFIG_VARIABLE2(humStart, 100); ConfigFile::SetVariable matches names with strcasecmp.
  it('humStart is 100 ms before the end of the ignition sound unless config.ini says otherwise, in any letter case', () => {
    const files = { 'hum.wav': 1, 'out01.wav': 2, 'in01.wav': 1 };
    expect(ignited(files).hum!.fadeIn!.after).toBeCloseTo(1.9);
    expect(ignited(files, { humStart: '500' }).hum!.fadeIn!.after).toBeCloseTo(1.5);
    expect(ignited(files, { HUMSTART: '500' }).hum!.fadeIn!.after).toBeCloseTo(1.5);
    expect(ignited(files, { humstart: '0' }).hum!.fadeIn!.after).toBe(0);
  });

  // FontConfigFile::iterateVariables registers `ProffieOS.SFX.<name>.paired`; Effect::FileID::GetFollowing uses it.
  it('pairs files by number with the key ProffieOS.SFX.<effect>.paired, in any letter case', () => {
    const files = ['hum.wav', 'preon1.wav', 'preon2.wav', 'out1.wav', 'out2.wav', 'in01.wav'];
    const run = (ini: Record<string, string>) => {
      const rolls = [0.99, 0, 0, 0]; // preon picks the second file; unpaired, out would pick the first
      const { engine, backend } = makeFont(files, { ini, random: () => rolls.shift() ?? 0 });
      engine.preon();
      return backend.played().filter((n) => n.startsWith('preon') || n.startsWith('out'));
    };
    expect(run({ 'ProffieOS.SFX.preon.paired': '1' })).toEqual(['preon2.wav', 'out2.wav']);
    expect(run({ 'proffieos.sfx.preon.PAIRED': '1' })).toEqual(['preon2.wav', 'out2.wav']);
    // The shorter spelling is not a key the firmware knows, and nothing is paired without a key.
    expect(run({ 'SFX.preon.paired': '1' })).toEqual(['preon2.wav', 'out1.wav']);
    expect(run({})).toEqual(['preon2.wav', 'out1.wav']);
  });

  // getHum(): SFX_humm ? &SFX_humm : &SFX_hum. A monophonic-hum font plays SFX_hum explicitly (SB_On).
  it('prefers humm to hum, but a font whose hum is part of its poweron plays hum', () => {
    const has = (names: string[]) => { const g = groupSounds(names); return (e: string) => !!g[e]; };
    expect(effectAliases('hum', has(['hum.wav', 'humm.wav', 'out01.wav', 'in01.wav']))).toEqual(['humm', 'hum']);
    expect(effectAliases('hum', has(['hum.wav', 'poweron.wav', 'poweroff.wav']))).toEqual(['hum']);
    const { backend } = ignited({ 'hum.wav': 1, 'humm.wav': 1, 'out01.wav': 2, 'in01.wav': 1 });
    expect(backend.playing('humm.wav')[0]?.opts.loop).toBe(true);
    expect(backend.playing('hum.wav')).toEqual([]);
  });

  // Effect::GetName counts files by number (strtol), so tr10 is after tr2, and a file without a number is last.
  it('puts numbered files in number order, not text order', () => {
    expect(groupSounds(['tr10.wav', 'tr2.wav', 'tr1.wav', 'tr.wav']).tr).toEqual(['tr1.wav', 'tr2.wav', 'tr10.wav', 'tr.wav']);
    expect(groupSounds(['tr/010.wav', 'tr/002.wav']).tr).toEqual(['tr/002.wav', 'tr/010.wav']);
  });
});
