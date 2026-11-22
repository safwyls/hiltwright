import { describe, expect, it } from 'vitest';
import { SABER_SHARE_FORMAT, importedModel, makeSaberShare, readSaberShare, shareFonts, shareStylesToAdd, shareableModel, type LookDef, type SaberConfigModel } from '../src';

const pasted: LookDef = { id: 'pasted_abc', name: 'Responsive Flame', source: 'pasted', by: 'Fett263', code: 'StylePtr<Blue>()', header: '/* copyright Fett263 */', roles: ['main'], args: [], preview: '#0000ff', description: '' };
const starter: LookDef = { ...pasted, id: 'hw_blade', source: 'starter', by: 'Hiltwright' };

const model = (over: Partial<SaberConfigModel> = {}): SaberConfigModel => ({
  name: 'hiltwright_nihilus', board: 'V3', boardFrom: 'bootloader', buttons: 2, prop: 'fett263',
  blades: [{ id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } }],
  presets: [{ font: 'Nihilus;common', track: 'tracks/nihilus.wav', name: 'Nihilus', looks: ['pasted_abc'], lookArgs: ['65535,0,0'] }, { font: 'Ronin', track: '', name: 'Ronin' }],
  looks: [pasted, starter], fonts: ['Nihilus', 'Ronin', 'Kylo'], voicePack: 'nosloppy-english-a',
  wiringConfirmation: { at: '2026-11-20T10:00:00.000Z', layout: 'abc' }, wiringConfirmedAt: '2026-09-01T00:00:00.000Z',
  wiringReference: { file: 'C:\\Users\\someone\\Desktop\\config.h', from: 'file', at: '2026-11-20T10:00:00.000Z', board: 'V3', buttons: 2, blades: [], unreadable: [] },
  presetsFrom: { name: 'edits made here', at: '2026-11-21T00:00:00.000Z', base: [{ name: 'Old', font: 'Old' }] },
  customProp: { file: 'my_prop.h', sha256: 'a'.repeat(64), propType: 'MyProp', like: 'fett263' },
  generator: 'hiltwright 0.2.0-beta.15',
  ...over,
});

describe('sharing a saber', () => {
  it('leaves out what belongs to the sender: wiring confirmation, config path, board source, draft origin', () => {
    const m = shareableModel(model());
    expect(m.wiringConfirmation).toBeUndefined();
    expect(m.wiringConfirmedAt).toBeUndefined();
    expect(m.wiringReference).toBeUndefined();
    expect(m.boardFrom).toBeUndefined();
    expect(m.presetsFrom).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain('someone');
  });

  it('keeps the plan: board, prop, blades, presets with their styles and colours, fonts and voice pack', () => {
    const m = shareableModel(model());
    expect(m.board).toBe('V3');
    expect(m.presets[0]).toEqual({ font: 'Nihilus;common', track: 'tracks/nihilus.wav', name: 'Nihilus', looks: ['pasted_abc'], lookArgs: ['65535,0,0'] });
    expect(m.fonts).toEqual(['Nihilus', 'Ronin', 'Kylo']);
    expect(m.voicePack).toBe('nosloppy-english-a');
  });

  it('carries pasted and built styles but not the starters every copy has', () => {
    expect(shareableModel(model()).looks?.map((l) => l.id)).toEqual(['pasted_abc']);
  });

  it('carries a custom prop only while the plan builds with it, with its text', () => {
    expect(shareableModel(model()).customProp).toBeUndefined();
    const s = makeSaberShare('SF_nihilus', model({ prop: 'custom' }), '0.2.0-beta.15', '#define PROP_TYPE MyProp');
    expect(s.model.customProp?.file).toBe('my_prop.h');
    expect(s.customPropText).toBe('#define PROP_TYPE MyProp');
    expect(makeSaberShare('x', model(), '1', 'text').customPropText).toBeUndefined();
  });

  it('reads back what it writes, through JSON', () => {
    const s = makeSaberShare('SF_nihilus', model(), '0.2.0-beta.15', undefined, new Date('2026-11-22T12:00:00.000Z'));
    const back = readSaberShare(JSON.parse(JSON.stringify(s)));
    expect(back.format).toBe(SABER_SHARE_FORMAT);
    expect(back.name).toBe('SF_nihilus');
    expect(back.model).toEqual(s.model);
  });

  it('refuses other files with a plain reason', () => {
    expect(() => readSaberShare({ hello: 1 })).toThrow('not a saber shared from Hiltwright');
    expect(() => readSaberShare({ format: SABER_SHARE_FORMAT, version: 9, model: {} })).toThrow('newer Hiltwright');
    expect(() => readSaberShare({ format: SABER_SHARE_FORMAT, version: 1, model: { name: 'x' } })).toThrow('damaged');
    expect(() => readSaberShare({ format: SABER_SHARE_FORMAT, version: 1, model: { ...model(), presets: [{ font: 1 }] } })).toThrow('preset is incomplete');
  });

  it('strips private fields again on reading, whatever the file holds', () => {
    const raw = { format: SABER_SHARE_FORMAT, version: 1, name: 'X', model: model() };
    const back = readSaberShare(raw);
    expect(back.model.wiringConfirmation).toBeUndefined();
    expect(back.model.wiringReference).toBeUndefined();
  });

  it('lists every font it uses, chosen or named by a preset, without common', () => {
    expect(shareFonts(model({ fonts: ['Kylo'] }))).toEqual(['Kylo', 'Nihilus', 'Ronin']);
  });

  it('adds only the styles the receiver does not have', () => {
    expect(shareStylesToAdd(model(), []).map((l) => l.id)).toEqual(['pasted_abc']);
    expect(shareStylesToAdd(model(), [pasted])).toEqual([]);
  });

  it('starts the import as a list for the next flash, with a config name of its own', () => {
    const s = readSaberShare(JSON.parse(JSON.stringify(makeSaberShare('SF_nihilus', model(), '1'))));
    const m = importedModel(s, ['hiltwright_nihilus', 'hiltwright_nihilus_2'], 'SF_nihilus.hwsaber', new Date('2026-11-22T12:00:00.000Z'));
    expect(m.name).toBe('hiltwright_nihilus_3');
    expect(m.presetsFrom).toEqual({ name: 'SF_nihilus.hwsaber', at: '2026-11-22T12:00:00.000Z' });
    expect(m.boardFrom).toBeUndefined();
    expect(importedModel(s, [], 'f').name).toBe('hiltwright_nihilus');
  });
});
