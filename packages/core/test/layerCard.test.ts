import { describe, expect, it } from 'vitest';
import { LIBRARY_LOOKS, LOOK_FX, RECIPES, at, numberUnit, paramLabel, waveSize, waveWidth, curvePoints, unlockPair, unpackTemplate, pairEnds, setCurvePoints, setPairEnds, colourNode, colourView, composedName, describeComposed, layerCue, numNode, numView, parseStyle, printStyle, readBase, readLayer, setAt, setShape, setStrength, setWhen, trNode, trView, type LayerCard, type Node } from '../src';

const P = (s: string): Node => parseStyle(s);
const S = (n: Node): string => printStyle(n).replace(/\s+/g, '');
type Composed = Extract<LayerCard, { form: 'composed' }>;
const composed = (s: string): [Node, Composed] => { const n = P(s); const c = readLayer(n); if (c.form !== 'composed') throw new Error(`${s} read as ${c.form}`); return [n, c]; };
const words = (w: ReturnType<typeof describeComposed>): string => w.map((p) => (typeof p === 'string' ? p : p.b)).join('');

// The style the owner pasted into the review: a dripping lockup spot, a clash, a wipe in and out.
const PASTED = 'Layers<AudioFlicker<Blue,Rgb<0,0,128>>,LockupTrL<AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Scale<SwingSpeed<100>,Int<9000>,Int<14000>>>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>,ResponsiveClashL<White,TrInstant,TrFade<200>>,InOutTrL<TrWipe<300>,TrWipeIn<500>>>';

describe('numbers', () => {
  it('reads fixed and following values', () => {
    expect(numView(P('Int<500>'))).toEqual({ mode: 'fixed', value: 500 });
    expect(numView(P('300'))).toEqual({ mode: 'fixed', value: 300 });
    expect(numView(P('Scale<BladeAngle<>,Int<26000>,Int<6000>>'))).toEqual({ mode: 'follow', sensor: 'angle', from: 26000, to: 6000, window: [0, 32768] });
    expect(numView(P('Scale<SwingSpeed<100>,Int<9000>,Int<14000>>'))).toEqual({ mode: 'follow', sensor: 'swing', from: 9000, to: 14000, window: [0, 100] });
    expect(numView(P('Scale<BladeAngle<>,Scale<SwingSpeed<1>,Int<1>,Int<2>>,Int<3>>')).mode).toBe('other');
    expect(numView(P('Sin<Int<10>>')).mode).toBe('other');
    expect(numView(P('BladeAngle<>'))).toEqual({ mode: 'follow', sensor: 'angle', from: 0, to: 32768, window: [0, 32768] });
    expect(S(numNode({ mode: 'follow', sensor: 'angle', from: 0, to: 32768, window: [9000, 23768] }, P('BladeAngle<9000,23768>')))).toBe('BladeAngle<9000,23768>');
    expect(numView(P('Scale<BladeAngle<0,16000>,Int<4000>,Int<26000>>'))).toEqual({ mode: 'follow', sensor: 'angle', from: 4000, to: 26000, window: [0, 16000] });
  });
  it('writes them back, keeping the sensor it had', () => {
    const prev = P('Scale<SwingSpeed<100>,Int<9000>,Int<14000>>');
    expect(S(numNode({ mode: 'follow', sensor: 'swing', from: 1, to: 2, window: [0, 100] }, prev))).toBe('Scale<SwingSpeed<100>,Int<1>,Int<2>>');
    expect(S(numNode({ mode: 'follow', sensor: 'swing', from: 1, to: 2, window: [0, 250] }, prev))).toBe('Scale<SwingSpeed<250>,Int<1>,Int<2>>');
    expect(S(numNode({ mode: 'follow', sensor: 'angle', from: 1, to: 2, window: null }, prev))).toBe('Scale<BladeAngle<>,Int<1>,Int<2>>');
    expect(S(numNode({ mode: 'follow', sensor: 'angle', from: 1, to: 2, window: [8000, 24000] }, prev))).toBe('Scale<BladeAngle<8000,24000>,Int<1>,Int<2>>');
    expect(S(numNode({ mode: 'fixed', value: 7 }, prev))).toBe('Int<7>');
    expect(S(numNode({ mode: 'fixed', value: 7 }, undefined, true))).toBe('7');
  });
});

describe('colours and transitions', () => {
  it('reads plain and live colours, keeps a named colour named', () => {
    expect(colourView(P('White'))).toEqual({ hex: '#ffffff', arg: null });
    expect(colourView(P('RgbArg<LOCKUP_COLOR_ARG,Rgb<255,0,10>>'))).toEqual({ hex: '#ff000a', arg: 'LOCKUP_COLOR_ARG' });
    expect(colourView(P('AudioFlicker<Blue,Red>'))).toBeNull();
    expect(S(colourNode({ hex: '#ffffff', arg: 'LOCKUP_COLOR_ARG' }, P('White')))).toBe('RgbArg<LOCKUP_COLOR_ARG,White>');
    expect(S(colourNode({ hex: '#ff0000', arg: null }, P('RgbArg<LOCKUP_COLOR_ARG,White>')))).toBe('Rgb<255,0,0>');
  });
  it('reads plain, X and live-time transitions and keeps their form', () => {
    expect(trView(P('TrFade<200>'))).toEqual({ base: 'TrFade', ms: 200, live: null, x: false });
    const live = trView(P('TrWipeX<IgnitionTime<300>>'));
    expect(live).toEqual({ base: 'TrWipe', ms: 300, live: 'ignition', x: true });
    expect(S(trNode({ ...live!, base: 'TrCenterWipe', ms: 400 }, live))).toBe('TrCenterWipeX<IgnitionTime<400>>');
    expect(S(trNode({ base: 'TrFade', ms: 250, live: null, x: false }, trView(P('TrWipeX<Int<300>>'))))).toBe('TrFadeX<Int<250>>');
    expect(trView(P('TrWipeSparkTip<White,300>'))).toBeNull();
  });
});

describe('reading layers', () => {
  it('lays the pasted lockup out as a spot, during a lockup', () => {
    const tree = P(PASTED);
    const [lockup, card] = [tree.args[1], readLayer(tree.args[1]) as Composed];
    expect(card.form).toBe('composed');
    expect(card.when.type).toBe('lockup');
    expect(card.where.shape).toBe('spot');
    expect(S(at(lockup, card.colour)!)).toBe('White');
    if (card.where.shape !== 'spot' || card.when.type !== 'lockup') throw new Error('shape');
    expect(numView(at(lockup, card.where.pos))).toEqual({ mode: 'follow', sensor: 'angle', from: 26000, to: 6000, window: [0, 32768] });
    expect(numView(at(lockup, card.where.size))).toEqual({ mode: 'follow', sensor: 'swing', from: 9000, to: 14000, window: [0, 100] });
    expect(S(at(lockup, card.when.outTr)!)).toBe('TrFade<100>');
    expect(composedName(lockup, card)).toBe('Lockup spot');
    expect(words(describeComposed(lockup, card, () => 'White'))).toBe('Paints a white spot while you hold a normal lockup. It runs toward whichever end of the blade is lower. It gets bigger as you swing faster.');
    expect(layerCue(lockup, card)).toEqual({ lockup: 'normal' });
  });

  it('reads the effect layers and the ignition as template cards', () => {
    const tree = P(PASTED);
    const clash = readLayer(tree.args[2]);
    expect(clash.form).toBe('template');
    if (clash.form !== 'template') return;
    expect(clash.when).toBe('On each clash');
    expect(clash.slots.map((s) => `${s.role}:${s.label}:${s.present}`)).toEqual(['what:Colour:true', 'when:Comes in:true', 'when:Goes out:true', 'where:Position, pointing down:false', 'where:Position, pointing up:false', 'where:Size:false']);
    expect(layerCue(tree.args[2], clash)).toEqual({ effect: 'EFFECT_CLASH' });
    const io = readLayer(tree.args[3]);
    expect(io.form === 'template' && io.slots.map((s) => s.label)).toEqual(['Ignition', 'Retraction', 'When off', 'Power down when retracted']);
    const base = readBase(tree.args[0]);
    expect(base.form === 'template' && base.slots.map((s) => s.label)).toEqual(['Quiet', 'Loud']);
  });

  it('reads effects wrapped in TransitionEffectL, tips, glows and see-through colours', () => {
    const [flash, fc] = composed('TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<16000>>>,TrFade<300>>,EFFECT_CLASH>');
    expect([fc.when.type, fc.where.shape, composedName(flash, fc)]).toEqual(['effect', 'spot', 'Clash spot']);
    expect(layerCue(flash, fc)).toEqual({ effect: 'EFFECT_CLASH' });
    expect(composed('AlphaL<Orange,SmoothStep<Int<29000>,Int<2000>>>')[1].where.shape).toBe('tip');
    expect(composed('AlphaL<White,SmoothStep<Int<3000>,Int<-2000>>>')[1].where.shape).toBe('hilt');
    const [glow, gc] = composed('AlphaL<White,Scale<SwingSpeed<400>,Int<0>,Int<20000>>>');
    expect(gc.where).toEqual({ shape: 'whole', strength: [1] });
    expect(words(describeComposed(glow, gc, () => 'White'))).toBe('Paints the whole blade white. It gets stronger as you swing faster.');
    expect(composed('AlphaL<Red,LayerFunctions<Bump<Int<0>>,Bump<Int<32768>>>>')[1].where.shape).toBe('custom');
    // A lockup whose colour is a pattern: still a card, the colour slot opens as a tree.
    const [, pc] = composed('LockupTrL<AudioFlicker<White,Red>,TrInstant,TrFade<200>,SaberBase::LOCKUP_NORMAL>');
    expect([pc.when.type, pc.where.shape]).toEqual(['lockup', 'whole']);
  });

  it('leaves what it does not know as a tree', () => {
    expect(readLayer(P('TransitionLoopL<TrConcat<TrFade<800>,AlphaL<White,Int<8000>>,TrFade<800>>>')).form).toBe('template');
    expect(readLayer(P('Layers<Red,Blue>')).form).toBe('tree');
    const mix = readBase(P('Mix<Sin<Int<24>>,Blue,Cyan>'));
    expect(mix.form === 'template' && mix.slots.map((s) => `${s.label}:${s.extra}`)).toEqual(['Mix by:false', 'Colour:true', 'Colour:true']);
    expect(readBase(P('Rainbow')).form).toBe('template');
    expect(readLayer(P('NotAThing<1,2>')).form).toBe('tree');
    expect(readLayer(P('BlastL<White,200,100,400,EFFECT_BLAST,9>')).form).toBe('tree'); // more arguments than it takes
  });
});

describe('changing a layer', () => {
  const [lockup, card] = composed('LockupTrL<AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Int<10000>>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');

  it('edits one slot and leaves the rest as written', () => {
    if (card.where.shape !== 'spot') throw new Error('shape');
    const next = setAt(lockup, card.where.size, numNode({ mode: 'fixed', value: 5000 }, at(lockup, card.where.size)));
    expect(S(next)).toBe('LockupTrL<AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Int<5000>>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');
  });

  it('appends a size a Bump left to its default', () => {
    const [n, c] = composed('AlphaL<White,Bump<Int<16384>>>');
    if (c.where.shape !== 'spot') throw new Error('shape');
    expect(at(n, c.where.size)).toBeUndefined();
    expect(S(setAt(n, c.where.size, P('Int<4000>')))).toBe('AlphaL<White,Bump<Int<16384>,Int<4000>>>');
  });

  it('switches shape, keeping the colour and the position', () => {
    expect(S(setShape(lockup, card, 'tip'))).toBe('LockupTrL<AlphaL<White,SmoothStep<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Int<2000>>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');
    expect(S(setShape(lockup, card, 'whole'))).toBe('LockupTrL<White,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');
  });

  it('switches trigger, keeping the transitions', () => {
    const fx = setWhen(lockup, card, 'effect');
    expect(S(fx)).toBe('TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Int<10000>>>,TrFade<100>>,EFFECT_BLAST>');
    const back = readLayer(fx) as Composed;
    expect(S(setWhen(fx, back, 'lockup'))).toBe(S(lockup).replace('LOCKUP_NORMAL', 'LOCKUP_NORMAL'));
    expect(S(setWhen(lockup, card, 'always'))).toBe('AlphaL<White,Bump<Scale<BladeAngle<>,Int<26000>,Int<6000>>,Int<10000>>>');
  });

  it('makes a whole-blade colour see-through', () => {
    const [n, c] = composed('LockupTrL<White,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');
    expect(S(setStrength(n, c, P('Int<16000>')))).toBe('LockupTrL<AlphaL<White,Int<16000>>,TrInstant,TrFade<100>,SaberBase::LOCKUP_NORMAL>');
  });
});

describe('coverage', () => {
  // Every layer in Hiltwright's own looks and the recipes gets a card rather than a bare tree.
  const layersOf = (code: string): Node[] => { const t = P(code); return t.name === 'Layers' ? t.args.slice(1) : []; };
  it('cards every layer of the shared effects and the recipes', () => {
    const fx = layersOf(/Layers<[\s\S]*?>>;/.exec(LOOK_FX)![0].replace(/;$/, '').replace(/OUT_TR/, 'TrWipe<300>').replace(/IN_TR/, 'TrWipeIn<500>'));
    expect(fx.length).toBeGreaterThan(5);
    for (const l of fx) expect([l.name, readLayer(l).form]).not.toEqual([l.name, 'tree']);
    for (const r of RECIPES) expect([r.name, readLayer(P(r.code)).form]).toEqual([r.name, 'composed']);
  });
  it('cards the bases of the library looks where it can', () => {
    const bases = LIBRARY_LOOKS.map((l) => /HwFx(?:Tr)?<([\s\S]*)>;$/.exec(l.define.trim())?.[1]).filter((b): b is string => !!b);
    const forms = bases.map((b) => { try { return readBase(P(b)).form; } catch { return 'unparsed'; } }).filter((f) => f !== 'unparsed');
    // A base that is itself a stack (Layers<...>) stays a tree; nearly everything else is a card.
    expect(forms.filter((f) => f !== 'tree').length).toBeGreaterThanOrEqual(Math.floor(forms.length / 2));
  });
});

describe('paired parameters', () => {
  const tpl = (s: string) => { const n = P(s); const c = readLayer(n); if (c.form !== 'template') throw new Error(`${s} read as ${c.form}`); return [n, c] as const; };

  it('folds the two ends of one sensor reading into one control', () => {
    const [drag, dc] = tpl('ResponsiveDragL<White>');
    expect(dc.pairs.map((p) => [p.label, p.sensor, p.shape, dc.slots[p.a].param, dc.slots[p.b].param])).toEqual([['Size', 'twist', 'pair', 'SIZE1', 'SIZE2']]);
    expect(pairEnds(drag, dc.pairs[0])).toEqual({ from: 2000, to: 10000 });
    // Setting the ends writes both parameters, filling the defaulted ones before them.
    expect(S(setPairEnds(drag, dc.pairs[0], 3000, 12000))).toBe('ResponsiveDragL<White,TrInstant,TrInstant,Int<3000>,Int<12000>>');
    const [, stab] = tpl('ResponsiveStabL<Red>');
    expect(stab.pairs.map((p) => [p.label, p.sensor])).toEqual([['Size', 'angle']]);
    const [, blast] = tpl('ResponsiveBlastL<White>');
    expect(blast.pairs.map((p) => [p.label, p.sensor, p.shape])).toEqual([['Position', 'angle', 'pair']]);
  });

  it('reads the nested clash position as where it lands at three tilts', () => {
    const [clash, cc] = tpl('ResponsiveClashL<White>');
    const curve = cc.pairs.find((p) => p.shape === 'curve')!;
    expect(curve.label).toBe('Where it lands');
    expect(curvePoints(clash, curve)).toEqual({ down: 4000, level: 16000, up: 6000 });
    // Setting the three checkpoints reads them back exactly.
    const set = setCurvePoints(clash, curve, { down: 8000, level: 20000, up: 4000 });
    const again = readLayer(set) as Extract<LayerCard, { form: 'template' }>;
    expect(curvePoints(set, again.pairs.find((p) => p.shape === 'curve')!)).toEqual({ down: 8000, level: 20000, up: 4000 });
    expect(S(set)).toBe('ResponsiveClashL<White,TrInstant,TrFade<200>,Scale<BladeAngle<0,16000>,Int<8000>,Int<36000>>,Int<4000>>');
  });

  it('leaves pairs it cannot represent as separate numbers', () => {
    const [, cc] = tpl('ResponsiveClashL<White,TrInstant,TrFade<200>,Sin<Int<10>>,Int<6000>>');
    expect(cc.pairs.filter((p) => p.shape === 'curve')).toEqual([]);
  });
});

describe('unpacking a template', () => {
  it('writes the template out as its definition, arguments in place', () => {
    expect(S(unpackTemplate(P('ResponsiveClashL<Red,TrInstant,TrFade<300>>'))!)).toBe('TransitionEffectL<TrConcat<TrInstant,AlphaL<Red,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Int<4000>,Int<26000>>,Int<6000>>,Int<10000>>>,TrFade<300>>,EFFECT_CLASH>');
    expect(unpackTemplate(P('Rgb<1,2,3>'))).toBeNull();
  });

  it('lets a pair react to something else, keeping the values at its ends', () => {
    const clash = P('ResponsiveClashL<White>');
    const card = readLayer(clash) as Extract<LayerCard, { form: 'template' }>;
    const open = unlockPair(clash, card.pairs.find((p) => p.shape === 'curve')!, 'swing')!;
    expect(S(open)).toBe('TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Scale<SwingSpeed<400>,Int<4000>,Int<6000>>,Int<10000>>>,TrFade<200>>,EFFECT_CLASH>');
    // What comes out is an ordinary layer card: a clash spot whose position now follows the swing.
    const c = readLayer(open);
    expect(c.form === 'composed' && c.where.shape === 'spot' && c.when.type).toBe('effect');
    const drag = P('ResponsiveDragL<Orange>');
    const dc = readLayer(drag) as Extract<LayerCard, { form: 'template' }>;
    const openDrag = unlockPair(drag, dc.pairs[0], 'angle')!;
    expect(S(openDrag)).toContain('SmoothStep<Int<32000>,Scale<BladeAngle<>,Int<2000>,Int<10000>>>');
    const odc = readLayer(openDrag);
    expect(odc.form === 'composed' && [odc.when.type, odc.where.shape]).toEqual(['lockup', 'tip']);
  });
});

describe('what a number means', () => {
  it('knows the units of the common parameters', () => {
    const u = (t: string, p: string, k: 'FUNCTION' | 'INTEGER') => numberUnit(t, p, k)?.kind ?? null;
    expect(u('BladeAngle', 'MIN', 'INTEGER')).toBe('angle');
    expect(u('TrFade', 'MILLIS', 'INTEGER')).toBe('ms');
    expect(u('TrFadeX', 'MILLIS', 'FUNCTION')).toBe('ms');
    expect(u('ResponsiveBlastL', 'FADE', 'FUNCTION')).toBe('ms');
    expect(u('Sparkle', 'SPARK_CHANCE_PROMILLE', 'INTEGER')).toBe('promille');
    expect(u('Rgb', 'R', 'INTEGER')).toBe('channel');
    expect(u('SwingSpeed', 'MAX', 'INTEGER')).toBe('degps');
    expect(u('Bump', 'BUMP_POSITION', 'FUNCTION')).toBe('fraction');
    expect(u('Scale', 'A', 'FUNCTION')).toBe('fraction');
    expect(u('StripesX', 'WIDTH', 'FUNCTION')).toBeNull();
    expect(u('Stripes', 'WIDTH', 'INTEGER')).toBeNull();
    expect(u('LockupTrL', 'CONDITION', 'FUNCTION')).toBeNull();
    expect(numberUnit('Rgb', 'G', 'INTEGER')).toEqual({ kind: 'channel', min: 0, max: 255 });
  });
});

describe('wave widths', () => {
  it('shows a blast size as the width it gives, bigger size narrower', () => {
    expect([50, 100, 200, 400].map(waveWidth)).toEqual([64, 32, 16, 8]);
    expect(waveSize(16)).toBe(200);
    expect(waveSize(waveWidth(100))).toBe(100);
    expect(numberUnit('ResponsiveBlastL', 'SIZE', 'FUNCTION')?.kind).toBe('wavewidth');
    expect(numberUnit('BlastL', 'WAVE_SIZE', 'INTEGER')?.kind).toBe('wavewidth');
    expect(numberUnit('ResponsiveBlastFadeL', 'SIZE', 'FUNCTION')?.kind).toBe('fraction'); // a real width: a Bump
    expect(paramLabel('ResponsiveBlastL', 'SIZE')).toBe('Wave width');
    expect(paramLabel('BlastL', 'WAVE_SIZE')).toBe('Wave width');
    expect([paramLabel('ResponsiveBlastL', 'SPEED'), numberUnit('ResponsiveBlastL', 'SPEED', 'FUNCTION')?.kind]).toEqual(['Wave travel time', 'ms']);
  });
});

describe('layers the toolchain refused (ST34)', () => {
  it('a whole-blade layer that is always on stays see-through, never a bare colour in the stack', async () => {
    const { readLayer, setShape, setWhen, newLayer } = await import('../src/layerCard');
    const spot = P('AlphaL<White,Bump<Int<16384>,Int<8000>>>');
    const card = readLayer(spot);
    if (card.form !== 'composed') throw new Error('not composed');
    expect(S(setShape(spot, card, 'whole'))).toBe('AlphaL<White,Int<32768>>');
    const flash = P('TransitionEffectL<TrConcat<TrInstant,White,TrFade<300>>,EFFECT_FORCE>');
    const fc = readLayer(flash);
    if (fc.form !== 'composed') throw new Error('not composed');
    expect(S(setWhen(flash, fc, 'always'))).toBe('AlphaL<White,Int<32768>>');
    // The numbers of these aliases are types, so the starting layer wraps them in Int<>.
    for (const n of ['BlinkingL', 'BrownNoiseFlickerL', 'PulsingL', 'StrobeL']) expect(S(newLayer(n)), n).toMatch(/Int</);
  });
});

