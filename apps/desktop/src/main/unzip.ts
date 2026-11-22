// Just enough zip to unpack a sound font package: stored and deflated entries, read one at a time from disk so a
// 300 MB package never sits in memory whole. No encryption, no zip64 (font packages stay well under 4 GB).
//
// Every number a zip gives about itself is checked against the file's real size and a sane cap before anything is
// allocated, and an entry is inflated no further than the size it declares (#21). A crafted zip could otherwise make
// the app allocate or inflate gigabytes from a few hundred kilobytes and run out of memory.

import { open, mkdir, writeFile } from 'node:fs/promises';
import { crc32, inflateRawSync } from 'node:zlib';
import { dirname, resolve, sep } from 'node:path';

export interface ZipEntry { name: string; method: number; compressed: number; size: number; localOffset: number; flags: number; /** CRC-32 of the unpacked bytes, from the central directory. */ crc: number }

/** The most a central directory may take: 65,535 entries with long names come to a few MB. */
export const MAX_CENTRAL_DIRECTORY = 64 * 1024 * 1024;
/** The most one entry may unpack to. The largest file in a sound font is a long track of some tens of MB. */
export const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
/** The most one unpack may write in all. Fonts and font collections run to hundreds of MB, rarely a few GB. */
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;

const DAMAGED = 'The zip file is damaged';

export async function listZip(file: string): Promise<ZipEntry[]> {
  const fh = await open(file, 'r');
  try {
    const { size } = await fh.stat();
    // The end-of-central-directory record sits in the last 22 bytes plus up to 64 KB of comment.
    const tailLen = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('This zip is too large to open here (zip64). Unpack it first, then add the folder.');
    // The central directory must lie inside the file, before the end record, and be of a sane size (#21).
    if (cdSize > MAX_CENTRAL_DIRECTORY || cdOffset + cdSize > size - tailLen + eocd) throw new Error(DAMAGED);
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const out: ZipEntry[] = [];
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(DAMAGED);
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      const compressed = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      if (p + 46 + nameLen > cd.length) throw new Error(DAMAGED);
      // Bit 11: the name is UTF-8. Otherwise it is CP437, which for font packages is plain ASCII in practice.
      const raw = cd.subarray(p + 46, p + 46 + nameLen);
      const name = (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1')).replace(/\\/g, '/');
      out.push({ name, method, compressed, size: usize, localOffset, flags, crc });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally { await fh.close(); }
}

/**
 * Unpack the entries `keep` accepts into `dest`. A package with any name that would land outside `dest` (`../`,
 * absolute paths) is refused outright, whether or not `keep` wants that entry. Every unpacked file must match the
 * CRC-32 and size the package records for it. Returns the number of files written.
 *
 * Before anything is unpacked, each kept entry's declared size must be within MAX_ENTRY_BYTES and all of them within
 * MAX_TOTAL_BYTES; each entry's packed bytes must lie inside the file, and inflating stops at its declared size (#21).
 */
export async function extractZip(file: string, dest: string, keep: (name: string) => boolean = () => true, onFile?: (name: string, done: number, total: number) => void): Promise<number> {
  const all = (await listZip(file)).filter((e) => !e.name.endsWith('/'));
  const root = resolve(dest);
  for (const e of all) {
    if (!resolve(root, e.name).startsWith(root + sep)) throw new Error(`The zip holds a file outside its own folder (${e.name}); not unpacking it.`);
  }
  const entries = all.filter((e) => keep(e.name));
  let declared = 0;
  for (const e of entries) {
    if (e.size > MAX_ENTRY_BYTES) throw new Error(`${e.name} is larger than any file in a sound font should be (${Math.round(e.size / 1048576)} MB). Not unpacking this zip.`);
    declared += e.size;
  }
  if (declared > MAX_TOTAL_BYTES) throw new Error(`This zip would unpack to ${(declared / 1073741824).toFixed(1)} GB, more than Hiltwright unpacks at once. Unpack it first, then add the folders.`);
  const fh = await open(file, 'r');
  let done = 0;
  try {
    const { size: fileSize } = await fh.stat();
    for (const e of entries) {
      if (e.flags & 0x1) throw new Error('This zip is password protected. Unpack it with its password first, then add the folder.');
      if (e.method !== 0 && e.method !== 8) throw new Error(`${e.name} is packed with a method this app cannot read (${e.method}). Unpack the zip first, then add the folder.`);
      const target = resolve(root, e.name);
      if (e.localOffset + 30 > fileSize) throw new Error(DAMAGED);
      const head = Buffer.alloc(30);
      await fh.read(head, 0, 30, e.localOffset);
      if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(DAMAGED);
      const start = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
      // The packed bytes must be in the file. Stored bytes are the file itself; deflate never needs much more room
      // than the data it holds, so a much larger packed size is a damaged entry, not one to allocate for.
      if (e.compressed > fileSize - start || e.compressed > e.size + (e.size >>> 6) + 1024) throw new Error(DAMAGED);
      const body = Buffer.alloc(e.compressed);
      await fh.read(body, 0, e.compressed, start);
      const mismatch = `This package is damaged (${e.name} does not match its checksum). Download it again.`;
      let data: Buffer;
      if (e.method === 0) data = body;
      else {
        // Inflated no further than the size the entry declares: a small entry that would inflate to gigabytes stops at
        // once (#21). zlib needs room for at least one byte.
        try { data = inflateRawSync(body, { maxOutputLength: Math.max(1, e.size) }); } catch { throw new Error(mismatch); }
      }
      if (data.length !== e.size || crc32(data) !== e.crc) throw new Error(mismatch);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
      done++;
      onFile?.(e.name, done, entries.length);
    }
  } finally { await fh.close(); }
  return done;
}
