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
    for (const u of report.unsupported) expect(['RotateColorsX', 'FireConfig', 'IgnitionTime', 'RetractionTime']).toContain(u);
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
