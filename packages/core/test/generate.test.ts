import { describe, expect, it } from 'vitest';
import { BOARD_NOT_CHOSEN, bladeTables, boardHint, commentSafe, customPropFileName, generateConfig, inspectPropText, propFamily, getDefine, hasDefine, parseConfig, presetArrays, readGeneratedHeader, rowToBlades, validateModel, withWiringConfirmation, type LookDef, type ModelBlade, type SaberConfigModel } from '../src';

const hote2: SaberConfigModel = {
  name: 'hiltwright_hote2', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263',
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

  it('records the board and blades it was built for, and the wiring confirmation never reaches the firmware', () => {
    const plain = generateConfig(hote2);
    expect(plain.manifest.wiring).toEqual({ board: 'V2', blades: hote2.blades });
    const confirmed = generateConfig(withWiringConfirmation(hote2, true, '2026-09-24T10:00:00.000Z'));
    expect(confirmed.text).toBe(plain.text);
    expect(confirmed.hash).toBe(plain.hash);
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
    expect(validateModel({ ...hote2, blades: [{ ...hote2.blades[0], wiring: { kind: 'own', dataPin: 'bladePin', powerPins: [] } }] })).toEqual(['Blade 1 needs at least one power pin.']);
    expect(validateModel({ ...hote2, blades: [hote2.blades[0], { ...hote2.blades[1], wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin4'] } }] })[0]).toMatch(/bladePin has 2 separate strips on it/);
  });
});

describe('generateConfig with every blade kind', () => {
  it('emits a chained sub-blade, a single LED, a star LED and a motor, and parses back', () => {
    const m: SaberConfigModel = {
      name: 'hw_kinds', board: 'V3', boardFrom: 'owner', buttons: 2, prop: 'sa22c',
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

// Baseline audit (baseline-firmware config-generation 3.3).
describe('config-generation audit', () => {
  it('3.3 a V3 saber: the config includes the Proffieboard V3 board file and not the V2 one', () => {
    const { text } = generateConfig({ ...hote2, board: 'V3' });
    expect(text).toContain('#include "proffieboard_v3_config.h"');
    expect(text).not.toContain('proffieboard_v2_config.h');
  });
});

describe('a custom prop file', () => {
  const sha = 'a'.repeat(64);
  const fettLike = { file: 'saber_fett263_buttons.h', sha256: sha, propType: 'SaberFett263Buttons', like: 'fett263' as const };
  const unknown = { file: 'my buttons (v2).h', sha256: 'b'.repeat(64), propType: 'MyButtons', like: null };

  it('is recognised by its PROP_TYPE, as one of the stock props or none', () => {
    expect(inspectPropText('#ifndef X\n  #define PROP_TYPE SaberFett263Buttons\n#endif')).toEqual({ propType: 'SaberFett263Buttons', like: 'fett263' });
    expect(inspectPropText('#define PROP_TYPE SaberBlasterProp<SaberSA22CButtons, Blaster> // two props')).toEqual({ propType: 'SaberBlasterProp<SaberSA22CButtons, Blaster>', like: null });
    expect(inspectPropText('// #define PROP_TYPE is not here\nclass X {};').propType).toBeNull();
  });

  it('is included under a name of its own, with its hash, so a new version of the file is a new build', () => {
    const a = generateConfig({ ...hote2, prop: 'custom', customProp: fettLike });
    expect(a.text).toContain('#ifdef CONFIG_PROP\n#include "../props/hiltwright_custom_saber_fett263_buttons.h"\n// Custom prop file saber_fett263_buttons.h, sha256 ' + sha);
    expect(a.text).not.toContain('"../props/saber_fett263_buttons.h"');
    const b = generateConfig({ ...hote2, prop: 'custom', customProp: { ...fettLike, sha256: 'c'.repeat(64) } });
    expect(b.hash).not.toBe(a.hash);
    expect(customPropFileName(unknown)).toBe('hiltwright_custom_my_buttons_v2.h');
  });

  it("gets the options of the stock prop it is a version of, and none when it is none of them", () => {
    expect(hasDefine(parseConfig(generateConfig({ ...hote2, prop: 'custom', customProp: fettLike }).text), 'FETT263_EDIT_MODE_MENU')).toBe(true);
    expect(hasDefine(parseConfig(generateConfig({ ...hote2, prop: 'custom', customProp: unknown }).text), 'FETT263_EDIT_MODE_MENU')).toBe(false);
    expect(propFamily({ prop: 'custom', customProp: unknown })).toBeNull();
    expect(propFamily({ prop: 'sa22c' })).toBe('sa22c');
  });

  it('is needed, and recorded properly, before anything is built; a stock prop ignores one kept from before', () => {
    expect(validateModel({ ...hote2, prop: 'custom' })).toContain('Choose the custom prop file on the Wiring page.');
    expect(validateModel({ ...hote2, prop: 'custom', customProp: { ...fettLike, file: '..\\evil.h' } }).join(' ')).toMatch(/not recorded properly/);
    expect(validateModel({ ...hote2, prop: 'custom', customProp: fettLike })).toEqual([]);
    expect(generateConfig({ ...hote2, prop: 'sa22c', customProp: fettLike }).text).toContain('#include "../props/saber_sa22c_buttons.h"');
  });
});

// build-correctness FW15 and FW14: names never break the config, and each preset slot's lines are known.
describe('names in the config', () => {
  const nasty: LookDef = {
    id: 'lk_nasty', name: 'Fire */ Blade', source: 'pasted', by: 'Kyber\\', header: '// Copyright 2026 someone',
    code: 'StylePtr<Red>()', roles: ['main'], args: [], preview: '#ff0000', description: '',
  };
  const model: SaberConfigModel = {
    ...hote2, prop: 'sa22c', looks: [nasty],
    presets: hote2.presets.map((p, i) => (i === 1 ? { ...p, looks: ['lk_nasty', null, null] } : p)),
    bladeId: { variants: [{ id: 'v1', name: 'Two\nlines\\', pixels: 140, ohms: 900 }, { id: 'v2', name: 'Plain', pixels: 96, ohms: 22000 }] },
  };

  it('FW15 a style named like code, an author ending in a backslash and a two-line blade name leave the config intact', () => {
    expect(commentSafe('Fire */ Blade', 'block')).toBe('Fire * / Blade');
    expect(commentSafe('Kyber\\', 'line')).toBe('Kyber');
    expect(commentSafe('Two\nlines\\', 'line')).toBe('Two lines');
    const { text } = generateConfig(model);
    // Every comment the generator opens ends where it meant to: no stray end inside a name.
    expect(text).toContain('/* Fire * / Blade */ StylePtr<Red>()');
    expect(text).toContain('// Look "Fire */ Blade" (Kyber):');
    for (const l of text.split('\n')) if (l.includes('//')) expect(l.endsWith('\\')).toBe(false);
    const doc = parseConfig(text);
    expect(presetArrays(doc)[0].presets.map((p) => p.name)).toEqual(model.presets.map((p) => p.name));
    expect(readGeneratedHeader(text)?.looks).toContain('lk_nasty');
  });

  it("FW14 slotLines point at each preset slot's style code", () => {
    const g = generateConfig(model);
    const lines = g.text.split('\n');
    expect(g.slotLines).toHaveLength(model.presets.length * model.blades.length);
    const slot = g.slotLines.find((s) => s.preset === 1 && s.blade === 0)!;
    expect(slot).toMatchObject({ lookId: 'lk_nasty', lookName: 'Fire */ Blade' });
    expect(lines[slot.line - 1]).toContain('StylePtr<Red>()');
    for (const s of g.slotLines) {
      const code = lines.slice(s.line - 1, s.endLine).join('\n');
      expect(code.trim().endsWith(',')).toBe(true);
    }
    // The line before a preset's first slot is its `{ font, track,` line.
    const first = g.slotLines.find((s) => s.preset === 0 && s.blade === 0)!;
    expect(lines[first.line - 2]).toContain('{ "Mara Jade Skywalker;common",');
  });
});

// wiring-validation FW27: each preset slot's style against its blade.
describe('styles against their blades', () => {
  const motor: ModelBlade = { id: 'motor', role: 'motor', type: 'simple', pixels: 1, order: '', extra: [], parallel: 1, leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], wiring: { kind: 'power', pins: ['bladePowerPin1'] } };
  it('fills an unchosen slot with the role default and says so, grouped per blade', () => {
    const { warnings } = generateConfig(hote2);
    expect(warnings).toContain('3 presets (Mara Jade Skywalker, Valkyrie, Battery Level), main blade (blade 1): no style chosen, using "Steady".');
    expect(warnings).toContain('3 presets (Mara Jade Skywalker, Valkyrie, Battery Level), crystal (blade 2): no style chosen, using "Follow the blade".');
  });
  it('refuses a blade style on a motor, naming the preset', () => {
    const m: SaberConfigModel = { ...hote2, blades: [...hote2.blades, motor], presets: hote2.presets.map((p, i) => (i === 0 ? { ...p, looks: ['hw_blade', null, null, 'hw_fire'] } : p)) };
    expect(validateModel(m)).toEqual(['Preset Mara Jade Skywalker: the motor needs a motor style, not "Fire".']);
    const ok: SaberConfigModel = { ...m, presets: m.presets.map((p, i) => (i === 0 ? { ...p, looks: ['hw_blade', null, null, 'hw_motor'] } : p)) };
    expect(validateModel(ok)).toEqual([]);
  });
  it('builds a main-blade style on a crystal, with a warning', () => {
    const m: SaberConfigModel = { ...hote2, presets: hote2.presets.map((p, i) => (i === 1 ? { ...p, looks: ['hw_blade', 'hw_fire', null] } : p)) };
    expect(validateModel(m)).toEqual([]);
    expect(generateConfig(m).warnings).toContain('Preset Valkyrie, crystal: "Fire" is not made for this blade.');
  });
});

// install-target-safety design D2: the board is known, or chosen by the owner, never assumed.
describe('the board is known before building', () => {
  it('a model whose board nobody has chosen is refused, in the Wiring page words', () => {
    const { boardFrom: _unset, ...unchosen } = hote2;
    expect(validateModel(unchosen)).toContain('Choose the board (Proffieboard V2 or V3) on the Wiring page.');
    expect(validateModel(unchosen)).toContain(BOARD_NOT_CHOSEN);
    for (const from of ['bootloader', 'firmware', 'owner'] as const) expect(validateModel({ ...hote2, boardFrom: from })).not.toContain(BOARD_NOT_CHOSEN);
  });

  it('a config name can suggest a board, but only when it names exactly one', () => {
    expect(boardHint('config/proffieboard_v3_config.h')).toBe('V3');
    expect(boardHint('config/my_v2_saber.h')).toBe('V2');
    expect(boardHint('config/V3-hilt.h')).toBe('V3');
    expect(boardHint('config/hiltwright_hote2.h')).toBeNull();
    expect(boardHint('config/default_proffieboard_config.h')).toBeNull();
    expect(boardHint('config/saber_v31.h')).toBeNull();
    expect(boardHint('config/v2_to_v3.h')).toBeNull();
    expect(boardHint(null)).toBeNull();
  });
});
