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
    expect(hasDefine(doc, 'MOUNT_SD_SETTING')).toBe(true);
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
