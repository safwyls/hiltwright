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
  /** Menu number sounds (`mnum`) exist beside it, as files or as a folder. ProffieOS checks for these first. */
  menuSounds: boolean;
}

export const FETT263_REQUIRED_VOICE_PACK = 2;

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

/** True when a directory listing (file or folder names) contains the menu number sounds. */
export function hasMenuSounds(names: string[]): boolean {
  return names.some((n) => /^mnum(\d*\.wav)?$/i.test(n.trim()));
}

/**
 * Read the board's answers to `cat common/voicepack.ini` and `dir common`. `cat` on a missing file prints nothing;
 * `dir` prints "<name> <size>" per entry and ends with "Done listing files.".
 */
export function voicePackFromSerial(catLines: string[], dirLines: string[]): VoicePackStatus {
  const text = catLines.filter((l) => !/^Whut\? :/.test(l)).join('\n');
  const parsed = parseVoicePackIni(/voice_pack_version|=/.test(text) ? text : null);
  const names = dirLines.filter((l) => !/^(Done listing files\.|No such directory\.|Whut\? :)/.test(l)).map((l) => l.replace(/\s+\d+\s*$/, ''));
  return { ...parsed, menuSounds: hasMenuSounds(names) };
}

export interface VoicePackVerdict { ok: boolean; tone: 'green' | 'amber'; text: string }

/** What to tell the owner before building with `prop`, given what the card holds. Null when the prop needs no pack. */
export function voicePackVerdict(prop: Prop, s: VoicePackStatus | null): VoicePackVerdict | null {
  if (prop !== 'fett263') return null;
  const need = FETT263_REQUIRED_VOICE_PACK;
  const fix = `Put the Fett263 Voice Pack version ${need} in the common folder on the SD card (voicepack.ini plus its menu sounds). Until then the saber speaks a voice pack error on every preset change; everything else works.`;
  if (!s) return { ok: false, tone: 'amber', text: `Fett263 button controls need the Fett263 Voice Pack version ${need} on the SD card. Hiltwright could not check this card. ${fix}` };
  if (!s.menuSounds && !s.ini) return { ok: false, tone: 'amber', text: `No voice pack found in the common folder. ${fix}` };
  if ((s.version ?? 1) < need) return { ok: false, tone: 'amber', text: `The card has voice pack version ${s.version ?? 1}, and this firmware needs version ${need}. ${fix}` };
  if (!s.menuSounds) return { ok: false, tone: 'amber', text: `voicepack.ini says version ${s.version}, but the menu sounds (mnum) are missing from the common folder. ${fix}` };
  return { ok: true, tone: 'green', text: `Voice pack version ${s.version} found on the card. Fett263 button controls will speak their menus.` };
}
