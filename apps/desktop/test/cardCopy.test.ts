// card-safety 1.1: copies onto the card are all or nothing, with a space check, a true replace and safe names.

import { describe, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFont, listFonts, stopReading } from '../src/main/sd';

/** A minimal 16-bit PCM wav header, mono or stereo, padded to `extra` bytes of silence. */
function wav(channels = 1, extra = 0): Buffer {
  const b = Buffer.alloc(44 + extra);
  b.write('RIFF', 0); b.writeUInt32LE(36 + extra, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(44100 * 2 * channels, 28); b.writeUInt16LE(2 * channels, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(extra, 40);
  return b;
}

/** A card with `Vader` on it (and `Kylo` in its old, monophonic form when asked). */
async function card(withOldKylo = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hw-copy-card-'));
  await mkdir(join(root, 'Vader'));
  for (const n of ['hum01.wav', 'clsh01.wav']) await writeFile(join(root, 'Vader', n), wav());
  if (withOldKylo) {
    await mkdir(join(root, 'Kylo'));
    for (const n of ['hum.wav', 'clash1.wav', 'swing1.wav']) await writeFile(join(root, 'Kylo', n), wav());
  }
  return root;
}

/** A polyphonic `Kylo` (or another name) on this computer, with a subfolder of tracks. */
async function source(name = 'Kylo'): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'hw-copy-src-')), name);
  await mkdir(join(dir, 'tracks'), { recursive: true });
  for (const n of ['hum01.wav', 'clsh01.wav', 'clsh02.wav', 'swingl01.wav', 'swingh01.wav']) await writeFile(join(dir, n), wav());
  await writeFile(join(dir, 'tracks', 'theme.wav'), wav(2));
  return dir;
}

const files = async (dir: string) => (await readdir(dir, { recursive: true })).map(String).sort();

describe('copies that overlap on one card (issue #6)', () => {
  it('a second copy does not clear the first one\'s unfinished folder: both fonts land whole', async () => {
    const root = await card();
    const a = await source('Kylo');
    const b = await source('Grey');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let reachedGate!: () => void;
    const paused = new Promise<void>((r) => { reachedGate = r; });
    let n = 0;
    // Kylo stops after its first file until Grey has been copied in full.
    const slow = async (from: string, to: string) => { await copyFile(from, to); if (++n === 1) { reachedGate(); await gate; } };
    const first = copyFont(a, root, { copyOne: slow });
    await paused;
    await copyFont(b, root, {});
    release();
    await first;
    expect(await files(join(root, 'Kylo'))).toEqual(await files(a));
    expect(await files(join(root, 'Grey'))).toEqual(await files(b));
    expect((await readdir(root)).filter((x) => x.startsWith('.hiltwright'))).toEqual([]);
  });

  it('the card queue runs writes to one card in order, lets other cards go ahead, and goes on after a failure', async () => {
    const { onCard } = await import('../src/main/cardQueue');
    const order: string[] = [];
    let open!: () => void;
    const held = new Promise<void>((r) => { open = r; });
    const one = onCard('X:\\', async () => { await held; order.push('x1'); });
    const two = onCard('x:\\', async () => { order.push('x2'); throw new Error('boom'); });
    const three = onCard('X:\\', async () => { order.push('x3'); return 3; });
    await onCard('Y:\\', async () => { order.push('y'); });
    expect(order).toEqual(['y']);
    open();
    await one;
    await expect(two).rejects.toThrow('boom');
    expect(await three).toBe(3);
    expect(order).toEqual(['y', 'x1', 'x2', 'x3']);
  });
});

describe('copies onto the card are all or nothing (card-safety D5)', () => {
  it('a new font lands whole, the source unchanged, and nothing else left on the card', async () => {
    const root = await card();
    const src = await source();
    const before = await files(src);
    const entry = await copyFont(src, root, {});
    expect(entry.name).toBe('Kylo');
    expect(await files(join(root, 'Kylo'))).toEqual(before);
    expect(await files(src)).toEqual(before);
    expect((await readdir(root)).sort()).toEqual(['Kylo', 'Vader']);
  });

  it('an existing font is refused without replace, and the card is unchanged', async () => {
    const root = await card(true);
    const before = await files(root);
    await expect(copyFont(await source(), root, {})).rejects.toThrow('Kylo is already on the card');
    expect(await files(root)).toEqual(before);
  });

  it('a replace leaves only the new files, and Vader beside it untouched', async () => {
    const root = await card(true);
    const vader = await files(join(root, 'Vader'));
    const src = await source();
    await copyFont(src, root, { replace: true });
    expect(await files(join(root, 'Kylo'))).toEqual(await files(src));
    expect(await files(join(root, 'Vader'))).toEqual(vader);
    expect((await readdir(root)).sort()).toEqual(['Kylo', 'Vader']);
    const kylo = (await listFonts(root)).find((f) => f.name === 'Kylo')!;
    expect(kylo.report.issues.some((i) => i.kind === 'mixed')).toBe(false);
  });

  it('a name with ; or , is refused, with the reason', async () => {
    const root = await card();
    await expect(copyFont(await source('Kylo;old'), root, {})).rejects.toThrow(/; or , in its name/);
    await expect(copyFont(await source('Kylo,old'), root, {})).rejects.toThrow(/; or , in its name/);
    expect((await readdir(root)).sort()).toEqual(['Vader']);
  });

  it('a font that does not fit is refused with both sizes, and nothing is written', async () => {
    const root = await card();
    const big = join(await mkdtemp(join(tmpdir(), 'hw-copy-src-')), 'Big');
    await mkdir(big);
    await writeFile(join(big, 'hum01.wav'), wav(1, 3_000_000));
    await expect(copyFont(big, root, { freeBytes: 1_200_000 })).rejects.toThrow('Big needs 3 MB and the card has 1 MB free.');
    expect((await readdir(root)).sort()).toEqual(['Vader']);
  });

  it('a copy failing part way leaves no Kylo and no listed leftover, and copying again works', async () => {
    const root = await card();
    const src = await source();
    let n = 0;
    const failing = async (from: string, to: string) => { if (++n === 3) throw new Error('EIO: i/o error, write'); await copyFile(from, to); };
    await expect(copyFont(src, root, { copyOne: failing })).rejects.toThrow(/^The copy of Kylo stopped part way: the card could not be written to \(EIO\)\. Nothing was left on the card under Kylo\./);
    expect((await readdir(root)).sort()).toEqual(['Vader']);
    expect((await listFonts(root)).map((f) => f.name)).toEqual(['Vader']);
    await copyFont(src, root, {});
    expect(await files(join(root, 'Kylo'))).toEqual(await files(src));
  });

  it('a failed replace keeps the old font as it was', async () => {
    const root = await card(true);
    const old = await files(join(root, 'Kylo'));
    let n = 0;
    const failing = async (from: string, to: string) => { if (++n === 2) throw new Error('EIO'); await copyFile(from, to); };
    await expect(copyFont(await source(), root, { replace: true, copyOne: failing })).rejects.toThrow('EIO');
    expect(await files(join(root, 'Kylo'))).toEqual(old);
    expect((await readdir(root)).sort()).toEqual(['Kylo', 'Vader']);
  });

  it('leftovers of a cut-short copy and replace are cleared by the next copy, and never listed', async () => {
    const root = await card();
    // A copy cut short, and a replace cut short between its two renames (the old font moved aside, the new not in).
    await mkdir(join(root, '.hiltwright-copy-Ember'));
    await writeFile(join(root, '.hiltwright-copy-Ember', 'hum01.wav'), wav());
    await mkdir(join(root, '.hiltwright-old-Kylo'));
    await writeFile(join(root, '.hiltwright-old-Kylo', 'hum.wav'), wav());
    expect((await listFonts(root)).map((f) => f.name)).toEqual(['Vader']);
    await copyFont(await source('Grey'), root, {});
    expect((await readdir(root)).sort()).toEqual(['Grey', 'Kylo', 'Vader']);
    expect(await readFile(join(root, 'Kylo', 'hum.wav'))).toHaveLength(44);
  });

  it('giving the card back stops a reading of it, so its files are let go (4.1, 2026-11-14)', async () => {
    const root = await card(true);
    // Listen for the rejection straight away: the reading can fail while stopReading is still being awaited.
    const listing = expect(listFonts(root)).rejects.toThrow('Stopped: the card is being given back.');
    await stopReading(root);
    await listing;
    // Once stopped, a new reading works again.
    expect((await listFonts(root)).map((f) => f.name)).toEqual(['Kylo', 'Vader']);
  });

  it('progress counts every file up to the total', async () => {
    const root = await card();
    const seen: [number, number][] = [];
    await copyFont(await source(), root, { onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([1, 2, 3, 4, 5, 6].map((d) => [d, 6]));
  });
});
