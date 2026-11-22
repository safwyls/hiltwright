// The Fett263 voice pack: spoken menu sounds the Fett263 prop needs on the SD card. ProffieOS looks for
// `voicepack.ini` in the font search path (in practice the `common` folder) and compares `voice_pack_version`
// with what the prop's sound library requires. With the edit menu enabled that requirement is version 2
// (see docs/09, item 12); without the pack, or with an older one, the saber speaks an error on every preset change.

import type { Prop } from './config/generate';

export interface VoicePackStatus {
  /** voicepack.ini was found. */
  ini: boolean;
  /** voice_pack_version from the file; ProffieOS treats a file without the key as version 1. */
  version: number | null;
  /** Menu number sounds (`mnum`) exist beside it, as loose files or in a folder. ProffieOS checks for these first. */
  menuSounds: boolean;
  /**
   * Sounds that are in common both as a folder (`mnum/`) and as loose files (`mnum1.wav`), lowercased: usually an old
   * pack's files left beside a newer pack's folder. ProffieOS counts both, finds twice the files it expects, and says
   * "error in font directory" on every preset change. Absent when not checked.
   */
  mixed?: string[];
}

export const FETT263_REQUIRED_VOICE_PACK = 2;

/**
 * The sound a `common` entry holds, the way ProffieOS groups files: a folder by its name, a `.wav` by its name less
 * any number (`mnum12.wav` is mnum). Lowercased, since FAT is case-blind. Null for anything else.
 */
export function soundOf(name: string, isFolder: boolean): string | null {
  if (isFolder) return name.toLowerCase();
  const m = /^(.*?[^\d])\d*\.wav$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}

/** The sounds in a listing of common that are there both as a folder and as loose files (see `mixed`). */
export function mixedSounds(entries: { name: string; isFolder: boolean }[]): string[] {
  const folders = new Set(entries.filter((e) => e.isFolder).map((e) => e.name.toLowerCase()));
  const loose = new Set(entries.filter((e) => !e.isFolder).map((e) => soundOf(e.name, false)).filter((s): s is string => !!s));
  return [...folders].filter((f) => loose.has(f)).sort();
}

/** Parse voicepack.ini text (ProffieOS config-file format: `key=value`, `#` comments). Null when there is no file. */
export function parseVoicePackIni(text: string | null): { ini: boolean; version: number | null } {
  if (text == null) return { ini: false, version: null };
  let version: number | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^voice_pack_version\s*=\s*(\d+)/i.exec(line);
    if (m) version = Number(m[1]);
  }
  return { ini: true, version: version ?? 1 };
}

/** A menu number sound by its path within common: a loose `mnum1.wav`, or a `.wav` in the `mnum` folder (not a Mac `._` file). */
const MENU_SOUND = /^mnum(\d*\.wav|\/[^/.][^/]*\.wav)$/i;

/**
 * True when `paths`, within common with forward slashes (`mnum3.wav`, `mnum/001.wav`), hold a menu number sound. A
 * folder named mnum counts only for the sounds in it: ProffieOS reads voicepack.ini only once it finds menu WAVs, and
 * otherwise says "voice pack not found" (issue #27).
 */
export function hasMenuSounds(paths: string[]): boolean {
  return paths.some((p) => MENU_SOUND.test(p.trim().replace(/\\/g, '/')));
}

/**
 * Where a voice pack sits inside a downloaded package, given every path in it (forward slashes): the folder holding
 * `voicepack.ini`, or failing that the one holding the menu number sounds, as a prefix ending in `/` ('' for the top).
 * Packages wrap it differently (`common/`, `<pack name>/common/`, or loose files), so the shallowest folder wins.
 * Null when the package holds no voice pack. Mac resource-fork folders are ignored.
 */
export function voicePackFolder(paths: string[]): string | null {
  const ini: string[] = []; const mnum: string[] = [];
  for (const raw of paths) {
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.some((p) => p === '__MACOSX')) continue;
    const i = parts.findIndex((p) => /^mnum(\d*\.wav)?$/i.test(p));
    if (i >= 0) mnum.push(parts.slice(0, i).map((p) => `${p}/`).join(''));
    if (!raw.endsWith('/') && parts.length && parts[parts.length - 1].toLowerCase() === 'voicepack.ini') ini.push(parts.slice(0, -1).map((p) => `${p}/`).join(''));
  }
  const pick = (l: string[]) => l.length ? l.reduce((a, b) => (b.split('/').length < a.split('/').length ? b : a)) : null;
  return pick(ini) ?? pick(mnum);
}

/**
 * Read the board's answers to `cat common/voicepack.ini` and `dir common`. `cat` on a missing file prints nothing;
 * `dir` prints "<name> <size>" per entry and ends with "Done listing files.". Folders are listed with size 0; an
 * entry of size 0 with no extension is taken as one.
 */
export function voicePackFromSerial(catLines: string[], dirLines: string[]): VoicePackStatus {
  const text = catLines.filter((l) => !/^Whut\? :/.test(l)).join('\n');
  const parsed = parseVoicePackIni(/voice_pack_version|=/.test(text) ? text : null);
  const entries = dirLines.filter((l) => !/^(Done listing files\.|No such directory\.|Whut\? :)/.test(l)).map((l) => {
    const m = /^(.*?)\s+(\d+)\s*$/.exec(l);
    const name = m ? m[1] : l;
    return { name, isFolder: !!m && m[2] === '0' && !name.includes('.') };
  }).filter((e) => e.name !== '.' && e.name !== '..');
  // `dir common` lists the mnum folder but not what is in it, so here the folder still counts as menu sounds. The
  // card checks that can look inside it (sd.ts readVoicePack, the zip check) need a sound in it (issue #27).
  const menuSounds = entries.some((e) => (e.isFolder && e.name.toLowerCase() === 'mnum') || hasMenuSounds([e.name]));
  return { ...parsed, menuSounds, mixed: mixedSounds(entries) };
}

/**
 * How many presets leave `common` out of their font path (`Font;common`). The saber looks for the voice pack only in
 * the folders a preset's font names, so a pack in `common` is invisible to these presets.
 */
export function presetsWithoutCommon(presets: { font: string }[]): number {
  return presets.filter((p) => !p.font.split(';').some((part) => part.trim().toLowerCase() === 'common')).length;
}

export interface VoicePackVerdict { ok: boolean; tone: 'green' | 'amber'; text: string }

/** What to say about sounds that are in common twice (see `VoicePackStatus.mixed`), and how to fix it. */
export function mixedText(mixed: string[]): string {
  const list = mixed.join(' and ');
  return `The card's common folder has ${list} both as a folder and as loose files, left from an older voice pack. The saber counts both, so it says "error in font directory" on every preset change. Put the voice pack on again on Live › Card: Hiltwright moves the loose files aside and keeps a copy of them on this computer.`;
}

/**
 * What to tell the owner before building with `prop`, given what the card holds. Null when the prop needs no pack.
 * `s` is null when the card could not be read; `couldNotRead` then says why (for example that the saber did not
 * answer). A card that could not be read is not a card without the pack, so that warning says only that it could
 * not check and why: it never says the pack is missing or that the saber will speak an error.
 */
export function voicePackVerdict(prop: Prop | null, s: VoicePackStatus | null, couldNotRead?: string | null, presetsWithoutCommon = 0): VoicePackVerdict | null {
  if (prop !== 'fett263') return null;
  const need = FETT263_REQUIRED_VOICE_PACK;
  const fix = `Put the Fett263 Voice Pack version ${need} in the common folder on the SD card (voicepack.ini plus its menu sounds). Until then the saber speaks a voice pack error on every preset change; everything else works.`;
  if (!s) return { ok: false, tone: 'amber', text: `Hiltwright could not check the voice pack on this card${couldNotRead ? `: ${couldNotRead}` : ''}. That does not mean it is missing; check again once the saber answers.` };
  if (!s.menuSounds && !s.ini) return { ok: false, tone: 'amber', text: `No voice pack found in the common folder. ${fix}` };
  if ((s.version ?? 1) < need) return { ok: false, tone: 'amber', text: `The card has voice pack version ${s.version ?? 1}, and this firmware needs version ${need}. ${fix}` };
  if (!s.menuSounds) return { ok: false, tone: 'amber', text: `voicepack.ini says version ${s.version}, but the menu sounds (mnum) are missing from the common folder. ${fix}` };
  if (s.mixed?.length) return { ok: false, tone: 'amber', text: mixedText(s.mixed) };
  if (presetsWithoutCommon > 0) {
    const n = presetsWithoutCommon;
    return { ok: false, tone: 'amber', text: `The card has voice pack version ${s.version}, but ${n} preset${n === 1 ? '' : 's'} on the saber ${n === 1 ? 'does' : 'do'} not use the common folder, which is where the pack lives. The saber will say "voice pack not found" on ${n === 1 ? 'it' : 'them'}. On the Presets page, turn on "Also use common sounds" for ${n === 1 ? 'that preset' : 'each of them'}.` };
  }
  return { ok: true, tone: 'green', text: `Voice pack version ${s.version} found on the card. Fett263 button controls will speak their menus.` };
}
