// saber-library 1.9 (baseline audit): a snapshot on disk is a presets list the codec reads back. ProffieOS would not
// load one copied onto a card: it takes a plain presets.ini only with installed=<its build time> first (issue #28).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emitPresetsIni, parsePresetsIni, planRestore } from '@hiltwright/core';
import { Snapshots } from '../src/main/snapshots';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-snap-')); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-25T20:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

const presets = [
  { font: 'Mara Jade Skywalker;common', track: 'Mara Jade Skywalker/tracks/The_Force.wav', styles: ['builtin 0 1', 'builtin 0 2', 'builtin 0 3'], name: 'Mara Jade\\nSkywalker', variation: 0 },
  { font: 'Valkyrie;common', track: '', styles: ['builtin 1 1 ~ ~ 255,0,0', 'builtin 1 2', 'builtin 1 3'], name: 'Valkyrie', variation: 12 },
];

describe('snapshots', () => {
  it('1.9 a snapshot on disk is a presets list with a header that reads back the same', async () => {
    const snaps = new Snapshots(dir);
    const meta = await snaps.save('ea8dbea42e78', 'Before: Edit\npreset', presets);
    expect(meta.file).toBe('2026-09-25T20-00-00-000Z-before-edit-preset.ini');
    const text = readFileSync(join(dir, 'sabers', 'ea8dbea42e78', 'snapshots', meta.file), 'utf8');
    expect(text.split('\n').slice(0, 3)).toEqual(['# hiltwright snapshot', '# label=Before: Edit preset', '# at=2026-09-25T20:00:00.000Z']);
    expect(text.trimEnd().split('\n').at(-1)).toBe('end');
    const ini = parsePresetsIni(text);
    expect(ini.terminated).toBe(true);
    expect(ini.presets).toEqual(presets);
    expect(await snaps.read('ea8dbea42e78', meta.file)).toEqual(presets);
    expect(await snaps.list('ea8dbea42e78')).toEqual([{ file: meta.file, at: '2026-09-25T20:00:00.000Z', label: 'Before: Edit preset', presets: 2, complete: true }]);
  });

  it('preset-history-restore: a snapshot read back from disk plans no change against the list it was taken from, and finds a moved, edited preset', async () => {
    const snaps = new Snapshots(dir);
    const meta = await snaps.save('ea8dbea42e78', 'Before: Font', presets);
    const saved = await snaps.read('ea8dbea42e78', meta.file);
    expect(planRestore(saved, presets).same).toBe(true);
    const now = [{ ...presets[1], font: 'Other;common' }, presets[0]];
    expect(planRestore(saved, now).single).toMatchObject({ at: 0, snapshotAt: 1, patch: { font: 'Valkyrie;common' } });
  });
});

describe('snapshots stay cheap as they pile up (issue #23)', () => {
  const id = 'ea8dbea42e78';
  const folder = () => join(dir, 'sabers', id, 'snapshots');
  /** A list that differs from every other one numbered differently. */
  const version = (n: number) => [{ ...presets[0], name: `Version ${n}` }];
  const files = () => readdirSync(folder()).sort();

  it('a new snapshot carries its preset count in its header, and a list reads only the header', async () => {
    const snaps = new Snapshots(dir);
    const meta = await snaps.save(id, 'Connected', presets);
    const path = join(folder(), meta.file);
    expect(readFileSync(path, 'utf8').split('\n')[3]).toBe('# presets=2');
    // A list from a fresh start trusts the header: a count that disagrees with the body shows it was not parsed.
    writeFileSync(path, readFileSync(path, 'utf8').replace('# presets=2', '# presets=7'));
    expect((await new Snapshots(dir).list(id))[0].presets).toBe(7);
  });

  it('a snapshot saved before the count was in the header is still counted, by reading it', async () => {
    mkdirSync(folder(), { recursive: true });
    const old = `# hiltwright snapshot\n# label=Before: Rename\n# at=2026-09-01T10:00:00.000Z\n${emitPresetsIni({ installed: null, presets, terminated: true })}`;
    writeFileSync(join(folder(), '2026-09-01T10-00-00-000Z-before-rename.ini'), old);
    expect(await new Snapshots(dir).list(id)).toEqual([{ file: '2026-09-01T10-00-00-000Z-before-rename.ini', at: '2026-09-01T10:00:00.000Z', label: 'Before: Rename', presets: 2, complete: true }]);
  });

  it('a list notices files added and removed by hand', async () => {
    const snaps = new Snapshots(dir);
    const a = await snaps.save(id, 'Connected', version(1));
    vi.setSystemTime(new Date('2026-09-25T20:01:00.000Z'));
    const b = await snaps.save(id, 'Before: Rename', version(2));
    expect((await snaps.list(id)).map((m) => m.file)).toEqual([b.file, a.file]);
    rmSync(join(folder(), b.file));
    expect((await snaps.list(id)).map((m) => m.file)).toEqual([a.file]);
  });

  it('a routine snapshot that matches the newest one is not saved again; one before an install always is', async () => {
    const snaps = new Snapshots(dir);
    const first = await snaps.save(id, 'Connected', presets);
    vi.setSystemTime(new Date('2026-09-25T20:01:00.000Z'));
    expect(await snaps.save(id, 'Connected', presets)).toEqual(first);
    expect(await snaps.save(id, 'Before: Rename preset', presets)).toEqual(first);
    // From a fresh start too, where the newest one is read back to compare.
    expect(await new Snapshots(dir).save(id, 'Connected', presets)).toEqual(first);
    expect(files()).toEqual([first.file]);
    const install = await snaps.save(id, 'Before install with staged presets', presets);
    expect(install.file).not.toBe(first.file);
    vi.setSystemTime(new Date('2026-09-25T20:02:00.000Z'));
    const changed = await snaps.save(id, 'Connected', version(9));
    expect(files()).toEqual([first.file, install.file, changed.file].sort());
  });

  it('routine snapshots beyond the newest few are thinned to one a day; restore, install and card ones are never removed', async () => {
    const snaps = new Snapshots(dir, 3);
    const saved: { file: string; label: string }[] = [];
    let n = 0;
    const at = (day: number, hour: number, label: string) => {
      vi.setSystemTime(new Date(`2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`));
      return snaps.save(id, label, version(++n)).then((m) => { saved.push(m); return m; });
    };
    // Day 1: three routine snapshots and the important ones; day 2: two routine; day 3: four routine.
    await at(1, 8, 'Connected');
    await at(1, 9, 'Before: Rename');
    await at(1, 10, 'Before: Restore "Connected"');
    await at(1, 11, 'Before install with staged presets');
    await at(1, 12, 'Card presets, before the card was prepared');
    await at(1, 13, 'Before: Delete preset');
    await at(2, 8, 'Connected');
    await at(2, 9, 'Before: Font');
    for (let h = 8; h < 12; h++) await at(3, h, h === 8 ? 'Connected' : 'Before: Colour');
    const left = (await snaps.list(id)).map((m) => m.label + ' ' + m.at.slice(0, 13));
    expect(left).toEqual([
      // The newest three routine snapshots, all from day 3.
      'Before: Colour 2026-09-03T11', 'Before: Colour 2026-09-03T10', 'Before: Colour 2026-09-03T09',
      // Then the newest of each older day.
      'Before: Font 2026-09-02T09',
      'Before: Delete preset 2026-09-01T13',
      // And every snapshot that is not routine.
      'Card presets, before the card was prepared 2026-09-01T12',
      'Before install with staged presets 2026-09-01T11',
      'Before: Restore "Connected" 2026-09-01T10',
    ]);
    expect(files()).toHaveLength(left.length);
  });
});

describe('a snapshot cut short is never offered as complete (issue #28)', () => {
  const id = 'ea8dbea42e78';
  const folder = () => join(dir, 'sabers', id, 'snapshots');
  /** Long enough that the header and the end are read apart (more than the 1024 bytes of the header read). */
  const many = Array.from({ length: 30 }, (_, i) => ({ ...presets[1], name: `Preset ${i}` }));
  const cut = (text: string) => text.slice(0, text.lastIndexOf('end')); // a save that stopped before its end line

  it('is written whole: through a temporary file renamed into place, with nothing left beside it', async () => {
    const snaps = new Snapshots(dir);
    const meta = await snaps.save(id, 'Connected', many);
    expect(meta.complete).toBe(true);
    expect(readdirSync(folder())).toEqual([meta.file]);
    // A temporary file a crash left behind is not listed, and goes.
    writeFileSync(join(folder(), `${meta.file.replace('.ini', '-x.ini')}.part`), '# hiltwright snapshot\n');
    expect((await new Snapshots(dir).list(id)).map((m) => m.file)).toEqual([meta.file]);
    expect(readdirSync(folder())).toEqual([meta.file]);
  });

  it('lists a file cut short as incomplete, long or short, with the count in its header or not, and refuses to read it', async () => {
    const snaps = new Snapshots(dir);
    const long = await snaps.save(id, 'Before install with staged presets', many);
    vi.setSystemTime(new Date('2026-09-25T20:01:00.000Z'));
    const short = await snaps.save(id, 'Before: Restore "Connected"', presets);
    for (const m of [long, short]) writeFileSync(join(folder(), m.file), cut(readFileSync(join(folder(), m.file), 'utf8')));
    mkdirSync(folder(), { recursive: true });
    const old = '2026-09-01T10-00-00-000Z-before-rename.ini';
    writeFileSync(join(folder(), old), cut(`# hiltwright snapshot\n# label=Before: Rename\n# at=2026-09-01T10:00:00.000Z\n${emitPresetsIni({ installed: null, presets, terminated: true })}`));
    const listed = await new Snapshots(dir).list(id);
    expect(listed.map((m) => [m.file, m.complete])).toEqual([[short.file, false], [long.file, false], [old, false]]);
    for (const m of listed) await expect(snaps.read(id, m.file)).rejects.toThrow(/incomplete.*cannot be restored/);
  });

  it('keeps the flag in the metas it remembers between lists', async () => {
    const snaps = new Snapshots(dir);
    const meta = await snaps.save(id, 'Before install with staged presets', presets);
    expect((await snaps.list(id))[0].complete).toBe(true);
    writeFileSync(join(folder(), 'zz-cut.ini'), cut(readFileSync(join(folder(), meta.file), 'utf8')));
    expect((await snaps.list(id)).map((m) => [m.file, m.complete])).toEqual([['zz-cut.ini', false], [meta.file, true]]);
    expect((await snaps.list(id)).map((m) => m.complete)).toEqual([false, true]);
  });

  it('an incomplete newest snapshot does not stand in for the saber\'s presets: the routine one is saved', async () => {
    const snaps = new Snapshots(dir);
    const first = await snaps.save(id, 'Connected', presets);
    writeFileSync(join(folder(), first.file), cut(readFileSync(join(folder(), first.file), 'utf8')));
    vi.setSystemTime(new Date('2026-09-25T20:01:00.000Z'));
    const again = await new Snapshots(dir).save(id, 'Connected', presets);
    expect(again.file).not.toBe(first.file);
    expect(again.complete).toBe(true);
  });
});
