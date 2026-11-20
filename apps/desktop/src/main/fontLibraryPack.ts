// The .hwfonts file: a whole font library in one compressed, encrypted file, to carry to another computer.
//
//   "HWFL" | u8 version (1: app key, 2: passphrase) | 16-byte salt | records...
//   record: u32 length | 12-byte nonce | 16-byte tag | ciphertext (deflated bytes, AES-256-GCM)
//
// The first record is the list (JSON): every font, what the owner said about it, and its files in order. Then one
// record per file, in that order. Each record is sealed with its place in the file, so records cannot be swapped,
// dropped or cut off unnoticed. Files are packed and unpacked one at a time, so a library of several gigabytes never
// sits in memory, and no zip limit applies.
//
// With a passphrase, the key comes from the passphrase and the file's salt, and nothing opens the file without it.
// Without one, the key comes from the key the app carries (hwpack.ts) and the salt. As with packs, that keeps the
// sounds from being lifted out of the file with ordinary tools; it does not stop someone who reads this code.

import { open, rename, rm, type FileHandle } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { appKeyFor } from './hwpack';
import type { FontMeta } from './fontLibrary';

/** The version byte also says how the file is locked: 1 with the key the app carries, 2 with the owner's passphrase. */
const WITH_APP_KEY = 1;
const WITH_PASSPHRASE = 2;
export const LIBRARY_PACK_EXT = 'hwfonts';
const MAGIC = Buffer.from('HWFL');
const HEAD = MAGIC.length + 1 + 16;
/** The most one record may claim to hold: a file of the library, or the list. Guards against a damaged length. */
const MAX_RECORD = 0xfffffff0;

export interface PackedFont { folder: string; meta: FontMeta; files: { path: string; bytes: number }[] }
export interface LibraryPackList { kind: 'hiltwright-font-library'; version: 1; made: string; fonts: PackedFont[] }

export const NOT_A_PACK = 'That file is not a Hiltwright font library export.';
const DAMAGED = 'That font library export is damaged or was cut short. Export it again and copy the file over once more.';

export const NEEDS_PASSPHRASE = 'This font library export is locked with a passphrase.';
export const WRONG_PASSPHRASE = 'That passphrase does not open this file. Check it and try again.';

/**
 * The key for a file. With a passphrase it comes from the passphrase alone (scrypt, made slow on purpose so guessing
 * is slow too): without it the file cannot be opened, by Hiltwright or anyone. Typed the same on any keyboard (NFKC).
 */
function keyFor(version: number, salt: Uint8Array, passphrase?: string): Buffer {
  if (version === WITH_APP_KEY) return appKeyFor(salt, 'hwfonts-record');
  return scryptSync(Buffer.from((passphrase ?? '').normalize('NFKC'), 'utf8'), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

/** Whether a file is a library export locked with a passphrase. Throws when it is not a library export at all. */
export async function libraryPackNeedsPassphrase(file: string): Promise<boolean> {
  let fh: FileHandle;
  try { fh = await open(file, 'r'); } catch { throw new Error('That file could not be opened.'); }
  try {
    const head = Buffer.alloc(HEAD);
    const { bytesRead } = await fh.read(head, 0, HEAD, 0);
    if (bytesRead !== HEAD || !head.subarray(0, 4).equals(MAGIC)) throw new Error(NOT_A_PACK);
    return head[4] === WITH_PASSPHRASE;
  } finally { await fh.close(); }
}

const place = (index: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(index, 0); return b; };

function seal(key: Buffer, index: number, data: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(place(index));
  const body = Buffer.concat([cipher.update(deflateSync(data, { level: 6 })), cipher.final()]);
  const head = Buffer.alloc(4);
  head.writeUInt32LE(12 + 16 + body.length, 0);
  return Buffer.concat([head, nonce, cipher.getAuthTag(), body]);
}

/**
 * Write a library export to `file`, through a temp file renamed into place, so a failed export never leaves half a
 * file. `read(font, path)` gives one file's bytes; it is asked for each file in the list's order.
 */
export async function writeLibraryPack(file: string, fonts: PackedFont[], read: (font: PackedFont, path: string) => Promise<Buffer>, opts: { passphrase?: string; onFont?: (font: PackedFont, done: number, total: number) => void; now?: Date } = {}): Promise<{ fonts: number; files: number; bytes: number }> {
  const { onFont, now = new Date() } = opts;
  const salt = randomBytes(16);
  const version = opts.passphrase ? WITH_PASSPHRASE : WITH_APP_KEY;
  const key = keyFor(version, salt, opts.passphrase);
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  const fh = await open(tmp, 'w');
  let files = 0; let bytes = 0;
  try {
    await fh.write(Buffer.concat([MAGIC, Buffer.from([version]), salt]));
    const list: LibraryPackList = { kind: 'hiltwright-font-library', version: 1, made: now.toISOString(), fonts };
    let index = 0;
    await fh.write(seal(key, index++, Buffer.from(JSON.stringify(list), 'utf8')));
    for (const [i, font] of fonts.entries()) {
      onFont?.(font, i + 1, fonts.length);
      for (const f of font.files) {
        const data = await read(font, f.path);
        if (data.length !== f.bytes) throw new Error(`${font.folder}/${f.path} changed while it was being exported. Try again.`);
        await fh.write(seal(key, index++, data));
        files++; bytes += data.length;
      }
    }
    await fh.sync();
  } catch (err) {
    await fh.close().catch(() => undefined); await rm(tmp, { force: true }); throw err;
  }
  await fh.close();
  try { await rename(tmp, file); } catch (err) { await rm(tmp, { force: true }); throw err; }
  return { fonts: fonts.length, files, bytes };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The list as far as it can be trusted: anything not shaped right means the file is not an export. */
function cleanList(raw: unknown): LibraryPackList | null {
  if (!isObj(raw) || raw.kind !== 'hiltwright-font-library' || !Array.isArray(raw.fonts)) return null;
  const fonts: PackedFont[] = [];
  for (const f of raw.fonts) {
    if (!isObj(f) || typeof f.folder !== 'string' || !isObj(f.meta) || typeof f.meta.name !== 'string' || !Array.isArray(f.files)) return null;
    const files: PackedFont['files'] = [];
    for (const x of f.files) {
      if (!isObj(x) || typeof x.path !== 'string' || typeof x.bytes !== 'number') return null;
      files.push({ path: x.path, bytes: x.bytes });
    }
    const m = f.meta as Partial<FontMeta>;
    const text = (v: unknown) => (typeof v === 'string' ? v : '');
    const meta: FontMeta = { name: text(m.name), maker: text(m.maker), notes: text(m.notes), added: text(m.added) };
    if (typeof m.from === 'string') meta.from = m.from;
    if (typeof m.bundle === 'string' && m.bundle) meta.bundle = m.bundle;
    fonts.push({ folder: f.folder, meta, files });
  }
  return { kind: 'hiltwright-font-library', version: 1, made: typeof raw.made === 'string' ? raw.made : '', fonts };
}

export interface LibraryPackReader {
  list: LibraryPackList;
  /** The next file's bytes, in the list's order. */
  next(): Promise<Buffer>;
  close(): Promise<void>;
}

/** Open a library export for reading. Throws a plain message when the file is something else, or damaged. */
export async function openLibraryPack(file: string, passphrase?: string): Promise<LibraryPackReader> {
  let fh: FileHandle;
  try { fh = await open(file, 'r'); } catch { throw new Error('That file could not be opened.'); }
  let pos = 0;
  const take = async (n: number): Promise<Buffer | null> => {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, pos);
    pos += bytesRead;
    return bytesRead === n ? buf : null;
  };
  try {
    const head = await take(HEAD);
    if (!head || !head.subarray(0, 4).equals(MAGIC)) throw new Error(NOT_A_PACK);
    const version = head[4];
    if (version !== WITH_APP_KEY && version !== WITH_PASSPHRASE) throw new Error('That font library export was made by a newer Hiltwright. Update this one, then import it.');
    const locked = version === WITH_PASSPHRASE;
    if (locked && !passphrase) throw new Error(NEEDS_PASSPHRASE);
    const key = keyFor(version, head.subarray(5), passphrase);
    let index = 0;
    const next = async (): Promise<Buffer> => {
      const len = (await take(4))?.readUInt32LE(0);
      if (len == null || len < 28 || len > MAX_RECORD) throw new Error(DAMAGED);
      const rec = await take(len);
      if (!rec) throw new Error(DAMAGED);
      try {
        const d = createDecipheriv('aes-256-gcm', key, rec.subarray(0, 12));
        d.setAAD(place(index++));
        d.setAuthTag(rec.subarray(12, 28));
        return inflateSync(Buffer.concat([d.update(rec.subarray(28)), d.final()]));
      } catch { unsealed = false; throw new Error(DAMAGED); }
    };
    let unsealed = true;
    let list: LibraryPackList | null = null;
    try { list = cleanList(JSON.parse((await next()).toString('utf8'))); } catch (err) {
      // The first record of a locked file was all there but would not open: the passphrase, not the file.
      if (locked && !unsealed) throw new Error(WRONG_PASSPHRASE);
      if (err instanceof Error && err.message === DAMAGED) throw err;
    }
    if (!list) throw new Error(NOT_A_PACK);
    return { list, next, close: () => fh.close() };
  } catch (err) {
    await fh.close().catch(() => undefined);
    throw err;
  }
}
