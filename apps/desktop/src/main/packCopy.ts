// Putting a font pack's folder onto a card. The pack is unpacked into a temporary folder and landed with copyFont,
// so it gets the same all-or-nothing copy, space check and replace as a font from the library.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { readItem, type PackManifest } from './hwpack';
import { copyFont, type CopyOptions, type FontEntry } from './sd';

/** No font comes near this: the six free fonts are 10 to 30 MB. It stops a crafted pack from filling the disk. */
export const MAX_UNPACKED_BYTES = 300 * 1024 * 1024;
export const MAX_UNPACKED_FILES = 1000;

const FOLDER_NAME = /^[^\\/:*?"<>|]+$/;

/** A pack entry's path, checked before anything is written: relative, forward slashes, no `.` or `..`, nothing a file system reads as a drive or stream. */
export function checkEntryName(name: string): string {
  const parts = name.split('/');
  const bad = !name || name.includes('\\') || name.includes(':') || name.includes('\0') || isAbsolute(name) || name.startsWith('/')
    || parts.some((p) => !p || p === '.' || p === '..' || /[<>"|?*]/.test(p) || /[. ]$/.test(p));
  if (bad) throw new Error(`The pack has a file name that is not safe to copy (${JSON.stringify(name)}). Nothing was copied.`);
  return name;
}

/** Everything in the pack that belongs in the font folder: all items but meshes. */
function fontItems(manifest: PackManifest) {
  return manifest.items.filter((i) => i.kind !== 'mesh');
}

/**
 * Write the pack's font folder to `dest/<font name>` and return that folder. Every name and size is checked first;
 * the decrypted bytes are held to the declared sizes as they come out.
 */
export async function unpackFont(file: Buffer, manifest: PackManifest, itemsStart: number, dest: string): Promise<string> {
  if (manifest.kind !== 'font') throw new Error('That pack is not a sound font');
  if (!FOLDER_NAME.test(manifest.name) || manifest.name === '.' || manifest.name === '..') throw new Error('The pack\'s font name is not valid on an SD card');
  const items = fontItems(manifest);
  if (!items.length) throw new Error('That pack has no files to copy');
  if (items.length > MAX_UNPACKED_FILES) throw new Error('That pack has too many files to copy');
  const seen = new Set<string>();
  let declared = 0;
  for (const it of items) {
    checkEntryName(it.name);
    const key = it.name.toLowerCase();
    if (seen.has(key)) throw new Error(`The pack lists ${it.name} twice. Nothing was copied.`);
    seen.add(key);
    if (!Number.isFinite(it.bytes) || it.bytes < 0) throw new Error('The pack has a file of unknown size. Nothing was copied.');
    declared += it.bytes;
  }
  if (declared > MAX_UNPACKED_BYTES) throw new Error('That pack is bigger than a sound font should be. Nothing was copied.');
  const folder = join(dest, manifest.name);
  await mkdir(folder, { recursive: true });
  const base = resolve(folder) + sep;
  let actual = 0;
  for (const it of items) {
    const to = resolve(folder, ...it.name.split('/'));
    if (!to.startsWith(base)) throw new Error(`The pack has a file name that is not safe to copy (${JSON.stringify(it.name)}). Nothing was copied.`);
    // readItem inflates no further than the declared size (#21); a pack that is damaged says so in plain words.
    let data: Buffer;
    try { data = readItem(file, manifest, itemsStart, it); } catch { throw new Error('The pack is damaged. Nothing was copied.'); }
    actual += data.length;
    if (data.length !== it.bytes || actual > MAX_UNPACKED_BYTES) throw new Error('The pack is damaged. Nothing was copied.');
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, data);
  }
  return folder;
}

/**
 * Copy a font pack's folder to the card at `root`. Refused unless the creator allowed copying. The temporary folder
 * is removed whether the copy works or not.
 */
export async function copyPackFontToCard(file: Buffer, manifest: PackManifest, itemsStart: number, root: string, options: CopyOptions = {}, tempRoot = tmpdir()): Promise<FontEntry> {
  if (!manifest.allow.copyToCard) throw new Error(`The creator of ${manifest.name} has not allowed it to be copied to a card`);
  const tmp = await mkdtemp(join(tempRoot, 'hw-packfont-'));
  try {
    const folder = await unpackFont(file, manifest, itemsStart, tmp);
    return await copyFont(folder, root, options);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
