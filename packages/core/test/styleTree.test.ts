import { describe, expect, it } from 'vitest';
import { BladeSim, registerStyleSim, unregisterStyleSim } from '../src/sim';
import { CATALOGUE, cloneNode, defaultFor, evaluateStyle, kindOf, newNode, paramFor, parseStyle, printStyle } from '../src/styleTree';

const USER_EXAMPLE = `Layers<Red, ResponsiveLockupL<White,TrInstant,TrFade<100>,Int<26000>>, ResponsiveLightningBlockL<White>, ResponsiveMeltL<Mix<TwistAngle<>,Red,Yellow>>, ResponsiveDragL<White>, ResponsiveClashL<White,TrInstant,TrFade<200>,Int<26000>>, ResponsiveBlastL<White>, ResponsiveBlastWaveL<White>, ResponsiveBlastFadeL<White>, ResponsiveStabL<White>, InOutTrL<TrWipe<300>,TrWipeIn<500>>>`;

const REAL_WORLD = [
  'StylePtr<Layers<Rgb<0,0,255>, AudioFlickerL<Rgb<0,0,180>>, BlastL<White>, SimpleClashL<White>, LockupTrL<AlphaL<White, Bump<Int<16384>, Int<12000>>>, TrInstant, TrFade<200>, SaberBase::LOCKUP_NORMAL>, InOutTrL<TrWipeSparkTip<White,300>, TrWipeInSparkTip<White,500>>>>()',
  'Layers<StyleFire<BrownNoiseFlicker<RotateColorsX<Variation,Red>,RotateColorsX<Variation,Rgb<60,0,0>>,300>,RotateColorsX<Variation,Rgb<80,0,0>>,0,6,FireConfig<10,1000,2>,FireConfig<2000,1000,5>,FireConfig<0,0,10>,FireConfig<10,1000,2>>, TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<8000>>>,TrFade<300>>,EFFECT_CLASH>, TransitionLoopL<TrConcat<TrFade<500>,White,TrDelay<200>,White,TrFade<500>>>, InOutTrL<TrWipeX<IgnitionTime<300>>,TrWipeInX<RetractionTime<500>>>>',
  'Layers<Stripes<3000,-1000,Blue,Rgb<0,0,60>,Cyan>, AlphaL<Rainbow, SwingSpeed<400>>, ResponsiveClashL<White>, InOutTrL<TrCenterWipeX<Int<300>>, TrCenterWipeInX<Int<500>>>>',
  'Layers<Mix<Sin<Int<12>>,Red,Orange>, Mix<SmoothStep<Scale<BladeAngle<>,Int<0>,Int<32768>>,Int<6000>>,Transparent,White>, ResponsiveBlastL<White,Int<400>,Int<100>,Int<400>>, InOutTrL<TrWipe<300>,TrWipeIn<500>>>',
  'Layers<RgbArg<BASE_COLOR_ARG,Rgb<0,255,0>>, AlphaL<RgbArg<SWING_COLOR_ARG,White>, SwingSpeed<300>>, BlastL<RgbArg<BLAST_COLOR_ARG,White>>, InOutTrL<TrWipeX<IgnitionTime<>>,TrWipeInX<RetractionTime<>>,Black>>',
];

function runOn(text: string, ms = 1500) {
  const { make, report } = evaluateStyle(parseStyle(text));
  registerStyleSim('t', make);
  try {
    const sim = new BladeSim('t', 40); sim.frame(0); sim.setOn(true);
    const frames: number[][] = [];
    for (let t = 0; t < ms; t += 50) frames.push([...sim.frame(t)]);
    if (ms > 800) { sim.trigger('clash'); frames.push([...sim.frame(ms + 10)]); sim.setLockup('normal'); frames.push([...sim.frame(ms + 100)]); sim.setLockup(null); frames.push([...sim.frame(ms + 400)]); }
    return { frames, report };
  } finally { unregisterStyleSim('t'); }
}

describe('style tree', () => {
  it('parses and prints the user example without loss', () => {
    const tree = parseStyle(USER_EXAMPLE);
    expect(tree.name).toBe('Layers');
    expect(tree.args).toHaveLength(11);
    expect(tree.args[3].args[0].name).toBe('Mix');
    const again = parseStyle(printStyle(tree));
    expect(again).toEqual(tree);
    expect(printStyle(tree).replace(/\s/g, '')).toBe(USER_EXAMPLE.replace(/\s/g, ''));
  });

  it('strips the StylePtr wrapper and trailing ()', () => {
    const tree = parseStyle(REAL_WORLD[0]);
    expect(tree.name).toBe('Layers');
    expect(printStyle(tree)).not.toContain('StylePtr');
  });

  it('rejects broken input with a useful message', () => {
    expect(() => parseStyle('Layers<Red, ')).toThrow(/Expected/);
    expect(() => parseStyle('Layers<Red>>')).toThrow(/Unexpected text/);
  });

  it('knows every template in the user example and its parameter kinds', () => {
    const tree = parseStyle(USER_EXAMPLE);
    for (const n of tree.args) if (n.args.length) expect(CATALOGUE[n.name], n.name).toBeDefined();
    expect(kindOf(tree.args[0])).toBe('COLOR');
    expect(kindOf(tree.args[1])).toBe('COLOR');
    expect(kindOf(tree.args[1].args[1])).toBe('TRANSITION');
    expect(kindOf(tree.args[1].args[3])).toBe('FUNCTION');
    expect(paramFor(CATALOGUE.ResponsiveLockupL, 3)?.name).toBe('TOP');
    expect(paramFor(CATALOGUE.Layers, 7)?.name).toBe('LAYER');
  });

  it('runs the user example on the simulator with nothing unsupported and every effect lighting up', () => {
    const { frames, report } = runOn(USER_EXAMPLE);
    expect(report.unsupported).toEqual([]);
    const lit = (f: number[]) => f.reduce((a, b) => a + b, 0);
    expect(lit(frames[0])).toBeLessThan(lit(frames[10])); // wiping in
    const mid = frames[10];
    expect(mid[0]).toBeGreaterThan(0.8); expect(mid[1]).toBeLessThan(0.15); // red
    const clash = frames[frames.length - 3];
    expect(clash.some((v, i) => i % 3 === 2 && v > 0.4)).toBe(true); // white clash flash somewhere
    const lockup = frames[frames.length - 2];
    expect(lockup.some((v, i) => i % 3 === 2 && v > 0.4)).toBe(true);
  });

  it.each(REAL_WORLD)('runs a real-world style: %s', (text) => {
    const { frames, report } = runOn(text);
    expect(frames.every((f) => f.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))).toBe(true);
    expect(frames.some((f) => f.some((v) => v > 0))).toBe(true);
    // Only templates that are genuinely cosmetic or unmodelled are allowed through unsupported.
    expect(report.unsupported).toEqual([]);
  });

  it('builds sensible new nodes from the catalogue', () => {
    const n = newNode('ResponsiveClashL');
    expect(n.args.length).toBeGreaterThanOrEqual(1);
    expect(kindOf(n.args[0])).toBe('COLOR');
    expect(printStyle(newNode('TrFade'))).toBe('TrFade<300>');
    expect(defaultFor('TRANSITION').name).toBe('TrInstant');
    const c = cloneNode(n); c.args[0].name = 'Blue'; expect(n.args[0].name).not.toBe('Blue');
  });
});

// Constructs the big library styles lean on: layers inside Mix, TransitionEffect with a layer base, TrWaveX/TrExtend/
// TrJoin/TrDelay, AlphaMixL, Strobe, RotateColorsX, melt kept apart from drag, and edit-mode IntArgs. Built here
// rather than pasted from a library, so the test carries no one else's style.
const LIBRARY_SHAPED = `StylePtr<Layers<
  AudioFlicker<Stripes<22000,-1400,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,Mix<Int<10000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,
  TransitionEffectL<TrWaveX<RgbArg<BLAST_COLOR_ARG,White>,Scale<EffectRandomF<EFFECT_BLAST>,Int<100>,Int<400>>,Int<100>,Int<400>,Scale<EffectPosition<EFFECT_BLAST>,Int<28000>,Int<8000>>>,EFFECT_BLAST>,
  Mix<IsLessThan<ClashImpactF<>,Int<26000>>,
      TransitionEffectL<TrConcat<TrInstant,AlphaL<RgbArg<CLASH_COLOR_ARG,White>,Bump<Scale<BladeAngle<>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Int<20000>>>,TrFadeX<Int<300>>>,EFFECT_CLASH>,
      TransitionEffectL<TrWaveX<RgbArg<CLASH_COLOR_ARG,White>,Int<200>,Int<100>,Int<300>,Int<16384>>,EFFECT_CLASH>>,
  LockupTrL<TransitionEffect<AlphaL<AlphaMixL<Bump<Int<16384>,Int<20000>>,AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,White>,Blue>,BrownNoiseFlicker<RgbArg<LOCKUP_COLOR_ARG,White>,Blue,300>>,Bump<Int<16384>,Int<20000>>>,RgbArg<LOCKUP_COLOR_ARG,White>,TrExtend<5000,TrInstant>,TrFade<5000>,EFFECT_LOCKUP_BEGIN>,
            TrConcat<TrJoin<TrDelay<50>,TrInstant>,RgbArg<LOCKUP_COLOR_ARG,White>,TrFade<300>>,TrConcat<TrInstant,RgbArg<LOCKUP_COLOR_ARG,White>,TrFade<400>>,SaberBase::LOCKUP_NORMAL,Int<1>>,
  ResponsiveLightningBlockL<Strobe<RgbArg<LB_COLOR_ARG,White>,AudioFlicker<RgbArg<LB_COLOR_ARG,White>,Blue>,50,1>,TrConcat<TrExtend<200,TrInstant>,AlphaL<White,Bump<Int<16384>,Int<10000>>>,TrFade<200>>,TrConcat<TrInstant,White,TrFade<400>>,Int<1>>,
  LockupTrL<AlphaL<TransitionEffect<RandomPerLEDFlickerL<RgbArg<DRAG_COLOR_ARG,White>>,BrownNoiseFlickerL<RgbArg<DRAG_COLOR_ARG,White>,Int<300>>,TrExtend<4000,TrInstant>,TrFade<4000>,EFFECT_DRAG_BEGIN>,SmoothStep<Scale<TwistAngle<>,IntArg<DRAG_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_DRAG,Int<1>>,
  LockupTrL<AlphaL<Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_MELT,Int<1>>,
  InOutTrL<TrWipeX<BendTimePowInvX<IgnitionTime<300>,Mult<IntArg<IGNITION_OPTION2_ARG,10992>,Int<98304>>>>,TrWipeInX<BendTimePowX<RetractionTime<0>,Mult<IntArg<RETRACTION_OPTION2_ARG,10992>,Int<98304>>>>,Black>>>(),`;

describe('library-shaped style', () => {
  const led = (f: Float32Array, i: number) => [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]];
  /** LEDs showing anything: the wipes are spatial, so this is monotonic where total brightness (stripes, flicker) is not. */
  const lit = (f: Float32Array) => { let n = 0; for (let i = 0; i < f.length; i += 3) if (f[i] + f[i + 1] + f[i + 2] > 0.05) n++; return n; };
  const start = (ignite = false) => {
    const { make, report } = evaluateStyle(parseStyle(LIBRARY_SHAPED));
    registerStyleSim('lib', make);
    const sim = new BladeSim('lib', 40);
    sim.frame(0); sim.setOn(true);
    if (ignite) for (let t = 0; t <= 1500; t += 50) sim.frame(t);
    return { sim, report };
  };

  it('parses, prints and round-trips with the trailing comma dropped', () => {
    const tree = parseStyle(LIBRARY_SHAPED);
    expect(parseStyle(printStyle(tree))).toEqual(tree);
    expect(printStyle(tree)).not.toMatch(/StylePtr|\(\)/);
  });

  it('models every template in it', () => {
    const { report } = start();
    expect(report.unsupported).toEqual([]);
    unregisterStyleSim('lib');
  });

  it('wipes in, idles blue, then retracts', () => {
    const { sim } = start();
    try {
      const s = [0, 100, 200, 300, 600].map((t) => lit(sim.frame(t)));
      expect(s[0]).toBeLessThan(s[1]); expect(s[1]).toBeLessThan(s[2]); expect(s[2]).toBeLessThan(s[3]); expect(s[4]).toBe(40);
      const idle = led(sim.frame(1500), 20);
      expect(idle[2]).toBeGreaterThan(0.2); expect(idle[0]).toBeLessThan(0.05);
      sim.setOn(false);
      const r = [3000, 3300, 3600, 4100].map((t) => lit(sim.frame(t))); // RetractionTime<0> falls back to the sound length, 1 s
      expect(r[0]).toBeGreaterThan(r[1]); expect(r[1]).toBeGreaterThan(r[2]); expect(r[3]).toBe(0);
    } finally { unregisterStyleSim('lib'); }
  });

  it('answers clash, blast, lockup, drag, melt and lightning block distinctly', () => {
    const { sim } = start(true);
    try {
      sim.trigger('clash', 0.5); const c = sim.frame(1520);
      expect(led(c, 20)[0]).toBeGreaterThan(0.9); // white at the clash point, blue elsewhere
      expect(led(c, 39)[0]).toBeLessThan(0.3);
      sim.trigger('blast', 0.5); const b = sim.frame(1720);
      expect([...b].some((v, i) => i % 3 === 0 && v > 0.5)).toBe(true);
      sim.setLockup('normal'); sim.frame(2100); const l = sim.frame(2200);
      expect(led(l, 20)[0]).toBeGreaterThan(0.9);
      sim.setLockup(null); sim.frame(2900);
      sim.setLockup('drag'); sim.frame(3000); const d = sim.frame(3250);
      expect(led(d, 39)[1]).toBeGreaterThan(0.4); expect(led(d, 39)[2]).toBeGreaterThan(0.9); // white sparks at the tip
      sim.setLockup(null); sim.frame(3600);
      sim.setLockup('melt'); sim.frame(3700); const m = sim.frame(3950);
      expect(led(m, 39)[0]).toBeGreaterThan(0.9); expect(led(m, 39)[2]).toBeLessThan(0.1); // orange at the tip, not white
      sim.setLockup(null); sim.frame(4300);
      sim.setLockup('lb'); const lb = sim.frame(4700);
      expect([...lb].some((v, i) => i % 3 === 0 && v > 0.8)).toBe(true);
    } finally { unregisterStyleSim('lib'); }
  });

  it('reads the edit-mode arguments a preset can change', () => {
    const { make, report } = evaluateStyle(parseStyle(LIBRARY_SHAPED));
    expect(report.unsupported).toEqual([]);
    registerStyleSim('lib', make);
    try {
      const sim = new BladeSim('lib', 40);
      sim.setArgs(new Map([[1, '65535,0,0']])); sim.frame(0); sim.setOn(true); for (let t = 0; t <= 2000; t += 50) sim.frame(t);
      const p = led(sim.frame(2100), 20);
      expect(p[0]).toBeGreaterThan(0.2); expect(p[2]).toBeLessThan(0.05); // base colour followed the argument
    } finally { unregisterStyleSim('lib'); }
  });
});

// A style that steers the prop, the way Fett263's Cortosis Clash ability does: a special ability arms it for 3 s, a
// clash then makes the style turn the saber off (TrDoEffect + EFFECT_FAST_OFF), spark at the emitter while it is
// off, ask for its own sounds (EFFECT_TRANSITION_SOUND) and re-ignite it (EFFECT_FAST_ON). Written here rather than
// pasted from the library.
const CONTROL_LOOP = `Layers<Blue,
  TransitionPulseL<TrConcat<TrExtend<300,TrDoEffectX<TrInstant,EFFECT_TRANSITION_SOUND,Int<1>>>,TrDoEffect<TrWipeIn<100>,EFFECT_FAST_OFF>,TrDelay<1000>>,Mult<EffectPulseF<EFFECT_CLASH>,HoldPeakF<EffectPulseF<EFFECT_USER1>,Int<3000>,Int<32768>>>>,
  TransitionEffectL<TrDoEffectX<TrInstant,EFFECT_TRANSITION_SOUND,Int<0>>,EFFECT_USER1>,
  TransitionEffectL<TrConcat<TrDelay<1000>,TrExtendX<Int<2000>,TrDoEffectAlwaysX<TrInstant,EFFECT_TRANSITION_SOUND,Int<2>>>,TrExtend<500,TrDoEffectAlwaysX<TrWipe<300>,EFFECT_TRANSITION_SOUND,Int<3>>>,TrDoEffectAlways<TrFade<300>,EFFECT_FAST_ON>>,EFFECT_FAST_OFF>,
  ResponsiveClashL<White>,
  InOutTrL<TrWipe<300>,TrWipeIn<500>,Black>,
  TransitionEffectL<TrConcat<TrDelay<1000>,AlphaL<BrownNoiseFlickerL<Blue,Int<300>>,SmoothStep<Int<1000>,Int<-500>>>,TrExtendX<Int<2000>,TrInstant>,AlphaL<RandomFlicker<Black,BrownNoiseFlickerL<Blue,Int<300>>>,SmoothStep<Int<1000>,Int<-500>>>,TrExtend<500,TrWipe<300>>,Mix<SmoothStep<Int<10000>,Int<2000>>,Blue,Black>,TrFade<300>>,EFFECT_FAST_OFF>>`;

describe('a style that steers the prop', () => {
  const lit = (f: Float32Array) => { let n = 0; for (let i = 0; i < f.length; i += 3) if (f[i] + f[i + 1] + f[i + 2] > 0.05) n++; return n; };

  it('is fully modelled', () => {
    const { report } = evaluateStyle(parseStyle(CONTROL_LOOP));
    expect(report.unsupported).toEqual([]);
  });

  it('turns the saber off on an armed clash, sparks at the emitter, then re-ignites it', () => {
    registerStyleSim('ctl', evaluateStyle(parseStyle(CONTROL_LOOP)).make);
    try {
      const sim = new BladeSim('ctl', 40);
      const events: string[] = [];
      sim.onEffect = (e) => { events.push(e.type + (e.wavnum >= 0 ? `#${e.wavnum}` : '')); };
      sim.frame(0); sim.setOn(true);
      for (let t = 50; t <= 2000; t += 50) sim.frame(t);
      expect(sim.isOn).toBe(true); expect(lit(sim.frame(2000))).toBe(40);
      // An unarmed clash does nothing to the prop.
      sim.trigger('clash'); for (let t = 2050; t <= 2600; t += 50) sim.frame(t);
      expect(sim.isOn).toBe(true); expect(events.filter((e) => e.startsWith('EFFECT_FAST'))).toEqual([]);
      // Arm, then clash within three seconds.
      sim.raise('EFFECT_USER1'); sim.frame(2650);
      sim.trigger('clash'); sim.frame(2700);
      const seen: Record<string, number> = {}; const at = (name: string) => { for (let t = 2750; t <= 9000; t += 50) { sim.frame(t); if (events.includes(name) && seen[name] == null) seen[name] = t; } };
      at('EFFECT_FAST_ON');
      expect(events.indexOf('EFFECT_TRANSITION_SOUND#0')).toBeGreaterThanOrEqual(0); // the arming sound
      expect(events.indexOf('EFFECT_TRANSITION_SOUND#1')).toBeGreaterThan(events.indexOf('EFFECT_TRANSITION_SOUND#0')); // the clash sound
      const off = events.indexOf('EFFECT_FAST_OFF'); const on = events.indexOf('EFFECT_FAST_ON');
      expect(off).toBeGreaterThan(events.indexOf('EFFECT_TRANSITION_SOUND#1'));
      expect(events[off + 1]).toBe('EFFECT_RETRACTION'); // the prop turned it off
      expect(events.indexOf('EFFECT_TRANSITION_SOUND#2')).toBeGreaterThan(off); // the sparking sound
      expect(events.indexOf('EFFECT_TRANSITION_SOUND#3')).toBeGreaterThan(events.indexOf('EFFECT_TRANSITION_SOUND#2')); // the partial flame
      expect(on).toBeGreaterThan(events.indexOf('EFFECT_TRANSITION_SOUND#3'));
      expect(events[on + 1]).toBe('EFFECT_IGNITION'); // and back on
      expect(sim.isOn).toBe(true);
    } finally { unregisterStyleSim('ctl'); }
  });

  it('shows sparks only at the emitter while shorted out, and the blade back afterwards', () => {
    registerStyleSim('ctl', evaluateStyle(parseStyle(CONTROL_LOOP)).make);
    try {
      const sim = new BladeSim('ctl', 40);
      sim.frame(0); sim.setOn(true); for (let t = 50; t <= 2000; t += 50) sim.frame(t);
      sim.raise('EFFECT_USER1'); sim.frame(2050); sim.trigger('clash'); sim.frame(2100);
      for (let t = 2150; t <= 4000; t += 50) sim.frame(t); // off at ~2400, sparking from ~3500
      expect(sim.isOn).toBe(false);
      let sparks = 0; let tipLit = 0;
      for (let t = 4050; t <= 5000; t += 50) { const f = sim.frame(t); if (f[0] + f[1] + f[2] > 0.05) sparks++; if (f[39 * 3] + f[39 * 3 + 1] + f[39 * 3 + 2] > 0.05) tipLit++; }
      expect(sparks).toBeGreaterThan(3); expect(tipLit).toBe(0);
      for (let t = 5050; t <= 8000; t += 50) sim.frame(t);
      expect(sim.isOn).toBe(true); expect(lit(sim.frame(8000))).toBe(40);
    } finally { unregisterStyleSim('ctl'); }
  });
});
