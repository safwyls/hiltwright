import { describe, expect, it } from 'vitest';
import { LIBRARY_LOOKS, LOOK_FX, STARTER_LOOKS, analyzeStyleCode, scanStyleArgs, colorWordToHex, formatStyleArgs, generateConfig, hexToColorWord, lookAtSlot, lookSlots, parseStyleArgs, validateModel, type LookDef, type SaberConfigModel } from '../src';

const FETT263 = `// Hiltwright test look (header laid out like a library block)
// Copyright 2026 Hiltwright contributors
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
    expect(a.header).toContain('Copyright 2026 Hiltwright contributors');
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
  const ember: LookDef = { ...analyzeStyleCode(FETT263), id: 'ember', name: 'Ember', source: 'pasted', by: 'Hiltwright', code: analyzeStyleCode(FETT263).expression, roles: ['main'], description: '' };
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
    expect(g.text).toContain('Copyright 2026 Hiltwright contributors');
    expect(g.text.split('Hiltwright contributors').length).toBe(2);
    expect(g.text).toContain('/* Ember */ StylePtr<Layers<');
    expect(g.manifest.looks.map((l) => l.id)).toEqual(['hw_blade', 'hw_accent', 'ember']);
    expect(g.manifest.presets).toEqual([{ name: 'Starter', looks: ['hw_blade', 'hw_accent'] }, { name: 'Fire', looks: ['ember', 'hw_accent'] }]);
    expect(g.manifest.hash).toBe(g.hash);
    const full = { ...g.manifest, os: 'v8.10', at: 'now' };
    expect(lookSlots(full, 'hw_accent')).toEqual([{ preset: 0, blade: 2 }, { preset: 1, blade: 2 }]);
    expect(lookAtSlot(full, 1, 1)?.args).toEqual([1, 2, 5, 11, 26]);
    expect(lookAtSlot(full, 1, 1)?.defaults).toEqual({ 1: '#ff0000', 2: '#ffff00', 11: '#ffffff' });
    expect(lookAtSlot(full, 0, 1)?.defaults).toMatchObject({ 1: '#0000ff', 9: '#ffffff', 10: '#ffffff', 11: '#ffffff', 13: '#ffb43c' });
    expect(lookAtSlot(full, 5, 1)).toBeNull();
  });
  it('flags unknown look ids', () => {
    expect(validateModel({ ...model, presets: [{ font: 'A', track: '', name: 'x', looks: ['nope'] }] })[0]).toMatch(/unknown look "nope"/);
  });
  it('starters cover every role', () => {
    for (const role of ['main', 'side', 'crystal', 'accent', 'motor'] as const) expect(STARTER_LOOKS.some((l) => l.roles.includes(role))).toBe(true);
  });
});

describe('the Hiltwright look library', () => {
  it('every look has a unique id and alias, a description, and C++ that defines exactly its alias', () => {
    expect(new Set(LIBRARY_LOOKS.map((l) => l.id)).size).toBe(LIBRARY_LOOKS.length);
    expect(new Set(LIBRARY_LOOKS.map((l) => l.alias)).size).toBe(LIBRARY_LOOKS.length);
    for (const l of LIBRARY_LOOKS) {
      expect(l.define.startsWith(`using ${l.alias} = `), l.id).toBe(true);
      expect(l.define.trim().endsWith(';'), l.id).toBe(true);
      expect((l.define.match(/</g) ?? []).length, `${l.id} brackets`).toBe((l.define.match(/>/g) ?? []).length);
      expect(l.usesFx, l.id).toBe(/\bHwFx(Tr)?</.test(l.define));
      expect(l.description.length, l.id).toBeGreaterThan(30);
    }
    expect((LOOK_FX.match(/</g) ?? []).length).toBe((LOOK_FX.match(/>/g) ?? []).length);
  });

  it('arguments and default colours are read from the C++, so they cannot drift', () => {
    const byId = Object.fromEntries(STARTER_LOOKS.map((l) => [l.id, l]));
    // A blade look: its own colours, the shared effect colours, and both timings.
    expect(byId.hw_pulse.args).toEqual([1, 2, 5, 9, 10, 11, 13, 15, 16, 26]);
    expect(byId.hw_pulse.defaults).toMatchObject({ 1: '#0000ff', 2: '#00ffff', 9: '#ffffff' });
    expect(byId.hw_unstable.defaults?.[1]).toBe('#ff0000');
    expect(byId.hw_swing.args).toContain(18);
    expect(byId.hw_rainbow.args).not.toContain(1);
    // Accent looks do not drag the blade effects in.
    expect(byId.hw_accent.args).toEqual([1, 5, 26]);
    expect(byId.hw_crystal.args).toEqual([1, 5, 10, 26, 31]);
    expect(byId.hw_battery.args).toEqual([]);
    expect(byId.hw_motor.args).toEqual([]);
    expect(scanStyleArgs('RgbArg<7, Red>, IntArg<IGNITION_DELAY_ARG, 0>')).toEqual({ args: [6, 7], defaults: { 7: '#ff0000' } });
  });

  it('a build only carries the looks it uses, and the shared wrapper only when a blade look needs it', () => {
    const blade = { id: 'b1', role: 'main' as const, type: 'pixel' as const, pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own' as const, dataPin: 'bladePin', powerPins: ['bladePowerPin2'] } };
    const g = generateConfig({ name: 'lib', board: 'V2', buttons: 2, prop: 'sa22c', blades: [blade], presets: [{ font: 'A', track: '', name: 'One', looks: ['hw_fire'] }, { font: 'B', track: '', name: 'Two' }] });
    expect(g.text).toContain('using HwFire = ');
    expect(g.text).toContain('using HwBlade = ');
    expect(g.text).toContain('template<class BASE> using HwFx');
    expect(g.text).not.toContain('using HwRainbow');
    expect(g.text).toContain('StylePtr<HwFire>()');
    const accentOnly = generateConfig({ name: 'lib2', board: 'V2', buttons: 2, prop: 'sa22c', blades: [{ ...blade, role: 'main' }], presets: [{ font: 'A', track: '', name: 'One', looks: ['hw_spark'] }] });
    expect(accentOnly.text).not.toContain('HwFx');
  });

  it('each blade role has a default look, and it is the first one listed for that role', () => {
    expect(STARTER_LOOKS.find((l) => l.roles.includes('main'))?.id).toBe('hw_blade');
    expect(STARTER_LOOKS.find((l) => l.roles.includes('crystal'))?.id).toBe('hw_accent');
    expect(STARTER_LOOKS.find((l) => l.roles.includes('motor'))?.id).toBe('hw_motor');
  });
});

describe('special abilities and the prop', () => {
  const code = 'StylePtr<Layers<Blue, TransitionEffectL<TrDoEffectX<TrInstant,EFFECT_TRANSITION_SOUND,Int<0>>,EFFECT_USER1>, InOutTrL<TrWipe<300>,TrWipeIn<500>>>>()';
  const cortosis: LookDef = { ...analyzeStyleCode(code), id: 'cortosis', name: 'Cortosis', source: 'pasted', by: 'Fett263', code, roles: ['main'], description: '' };
  const model = (prop: SaberConfigModel['prop']): SaberConfigModel => ({
    name: 'hw_test', board: 'V2', buttons: 2, prop,
    blades: [{ id: 'main', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2'] } }],
    presets: [{ font: 'A', track: '', name: 'One', looks: ['cortosis'] }],
    looks: [cortosis],
  });

  it('adds FETT263_SPECIAL_ABILITIES for a Fett263 saber when a used look has an ability', () => {
    const g = generateConfig(model('fett263'));
    expect(g.text).toMatch(/#define FETT263_SPECIAL_ABILITIES/);
    expect(g.warnings.some((w) => /special abilities/.test(w))).toBe(true);
  });

  it('does not add it when no used look has an ability', () => {
    const m = model('fett263'); m.presets[0].looks = [null];
    expect(generateConfig(m).text).not.toMatch(/SPECIAL_ABILITIES/);
  });

  it('warns that the sa22c prop cannot raise abilities', () => {
    const g = generateConfig(model('sa22c'));
    expect(g.text).not.toMatch(/SPECIAL_ABILITIES/);
    expect(g.warnings.some((w) => /no gesture/.test(w))).toBe(true);
  });
});
