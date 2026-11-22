// Putting a Fett263 voice pack in the card's common folder: one of the packs Hiltwright offers
// (voicePackCatalogue.ts), or a zip the owner chose.
//
// common holds more than the voice pack (shared sounds the owner put there), so it is never cleared. Each top-level
// entry the pack has (a file, or a folder such as mnum) replaces the card's entry of that name whole, and with it every
// card entry of the same sound in either layout: a pack's mnum/ folder replaces loose mnum1.wav, mnum2.wav…, and
// loose files replace an mnum/ folder. ProffieOS counts every layout, so an old pack's numbered sounds left beside
// the new ones make it say "error in font directory" on every preset change. The pack is copied to a hidden folder on the card first, then moved into
// common with voicepack.ini last: a copy cut short leaves the card reading as its old version, and the next run puts
// back what was moved aside. Whatever is replaced is copied to this computer before anything on the card changes.
//
// The swap is written down first (a journal in the set-aside folder): each pack entry and what it set aside. A swap
// cut short before the new voicepack.ini landed is then undone exactly: every pack entry that landed goes back out,
// and everything set aside comes back, so the card never keeps both layouts of one sound or half of each pack
// (issue #18). Once the new voicepack.ini is in, the new pack is whole and what was set aside is no longer needed.

import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { FETT263_REQUIRED_VOICE_PACK, hasMenuSounds, parseVoicePackIni, soundOf, voicePackFolder, type VoicePackStatus } from '@hiltwright/core';
import { extractZip, listZip } from './unzip';
import { checkEntryName } from './packCopy';
import { cardFree, exists, filesUnder, isDir, noteCardWritten, readVoicePack } from './sd';
import type { VoicePackInfo } from '../shared/api';

/** Voice packs are 15 to 20 MB in a couple of hundred files; this stops a crafted zip from filling the disk. */
export const MAX_VOICE_PACK_BYTES = 150 * 1024 * 1024;
export const MAX_VOICE_PACK_FILES = 2000;

const NEW = '.hiltwright-voice-new';
const OLD = '.hiltwright-voice-old';
/** Inside OLD: the journal of the swap, and the card's entries set aside. */
const JOURNAL = 'journal.json';
const ASIDE = 'aside';

/** Each pack entry, in the order it is moved in, and the card entries in common it sets aside. */
interface SwapJournal { version: 1; entries: { name: string; had: string[] }[] }

const isIni = (n: string) => n.toLowerCase() === 'voicepack.ini';
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const plainName = (n: unknown): n is string => typeof n === 'string' && !!n && n !== '.' && n !== '..' && !/[\\/]/.test(n);

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
  // Whole paths, not first folders: an mnum folder with no sounds in it is no menu sounds (issue #27).
  if (!hasMenuSounds(mine.map((e) => e.name.slice(prefix.length)))) throw new Error('That voice pack has no menu number sounds (mnum), so the saber could not speak numbers from it. Nothing was copied.');
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

async function listing(dir: string): Promise<{ name: string; isFolder: boolean }[]> {
  try { return (await readdir(dir, { withFileTypes: true })).map((d) => ({ name: d.name, isFolder: d.isDirectory() })); } catch { return []; }
}

async function readJournal(old: string): Promise<SwapJournal | null> {
  try {
    const j = JSON.parse(await readFile(join(old, JOURNAL), 'utf8')) as SwapJournal;
    const ok = Array.isArray(j?.entries) && j.entries.every((e) => plainName(e?.name) && Array.isArray(e.had) && e.had.every(plainName));
    return ok ? j : null;
  } catch { return null; }
}

/** The commit point: the new voicepack.ini moved in (it goes last). A pack without one counts once every entry is in. */
async function swapCommitted(root: string, j: SwapJournal): Promise<boolean> {
  const isIn = async (n: string) => !(await exists(join(root, NEW, n))) && (await exists(join(root, 'common', n)));
  const ini = j.entries.find((e) => isIni(e.name));
  if (ini) return isIn(ini.name);
  for (const e of j.entries) if (!(await isIn(e.name))) return false;
  return true;
}

/** A finished swap: what was set aside goes, then the staging folder, and the journal last. */
async function finishSwap(root: string): Promise<void> {
  await rm(join(root, OLD, ASIDE), { recursive: true, force: true });
  await rm(join(root, NEW), { recursive: true, force: true });
  await rm(join(root, OLD), { recursive: true, force: true });
}

/**
 * Undo a swap cut short before its commit point: each pack entry that landed goes back to the staging folder, and
 * each card entry set aside comes back to common. Returns what could not be taken out or put back.
 */
async function undoSwap(root: string, j: SwapJournal): Promise<string[]> {
  const common = join(root, 'common');
  const staged = join(root, NEW);
  const aside = join(root, OLD, ASIDE);
  const failed: string[] = [];
  await mkdir(common, { recursive: true });
  await mkdir(staged, { recursive: true });
  const asideNames = (await listing(aside)).map((d) => d.name);
  for (const e of j.entries) {
    if (!(await exists(join(staged, e.name)))) {
      // It landed: back out. Moved, not deleted, so a second run of this never mistakes a put-back entry for it.
      try { await rename(join(common, e.name), join(staged, e.name)); } catch { if (await exists(join(common, e.name))) failed.push(e.name); }
    } else if (asideNames.some((a) => sameName(a, e.name)) && (await exists(join(common, e.name)))) {
      // Not moved in whole, yet something of its name is in common while the card's own is set aside: a part copy.
      try { await rm(join(common, e.name), { recursive: true, force: true }); } catch { failed.push(e.name); }
    }
  }
  // A folder and loose files of one sound count as one (soundOf): nothing goes back beside the other layout of it,
  // unless that is itself one of the entries this swap set aside and never got to.
  const allHad = j.entries.flatMap((e) => e.had);
  const now = await listing(common);
  for (const h of allHad) {
    if (!asideNames.includes(h)) continue; // never set aside: still in common
    const sound = soundOf(h, await isDir(join(aside, h)));
    const inWay = now.some((c) => sameName(c.name, h) || (!!sound && soundOf(c.name, c.isFolder) === sound && !allHad.some((x) => sameName(x, c.name))));
    if (inWay) { failed.push(h); continue; }
    try { await rename(join(aside, h), join(common, h)); } catch { failed.push(h); }
  }
  return failed;
}

/**
 * Leftovers from a version before the journal: entries set aside straight into OLD. Each goes back only when common
 * has nothing of its name and nothing of its sound in the other layout; the rest are dropped (the computer has a
 * copy of them). Returns what could not be moved back.
 */
async function putBackUnjournalled(root: string): Promise<string[]> {
  const old = join(root, OLD);
  const common = join(root, 'common');
  await mkdir(common, { recursive: true });
  const now = await listing(common);
  const failed: string[] = [];
  for (const dir of [old, join(old, ASIDE)]) {
    for (const d of await listing(dir)) {
      if (dir === old && (d.name === ASIDE || d.name === JOURNAL)) continue;
      const sound = soundOf(d.name, d.isFolder);
      const inWay = now.some((c) => sameName(c.name, d.name) || (!!sound && c.isFolder !== d.isFolder && soundOf(c.name, c.isFolder) === sound));
      if (inWay) continue;
      try { await rename(join(dir, d.name), join(common, d.name)); } catch { failed.push(d.name); }
    }
  }
  return failed;
}

/**
 * What an earlier install left behind. A swap past its commit point is finished; one cut short before it is undone
 * from its journal, so common is as it was. Returns what could not be put back: then both hidden folders are kept,
 * so the next run can try again, and nothing is lost.
 */
export async function clearVoiceLeftovers(root: string): Promise<string[]> {
  const old = join(root, OLD);
  if (await isDir(old)) {
    const j = await readJournal(old);
    if (j && (await swapCommitted(root, j))) { await finishSwap(root); return []; }
    const failed = j ? await undoSwap(root, j) : await putBackUnjournalled(root);
    if (failed.length) return failed;
    // The journal goes first: with common back as it was, a run cut short here must not undo it a second time.
    await rm(join(old, JOURNAL), { force: true });
    await rm(old, { recursive: true, force: true });
  }
  await rm(join(root, NEW), { recursive: true, force: true });
  return [];
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
  /** How one card entry is set aside, for tests that stop the swap part way. */
  setAside?: (from: string, to: string) => Promise<void>;
}

export interface VoicePackInstallResult { status: VoicePackStatus; backup: string | null; replaced: number }

const plainCode = (err: unknown) => (err as { code?: string }).code ?? (err instanceof Error ? err.message.split(':')[0] : String(err));

/** Put the voice pack in `file` into common on the card at `root`. Refused below the version Fett263 needs. */
export async function installVoicePack(file: string, root: string, o: VoicePackInstallOptions): Promise<VoicePackInstallResult> {
  const pack = await inspectVoicePack(file, o.tempRoot);
  const need = FETT263_REQUIRED_VOICE_PACK;
  if (pack.version < need) throw new Error(`${pack.name} is voice pack version ${pack.version}, and the Fett263 controls need version ${need}. Nothing was copied.`);
  const notBack = await clearVoiceLeftovers(root);
  if (notBack.length) throw new Error(`An earlier voice pack install on this card was cut short, and Hiltwright could not put back ${notBack.join(', ')} in the common folder. They are still on the card, in the hidden folder ${OLD}. Nothing new was copied. Check the card is in, then try again.`);
  noteCardWritten(root);
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
  const top = (await readdir(staged, { withFileTypes: true })).sort((a, b) => Number(isIni(a.name)) - Number(isIni(b.name)));
  // What each pack entry replaces on the card: its own name (FAT is case-blind, so the card's MNUM is the pack's mnum)
  // and every other card entry of the same sound, in either layout (an old mnum30.wav the pack lacks goes too).
  const card = await readdir(common, { withFileTypes: true });
  const taken = new Set<string>();
  const replaces = new Map<string, string[]>();
  for (const d of top) {
    const same = card.find((c) => c.name.toLowerCase() === d.name.toLowerCase());
    const list = same ? [same.name] : [];
    if (same) taken.add(same.name);
    replaces.set(d.name, list);
  }
  for (const d of top) {
    const sound = soundOf(d.name, d.isDirectory());
    if (!sound) continue;
    for (const c of card) {
      if (taken.has(c.name) || soundOf(c.name, c.isDirectory()) !== sound) continue;
      taken.add(c.name);
      replaces.get(d.name)!.push(c.name);
    }
  }
  const replacing = [...taken];
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

  // 3. Into common, each entry whole, voicepack.ini last. The journal is written before anything moves.
  const old = join(root, OLD);
  const aside = join(old, ASIDE);
  const moveIn = o.moveIn ?? rename;
  const setAside = o.setAside ?? rename;
  const journal: SwapJournal = { version: 1, entries: top.map((d) => ({ name: d.name, had: replaces.get(d.name) ?? [] })) };
  try {
    await mkdir(aside, { recursive: true });
    await writeFile(join(old, JOURNAL), JSON.stringify(journal));
    for (const e of journal.entries) {
      for (const h of e.had) await setAside(join(common, h), join(aside, h));
      await moveIn(join(staged, e.name), join(common, e.name));
    }
  } catch (err) {
    console.log(`[voice] swap on ${root} stopped: ${String(err)}`);
    // Past the commit point (the new voicepack.ini went in after all), the new pack is whole: finish rather than undo.
    if (await swapCommitted(root, journal).catch(() => false)) {
      await finishSwap(root);
      return { status: await readVoicePack(root), backup, replaced: replacing.length };
    }
    // The same undo a later run would do, from the journal. Whatever it could not put back is said, not hidden.
    let notBack: string[];
    try { notBack = await clearVoiceLeftovers(root); } catch (undoErr) { console.log(`[voice] undo on ${root} stopped: ${String(undoErr)}`); notBack = ['the old voice pack']; }
    if (!notBack.length) throw new Error(`The voice pack could not be moved into the common folder (${plainCode(err)}). The card's old voice pack was put back. Check the card is in, then try again.`);
    const kept = backup ? ` A copy of what it replaced is on this computer, in ${backup}.` : '';
    throw new Error(`The voice pack could not be moved into the common folder (${plainCode(err)}), and Hiltwright could not put all of the card's old voice pack back: ${notBack.join(', ')} did not go back.${kept} Check the card is in, then install the voice pack again: Hiltwright finishes putting the old one back first.`);
  }
  await finishSwap(root);
  return { status: await readVoicePack(root), backup, replaced: replacing.length };
}
