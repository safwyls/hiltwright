import { beforeAll, describe, expect, it } from 'vitest';
import { wiringConfirmed, withWiringConfirmation, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../src/shared/api';

// draftModel stamps the app version from the preload bridge; stand it in before the module loads.
let draftModel: typeof import('../src/renderer/src/saberModel').draftModel;
let infoFromRecord: typeof import('../src/renderer/src/saberModel').infoFromRecord;
let matchPresets: typeof import('../src/renderer/src/saberModel').matchPresets;
let withPresetRenamed: typeof import('../src/renderer/src/saberModel').withPresetRenamed;
let boardCorrection: typeof import('../src/renderer/src/saberModel').boardCorrection;
let boardSuggestion: typeof import('../src/renderer/src/saberModel').boardSuggestion;
beforeAll(async () => {
  (globalThis as unknown as { window: unknown }).window = { hiltwright: { appVersion: 'test' } };
  ({ draftModel, infoFromRecord, boardCorrection, boardSuggestion, matchPresets, withPresetRenamed } = await import('../src/renderer/src/saberModel'));
});

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const saved: SaberConfigModel = { name: 'hiltwright_kylo', board: 'V2', buttons: 2, prop: 'fett263', blades: [main], presets: [{ font: 'common', track: '', name: 'Preset 1' }], looks: [] };

function plan(model: SaberConfigModel): SaberRecord {
  return { id: 'p1', name: 'Kylo build', planned: true, identity: {}, presets: [], fonts: [], tracks: [], model, lastSeen: null } as unknown as SaberRecord;
}

describe('the working model', () => {
  it('keeps the wiring confirmation of a saber that has never been installed (FW1)', () => {
    const rec = plan(withWiringConfirmation(saved, true));
    const m = draftModel(infoFromRecord(rec), rec);
    expect(m.wiringConfirmation).toEqual(rec.model!.wiringConfirmation);
    expect(wiringConfirmed(m)).toBe(true);
  });

  it("#14 keeps the board settings taken from the installer's config, so builds have them", () => {
    const rec = plan({ ...saved, boardDefines: ['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE'] });
    expect(draftModel(infoFromRecord(rec), rec).boardDefines).toEqual(['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE']);
    expect(draftModel(infoFromRecord(plan(saved)), plan(saved)).boardDefines).toBeUndefined();
  });

  it('shows no confirmation when none was given, or only the old timestamp', () => {
    expect(wiringConfirmed(draftModel(infoFromRecord(plan(saved)), plan(saved)))).toBe(false);
    const legacy = plan({ ...saved, wiringConfirmedAt: '2026-09-22T10:00:00.000Z' });
    expect(wiringConfirmed(draftModel(infoFromRecord(legacy), legacy))).toBe(false);
  });
});

// Baseline audit (baseline-board 1.15, 6.16) and the defects found while writing these tests (BST-2, BST-3).
const board = (name: string, font = 'common') => ({ font, track: '', styles: ['builtin 0 1'], name, variation: 0 });
function connected(presets: ReturnType<typeof board>[], model?: SaberConfigModel, identity: Partial<SaberRecord['identity']> = {}): SaberRecord {
  return {
    id: 's1', name: 'hote2', firstSeen: '', lastSeen: '', fonts: [], tracks: [], presets, ...(model ? { model } : {}),
    identity: { usbSerial: '1', configName: 'config/hiltwright_hote2.h', version: 'v8.10 hiltwright ce12a06', prop: 'SaberFett263Buttons', buttons: 2, installed: 'x', pixelBlades: [132, 1, 2], bladeConfig: 0, ...identity },
  };
}
const withLooks = (names: [string, string | null][]): SaberConfigModel => ({ ...saved, presets: names.map(([name, look]) => ({ font: 'common', track: '', name, ...(look ? { looks: [look] } : {}) })) });
const looksOf = (m: SaberConfigModel) => m.presets.map((p) => p.looks?.[0] ?? null);

describe('drafts from what the saber reports', () => {
  it("1.15 first visit to a remembered saber: one blade per reported pixel count, and the saber's presets", () => {
    const rec = connected([board('Mara Jade', 'Mara;common'), board('Valkyrie', 'Valkyrie;common')]);
    const m = draftModel(infoFromRecord(rec), rec);
    expect(m.blades.map((b) => [b.role, b.type, b.pixels])).toEqual([['main', 'pixel', 132], ['crystal', 'pixel', 1], ['accent', 'pixel', 2]]);
    expect(m.presets).toEqual([{ font: 'Mara;common', track: '', name: 'Mara Jade' }, { font: 'Valkyrie;common', track: '', name: 'Valkyrie' }]);
    expect(m.name).toBe('hiltwright_hote2');
    expect(m.looks).toEqual([]);
    expect(m.generator).toBe('hiltwright test');
  });

  it('6.16 presets reordered on the saber keep the styles chosen for them', () => {
    const rec = connected([board('B'), board('C'), board('A')], withLooks([['A', 'look_a'], ['B', 'look_b'], ['C', null]]));
    expect(looksOf(draftModel(infoFromRecord(rec), rec))).toEqual(['look_b', null, 'look_a']);
  });

  // BST-2, fixed by preset-editor-fixes (design D2): presets that share a name, or have none, match in order.
  it('presets with the same name, or no name, keep their own styles', () => {
    const rec = connected([board(''), board('')], withLooks([['', 'look_1'], ['', 'look_2']]));
    expect(looksOf(draftModel(infoFromRecord(rec), rec))).toEqual(['look_1', 'look_2']);
  });

  // BST-2, fixed by preset-editor-fixes (design D2): an unknown name takes no styles, not its position's.
  it("a preset renamed and moved on the saber does not take its new position's styles", () => {
    const rec = connected([board('B'), board('A renamed')], withLooks([['A', 'look_a'], ['B', 'look_b']]));
    expect(looksOf(draftModel(infoFromRecord(rec), rec))).toEqual(['look_b', null]);
  });

  // BST-3, fixed by install-target-safety (design D2): the running firmware never says its board, so a name is only a hint.
  it('a new saber whose config names a V3 board: V3 is suggested, and no board is chosen', () => {
    const rec = connected([board('A')], undefined, { configName: 'config/proffieboard_v3_config.h', version: 'v8.10' });
    const m = draftModel(infoFromRecord(rec), rec);
    expect(m.boardFrom).toBeUndefined();
    expect(boardSuggestion(rec)).toBe('V3');
  });
});

// install-target-safety design D2: where the board comes from.
describe('the board of a draft', () => {
  const manifest = (b: 'V2' | 'V3') => ({ hash: 'h', os: 'v8.10', at: '', looks: [], presets: [], wiring: { board: b, blades: [main] } });
  const boot = (b: 'V2' | 'V3') => ({ serial: '1', flashBytes: b === 'V2' ? 262144 : 524288, board: b, at: '' });

  it('a saber never installed, with nothing chosen: no board, whatever the saved wiring holds', () => {
    const rec = connected([board('A')], { ...saved, board: 'V3', boardFrom: 'firmware' });
    const m = draftModel(infoFromRecord(rec), rec);
    expect([m.board, m.boardFrom]).toEqual(['V3', undefined]);
  });

  it("the owner's choice counts", () => {
    const rec = connected([board('A')], { ...saved, board: 'V3', boardFrom: 'owner' });
    expect(draftModel(infoFromRecord(rec), rec)).toMatchObject({ board: 'V3', boardFrom: 'owner' });
  });

  it('firmware Hiltwright installed for the same board makes it known, also with no saved wiring', () => {
    const rec = { ...connected([board('A')], saved), firmware: manifest('V2') };
    expect(draftModel(infoFromRecord(rec), rec)).toMatchObject({ board: 'V2', boardFrom: 'firmware' });
    const bare = { ...connected([board('A')]), firmware: manifest('V3') };
    expect(draftModel(infoFromRecord(bare), bare)).toMatchObject({ board: 'V3', boardFrom: 'firmware' });
  });

  it("the owner switching away from the installed firmware's board is their choice", () => {
    const rec = { ...connected([board('A')], { ...saved, board: 'V3', boardFrom: 'owner' }), firmware: manifest('V2') };
    expect(draftModel(infoFromRecord(rec), rec)).toMatchObject({ board: 'V3', boardFrom: 'owner' });
  });

  it("the bootloader's flash size wins, and a different saved board is reported as corrected", () => {
    const rec = { ...connected([board('A')], { ...saved, board: 'V2', boardFrom: 'owner' }), firmware: manifest('V2'), bootloader: boot('V3') };
    expect(draftModel(infoFromRecord(rec), rec)).toMatchObject({ board: 'V3', boardFrom: 'bootloader' });
    expect(boardCorrection(rec)).toEqual({ saved: 'V2', actual: 'V3' });
    expect(boardSuggestion(rec)).toBeNull();
    const same = { ...rec, model: { ...saved, board: 'V3' as const } };
    expect(boardCorrection(same)).toBeNull();
  });

  it('a planned saber asks, until the owner chooses', () => {
    expect(draftModel(infoFromRecord(plan(saved)), plan(saved)).boardFrom).toBeUndefined();
    const chosen = plan({ ...saved, boardFrom: 'owner' });
    expect(draftModel(infoFromRecord(chosen), chosen).boardFrom).toBe('owner');
  });
});

// Baseline audit (baseline-firmware hardware-wiring 1.4).
describe('hardware-wiring audit: the first guess', () => {
  it('1.4 a connected saber seen for the first time: one pixel blade per strip it reports', () => {
    const rec = connected([board('One')], undefined, { pixelBlades: [140, 2, 1] });
    const m = draftModel(infoFromRecord(rec), rec);
    expect(m.blades.map((b) => [b.type, b.pixels])).toEqual([['pixel', 140], ['pixel', 2], ['pixel', 1]]);
    expect(m.blades.map((b) => b.role)).toEqual(['main', 'crystal', 'accent']);
    expect(new Set(m.blades.map((b) => (b.wiring as { dataPin: string }).dataPin)).size).toBe(3);
  });
});

// preset-editor-fixes design D2: presets matched by name, in order.
describe('presets matched by name', () => {
  it('names seen several times match in their order; a new name matches nothing', () => {
    const saved = [{ name: 'A', n: 1 }, { name: 'B', n: 2 }, { name: 'A', n: 3 }, { name: '', n: 4 }];
    expect(matchPresets(saved, [{ name: 'A' }, { name: 'A' }, { name: 'A' }, { name: 'B' }, { name: '' }, { name: 'C' }]).map((m) => m?.n ?? null)).toEqual([1, 3, null, 2, 4, null]);
  });

  it('a preset renamed in the app keeps its styles under the new name', () => {
    const before = withLooks([['A', 'look_a'], ['B', 'look_b']]);
    const renamed = connected([board('A new'), board('B')], withPresetRenamed(before, 0, 'A new'));
    expect(looksOf(draftModel(infoFromRecord(renamed), renamed))).toEqual(['look_a', 'look_b']);
  });
});
