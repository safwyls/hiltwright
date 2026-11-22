// #21: a crafted zip, pack or library export cannot make the app allocate or inflate far more than it declares. Each
// reader checks the sizes a file gives about itself against the file and sane caps, and inflates no further than the
// declared size. zlib is wrapped here only to see the limit each reader asks for.

import { describe, expect, it, vi } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

const limits = vi.hoisted(() => [] as (number | undefined)[]);
vi.mock('node:zlib', async (importOriginal) => {
  const z = await importOriginal<typeof import('node:zlib')>();
  return {
    ...z,
    inflateRawSync: (b: Buffer, o?: { maxOutputLength?: number }) => { limits.push(o?.maxOutputLength); return z.inflateRawSync(b, o); },
    inflateSync: (b: Buffer, o?: { maxOutputLength?: number }) => { limits.push(o?.maxOutputLength); return z.inflateSync(b, o); },
  };
});

import { MAX_ENTRY_BYTES, extractZip, listZip } from '../src/main/unzip';
import { MAX_ITEM_BYTES, appKeyFor, readItem, readManifest, writePack } from '../src/main/hwpack';
import { openLibraryPack } from '../src/main/fontLibraryPack';

const MiB = 1024 * 1024;
const tmp = (p: string) => mkdtemp(join(tmpdir(), `hw-${p}-`));

interface Craft { name: string; data: Buffer; method?: 0 | 8; size?: number; compressed?: number; crc?: number }
/** A zip whose recorded sizes and CRC can be set apart from what each entry really holds. */
function zip(entries: Craft[], cd: { size?: number; offset?: number } = {}): Buffer {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const n = Buffer.from(e.name, 'utf8');
    const body = method === 8 ? deflateRawSync(e.data) : e.data;
    const size = e.size ?? e.data.length; const compressed = e.compressed ?? body.length; const sum = e.crc ?? crc32(e.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(sum, 14); lh.writeUInt32LE(compressed, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(sum, 16); ch.writeUInt32LE(compressed, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, body); central.push(ch, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.size ?? dir.length, 12); end.writeUInt32LE(cd.offset ?? offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

async function zipFile(buf: Buffer): Promise<string> {
  const f = join(await tmp('zip'), 'x.zip');
  await writeFile(f, buf);
  return f;
}

describe('zip limits (#21)', () => {
  it('a deflated entry that declares 1 byte but inflates to megabytes is refused without inflating it', async () => {
    // As in the issue's repro: about 64 KB of deflate that inflates to 64 MiB.
    const bomb = Buffer.alloc(64 * MiB);
    const f = await zipFile(zip([{ name: 'Font/hum.wav', data: bomb, size: 1, crc: crc32(bomb.subarray(0, 1)) }]));
    expect((await stat(f)).size).toBeLessThan(1 * MiB);
    const dest = await tmp('out');
    limits.length = 0;
    // A packed size far beyond what 1 byte needs is damage on its face: nothing is read or inflated.
    await expect(extractZip(f, dest)).rejects.toThrow('The zip file is damaged');
    expect(limits).toEqual([]);
    expect(await readdir(dest)).toEqual([]);
  });

  it('a deflated entry that inflates to more than it declares stops at its declared size', async () => {
    const bomb = Buffer.alloc(64 * MiB);
    const declared = 100_000; // more than the ~64 KB packed, far less than the 64 MiB it would inflate to
    const f = await zipFile(zip([{ name: 'Font/hum.wav', data: bomb, size: declared, crc: crc32(bomb.subarray(0, declared)) }]));
    const dest = await tmp('out');
    limits.length = 0;
    await expect(extractZip(f, dest)).rejects.toThrow('This package is damaged (Font/hum.wav does not match its checksum). Download it again.');
    expect(limits).toEqual([declared]);
    expect(await readdir(dest)).toEqual([]);
  });

  it('an entry is inflated no further than the size it declares, and a good zip still unpacks', async () => {
    const hum = Buffer.alloc(300_000, 3);
    const f = await zipFile(zip([{ name: 'Font/hum.wav', data: hum }, { name: 'Font/config.ini', data: Buffer.from('humStart=100\n'), method: 0 }, { name: 'Font/empty.txt', data: Buffer.alloc(0) }]));
    const dest = await tmp('out');
    limits.length = 0;
    expect(await extractZip(f, dest)).toBe(3);
    expect(limits).toEqual([300_000, 1]); // the stored entry is not inflated; the empty one gets zlib's least room
    expect(existsSync(join(dest, 'Font', 'hum.wav'))).toBe(true);
  });

  it('a central directory claiming more than the file holds is refused before room is made for it', async () => {
    const good = zip([{ name: 'a.txt', data: Buffer.from('hello') }]);
    await expect(listZip(await zipFile(zip([{ name: 'a.txt', data: Buffer.from('hello') }], { size: 0x7fffffff })))).rejects.toThrow('The zip file is damaged');
    await expect(listZip(await zipFile(zip([{ name: 'a.txt', data: Buffer.from('hello') }], { offset: good.length })))).rejects.toThrow('The zip file is damaged');
    expect(await listZip(await zipFile(good))).toHaveLength(1);
  });

  it("an entry's packed size beyond the end of the file, or far beyond its declared size, is refused", async () => {
    const dest = await tmp('out');
    await expect(extractZip(await zipFile(zip([{ name: 'a.wav', data: Buffer.from('abc'), method: 0, compressed: 0x7fffffff, size: 0x7fffffff }])), dest, () => true)).rejects.toThrow(/larger than any file in a sound font/);
    await expect(extractZip(await zipFile(zip([{ name: 'a.wav', data: Buffer.from('abcdef'), method: 0, compressed: 400 * MiB, size: 400 * MiB }])), dest)).rejects.toThrow('The zip file is damaged');
    await expect(extractZip(await zipFile(zip([{ name: 'a.wav', data: Buffer.alloc(4000, 1), compressed: 300 * MiB }])), dest)).rejects.toThrow('The zip file is damaged');
    // Inside the file, but far more packed bytes than an entry of 1 byte could ever need.
    await expect(extractZip(await zipFile(zip([{ name: 'a.wav', data: randomBytes(4000), method: 0, size: 1 }])), dest)).rejects.toThrow('The zip file is damaged');
    expect(await readdir(dest)).toEqual([]);
  });

  it('declared sizes over the per-file or the total cap are refused before anything is unpacked', async () => {
    const dest = await tmp('out');
    await expect(extractZip(await zipFile(zip([{ name: 'big.wav', data: Buffer.from('x'), size: MAX_ENTRY_BYTES + 1 }])), dest)).rejects.toThrow(/big\.wav is larger than any file in a sound font should be/);
    const many = Array.from({ length: 17 }, (_, i) => ({ name: `f${i}.wav`, data: Buffer.from('x'), size: MAX_ENTRY_BYTES }));
    limits.length = 0;
    await expect(extractZip(await zipFile(zip(many)), dest)).rejects.toThrow(/would unpack to 8\.5 GB, more than Hiltwright unpacks at once/);
    expect(limits).toEqual([]);
    // Only the entries asked for count.
    await expect(extractZip(await zipFile(zip(many)), dest, (n) => n === 'f0.wav')).rejects.toThrow(/does not match its checksum/);
    expect(await readdir(dest)).toEqual([]);
  });
});

describe('pack limits (#21)', () => {
  const pack = (data: Buffer) => {
    const buf = writePack({ id: 'bomb', kind: 'font', name: 'Bomb', creator: 'x', licence: 'CC0', allow: { copyToCard: true, demoPlayback: true } }, [{ name: 'hum.wav', kind: 'wav', data }]);
    return { buf, ...readManifest(buf) };
  };

  it('an item that declares fewer bytes than it inflates to is refused, inflated no further than declared', () => {
    const { buf, manifest, itemsStart } = pack(Buffer.alloc(32 * MiB));
    expect(buf.length).toBeLessThan(1 * MiB);
    limits.length = 0;
    expect(() => readItem(buf, manifest, itemsStart, { ...manifest.items[0], bytes: 1 })).toThrow('The pack is damaged.');
    expect(limits).toEqual([1]);
    limits.length = 0;
    expect(readItem(buf, manifest, itemsStart, manifest.items[0]).length).toBe(32 * MiB);
    expect(limits).toEqual([32 * MiB]);
  });

  it('an item larger than any pack item should be, or outside the file, is refused before it is read', () => {
    const { buf, manifest, itemsStart } = pack(Buffer.from('RIFF'));
    limits.length = 0;
    expect(() => readItem(buf, manifest, itemsStart, { ...manifest.items[0], bytes: MAX_ITEM_BYTES + 1 })).toThrow('The pack is damaged.');
    expect(() => readItem(buf, manifest, itemsStart, { ...manifest.items[0], offset: buf.length })).toThrow('The pack is damaged.');
    const short = Buffer.from(buf); short.writeUInt32LE(0x7fffffff, itemsStart);
    expect(() => readItem(short, manifest, itemsStart, manifest.items[0])).toThrow('The pack is damaged.');
    expect(limits).toEqual([]);
  });
});

describe('font library export limits (#21)', () => {
  /** A library export made by hand, so its list can declare sizes its records do not hold. */
  async function exportFile(bytes: number, data: Buffer, cut?: (b: Buffer) => Buffer): Promise<string> {
    const salt = randomBytes(16);
    const key = appKeyFor(salt, 'hwfonts-record');
    const seal = (index: number, plain: Buffer) => {
      const nonce = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, nonce);
      const aad = Buffer.alloc(4); aad.writeUInt32LE(index, 0); c.setAAD(aad);
      const body = Buffer.concat([c.update(deflateSync(plain)), c.final()]);
      const head = Buffer.alloc(4); head.writeUInt32LE(28 + body.length, 0);
      return Buffer.concat([head, nonce, c.getAuthTag(), body]);
    };
    const list = { kind: 'hiltwright-font-library', version: 1, made: '', fonts: [{ folder: 'A', meta: { name: 'A', maker: '', notes: '', added: '' }, files: [{ path: 'hum.wav', bytes }] }] };
    let file: Buffer = Buffer.concat([Buffer.from('HWFL'), Buffer.from([1]), salt, seal(0, Buffer.from(JSON.stringify(list))), seal(1, data)]);
    if (cut) file = cut(file);
    const f = join(await tmp('lib'), 'x.hwfonts');
    await writeFile(f, file);
    return f;
  }

  it('a file record that inflates to more than the list declares is refused, inflated no further than declared', async () => {
    const pack = await openLibraryPack(await exportFile(1, Buffer.alloc(32 * MiB)));
    limits.length = 0;
    await expect(pack.next()).rejects.toThrow(/damaged or was cut short/);
    expect(limits).toEqual([1]);
    await pack.close();
    const good = await openLibraryPack(await exportFile(5, Buffer.from('hello')));
    expect((await good.next()).toString()).toBe('hello');
    await good.close();
  });

  it('a record whose length runs past the end of the file is refused before room is made for it', async () => {
    const f = await exportFile(5, Buffer.from('hello'), (b) => { const c = Buffer.from(b); c.writeUInt32LE(400 * MiB, c.length - (28 + deflateSync(Buffer.from('hello')).length + 4)); return c; });
    const pack = await openLibraryPack(f);
    limits.length = 0;
    await expect(pack.next()).rejects.toThrow(/damaged or was cut short/);
    expect(limits).toEqual([]);
    await pack.close();
  });
});
