import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonStore, resetStoreProblems, storeProblems } from '../src/main/jsonStore';

interface Doc { version: 1; items: { id: string }[] }
const clean = (raw: unknown): { value: Doc; dropped: number } | null => {
  const r = raw as Partial<Doc> | null;
  if (!r || r.version !== 1 || !Array.isArray(r.items)) return null;
  const items = r.items.filter((i): i is { id: string } => !!i && typeof (i as { id?: unknown }).id === 'string');
  return { value: { version: 1, items }, dropped: r.items.length - items.length };
};
const at = new Date(2026, 8, 25, 16, 15, 0);

let dir = '';
let file = '';
const store = () => new JsonStore<Doc>(file, { name: 'test list', empty: () => ({ version: 1, items: [] }), clean, now: () => at });
const onDisk = (name = 'things.json') => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Doc;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-store-')); file = join(dir, 'things.json'); resetStoreProblems(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the safe store', () => {
  it('reads a good file and reports nothing', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, items: [{ id: 'a' }] }));
    expect((await store().read()).items).toEqual([{ id: 'a' }]);
    expect(storeProblems()).toEqual([]);
  });

  it('reads a file that starts with a byte-order mark (saved by Notepad or PowerShell) as good', async () => {
    writeFileSync(file, '\uFEFF' + JSON.stringify({ version: 1, items: [{ id: 'bom' }] }));
    expect((await store().read()).items).toEqual([{ id: 'bom' }]);
    expect(storeProblems()).toEqual([]);
  });

  it('sets an unparseable file aside unchanged and starts from the backup copy', async () => {
    writeFileSync(join(dir, 'things.bak.json'), JSON.stringify({ version: 1, items: [{ id: 'from backup' }] }));
    writeFileSync(file, '{ broken');
    const s = store();
    expect((await s.read()).items).toEqual([{ id: 'from backup' }]);
    expect(readFileSync(join(dir, 'things.damaged-20260925-161500.json'), 'utf8')).toBe('{ broken');
    expect(storeProblems()).toEqual([{ store: 'test list', keptAs: 'things.damaged-20260925-161500.json', startedFrom: 'backup', place: 'data' }]);
    await s.update((d) => { d.items.push({ id: 'new' }); });
    expect(onDisk().items).toEqual([{ id: 'from backup' }, { id: 'new' }]);
    expect(readFileSync(join(dir, 'things.damaged-20260925-161500.json'), 'utf8')).toBe('{ broken');
  });

  it('keeps a store recovered from its backup on disk, so the next start without an edit still has it (issue #8)', async () => {
    writeFileSync(join(dir, 'things.bak.json'), JSON.stringify({ version: 1, items: [{ id: 'one' }, { id: 'two' }] }));
    writeFileSync(file, '{ "version": 1, "items": [{ "id": "one" }, {');
    expect((await store().read()).items).toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(onDisk().items).toEqual([{ id: 'one' }, { id: 'two' }]);
    resetStoreProblems();
    // Next start, no change made in between: the records are still there, and nothing is reported as damaged.
    expect((await store().read()).items).toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(storeProblems()).toEqual([]);
    // Two edits later the backup holds a real version, not an empty store.
    const s = store();
    await s.update((d) => { d.items.push({ id: 'three' }); });
    await s.update((d) => { d.items.push({ id: 'four' }); });
    expect(onDisk('things.bak.json').items.map((i) => i.id)).toEqual(['one', 'two', 'three']);
  });

  it('starts from the backup when the main file is missing but a backup is there', async () => {
    writeFileSync(join(dir, 'things.bak.json'), JSON.stringify({ version: 1, items: [{ id: 'kept' }] }));
    expect((await store().read()).items).toEqual([{ id: 'kept' }]);
    expect(onDisk().items).toEqual([{ id: 'kept' }]);
  });

  it('starts from nothing when there is no usable backup, and a wrong shape counts as unreadable', async () => {
    writeFileSync(file, JSON.stringify({ version: 9, items: 'x' }));
    expect((await store().read()).items).toEqual([]);
    expect(storeProblems()[0]).toMatchObject({ keptAs: 'things.damaged-20260925-161500.json', startedFrom: 'nothing' });
  });

  it('copies a partly bad file aside and carries on with the readable records', async () => {
    const original = JSON.stringify({ version: 1, items: [{ id: 'ok' }, { nope: 1 }] });
    writeFileSync(file, original);
    const s = store();
    expect((await s.read()).items).toEqual([{ id: 'ok' }]);
    expect(readFileSync(join(dir, 'things.damaged-20260925-161500.json'), 'utf8')).toBe(original);
    expect(storeProblems()[0].startedFrom).toBe('readable records');
    await s.update(() => {});
    expect(onDisk().items).toEqual([{ id: 'ok' }]);
    expect(readdirSync(dir)).not.toContain('things.bak.json'); // the damaged file is never the backup
  });

  it('keeps the version before the last write as the backup', async () => {
    const s = store();
    await s.update((d) => { d.items.push({ id: 'one' }); });
    await s.update((d) => { d.items.push({ id: 'two' }); });
    expect(onDisk('things.bak.json').items).toEqual([{ id: 'one' }]);
    expect(onDisk().items).toEqual([{ id: 'one' }, { id: 'two' }]);
  });

  it('lands ten updates started at once, in order, with no error and no temporary files left', async () => {
    const s = store();
    await Promise.all(Array.from({ length: 10 }, (_, i) => s.update((d) => { d.items.push({ id: String(i) }); })));
    expect(onDisk().items.map((x) => x.id)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('undoes a change in memory when it cannot be written, or when the change itself fails part-way', async () => {
    const s = store();
    await s.update((d) => { d.items.push({ id: 'kept' }); });
    rmSync(file); mkdirSync(file); // the store's file is now a folder: the next write cannot land
    await expect(s.update((d) => { d.items.push({ id: 'lost' }); })).rejects.toThrow();
    expect((await s.read()).items).toEqual([{ id: 'kept' }]);
    await expect(s.update((d) => { d.items.push({ id: 'half' }); throw new Error('stopped'); })).rejects.toThrow('stopped');
    expect((await s.read()).items).toEqual([{ id: 'kept' }]);
  });

  it('returns what the update returns, and one failed update does not stop the next', async () => {
    const s = store();
    await expect(s.update(() => { throw new Error('bad input'); })).rejects.toThrow('bad input');
    expect(await s.update((d) => { d.items.push({ id: 'x' }); return d.items.length; })).toBe(1);
  });
});
