import { describe, expect, it } from 'vitest';
import { bladeTables, generateConfig, getDefine, hasDefine, parseConfig, presetArrays, readGeneratedHeader, rowToBlades, validateModel, type SaberConfigModel } from '../src';

const hote2: SaberConfigModel = {
  name: 'hiltwright_hote2', board: 'V2', buttons: 2, prop: 'fett263',
  blades: [
    { id: 'main', role: 'main', type: 'pixel', pixels: 140, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
    { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } },
    { id: 'accent', role: 'accent', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade3Pin', powerPins: ['bladePowerPin4'] } },
  ],
  presets: [
    { font: 'Mara Jade Skywalker;common', track: 'Mara Jade Skywalker/tracks/The_Force.wav', name: 'Mara Jade Skywalker' },
    { font: 'Valkyrie;common', track: 'Valkyrie/tracks/battle_cry.wav', name: 'Valkyrie' },
    { font: 'Battery;common', track: 'tracks/mars.wav', name: 'Battery\nLevel' },
  ],
};

describe('generateConfig', () => {
  it('produces a config that parses back to the same blades and presets', () => {
    const { text, hash, sharedPower } = generateConfig(hote2);
    expect(sharedPower).toEqual(['bladePowerPin4']);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    const doc = parseConfig(text);
    expect(getDefine(doc, 'NUM_BLADES')).toBe('3');
    expect(getDefine(doc, 'NUM_BUTTONS')).toBe('2');
    expect(hasDefine(doc, 'SHARED_POWER_PINS')).toBe(true);
    expect(hasDefine(doc, 'SAVE_STATE')).toBe(true);
    // Not listed by us, but ENABLE_ALL_EDIT_OPTIONS turns it on inside ProffieOS.ino (so Fett263 needs voice pack v2).
    expect(hasDefine(doc, 'MOUNT_SD_SETTING')).toBe(false);
    expect(hasDefine(doc, 'DISABLE_DIAGNOSTIC_COMMANDS')).toBe(false);
    expect(hasDefine(doc, 'FETT263_EDIT_MODE_MENU')).toBe(true);
    const [arr] = presetArrays(doc);
    expect(arr.presets.map((p) => p.name)).toEqual(['Mara Jade Skywalker', 'Valkyrie', 'Battery\nLevel']);
    expect(arr.presets[0].styles.map((s) => (s.kind === 'styleptr' ? s.style : s.kind))).toEqual(['HwBlade', 'HwAccent', 'HwAccent']);
    const blades = rowToBlades(bladeTables(doc)[0].rows[0]);
    expect(blades.map((b) => b.pixels)).toEqual([140, 2, 1]);
    expect(blades[0].wiring).toEqual({ kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] });
    expect(readGeneratedHeader(text)).toMatchObject({ name: 'hiltwright_hote2', board: 'V2', presets: 3, hash });
    expect(text).toContain('#include "proffieboard_v2_config.h"');
    expect(text).toContain('#include "../props/saber_fett263_buttons.h"');
    expect(text).toContain('Button AuxButton(BUTTON_AUX, auxPin, "aux");');
  });

  it('is deterministic', () => {
    expect(generateConfig(hote2).text).toBe(generateConfig(hote2).text);
  });

  it('chained blades become SubBlade rows and a motor gets the motor look', () => {
    const m: SaberConfigModel = {
      ...hote2, prop: 'default', buttons: 1,
      blades: [
        hote2.blades[0],
        { id: 'c', role: 'crystal', type: 'pixel', pixels: 6, order: '', extra: [], leds: [], parallel: 1, wiring: { kind: 'chain', after: 'main' } },
        { id: 'm', role: 'motor', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<0>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin6'] } },
      ],
    };
    const { text } = generateConfig(m);
    expect(text).toContain('SubBlade(0, 139, WS281XBladePtr<146, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3> >())');
    expect(text).toContain('SubBlade(140, 145, NULL)');
    expect(text).toContain('SimpleBladePtr<CreeXPE2WhiteTemplate<0>, NoLED, NoLED, NoLED, bladePowerPin6, -1, -1, -1>()');
    expect(text).toContain('StylePtr<HwMotor>()');
    expect(text).not.toContain('AuxButton');
    expect(text).not.toContain('FETT263');
  });

  it('validates the model before generating', () => {
    expect(validateModel(hote2)).toEqual([]);
    expect(validateModel({ ...hote2, name: 'bad name' })).toContain('Config name must be letters, digits and underscores.');
    expect(validateModel({ ...hote2, blades: [{ ...hote2.blades[0], wiring: { kind: 'own', dataPin: 'bladePin', powerPins: [] } }] })).toEqual(['main: a pixel strip needs at least one power pin.']);
    expect(validateModel({ ...hote2, blades: [hote2.blades[0], { ...hote2.blades[1], wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin4'] } }] })[0]).toMatch(/bladePin is used by 2/);
  });
});

describe('generateConfig with every blade kind', () => {
  it('emits a chained sub-blade, a single LED, a star LED and a motor, and parses back', () => {
    const m: SaberConfigModel = {
      name: 'hw_kinds', board: 'V3', buttons: 2, prop: 'sa22c',
      blades: [
        { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
        { id: 'b2', role: 'crystal', type: 'pixel', pixels: 4, order: '', extra: [], leds: [], parallel: 1, wiring: { kind: 'chain', after: 'b1', reverse: true } },
        { id: 'b3', role: 'accent', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['blade5Pin'] } },
        { id: 'b4', role: 'side', type: 'simple', pixels: 3, order: '', extra: [], leds: ['CreeXPE2RedTemplate<1000>', 'CreeXPE2GreenTemplate<0>', 'CreeXPE2BlueTemplate<240>', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'] } },
        { id: 'b5', role: 'motor', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin1'] } },
      ],
      presets: [{ font: 'A', track: '', name: 'One' }],
    };
    expect(validateModel(m)).toEqual([]);
    const g = generateConfig(m);
    expect(g.text).toContain('SubBlade(0, 131, WS281XBladePtr<136, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3> >())');
    expect(g.text).toContain('SubBladeReverse(132, 135, NULL)');
    expect(g.text).toContain('SimpleBladePtr<CreeXPE2WhiteTemplate<550>, NoLED, NoLED, NoLED, blade5Pin, -1, -1, -1>()');
    expect(g.text).toContain('SimpleBladePtr<CreeXPE2RedTemplate<1000>, CreeXPE2GreenTemplate<0>, CreeXPE2BlueTemplate<240>, NoLED, bladePowerPin4, bladePowerPin5, bladePowerPin6, -1>()');
    expect(g.text).toContain('StylePtr<HwMotor>()');
    expect(g.manifest.presets[0].looks).toEqual(['hw_blade', 'hw_accent', 'hw_accent', 'hw_blade', 'hw_motor']);
    const doc = parseConfig(g.text);
    const blades = rowToBlades(bladeTables(doc)[0].rows[0]);
    expect(blades.map((b) => b.type)).toEqual(['pixel', 'pixel', 'simple', 'simple', 'simple']);
    expect(blades[1].wiring).toEqual({ kind: 'chain', after: 'b1', reverse: true });
    expect(getDefine(doc, 'NUM_BLADES')).toBe('5');
  });
});

describe('Blade ID variants', () => {
  const base: SaberConfigModel = { ...hote2, prop: 'sa22c' };
  it('without variants there is one row with ID 0 and no Blade ID defines', () => {
    const g = generateConfig(base);
    expect(g.text).toContain('  { 0, WS281XBladePtr<140,');
    expect(g.text).not.toContain('BLADE_ID_SCAN_MILLIS');
    expect(g.manifest.bladeId).toBe(false);
  });
  it('swapping on but nothing measured yet: still one row, but the scanning defines are already in', () => {
    const g = generateConfig({ ...base, bladeId: { variants: [{ id: 'v1', name: 'Duel blade', pixels: 140, ohms: null }] } });
    expect(g.text).toContain('  { 0, WS281XBladePtr<140,');
    expect(g.text).toContain('#define ENABLE_POWER_FOR_ID PowerPINS<bladePowerPin2, bladePowerPin3>');
    expect(g.text).toContain('#define BLADE_ID_SCAN_MILLIS 1000');
    expect(g.text).toContain('#define SHARED_POWER_PINS');
    expect(g.manifest.bladeId).toBe(true);
  });
  it('one row per measured blade, with its own pixel count, plus the empty emitter', () => {
    const m: SaberConfigModel = { ...base, bladeId: { variants: [
      { id: 'v1', name: 'Duel blade', pixels: 140, ohms: 916.4 },
      { id: 'v2', name: 'Short blade', pixels: 96, ohms: 22000 },
      { id: 'v3', name: 'Not measured', pixels: 120, ohms: null },
      { id: 'v0', name: 'No blade', pixels: 0, ohms: null, noBlade: true },
    ] } };
    expect(validateModel(m)).toEqual([]);
    const g = generateConfig(m);
    expect(g.text).toContain('  { 916, WS281XBladePtr<140,');
    expect(g.text).toContain('  { 22000, WS281XBladePtr<96,');
    expect(g.text).toContain('  { NO_BLADE, WS281XBladePtr<140,');
    expect(g.text).not.toContain('WS281XBladePtr<120,');
    expect(g.text).toContain('// Short blade');
    const doc = parseConfig(g.text);
    expect(bladeTables(doc)[0].rows.map((r) => r.id)).toEqual(['916', '22000', 'NO_BLADE']);
    expect(rowToBlades(bladeTables(doc)[0].rows[1]).map((b) => b.pixels)).toEqual([96, 2, 1]);
  });
  it('refuses blades whose readings are too close to tell apart', () => {
    const m: SaberConfigModel = { ...base, bladeId: { variants: [{ id: 'a', name: 'A', pixels: 140, ohms: 10000 }, { id: 'b', name: 'B', pixels: 96, ohms: 10800 }] } };
    expect(validateModel(m)[0]).toMatch(/too close together/);
  });
});
