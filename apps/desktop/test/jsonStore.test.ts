import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, readFile, rename } from 'node:fs/promises';
import { JsonStore, resetStoreProblems, storeProblems, type StoreFs } from '../src/main/jsonStore';

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
const store = (fs?: Partial<StoreFs>) => new JsonStore<Doc>(file, { name: 'test list', empty: () => ({ version: 1, items: [] }), clean, now: () => at, fs, busyWaits: [1, 1, 1, 1, 1] });
/** An error like the one Windows gives for a file another program has open. */
const busy = (code = 'EBUSY') => Object.assign(new Error(`${code}: resource busy or locked`), { code });
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
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    await expect(s.update((d) => { d.items.push({ id: 'half' }); throw new Error('stopped'); })).rejects.toThrow('stopped');
    expect((await s.read()).items).toEqual([{ id: 'kept' }]);
  });

  it('returns what the update returns, and one failed update does not stop the next', async () => {
    const s = store();
    await expect(s.update(() => { throw new Error('bad input'); })).rejects.toThrow('bad input');
    expect(await s.update((d) => { d.items.push({ id: 'x' }); return d.items.length; })).toBe(1);
  });
});

describe('a file another program holds open (issue #11)', () => {
  const good = JSON.stringify({ version: 1, items: [{ id: 'a' }] });

  it('reads the file once the other program lets go, and reports nothing', async () => {
    writeFileSync(file, good);
    let tries = 0;
    const s = store({ readFile: (p, e) => (p === file && ++tries <= 3 ? Promise.reject(busy()) : readFile(p, e)) });
    expect((await s.read()).items).toEqual([{ id: 'a' }]);
    expect(tries).toBe(4);
    expect(storeProblems()).toEqual([]);
  });

  it('a file that stays busy is not damage: "try again", nothing set aside or reported, and saving still works later', async () => {
    writeFileSync(join(dir, 'things.bak.json'), JSON.stringify({ version: 1, items: [] }));
    writeFileSync(file, good);
    let locked = true;
    const s = store({ readFile: (p, e) => (p === file && locked ? Promise.reject(busy('EPERM')) : readFile(p, e)) });
    await expect(s.read()).rejects.toThrow('Could not read the test list: another program is using its file. Try again in a moment.');
    expect(readdirSync(dir).sort()).toEqual(['things.bak.json', 'things.json']);
    expect(readFileSync(file, 'utf8')).toBe(good);
    expect(storeProblems()).toEqual([]);
    // The other program lets go: the next read goes back to the disk, and the store saves as normal.
    locked = false;
    await s.update((d) => { d.items.push({ id: 'b' }); });
    expect(onDisk().items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('waits out a busy rename and lands the write', async () => {
    let tries = 0;
    const s = store({ rename: (from, to) => (to === file && ++tries <= 2 ? Promise.reject(busy('EACCES')) : rename(from, to)) });
    await s.update((d) => { d.items.push({ id: 'one' }); });
    expect(onDisk().items).toEqual([{ id: 'one' }]);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a rename that stays busy undoes the change and leaves no temporary file behind', async () => {
    writeFileSync(file, good);
    const s = store({ rename: () => Promise.reject(busy('EPERM')) });
    await expect(s.update((d) => { d.items.push({ id: 'lost' }); })).rejects.toThrow('EPERM');
    expect((await s.read()).items).toEqual([{ id: 'a' }]);
    expect(readFileSync(file, 'utf8')).toBe(good);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(storeProblems()).toEqual([]);
  });

  it('flushes each write to the disk before it replaces the main file', async () => {
    const steps: string[] = [];
    const s = store({
      open: async (p, flags) => {
        const fh = await open(p, flags);
        return {
          writeFile: async (data, enc) => { steps.push('write'); await fh.writeFile(data, enc); },
          sync: async () => { steps.push('sync'); await fh.sync(); },
          close: async () => { steps.push('close'); await fh.close(); },
        };
      },
      rename: async (from, to) => { steps.push('rename'); await rename(from, to); },
    });
    await s.update((d) => { d.items.push({ id: 'one' }); });
    expect(steps).toEqual(['write', 'sync', 'close', 'rename']);
    expect(onDisk().items).toEqual([{ id: 'one' }]);
  });
});
