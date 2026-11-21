// Putting a Fett263 voice pack in the card's common folder: one of the packs Hiltwright offers
// (voicePackCatalogue.ts), or a zip the owner chose.
//
// common holds more than the voice pack (shared sounds the owner put there), so it is never cleared. Each top-level
// entry the pack has (a file, or a folder such as mnum) replaces the card's entry of that name whole, so an old pack's
// numbered sounds never mix with the new ones. The pack is copied to a hidden folder on the card first, then moved into
// common with voicepack.ini last: a copy cut short leaves the card reading as its old version, and the next run puts
// back what was moved aside. Whatever is replaced is copied to this computer before anything on the card changes.

import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { FETT263_REQUIRED_VOICE_PACK, hasMenuSounds, parseVoicePackIni, voicePackFolder, type VoicePackStatus } from '@hiltwright/core';
import { extractZip, listZip } from './unzip';
import { checkEntryName } from './packCopy';
import { cardFree, exists, filesUnder, isDir, readVoicePack } from './sd';
import type { VoicePackInfo } from '../shared/api';

/** Voice packs are 15 to 20 MB in a couple of hundred files; this stops a crafted zip from filling the disk. */
export const MAX_VOICE_PACK_BYTES = 150 * 1024 * 1024;
export const MAX_VOICE_PACK_FILES = 2000;

const NEW = '.hiltwright-voice-new';
const OLD = '.hiltwright-voice-old';

const outsidePack = (n: string) => n.endsWith('/') || n.split('/').includes('__MACOSX');

/** What a voice pack zip holds, checked before anything is written anywhere but a temporary folder. */
export async function inspectVoicePack(file: string, tempRoot = tmpdir()): Promise<VoicePackInfo & { prefix: string }> {
  const entries = await listZip(file);
  const prefix = voicePackFolder(entries.map((e) => e.name));
  if (prefix == null) throw new Error('That zip has no voice pack in it: no voicepack.ini and no menu number sounds (mnum).');
  const mine = entries.filter((e) => !outsidePack(e.name) && e.name.startsWith(prefix));
  if (mine.length > MAX_VOICE_PACK_FILES) throw new Error('That zip has too many files for a voice pack. Nothing was copied.');
  let bytes = 0;
  for (const e of mine) { checkEntryName(e.name.slice(prefix.length)); bytes += e.size; }
  if (bytes > MAX_VOICE_PACK_BYTES) throw new Error('That zip is far bigger than a voice pack should be. Nothing was copied.');
  if (!hasMenuSounds(mine.map((e) => e.name.slice(prefix.length).split('/')[0]))) throw new Error('That voice pack has no menu number sounds (mnum), so the saber could not speak numbers from it. Nothing was copied.');
  // voicepack.ini and a licence or readme are small: unpack just those to read them.
  const ini = mine.find((e) => e.name.slice(prefix.length).toLowerCase() === 'voicepack.ini');
  const notes = entries.filter((e) => !outsidePack(e.name) && /(^|\/)[^/]*(licen[cs]e|readme)[^/]*\.txt$/i.test(e.name) && e.size < 64 * 1024)
    .sort((a, b) => Number(/licen/i.test(b.name)) - Number(/licen/i.test(a.name)) || a.name.split('/').length - b.name.split('/').length);
  const tmp = await mkdtemp(join(tempRoot, 'hw-voiceinfo-'));
  try {
    const want = new Set([ini?.name, notes[0]?.name].filter((n): n is string => !!n));
    await extractZip(file, tmp, (n) => want.has(n));
    const version = ini ? parseVoicePackIni(await readFile(join(tmp, ...ini.name.split('/')), 'utf8')).version ?? 1 : 1;
    const credit = notes[0] ? (await readFile(join(tmp, ...notes[0].name.split('/')), 'utf8')).split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null : null;
    return { file, name: basename(file).replace(/\.zip$/i, '').replace(/_/g, ' '), version, files: mine.length, bytes, credit: credit ? credit.slice(0, 200) : null, prefix };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * What an earlier install left behind: anything moved aside whose replacement never landed is put back, then the
 * hidden folders are removed. With voicepack.ini moved last, a card cut short mid-swap still reads as its old version.
 */
export async function clearVoiceLeftovers(root: string): Promise<void> {
  const old = join(root, OLD);
  const common = join(root, 'common');
  if (await isDir(old)) {
    await mkdir(common, { recursive: true });
    for (const n of await readdir(old)) if (!(await exists(join(common, n)))) await rename(join(old, n), join(common, n));
    await rm(old, { recursive: true, force: true });
  }
  await rm(join(root, NEW), { recursive: true, force: true });
}

export interface VoicePackInstallOptions {
  /** Where on this computer the entries it replaces are copied first. Made only when something is replaced. */
  backupDir: string;
  onProgress?: (done: number, total: number) => void;
  /** The card's free space, for tests. Read from the card when not given. */
  freeBytes?: number | null;
  tempRoot?: string;
  /** How one entry is moved into common, for tests that make the swap fail part way. */
  moveIn?: (from: string, to: string) => Promise<void>;
}

export interface VoicePackInstallResult { status: VoicePackStatus; backup: string | null; replaced: number }

const plainCode = (err: unknown) => (err as { code?: string }).code ?? (err instanceof Error ? err.message.split(':')[0] : String(err));

/** Put the voice pack in `file` into common on the card at `root`. Refused below the version Fett263 needs. */
export async function installVoicePack(file: string, root: string, o: VoicePackInstallOptions): Promise<VoicePackInstallResult> {
  const pack = await inspectVoicePack(file, o.tempRoot);
  const need = FETT263_REQUIRED_VOICE_PACK;
  if (pack.version < need) throw new Error(`${pack.name} is voice pack version ${pack.version}, and the Fett263 controls need version ${need}. Nothing was copied.`);
  await clearVoiceLeftovers(root);
  // The old entries go only once the new ones are in, so the whole pack must fit beside them.
  const free = o.freeBytes !== undefined ? o.freeBytes : await cardFree(root);
  if (free != null && pack.bytes + Math.max(1e6, pack.bytes * 0.02) > free) throw new Error(`The voice pack needs ${Math.ceil(pack.bytes / 1e6)} MB and the card has ${Math.floor(free / 1e6)} MB free.`);

  // 1. Onto the card, beside common.
  const staged = join(root, NEW);
  const tmp = await mkdtemp(join(o.tempRoot ?? tmpdir(), 'hw-voice-'));
  try {
    await extractZip(file, tmp, (n) => !outsidePack(n) && n.startsWith(pack.prefix));
    const src = join(tmp, ...pack.prefix.split('/').filter(Boolean));
    const files = await filesUnder(src);
    try {
      await mkdir(staged, { recursive: true });
      let done = 0;
      for (const f of files) {
        const to = join(staged, f.rel);
        await mkdir(dirname(to), { recursive: true });
        await copyFile(join(src, f.rel), to);
        o.onProgress?.(++done, files.length);
      }
    } catch (err) {
      await rm(staged, { recursive: true, force: true }).catch(() => undefined);
      console.log(`[voice] copy to ${root} stopped: ${String(err)}`);
      throw new Error(`The voice pack copy stopped part way: the card could not be written to (${plainCode(err)}). The card's common folder was not changed. Check the card is in, then try again.`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }

  // 2. What it replaces, copied to this computer.
  const common = join(root, 'common');
  await mkdir(common, { recursive: true });
  const isIni = (n: string) => n.toLowerCase() === 'voicepack.ini';
  const top = (await readdir(staged)).sort((a, b) => Number(isIni(a)) - Number(isIni(b)));
  // FAT is case-blind: the card's MNUM is the pack's mnum.
  const existing = new Map((await readdir(common)).map((n) => [n.toLowerCase(), n]));
  const replacing = top.map((n) => existing.get(n.toLowerCase())).filter((n): n is string => !!n);
  let backup: string | null = null;
  if (replacing.length) {
    try {
      await mkdir(o.backupDir, { recursive: true });
      for (const n of replacing) await cp(join(common, n), join(o.backupDir, n), { recursive: true });
      backup = o.backupDir;
    } catch (err) {
      await rm(staged, { recursive: true, force: true }).catch(() => undefined);
      throw new Error(`Hiltwright could not keep a copy of the card's old voice pack on this computer (${plainCode(err)}), so the card was not changed.`);
    }
  }

  // 3. Into common, each entry whole, voicepack.ini last.
  const old = join(root, OLD);
  const moveIn = o.moveIn ?? rename;
  const moved: { name: string; had?: string; landed: boolean }[] = [];
  try {
    await mkdir(old, { recursive: true });
    for (const n of top) {
      const had = existing.get(n.toLowerCase());
      const m = { name: n, had, landed: false };
      if (had) await rename(join(common, had), join(old, had));
      moved.push(m);
      await moveIn(join(staged, n), join(common, n));
      m.landed = true;
    }
  } catch (err) {
    for (const m of moved.reverse()) {
      if (m.landed) await rename(join(common, m.name), join(staged, m.name)).catch(() => undefined);
      if (m.had) await rename(join(old, m.had), join(common, m.had)).catch(() => undefined);
    }
    await clearVoiceLeftovers(root).catch(() => undefined);
    console.log(`[voice] swap on ${root} stopped: ${String(err)}`);
    throw new Error(`The voice pack could not be moved into the common folder (${plainCode(err)}). The card's old voice pack was put back. Check the card is in, then try again.`);
  }
  await rm(old, { recursive: true, force: true });
  await rm(staged, { recursive: true, force: true });
  return { status: await readVoicePack(root), backup, replaced: replacing.length };
}
