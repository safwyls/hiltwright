import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, bankFromSaber, bankProblems, bankToModel, generateConfig, isBank, newBank, newBankPreset, type FirmwareManifest, type LookDef, type PresetRecord, type SaberConfigModel } from '../src';

const model: SaberConfigModel = {
  name: 'hw_test', board: 'V2', buttons: 2, prop: 'fett263',
  blades: [
    { id: 'main', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2'] } },
    { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } },
  ],
  presets: [{ font: 'Old;common', track: '', name: 'Old' }],
};
const pasted: LookDef = { id: 'lk_paste', name: 'Pasted', source: 'pasted', by: 'someone', code: 'StylePtr<Layers<Red, InOutTrL<TrWipe<300>, TrWipeIn<500>>>>()', header: null, roles: ['main'], args: [], preview: '#ff0000', description: '' };

describe('preset banks', () => {
  it('maps roles onto a saber\'s blades and carries the looks it needs', () => {
    const bank = newBank('Duel');
    bank.presets = [
      { name: 'Guardian', font: 'Sentinel;common', track: 'tracks/one.wav', looks: { main: 'hw_pulse', crystal: 'hw_accent' }, lookArgs: { main: '1,0,0,65535' } },
      { name: 'Ember', font: 'Fire', track: '', looks: { main: 'lk_paste', side: 'hw_blade' } },
    ];
    const m = bankToModel(bank, model, [pasted]);
    expect(m.presets).toHaveLength(2);
    expect(m.presets[0]).toMatchObject({ name: 'Guardian', font: 'Sentinel;common', looks: ['hw_pulse', 'hw_accent'], lookArgs: ['1,0,0,65535', null] });
    expect(m.presets[1].looks).toEqual(['lk_paste', null]); // the side blade is not on this saber
    expect(m.looks?.map((l) => l.id)).toEqual(['lk_paste']);
    expect(m.presetsFrom?.bank).toBe(bank.id);
    const g = generateConfig(m);
    expect(g.text).toContain('Sentinel;common');
    expect(g.manifest.presets.map((p) => p.name)).toEqual(['Guardian', 'Ember']);
  });

  it('seeds a bank from a saber\'s presets and firmware', () => {
    const presets: PresetRecord[] = [{ font: 'Jedi;common', track: 'tracks/a.wav', styles: ['builtin 0 1 1,0,0,65535', 'builtin 0 2'], name: 'One', variation: 0 }];
    const firmware: FirmwareManifest = { hash: 'x', os: '8.10', at: '', looks: [{ id: 'hw_pulse', name: 'Pulsing', args: [1] }, { id: 'hw_accent', name: 'Accent', args: [] }], presets: [{ name: 'One', looks: ['hw_pulse', 'hw_accent'] }] };
    const bank = bankFromSaber('From hote2', presets, model.blades, firmware);
    expect(isBank(bank)).toBe(true);
    expect(bank.presets[0]).toEqual({ name: 'One', font: 'Jedi;common', track: 'tracks/a.wav', looks: { main: 'hw_pulse', crystal: 'hw_accent' }, lookArgs: { main: '1,0,0,65535' } });
    const vendor = bankFromSaber('Vendor', presets, model.blades, null);
    expect(vendor.presets[0].looks).toEqual({});
  });

  it('names the problems a bank has for a saber', () => {
    const bank = newBank('Odd');
    bank.presets = [{ ...newBankPreset('Ghost'), looks: { main: 'gone', side: STARTER_LOOKS[0].id } }, { ...newBankPreset(''), font: '' }];
    const problems = bankProblems(bank, model.blades, []);
    expect(problems.some((p) => /"gone" is not in the library/.test(p))).toBe(true);
    expect(problems.some((p) => /side blade, which this saber does not have/.test(p))).toBe(true);
    expect(problems.some((p) => /Preset 2 has no name/.test(p))).toBe(true);
    expect(problems.some((p) => /has no font/.test(p))).toBe(true);
    expect(bankProblems(newBank(), model.blades, [])).toEqual(['The bank has no presets.']);
  });
});
