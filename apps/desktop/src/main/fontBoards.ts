// Sorting what a downloaded font package holds. Makers put one font for every soundboard in one package, plus a
// folder of extras. Only a Proffie copy belongs in the library, so each folder is looked at for what is in it (config
// files, how the sounds are named), with its name as the fallback, never the name alone when the contents say more.

import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { looksLikeFont } from './sd';

/** What is in one folder: its own files, and the files of each folder directly inside it. */
export interface FolderFacts { files: string[]; folders: Record<string, string[]> }

export async function folderFacts(dir: string): Promise<FolderFacts> {
  const facts: FolderFacts = { files: [], folders: {} };
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return facts; }
  for (const n of names) {
    let isFolder = false;
    try { isFolder = (await stat(join(dir, n))).isDirectory(); } catch { continue; }
    if (!isFolder) { facts.files.push(n); continue; }
    try { facts.folders[n] = await readdir(join(dir, n)); } catch { facts.folders[n] = []; }
  }
  return facts;
}

export const PROFFIE_BOARD = 'Proffie';

/**
 * The board a folder's contents were made for, and what gave it away; null when the contents do not say. Each rule
 * is a file or a way of naming sounds that only that board uses:
 *  - Xenopixel names sounds "clash (1).wav".
 *  - Crystal Focus keeps font_config.txt and leds.txt in the font, and names hums humM1.wav.
 *  - Verso names accent swings aswing1.wav and blaster deflections deflc1.wav.
 *  - Asteria keeps a Hyswing folder, SmoothSwing pairs named SW01_H.wav, and bankswitch.wav.
 *  - ProffieOS keeps smoothsw.ini, and names polyphonic sounds clsh, swng and blst.
 * Plain Plecter names (poweron.wav, clash1.wav, hswing1.wav) are not a sign of anything: ProffieOS plays them too.
 */
export function boardByContent(f: FolderFacts): { board: string; signal: string } | null {
  const files = f.files.map((n) => n.toLowerCase());
  const folders = Object.keys(f.folders).map((n) => n.toLowerCase());
  const inFolders = Object.values(f.folders).flat().map((n) => n.toLowerCase());
  const has = (re: RegExp) => files.some((n) => re.test(n));
  if (files.filter((n) => /^[a-z]+ \(\d+\)\.wav$/.test(n)).length >= 3) return { board: 'Xenopixel', signal: 'sounds named like "clash (1).wav"' };
  if (has(/^font_config\.txt$/)) return { board: 'CFX', signal: 'font_config.txt' };
  if (has(/^leds\.txt$/)) return { board: 'CFX', signal: 'leds.txt' };
  if (has(/^humm\d+\.wav$/)) return { board: 'CFX', signal: 'hums named like humM1.wav' };
  if (has(/^aswing\d+\.wav$/)) return { board: 'Verso', signal: 'swings named like aswing1.wav' };
  if (has(/^deflc\d+\.wav$/)) return { board: 'Verso', signal: 'sounds named like deflc1.wav' };
  if (folders.includes('hyswing')) return { board: 'Asteria', signal: 'a Hyswing folder' };
  if (inFolders.some((n) => /^sw\d+_[hl]\.wav$/.test(n))) return { board: 'Asteria', signal: 'swings named like SW01_H.wav' };
  if (has(/^bankswitch\.wav$/)) return { board: 'Asteria', signal: 'bankswitch.wav' };
  if (has(/^smoothsw\.ini$/)) return { board: PROFFIE_BOARD, signal: 'smoothsw.ini' };
  if (has(/^(clsh|swng|blst)\d*\.wav$/) || folders.some((n) => /^(clsh|swng|blst)$/.test(n))) return { board: PROFFIE_BOARD, signal: 'sounds named clsh, swng or blst' };
  return null;
}

/** A hum, as a file (hum.wav, hum01.wav, humM1.wav) or in a hum folder. A font cannot run without one. */
export function hasHum(f: FolderFacts): boolean {
  if (f.files.some((n) => /^hum(m?\d+)?\.wav$/i.test(n))) return true;
  return Object.entries(f.folders).some(([name, inside]) => /^hum$/i.test(name) && inside.some((n) => /\.wav$/i.test(n)));
}

/** One folder of a package worth deciding about: a font folder, or one that is plainly another board's copy. */
export interface PackageDir { dir: string; font: boolean; facts: FolderFacts }

/**
 * The folders to decide about inside what someone downloaded: the folder itself, or folders below it, four levels
 * down. A folder that is not a font but is plainly made for another board is listed too, so it can be reported.
 */
export async function surveyPackage(dir: string, depth = 0): Promise<PackageDir[]> {
  const facts = await folderFacts(dir);
  if (await looksLikeFont(dir)) return [{ dir, font: true, facts }];
  const made = boardByContent(facts);
  // Spare sounds in an extras folder can be named another board's way (humM2.wav); that is not a copy of the font.
  if (made && made.board !== PROFFIE_BOARD && !EXTRAS.test(basename(dir))) return [{ dir, font: false, facts }];
  if (depth >= 4) return [];
  const out: PackageDir[] = [];
  for (const n of Object.keys(facts.folders).sort()) {
    if (n.startsWith('.') || n === '__MACOSX' || /^tracks?$/i.test(n)) continue;
    out.push(...(await surveyPackage(join(dir, n), depth + 1)));
  }
  return out;
}

const PROFFIE = /proffie/i;
/** Folder names that say a copy of a font is for another board. */
const OTHER_BOARD = /(^|[^a-z])(cfx|crystal ?focus|xeno(pixel)?|golden ?harvest|ghv?\d|verso|asteria|plecter|lgt|sn-?pixel|darkwolf|polaris)([^a-z]|$)/i;
/** A folder named only for a board ("Proffie", "ProffieOS v2", "CFX"): a variant folder, not a font's own name. */
const BOARD_ONLY = /^(proffie(os|board)?|cfx|crystal ?focus|xeno(pixel)?|golden ?harvest|ghv?\d|verso|asteria|plecter|lgt|sn-?pixel|darkwolf|polaris)([ _-]?(v|ver|version)?[ _-]?\d+(\.\d+)*)?$/i;
/** A folder a maker keeps spare parts in: other hums, alternate ignitions, music, quotes. */
const EXTRAS = /^[\s_.-]*(extras?|bonus(es)?|optional)([\s_.-].*)?$/i;

export interface LeftOut {
  dir: string;
  reason: 'other-board' | 'extra';
  /** The folder that says which board: the copy's own folder, or the board folder above it. */
  from: string;
}

/**
 * Which folders of a package come into the library.
 *
 * Another board's copy is left out only when the package also holds a Proffie copy, because a font made for
 * Crystal Focus alone still plays on a Proffieboard. Two ways to tell:
 *  - by contents (boardByContent), when a Proffie copy sits beside it in the same folder, or a folder in the
 *    package is named for Proffie;
 *  - by name, as before, when the contents say nothing: a package with both a folder named for Proffie and a folder
 *    named for another board. Folders above a font count, and so does the font's own folder when its whole name is
 *    a board's ("Kyber Ember/CFX"); a font whose name merely mentions a board ("ProffieOS Default") never does.
 * Contents that say Proffie always win over a name.
 *
 * An extra is left out too: a font-shaped folder kept under an "Extras" folder, or one with no hum while another
 * folder in the package has one (spare ignitions, say). A variant of a font is a whole font with its own hum, so
 * it stays.
 */
export function sortPackage(top: string, found: PackageDir[]): { keep: string[]; left: LeftOut[] } {
  const t = resolve(top);
  const info = found.map((p) => {
    const above = relative(t, dirname(resolve(p.dir))).split(/[\\/]+/).filter((x) => x && x !== '.' && x !== '..');
    const own = basename(p.dir);
    const segs = BOARD_ONLY.test(own) ? [...above, own] : above;
    const content = boardByContent(p.facts);
    return {
      ...p, above, own, content,
      nameProffie: segs.some((x) => PROFFIE.test(x)),
      nameOther: segs.find((x) => OTHER_BOARD.test(x) && !PROFFIE.test(x)),
      hum: hasHum(p.facts),
    };
  });
  type Info = (typeof info)[number];
  const fonts = info.filter((i) => i.font);
  const proffieByName = fonts.some((i) => i.nameProffie);
  const otherByName = fonts.some((i) => !!i.nameOther);
  const isProffie = (i: Info) => i.font && (i.content ? i.content.board === PROFFIE_BOARD : i.nameProffie);
  const beside = (i: Info) => info.some((o) => o !== i && isProffie(o) && resolve(dirname(o.dir)) === resolve(dirname(i.dir)));

  const underExtras = (i: Info) => i.above.some((x) => EXTRAS.test(x));
  const keep: Info[] = [];
  const left: LeftOut[] = [];
  for (const i of info) {
    if (underExtras(i)) { if (i.font) keep.push(i); continue; }
    if (i.content && i.content.board !== PROFFIE_BOARD) {
      if (beside(i) || proffieByName) left.push({ dir: i.dir, reason: 'other-board', from: i.nameOther ?? i.own });
      else if (i.font) keep.push(i);
    } else if (!i.content && proffieByName && otherByName && i.nameOther) {
      left.push({ dir: i.dir, reason: 'other-board', from: i.nameOther });
    } else if (i.font) keep.push(i);
  }

  const whole =keep.filter((i) => i.hum && !underExtras(i));
  const out: string[] = [];
  for (const i of keep) {
    const extra = whole.length > 0 && !whole.includes(i);
    if (extra) left.push({ dir: i.dir, reason: 'extra', from: i.own }); else out.push(i.dir);
  }
  return { keep: out, left };
}
