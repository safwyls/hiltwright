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
// the one with the higher iteration counter; both share this format.

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
