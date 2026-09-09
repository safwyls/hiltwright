// Preset records as the board reports them (`list_presets`, `show_current_preset`) and the commands that edit them.

import { isNoise, unescapeValue } from './lines';

/** One preset as printed by CurrentPreset::Print(): FONT=, TRACK=, STYLE1..N=, NAME=, VARIATION=. */
export interface PresetRecord {
  font: string;
  track: string;
  styles: string[];
  name: string;
  variation: number;
}

/** `builtin P B [args]`: the style compiled into preset P, blade B, with an optional argument string. */
export interface BuiltinStyle {
  preset: number;
  blade: number;
  args: string | null;
}

export function parseBuiltin(style: string): BuiltinStyle | null {
  const m = /^builtin\s+(\d+)\s+(\d+)(?:\s+(.*))?$/.exec(style.trim());
  if (!m) return null;
  return { preset: Number(m[1]), blade: Number(m[2]), args: m[3] !== undefined && m[3] !== '' ? m[3] : null };
}

export function formatBuiltin(b: BuiltinStyle): string {
  return `builtin ${b.preset} ${b.blade}${b.args ? ` ${b.args}` : ''}`;
}

/** Parse zero or more preset blocks out of console lines. Unrelated lines are skipped, a block ends at VARIATION=. */
export function parsePresetBlocks(lines: string[]): { presets: PresetRecord[]; incomplete: boolean } {
  const presets: PresetRecord[] = [];
  let cur: Partial<PresetRecord> & { styles: string[] } | null = null;
  for (const line of lines) {
    if (isNoise(line)) continue;
    const m = /^(FONT|TRACK|STYLE(\d+)|NAME|VARIATION)=(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[3];
    if (key === 'FONT') {
      if (cur) presets.push(finish(cur)); // a FONT= without VARIATION= means the previous block was cut short
      cur = { styles: [] };
      cur.font = unescapeValue(value);
      continue;
    }
    if (!cur) cur = { styles: [] };
    if (key === 'TRACK') cur.track = unescapeValue(value);
    else if (key.startsWith('STYLE')) cur.styles[Number(m[2]) - 1] = unescapeValue(value);
    else if (key === 'NAME') cur.name = unescapeValue(value);
    else if (key === 'VARIATION') {
      cur.variation = Number(value);
      presets.push(finish(cur));
      cur = null;
    }
  }
  return { presets, incomplete: cur !== null };
}

function finish(p: Partial<PresetRecord> & { styles: string[] }): PresetRecord {
  return { font: p.font ?? '', track: p.track ?? '', styles: [...p.styles].map((s) => s ?? ''), name: p.name ?? '', variation: p.variation ?? 0 };
}

/** A block is complete once VARIATION= has been seen. Used by the client to know when show_current_preset is done. */
export function isPresetBlockEnd(line: string): boolean {
  return /^VARIATION=/.test(line);
}

// ---------- Commands ----------
// All edits act on the board's *current* preset and are saved to presets.ini by the board, asynchronously.

function arg(s: string): string {
  if (/[\r\n]/.test(s)) throw new Error('Argument must not contain newlines');
  return s;
}

export const presetCommands = {
  list: () => 'list_presets',
  showCurrent: () => 'show_current_preset',
  getCurrent: () => 'get_preset',
  /** Select preset `n` (0-based) and make it current. The board answers with font-scan chatter, not an acknowledgement. */
  select: (n: number) => `set_preset ${n}`,
  setFont: (font: string) => `set_font ${arg(font)}`,
  setTrack: (track: string) => `set_track ${arg(track)}`,
  /** Newlines in names are written as literal backslash-n, matching what the board prints back. */
  setName: (name: string) => `set_name ${arg(name.replace(/\n/g, '\\n'))}`,
  setStyle: (blade: number, style: string) => `set_style${blade} ${arg(style)}`,
  /** Move the current preset to position `pos`. */
  move: (pos: number) => `move_preset ${pos}`,
  duplicate: (pos: number) => `duplicate_preset ${pos}`,
  delete: () => 'delete_preset',
  getVariation: () => 'get_variation',
  setVariation: (v: number) => `variation ${v}`,
};
