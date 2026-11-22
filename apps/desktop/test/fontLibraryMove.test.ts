// Audit of baseline-sd-fonts, font-library 1.3 (sd-fonts-test-coverage design D3): moving the library to another
// drive. Across drives `rename` fails with EXDEV and the library copies instead. Here `rename` fails that way for
// font folders (names without a dot), so the copy path runs on one drive; the store's own files and the library's
// own staging folders (.incoming-*, on the library's drive) rename as usual. `failCopy` makes the copy of one font
// stop part way, the way a pulled stick or a full disk would (issue #22).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const crossDrive = vi.hoisted(() => ({ renames: 0, failCopy: null as string | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    rename: async (from: string, to: string) => {
      if (!basename(String(from)).includes('.') && !String(from).includes('.incoming-')) {
        crossDrive.renames++;
        throw Object.assign(new Error(`EXDEV: cross-device link not permitted, rename '${from}' -> '${to}'`), { code: 'EXDEV' });
      }
      return real.rename(from, to);
    },
    cp: async (from: string, to: string, opts?: Parameters<typeof real.cp>[2]) => {
      if (crossDrive.failCopy && basename(String(from)) === crossDrive.failCopy) {
        // One sound lands, then the disk is full.
        await real.mkdir(String(to), { recursive: true });
        await real.copyFile(join(String(from), 'hum.wav'), join(String(to), 'hum.wav'));
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }
      return real.cp(from, to, opts);
    },
  };
});

const { FontLibrary } = await import('../src/main/fontLibrary');

/** A minimal 16-bit mono 44.1 kHz PCM wav. */
function wav(): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0); b.writeUInt32LE(36, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(0, 40);
  return b;
}

const made: string[] = [];
const temp = async (p: string) => { const d = await mkdtemp(join(tmpdir(), p)); made.push(d); return d; };
afterEach(async () => { for (const d of made.splice(0)) await rm(d, { recursive: true, force: true }); });

describe('font-library audit: moving across drives', () => {
  it('1.3 every font and its details are in the new folder, none left behind, and the library shows the same fonts', async () => {
    const lib = new FontLibrary(await temp('hw-lib-'), async (p) => { await rm(p, { recursive: true, force: true }); });
    const src = await temp('hw-src-');
    for (const f of ['Alpha', 'Beta']) {
      await mkdir(join(src, f, 'clsh'), { recursive: true });
      await writeFile(join(src, f, 'hum.wav'), wav()); await writeFile(join(src, f, 'clsh', '001.wav'), wav());
    }
    await lib.importFrom(src);
    await lib.setMeta('Beta', { name: 'The Beta', maker: 'Someone' });
    const before = (await lib.list()).map((f) => ({ folder: f.folder, name: f.meta.name, maker: f.meta.maker }));
    const old = lib.root;

    const next = await temp('hw-lib-other-drive-');
    crossDrive.renames = 0;
    await lib.moveTo(next, true);

    expect(crossDrive.renames).toBeGreaterThanOrEqual(2); // each font took the copy path
    for (const f of ['Alpha', 'Beta']) {
      expect(existsSync(join(next, f, 'hum.wav'))).toBe(true);
      expect(existsSync(join(next, f, 'clsh', '001.wav'))).toBe(true);
      expect(existsSync(join(old, f))).toBe(false);
    }
    expect((await readdir(old)).filter((n) => !n.startsWith('hiltwright-'))).toEqual([]);
    expect((await lib.list()).map((f) => ({ folder: f.folder, name: f.meta.name, maker: f.meta.maker }))).toEqual(before);
  });
});

describe('a copy that fails part way leaves no partial font (issue #22)', () => {
  afterEach(() => { crossDrive.failCopy = null; });

  const font = async (dir: string) => {
    await mkdir(join(dir, 'clsh'), { recursive: true });
    await writeFile(join(dir, 'hum.wav'), wav()); await writeFile(join(dir, 'clsh', '001.wav'), wav());
  };
  const newLib = async () => new FontLibrary(await temp('hw-lib-'), async (p) => { await rm(p, { recursive: true, force: true }); });

  it('adding a font folder: nothing under the font name, no staging left, and the fonts before it still count', async () => {
    const lib = await newLib();
    const src = await temp('hw-src-');
    await font(join(src, 'Alpha'));
    crossDrive.failCopy = 'Alpha';
    await expect(lib.importFrom(join(src, 'Alpha'))).rejects.toThrow(/ENOSPC/);
    expect(await readdir(lib.root)).not.toContain('Alpha');
    expect((await readdir(lib.root)).filter((n) => n.startsWith('.incoming-'))).toEqual([]);
    expect(await lib.list()).toEqual([]);

    const pack = await temp('hw-src-');
    for (const f of ['Alpha', 'Beta']) await font(join(pack, f));
    crossDrive.failCopy = 'Beta';
    await expect(lib.importFrom(pack)).rejects.toThrow(/ENOSPC/);
    expect((await lib.list()).map((f) => f.folder)).toEqual(['Alpha']);
    expect(existsSync(join(lib.root, 'Beta'))).toBe(false);

    crossDrive.failCopy = null;
    await lib.importFrom(join(pack, 'Beta'));
    expect(existsSync(join(lib.root, 'Beta', 'clsh', '001.wav'))).toBe(true);
  });

  it('moving to another drive: the partial copy is removed, so a retry finds no clash and moves the whole font', async () => {
    const lib = await newLib();
    const old = lib.root;
    for (const f of ['Alpha', 'Beta', 'Gamma']) await font(join(old, f));
    const next = await temp('hw-lib-other-drive-');
    crossDrive.failCopy = 'Beta';
    await expect(lib.moveTo(next, true)).rejects.toThrow(/Moved 1 of 3 fonts .*Beta could not be moved: ENOSPC/);
    expect(lib.root).toBe(old);
    expect((await readdir(next)).filter((n) => !n.startsWith('hiltwright-'))).toEqual(['Alpha']);
    expect(existsSync(join(old, 'Beta', 'clsh', '001.wav'))).toBe(true);
    expect((await lib.planMove(next)).clashes).toEqual([]);

    crossDrive.failCopy = null;
    await lib.moveTo(next, true);
    expect(lib.root).toBe(next);
    for (const f of ['Alpha', 'Beta', 'Gamma']) expect(existsSync(join(next, f, 'clsh', '001.wav'))).toBe(true);
    expect((await readdir(next)).filter((n) => n.startsWith('.'))).toEqual([]);
  });
});
