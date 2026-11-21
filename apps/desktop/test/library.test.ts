// saber-library scenarios from the baseline audit (baseline-board 1.1, 1.2, 1.4-1.7, 1.18, 1.20), against the real
// store on a temporary folder. A new Library on the same file stands for a restart of the app.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SaberConfigModel } from '@hiltwright/core';
import { Library, defaultName } from '../src/main/library';
import { resetStoreProblems, storeProblems } from '../src/main/jsonStore';
import type { SaberIdentity } from '../src/shared/api';

let dir = '';
let file = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-library-')); file = join(dir, 'library.json'); resetStoreProblems(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const hote2: SaberIdentity = {
  usbSerial: '209133815232', configName: 'config/hiltwright_hote2.h', version: 'v8.10 hiltwright ce12a06', prop: 'SaberFett263Buttons',
  buttons: 2, installed: 'Sep 24 2026 18:48:49', pixelBlades: [132, 1, 2], bladeConfig: 0,
};
const noSerial = (over: Partial<SaberIdentity> = {}): SaberIdentity => ({ ...hote2, usbSerial: null, ...over });
const preset = (name: string, font = 'GeneralPrincess;common') => ({ font, track: 'tracks/General.wav', styles: ['builtin 0 1'], name, variation: 0 });
const connect = (lib: Library, identity: SaberIdentity, names = ['Preset: 1']) =>
  lib.upsert({ identity, presets: names.map((n) => preset(n)), fonts: ['GeneralPrincess'], tracks: ['tracks/General.wav'] });
const model = { name: 'kylo', board: 'V2', buttons: 2, prop: 'fett263', blades: [], presets: [] } as unknown as SaberConfigModel;

describe('saber library', () => {
  it('a card belongs to one saber: linking it to another takes it from the first, and it can be let go', async () => {
    const lib = new Library(file);
    const a = await connect(lib, hote2);
    const b = await connect(lib, { ...hote2, usbSerial: '207A349A5430', configName: 'config/v3.h' });
    await lib.linkCard(a.id, { serial: '5a1c3f0e', label: 'NIHILUS' });
    let [ra, rb] = [(await lib.list()).find((s) => s.id === a.id)!, (await lib.list()).find((s) => s.id === b.id)!];
    expect(ra.cards?.map((c) => [c.serial, c.label])).toEqual([['5A1C3F0E', 'NIHILUS']]);
    await lib.linkCard(b.id, { serial: '5A1C3F0E', label: null });
    [ra, rb] = [(await new Library(file).list()).find((s) => s.id === a.id)!, (await new Library(file).list()).find((s) => s.id === b.id)!];
    expect(ra.cards).toEqual([]);
    expect(rb.cards?.map((c) => c.serial)).toEqual(['5A1C3F0E']);
    await lib.unlinkCard(b.id, '5a1c3f0e');
    expect((await lib.list()).find((s) => s.id === b.id)?.cards).toEqual([]);
    await expect(lib.linkCard(a.id, { serial: 'E:\\; del', label: null })).rejects.toThrow(/Not a volume serial/);
  });

  it('1.1 a connected saber is still listed after a restart', async () => {
    await connect(new Library(file), hote2, ['Mara Jade Skywalker', 'Valkyrie']);
    const [s, ...rest] = await new Library(file).list();
    expect(rest).toEqual([]);
    expect(s.name).toBe('hote2');
    expect(s.identity.configName).toBe('config/hiltwright_hote2.h');
    expect(s.presets.map((p) => p.name)).toEqual(['Mara Jade Skywalker', 'Valkyrie']);
    expect(Date.parse(s.lastSeen)).not.toBeNaN();
  });

  it('1.2 an unreadable store starts with no sabers instead of failing, and is kept aside, never overwritten', async () => {
    writeFileSync(file, '{ this is not json');
    const lib = new Library(file);
    expect(await lib.list()).toEqual([]);
    const [p] = storeProblems();
    expect(p).toMatchObject({ store: 'saber list', startedFrom: 'nothing' });
    await connect(lib, hote2);
    expect(readFileSync(join(dir, p.keptAs), 'utf8')).toBe('{ this is not json');
    expect((await new Library(file).list()).map((s) => s.name)).toEqual(['hote2']);
    for (const bad of [JSON.stringify({ version: 7, sabers: [{ id: 'x' }] }), JSON.stringify({ version: 1, sabers: 'nope' })]) {
      writeFileSync(file, bad);
      expect(await new Library(file).list()).toEqual([]);
    }
  });

  it('1.2 an unreadable store starts from the backup copy when there is one', async () => {
    const lib = new Library(file);
    await connect(lib, hote2);
    await connect(lib, noSerial({ configName: 'config/other.h' }));
    writeFileSync(file, 'garbage');
    expect((await new Library(file).list()).map((s) => s.name)).toEqual(['hote2']);
    expect(storeProblems()[0].startedFrom).toBe('backup');
  });

  // BST-1: fixed by library-integrity.
  it('1.2 a store whose records have the wrong shape reads as no sabers, and the original is kept', async () => {
    const original = JSON.stringify({ version: 1, sabers: [{ id: 'a' }, { id: 'b' }] });
    writeFileSync(file, original);
    const lib = new Library(file);
    expect(await lib.list()).toEqual([]);
    await connect(lib, hote2);
    expect((await lib.list()).map((s) => s.name)).toEqual(['hote2']);
    expect(readFileSync(join(dir, storeProblems()[0].keptAs), 'utf8')).toBe(original);
  });

  it('two changes at the same moment both land (HW-2026-09-24a)', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    const firmware = { hash: 'h', os: 'v8.10', at: '2026-09-25T00:00:00Z', looks: [], presets: [] };
    await Promise.all([lib.update(s.id, { firmware }), lib.update(s.id, { model }), lib.rename(s.id, 'Ahsoka')]);
    const [back] = await new Library(file).list();
    expect(back.firmware).toEqual(firmware);
    expect(back.model).toEqual(model);
    expect(back.name).toBe('Ahsoka');
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('preset-editor-fixes D5 (F38): presets changed live are remembered as last read, and the rest of the record kept', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2, ['Mara', 'Valkyrie']);
    await lib.update(s.id, { model });
    await lib.update(s.id, { presets: [preset('Mara Jade'), preset('Valkyrie', 'Grey;Extra;common')] });
    const [back] = await new Library(file).list();
    expect(back.presets.map((p) => [p.name, p.font])).toEqual([['Mara Jade', 'GeneralPrincess;common'], ['Valkyrie', 'Grey;Extra;common']]);
    expect(back.model).toEqual(model);
    expect(back.identity).toEqual(hote2);
  });

  it('1.4 with no serial, a board is matched only when config, install stamp and blade layout all agree', async () => {
    const lib = new Library(file);
    const first = await connect(lib, noSerial());
    expect((await connect(lib, noSerial())).id).toBe(first.id);
    // Today a reflash (new install stamp) without a serial makes a new record; library-integrity F15 changes that.
    for (const differs of [{ configName: 'config/other.h' }, { installed: 'Sep 25 2026 09:00:00' }, { pixelBlades: [144] }]) {
      expect((await connect(lib, noSerial(differs))).id).not.toBe(first.id);
    }
  });

  it('1.5 a plan is never mistaken for a board', async () => {
    const lib = new Library(file);
    const plan = await lib.plan('hote2', model);
    const board = await connect(lib, noSerial());
    expect(board.id).not.toBe(plan.id);
    expect(board.planned).toBeUndefined();
    const all = await lib.list();
    expect(all.find((s) => s.id === plan.id)?.planned).toBe(true);
    expect(all).toHaveLength(2);
  });

  it('1.6 presets changed on the saber itself replace the record\'s, and the name is kept', async () => {
    const lib = new Library(file);
    const first = await connect(lib, hote2, ['Preset: 1', 'Preset: 2']);
    await lib.rename(first.id, 'Ahsoka');
    const again = await connect(new Library(file), hote2, ['Preset: 2', 'Preset: 1', 'Preset: 3']);
    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Ahsoka');
    expect(again.presets.map((p) => p.name)).toEqual(['Preset: 2', 'Preset: 1', 'Preset: 3']);
  });

  it('1.7 a saber is named from its config', async () => {
    expect((await connect(new Library(file), hote2)).name).toBe('hote2');
    expect(defaultName({ ...hote2, configName: 'config/hote2.h' })).toBe('hote2');
    expect(defaultName({ ...hote2, configName: 'config/proffieboard_v2_config.h', prop: 'SaberFett263Buttons' })).toBe('SaberFett263Buttons saber');
    expect(defaultName({ ...hote2, configName: null, prop: null })).toBe('Proffie saber');
  });

  it('1.18 dropping a plan removes it and leaves the rest', async () => {
    const lib = new Library(file);
    const plan = await lib.plan('Kylo', model);
    const board = await connect(lib, hote2);
    await lib.remove(plan.id);
    expect((await new Library(file).list()).map((s) => s.id)).toEqual([board.id]);
  });

  it('1.20 a new name is kept after reconnecting, and a blank name keeps the old one', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    expect((await lib.rename(s.id, '  Ahsoka ')).name).toBe('Ahsoka');
    expect((await lib.rename(s.id, '   ')).name).toBe('Ahsoka');
    expect((await connect(new Library(file), hote2)).name).toBe('Ahsoka');
    await expect(lib.rename('nope', 'x')).rejects.toThrow('Unknown saber');
  });
});

describe('a saber expected back after its install (F15)', () => {
  const reflashed = noSerial({ installed: 'Sep 25 2026 16:30:00', configName: 'config/hiltwright_hote2.h' });

  it('matches the saber installed when the board reports the config that install wrote, with no serial', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    const back = await lib.upsert({ identity: reflashed, presets: [], fonts: [], tracks: [] }, { id: s.id, configName: 'config/hiltwright_hote2.h' });
    expect(back.id).toBe(s.id);
    expect(back.identity.installed).toBe('Sep 25 2026 16:30:00');
    expect(back.identity.usbSerial).toBe(hote2.usbSerial);
    expect(await lib.list()).toHaveLength(1);
  });

  it('does not match when the board reports another config', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    const other = await lib.upsert({ identity: reflashed, presets: [], fonts: [], tracks: [] }, { id: s.id, configName: 'config/hiltwright_kylo.h' });
    expect(other.id).not.toBe(s.id);
  });

  it('never matches a plan through an expectation', async () => {
    const lib = new Library(file);
    const plan = await lib.plan('hote2', model);
    const board = await lib.upsert({ identity: reflashed, presets: [], fonts: [], tracks: [] }, { id: plan.id, configName: 'config/hiltwright_hote2.h' });
    expect(board.id).not.toBe(plan.id);
    expect((await lib.list()).find((x) => x.id === plan.id)?.planned).toBe(true);
  });

  it('lets a serial match win over the expectation', async () => {
    const lib = new Library(file);
    const a = await connect(lib, hote2);
    const b = await connect(lib, { ...hote2, usbSerial: 'OTHER', configName: 'config/hiltwright_kylo.h' });
    const back = await lib.upsert({ identity: { ...hote2, installed: 'new' }, presets: [], fonts: [], tracks: [] }, { id: b.id, configName: 'config/hiltwright_hote2.h' });
    expect(back.id).toBe(a.id);
  });
});

describe('a style saved again reaches every plan that holds it (style-save-integrity ST1)', () => {
  const red = { id: 'look_kylo', name: 'Kylo', source: 'built', by: 'you', code: 'StylePtr<Red>()', header: null, roles: ['main'], args: [], preview: '#ff0000', description: '' } as const;
  const withLooks = (looks: unknown[]) => ({ ...model, looks }) as unknown as SaberConfigModel;

  it('replaces the copy in every record that has it, planned or not, and counts them', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    await lib.update(s.id, { model: withLooks([red]) });
    const plan = await lib.plan('Kylo build', withLooks([{ ...red }, { ...red, id: 'look_other', code: 'StylePtr<Blue>()' }]));
    const bystander = await lib.plan('Other build', withLooks([{ ...red, id: 'look_other' }]));
    const blue = { ...red, code: 'StylePtr<Blue>()' };
    expect(await lib.replaceLook(blue as never)).toBe(2);
    const all = await new Library(file).list();
    const by = (id: string) => all.find((x) => x.id === id)!.model!.looks!;
    expect(by(s.id)).toEqual([blue]);
    expect(by(plan.id).map((l) => [l.id, l.code])).toEqual([['look_kylo', 'StylePtr<Blue>()'], ['look_other', 'StylePtr<Blue>()']]);
    expect(by(bystander.id)).toEqual([{ ...red, id: 'look_other' }]);
  });

  it('counts none when no plan holds the style', async () => {
    const lib = new Library(file);
    await lib.plan('Empty', model);
    expect(await lib.replaceLook(red as never)).toBe(0);
  });
});

// install-target-safety design D1: what a saber's bootloader showed at an install.
describe('the bootloader a saber showed', () => {
  it('is kept with the board its flash size means, and survives the next normal connect and a restart', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    const rec = await lib.noteBootloader(s.id, { serial: '209133815232', flashBytes: 262144 });
    expect(rec.bootloader).toMatchObject({ serial: '209133815232', flashBytes: 262144, board: 'V2' });
    await connect(lib, hote2);
    const [again] = await new Library(file).list();
    expect(again.bootloader).toMatchObject({ serial: '209133815232', board: 'V2' });
  });

  it('a 512 KB bootloader is a V3; a serial-less one is kept without a serial', async () => {
    const lib = new Library(file);
    const s = await connect(lib, noSerial());
    expect((await lib.noteBootloader(s.id, { serial: null, flashBytes: 524288 })).bootloader).toMatchObject({ serial: null, board: 'V3' });
  });

  it('refuses a flash size no Proffieboard has, and a serial that is not plain text', async () => {
    const lib = new Library(file);
    const s = await connect(lib, hote2);
    await expect(lib.noteBootloader(s.id, { serial: '209133815232', flashBytes: 131072 })).rejects.toThrow(/flash size/);
    await expect(lib.noteBootloader(s.id, { serial: 'x'.repeat(41), flashBytes: 262144 })).rejects.toThrow(/serial/);
    await expect(lib.noteBootloader(s.id, { serial: '..\evil', flashBytes: 262144 })).rejects.toThrow(/serial/);
    expect((await lib.list())[0].bootloader).toBeUndefined();
  });

  it('a serial is one board: recording it on one saber takes it off another', async () => {
    const lib = new Library(file);
    const a = await connect(lib, hote2);
    const b = await connect(lib, { ...hote2, usbSerial: '207A349A5430', configName: 'config/default_proffieboard_config.h' });
    await lib.noteBootloader(a.id, { serial: '207A349A5430', flashBytes: 524288 });
    await lib.noteBootloader(b.id, { serial: '207A349A5430', flashBytes: 524288 });
    const byId = new Map((await lib.list()).map((s) => [s.id, s]));
    expect(byId.get(a.id)!.bootloader).toBeUndefined();
    expect(byId.get(b.id)!.bootloader?.serial).toBe('207A349A5430');
  });
});
