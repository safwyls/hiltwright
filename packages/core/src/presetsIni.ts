// presets.ini / presets.tmp codec. Format from ProffieOS common/current_preset.h and file_reader.h:
//
//   installed=<build timestamp>        (omitted when KEEP_SAVEFILES_WHEN_PROGRAMMING is defined)
//   new_preset
//   font=TeensySF;common
//   track=tracks/venus.wav
//   style=builtin 0 1                  (one per blade, in blade order)
//   style=builtin 0 2 65535,0,0
//   name=Preset name
//   variation=0
//   ...more new_preset blocks...
//   end
//
// Keys are matched case-insensitively (the reader lowercases). Values escape \n, \t and backslash.
// Lines starting with # are comments. The board alternates writes between presets.ini and presets.tmp and keeps
// the one with the higher iteration counter; both share this format, after a binary header (activePresets below).

import { escapeValue, unescapeValue } from './protocol/lines';
import type { PresetRecord } from './protocol/presets';

export interface PresetsIni {
  installed: string | null;
  presets: PresetRecord[];
  /** True when the file ended with `end`. A missing `end` means a truncated write. */
  terminated: boolean;
}

export function parsePresetsIni(text: string): PresetsIni {
  const out: PresetsIni = { installed: null, presets: [], terminated: false };
  let cur: (Partial<PresetRecord> & { styles: string[] }) | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_.]+)\s*(?:=\s*(.*))?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2] !== undefined ? unescapeValue(m[2]) : null;
    if (key === 'installed') { out.installed = value; continue; }
    if (key === 'new_preset') { if (cur) out.presets.push(finish(cur)); cur = { styles: [] }; continue; }
    if (key === 'end') { if (cur) out.presets.push(finish(cur)); cur = null; out.terminated = true; break; }
    if (!cur || value === null) continue;
    if (key === 'font') cur.font = value;
    else if (key === 'track') cur.track = value;
    else if (key === 'style') cur.styles.push(value);
    else if (key === 'name') cur.name = value;
    else if (key === 'variation') cur.variation = parseInt(value, 10) || 0;
  }
  if (cur) out.presets.push(finish(cur));
  return out;
}

function finish(p: Partial<PresetRecord> & { styles: string[] }): PresetRecord {
  return { font: p.font ?? '', track: p.track ?? '', styles: p.styles, name: p.name ?? '', variation: p.variation ?? 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Which of presets.ini and presets.tmp ProffieOS loads (issue #25). From v8.10's common/file_reader.h (FileValidator,
// FileSelector, BufferedFileWriter) and common/current_preset.h (OpenPresets2, ValidatePresets):
//
// - The firmware saves to the two files in turn. Each save starts with a 512-byte header: two copies of
//   { magic 0xFF1E5AFE, checksum, iteration, length } (uint32 little-endian), then the build's install time. The
//   text follows at byte 512, `length` bytes of it, and the rest of the file is padding.
// - It loads the file whose two header copies agree, whose magic is right and whose checksum matches the text,
//   trying the higher iteration first (presets.ini on a tie). Only when neither is good does it take a plain text
//   file, presets.ini before presets.tmp, and only one that starts with `installed=` and ends with `end`.
// - Every file must also carry the install time of the firmware on the saber. That is not known here, so when the
//   loadable files disagree about it, the list in use cannot be told.

export const SAVED_PRESETS_MAGIC = 0xff1e5afe;
export const SAVED_PRESETS_HEADER_BYTES = 512;

/** The header of a file ProffieOS saved, or null when the file has none (both copies equal, the right magic). */
export function savedPresetsHeader(bytes: Uint8Array): { checksum: number; iteration: number; length: number } | null {
  if (bytes.length < 32) return null;
  for (let i = 0; i < 16; i++) if (bytes[i] !== bytes[16 + i]) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, 32);
  if (v.getUint32(0, true) !== SAVED_PRESETS_MAGIC) return null;
  // The firmware compares iterations as signed 32-bit numbers (FileValidator::iteration returns int32_t).
  return { checksum: v.getUint32(4, true), iteration: v.getInt32(8, true), length: v.getUint32(12, true) };
}

/** ProffieOS's checksum (CheckSummer): each byte in turn, sum = sum * 997 + byte, in 32 bits. */
export function presetsChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum = (Math.imul(sum, 997) + bytes[i]) >>> 0;
  return sum;
}

/** One of the two files, read as the firmware would: null when it would not load it. */
export interface LoadablePresets {
  /** `saved` for a file the firmware wrote (with its iteration), `plain` for a text file written by hand or a tool. */
  kind: 'saved' | 'plain';
  iteration: number;
  ini: PresetsIni;
}

const decodeText = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);
const SPACE = /[\n\r \t]/;

export function readPresetsFile(bytes: Uint8Array): LoadablePresets | null {
  const head = savedPresetsHeader(bytes);
  if (head) {
    const start = SAVED_PRESETS_HEADER_BYTES;
    if (start + head.length > bytes.length) return null;
    const body = bytes.subarray(start, start + head.length);
    if (presetsChecksum(body) !== head.checksum) return null;
    // The checksum is the firmware's whole test of a saved file: a matching one is loaded as it is.
    return { kind: 'saved', iteration: head.iteration, ini: parsePresetsIni(decodeText(body)) };
  }
  // A plain file: `installed=` first (ValidatePresets reads it up to a bare \n), and its last word `end`, after a space.
  const text = decodeText(bytes);
  if (!/^[ \t]*installed[ \t]*=[^\r\n]*\n/i.test(text)) return null;
  let end = text.length;
  while (end > 0 && SPACE.test(text[end - 1])) end--;
  if (end < 4 || !SPACE.test(text[end - 4]) || text.slice(end - 3, end).toLowerCase() !== 'end') return null;
  const ini = parsePresetsIni(text);
  return ini.terminated ? { kind: 'plain', iteration: 0, ini } : null;
}

/** A presets file's bytes, or undefined when the card does not have it. */
export interface PresetsFiles { ini?: Uint8Array; tmp?: Uint8Array }

/**
 * The list ProffieOS loads from a card's presets.ini and presets.tmp, and which file it is in; null when neither
 * would load, or when it cannot be told which would (they carry different install times). Card identity and the
 * snapshot kept before a card's presets are removed both use this (issue #25).
 */
export function activePresets(files: PresetsFiles): { file: 'presets.ini' | 'presets.tmp'; ini: PresetsIni } | null {
  const ini = files.ini ? readPresetsFile(files.ini) : null;
  const tmp = files.tmp ? readPresetsFile(files.tmp) : null;
  const named = [{ file: 'presets.ini' as const, f: ini }, { file: 'presets.tmp' as const, f: tmp }];
  const saved = named.filter((n) => n.f?.kind === 'saved');
  // Higher iteration first, presets.ini on a tie (FileSelector), then plain files in name order (OpenPresets2).
  saved.sort((a, b) => b.f!.iteration - a.f!.iteration);
  const order = [...saved, ...named.filter((n) => n.f?.kind === 'plain')];
  if (!order.length) return null;
  const first = order[0];
  if (order.some((n) => n.f!.ini.installed !== first.f!.ini.installed)) return null;
  return { file: first.file, ini: first.f!.ini };
}

export function emitPresetsIni(ini: PresetsIni): string {
  const lines: string[] = [];
  if (ini.installed !== null) lines.push(`installed=${escapeValue(ini.installed)}`);
  for (const p of ini.presets) {
    lines.push('new_preset');
    lines.push(`font=${escapeValue(p.font)}`);
    lines.push(`track=${escapeValue(p.track)}`);
    for (const s of p.styles) lines.push(`style=${escapeValue(s)}`);
    lines.push(`name=${escapeValue(p.name)}`);
    lines.push(`variation=${p.variation}`);
  }
  lines.push('end');
  return lines.join('\n') + '\n';
}
