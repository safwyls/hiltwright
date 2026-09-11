import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, analyzeStyleCode, colorWordToHex, formatStyleArgs, generateConfig, hexToColorWord, lookAtSlot, lookSlots, parseStyleArgs, validateModel, type LookDef, type SaberConfigModel } from '../src';

const FETT263 = `// Fett263 Style Library
// Copyright 2020-2024 Fernando da Rosa
// Licensed under GPLv3
//
// Base Style: Fire Blade
StylePtr<Layers<
  StyleFire<RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>,RgbArg<ALT_COLOR_ARG, Rgb<255,255,0>>,0,6,FireConfig<10,1000,2>,FireConfig<2,1000,5>,FireConfig<0,0,10>,FireConfig<0,0,10>>,
  TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<16000>>>,TrFade<300>>,EFFECT_CLASH>,
  LockupTrL<AudioFlicker<RgbArg<LOCKUP_COLOR_ARG, Rgb<255,255,255>>,RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>,TrInstant,TrFade<200>,SaberBase::LOCKUP_NORMAL>,
  InOutTrL<TrWipeX<IgnitionTime<300>>,TrWipeInX<RetractionTime<0>>>>>()`;

describe('analyzeStyleCode', () => {
  it('keeps the library header apart from the expression and finds the runtime arguments', () => {
    const a = analyzeStyleCode(FETT263 + ',\n');
    expect(a.ok).toBe(true);
    expect(a.header).toContain('Copyright 2020-2024 Fernando da Rosa');
    expect(a.expression.startsWith('StylePtr<Layers<')).toBe(true);
    expect(a.expression.endsWith('>>()')).toBe(true);
    expect(a.args).toEqual([1, 2, 5, 11, 26]);
    expect(a.preview).toBe('#ff0000');
    expect(a.defaults).toEqual({ 1: '#ff0000', 2: '#ffff00', 11: '#ffffff' });
  });
  it('rejects things that are not a style expression', () => {
    expect(analyzeStyleCode('').ok).toBe(false);
    expect(analyzeStyleCode('#define NUM_BLADES 1').ok).toBe(false);
    expect(analyzeStyleCode('StylePtr<Layers<Red>>').problems.join(' ')).toMatch(/end with \(\)/);
    expect(analyzeStyleCode('StylePtr<Layers<Red>()').problems.join(' ')).toMatch(/Unbalanced/);
  });
  it('reads numeric argument slots and named colours', () => {
    const a = analyzeStyleCode('StylePtr<InOutHelper<RgbArg<1, DeepSkyBlue>, IntArg<5, 300>, IntArg<26, 800>>>()');
    expect(a.args).toEqual([1, 5, 26]);
    expect(a.preview).toBe('#00bfff');
    expect(a.defaults).toEqual({ 1: '#00bfff' });
  });
});

describe('style argument words', () => {
  it('round-trips builtin argument strings with ~ gaps', () => {
    const m = parseStyleArgs('65535,0,0 ~ ~ ~ ~ ~ ~ ~ 0,65535,0');
    expect(m.get(1)).toBe('65535,0,0');
    expect(m.get(2)).toBeUndefined();
    expect(m.get(9)).toBe('0,65535,0');
    expect(formatStyleArgs(m)).toBe('65535,0,0 ~ ~ ~ ~ ~ ~ ~ 0,65535,0');
    expect(formatStyleArgs(new Map())).toBe('');
    expect(parseStyleArgs(null).size).toBe(0);
  });
  it('converts colours between hex and 16-bit words', () => {
    expect(colorWordToHex('65535,0,0')).toBe('#ff0000');
    expect(colorWordToHex('255,128,0')).toBe('#ff8000');
    expect(colorWordToHex('nope')).toBeNull();
    expect(hexToColorWord('#00ff80')).toBe('0,65535,32896');
    expect(colorWordToHex(hexToColorWord('#123456'))).toBe('#123456');
  });
});

describe('generateConfig with chosen looks', () => {
  const ember: LookDef = { ...analyzeStyleCode(FETT263), id: 'ember', name: 'Ember', source: 'pasted', by: 'Fett263', code: analyzeStyleCode(FETT263).expression, roles: ['main'], description: '' };
  const model: SaberConfigModel = {
    name: 'hw_test', board: 'V2', buttons: 2, prop: 'fett263',
    blades: [
      { id: 'main', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2'] } },
      { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } },
    ],
    presets: [
      { font: 'A', track: '', name: 'Starter' },
      { font: 'B', track: '', name: 'Fire', looks: ['ember', null] },
    ],
    looks: [ember],
  };
  it('compiles the chosen look into its slot and keeps the library header once', () => {
    expect(validateModel(model)).toEqual([]);
    const g = generateConfig(model);
    expect(g.text).toContain('Copyright 2020-2024 Fernando da Rosa');
    expect(g.text.split('Fernando da Rosa').length).toBe(2);
    expect(g.text).toContain('/* Ember */ StylePtr<Layers<');
    expect(g.manifest.looks.map((l) => l.id)).toEqual(['hw_blade', 'hw_accent', 'ember']);
    expect(g.manifest.presets).toEqual([{ name: 'Starter', looks: ['hw_blade', 'hw_accent'] }, { name: 'Fire', looks: ['ember', 'hw_accent'] }]);
    expect(g.manifest.hash).toBe(g.hash);
    const full = { ...g.manifest, os: 'v8.10', at: 'now' };
    expect(lookSlots(full, 'hw_accent')).toEqual([{ preset: 0, blade: 2 }, { preset: 1, blade: 2 }]);
    expect(lookAtSlot(full, 1, 1)?.args).toEqual([1, 2, 5, 11, 26]);
    expect(lookAtSlot(full, 1, 1)?.defaults).toEqual({ 1: '#ff0000', 2: '#ffff00', 11: '#ffffff' });
    expect(lookAtSlot(full, 0, 1)?.defaults).toEqual({ 1: '#0000ff', 9: '#ffffff', 10: '#ffffff', 11: '#ffffff' });
    expect(lookAtSlot(full, 5, 1)).toBeNull();
  });
  it('flags unknown look ids', () => {
    expect(validateModel({ ...model, presets: [{ font: 'A', track: '', name: 'x', looks: ['nope'] }] })[0]).toMatch(/unknown look "nope"/);
  });
  it('starters cover every role', () => {
    for (const role of ['main', 'side', 'crystal', 'accent', 'motor'] as const) expect(STARTER_LOOKS.some((l) => l.roles.includes(role))).toBe(true);
  });
});
