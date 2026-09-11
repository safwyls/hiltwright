// Looks: compiled blade styles and their runtime arguments.
//
// ProffieOS compiles styles into preset slots; at runtime a preset refers to one as `builtin P B [args]`, where
// the args are space-separated words in the Fett263 edit-mode numbering (1 = base colour, 9 = blast colour, ...)
// and `~` means "keep the compiled default". Colours are 16-bit `r,g,b`. Hiltwright knows which arguments a look
// uses because it either wrote the look (starters) or analysed the pasted code, and records that per build.

import type { BladeRole } from './config/generate';

export type ArgKind = 'color' | 'option' | 'time' | 'size';
export interface StyleArgInfo { n: number; name: string; kind: ArgKind }

/** The `builtin` argument template ProffieOS 8.10 documents, which is also the edit-mode enum in styles/edit_mode.h. */
export const STANDARD_ARGS: readonly StyleArgInfo[] = [
  { n: 1, name: 'Base colour', kind: 'color' }, { n: 2, name: 'Alt colour', kind: 'color' }, { n: 3, name: 'Style option', kind: 'option' },
  { n: 4, name: 'Ignition option', kind: 'option' }, { n: 5, name: 'Ignition time', kind: 'time' }, { n: 6, name: 'Ignition delay', kind: 'time' },
  { n: 7, name: 'Ignition colour', kind: 'color' }, { n: 8, name: 'Ignition power-up', kind: 'option' }, { n: 9, name: 'Blast colour', kind: 'color' },
  { n: 10, name: 'Clash colour', kind: 'color' }, { n: 11, name: 'Lockup colour', kind: 'color' }, { n: 12, name: 'Lockup position', kind: 'option' },
  { n: 13, name: 'Drag colour', kind: 'color' }, { n: 14, name: 'Drag size', kind: 'size' }, { n: 15, name: 'Lightning block colour', kind: 'color' },
  { n: 16, name: 'Stab colour', kind: 'color' }, { n: 17, name: 'Melt size', kind: 'size' }, { n: 18, name: 'Swing colour', kind: 'color' },
  { n: 19, name: 'Swing option', kind: 'option' }, { n: 20, name: 'Emitter colour', kind: 'color' }, { n: 21, name: 'Emitter size', kind: 'size' },
  { n: 22, name: 'Pre-on colour', kind: 'color' }, { n: 23, name: 'Pre-on option', kind: 'option' }, { n: 24, name: 'Pre-on size', kind: 'size' },
  { n: 25, name: 'Retraction option', kind: 'option' }, { n: 26, name: 'Retraction time', kind: 'time' }, { n: 27, name: 'Retraction delay', kind: 'time' },
  { n: 28, name: 'Retraction colour', kind: 'color' }, { n: 29, name: 'Retraction cool-down', kind: 'option' }, { n: 30, name: 'Post-off colour', kind: 'color' },
  { n: 31, name: 'Off colour', kind: 'color' }, { n: 32, name: 'Off option', kind: 'option' }, { n: 33, name: '2nd alt colour', kind: 'color' },
  { n: 34, name: '3rd alt colour', kind: 'color' }, { n: 35, name: '2nd style option', kind: 'option' }, { n: 36, name: '3rd style option', kind: 'option' },
  { n: 37, name: 'Ignition bend', kind: 'option' }, { n: 38, name: 'Retraction bend', kind: 'option' },
];

/** Names the enum in styles/edit_mode.h gives each argument number. */
const ARG_NAMES: Record<string, number> = {
  BASE_COLOR_ARG: 1, ALT_COLOR_ARG: 2, STYLE_OPTION_ARG: 3, IGNITION_OPTION_ARG: 4, IGNITION_TIME_ARG: 5, IGNITION_DELAY_ARG: 6,
  IGNITION_COLOR_ARG: 7, IGNITION_POWER_UP_ARG: 8, BLAST_COLOR_ARG: 9, CLASH_COLOR_ARG: 10, LOCKUP_COLOR_ARG: 11, LOCKUP_POSITION_ARG: 12,
  DRAG_COLOR_ARG: 13, DRAG_SIZE_ARG: 14, LB_COLOR_ARG: 15, STAB_COLOR_ARG: 16, MELT_SIZE_ARG: 17, SWING_COLOR_ARG: 18, SWING_OPTION_ARG: 19,
  EMITTER_COLOR_ARG: 20, EMITTER_SIZE_ARG: 21, PREON_COLOR_ARG: 22, PREON_OPTION_ARG: 23, PREON_SIZE_ARG: 24, RETRACTION_OPTION_ARG: 25,
  RETRACTION_TIME_ARG: 26, RETRACTION_DELAY_ARG: 27, RETRACTION_COLOR_ARG: 28, RETRACTION_COOL_DOWN_ARG: 29, POSTOFF_COLOR_ARG: 30,
  OFF_COLOR_ARG: 31, OFF_OPTION_ARG: 32, ALT_COLOR2_ARG: 33, ALT_COLOR3_ARG: 34, STYLE_OPTION2_ARG: 35, STYLE_OPTION3_ARG: 36,
  IGNITION_OPTION2_ARG: 37, RETRACTION_OPTION2_ARG: 38,
};

export function argInfo(n: number): StyleArgInfo {
  return STANDARD_ARGS[n - 1] ?? { n, name: `Argument ${n}`, kind: 'option' };
}

/** A look as Hiltwright stores it: something it can compile into a preset slot. */
export interface LookDef {
  /** Stable id, letters/digits/underscore. Starter ids begin with `hw_`. */
  id: string;
  name: string;
  source: 'starter' | 'pasted';
  /** Attribution shown in the gallery ("Fett263", "you"). */
  by: string;
  /** The `StylePtr<...>()` expression (or any expression yielding a StyleFactory*) placed in the preset slot. */
  code: string;
  /** Copyright / library header kept verbatim above the style, as the library's licence asks. */
  header: string | null;
  /** Blade roles the look suits. */
  roles: BladeRole[];
  /** Argument numbers the look reads at runtime, ascending. */
  args: number[];
  /** Hex colour used for the gallery preview; the compiled default when known. */
  preview: string;
  description: string;
  /** Compiled default per colour argument, as hex, where the code makes it plain. */
  defaults?: Record<number, string>;
}

export const STARTER_LOOKS: readonly LookDef[] = [
  {
    id: 'hw_blade', name: 'Hiltwright Blade', source: 'starter', by: 'Hiltwright', code: 'StylePtr<HwBlade>()', header: null,
    roles: ['main', 'side'], args: [1, 9, 10, 11], preview: '#2255ff', defaults: { 1: '#0000ff', 9: '#ffffff', 10: '#ffffff', 11: '#ffffff' },
    description: 'A steady blade with blast, clash and lockup flashes. Every colour is yours to change live.',
  },
  {
    id: 'hw_accent', name: 'Hiltwright Accent', source: 'starter', by: 'Hiltwright', code: 'StylePtr<HwAccent>()', header: null,
    roles: ['crystal', 'accent'], args: [1], preview: '#2255ff', defaults: { 1: '#0000ff' },
    description: 'Follows the base colour and fades in and out with the blade. For crystals and accent LEDs.',
  },
  {
    id: 'hw_motor', name: 'Motor on while ignited', source: 'starter', by: 'Hiltwright', code: 'StylePtr<HwMotor>()', header: null,
    roles: ['motor'], args: [], preview: '#ffffff',
    description: 'Runs the motor at full power while the blade is on. No colours.',
  },
];

export function starterLookFor(role: BladeRole): LookDef {
  return STARTER_LOOKS.find((l) => l.roles.includes(role)) ?? STARTER_LOOKS[0];
}

export interface StyleAnalysis {
  ok: boolean;
  problems: string[];
  /** The expression with the header comment removed. */
  expression: string;
  header: string | null;
  args: number[];
  /** Best guess at the base colour for previews, from `RgbArg<1, Rgb<r,g,b>>` or the first Rgb<> seen. */
  preview: string;
  /** Compiled default per colour argument where the code spells it out. */
  defaults: Record<number, string>;
}

const NAMED_COLORS: Record<string, string> = {
  RED: '#ff0000', GREEN: '#00ff00', BLUE: '#0000ff', YELLOW: '#ffff00', CYAN: '#00ffff', MAGENTA: '#ff00ff', WHITE: '#ffffff', BLACK: '#000000',
  Red: '#ff0000', Green: '#00ff00', Blue: '#0000ff', Yellow: '#ffff00', Cyan: '#00ffff', Magenta: '#ff00ff', White: '#ffffff', Black: '#000000',
  Orange: '#ff8000', DeepSkyBlue: '#00bfff', DodgerBlue: '#1e90ff', Azure: '#0080ff', Purple: '#800080', Pink: '#ffc0cb', LightSkyBlue: '#87cefa',
  ORANGE: '#ff8000', PURPLE: '#800080', PINK: '#ffc0cb', Amber: '#ffbf00', Gold: '#ffd700', Ivory: '#fffff0', Rgb16: '#ffffff', Tomato: '#ff6347',
  SteelBlue: '#4682b4', Crimson: '#dc143c', DarkOrange: '#ff8c00', Lime: '#00ff00', Coral: '#ff7f50', Turquoise: '#40e0d0', Violet: '#ee82ee',
  Indigo: '#4b0082', ElectricPurple: '#bf00ff', Moccasin: '#ffe4b5', NavajoWhite: '#ffdead', LemonChiffon: '#fffacd', Sienna: '#a0522d',
};

/**
 * Analyse pasted style code (typically from the Fett263 style library). Splits off the leading comment header,
 * finds the runtime arguments the style reads, and checks the shape is something a preset slot can hold.
 */
export function analyzeStyleCode(input: string): StyleAnalysis {
  const problems: string[] = [];
  let text = input.replace(/\r\n?/g, '\n').trim();
  // Leading comments (block or line) are the library's attribution header; keep them, but out of the expression.
  const headerLines: string[] = [];
  for (;;) {
    const block = /^\/\*[\s\S]*?\*\/\s*/.exec(text);
    if (block) { headerLines.push(block[0].trim()); text = text.slice(block[0].length); continue; }
    const line = /^\/\/[^\n]*\n?/.exec(text);
    if (line) { headerLines.push(line[0].trim()); text = text.slice(line[0].length); continue; }
    break;
  }
  text = text.trim().replace(/,\s*$/, '');
  if (!text) problems.push('No style code found.');
  else if (!/^(StylePtr|StyleNormalPtr|StyleFirePtr|StyleRainbowPtr|StyleStrobePtr|StyleNormalPtrX|StyleRainbowPtrX|StyleFirePtrX|StyleStrobePtrX|Style\w+Ptr\w*)\s*</.test(text) && !/^&\w+/.test(text)) {
    problems.push('Expected a style expression such as StylePtr<...>() as the Fett263 library produces.');
  }
  if (/^StylePtr</.test(text) && !/\)\s*$/.test(text)) problems.push('The expression should end with () after the closing >.');
  const depth = (text.match(/</g) ?? []).length - (text.match(/>/g) ?? []).length;
  if (depth !== 0) problems.push(`Unbalanced angle brackets (${depth > 0 ? 'missing >' : 'extra >'}).`);
  if (/^\s*(#include|#define|#ifdef|using\s)/m.test(text)) problems.push('Only the style expression belongs here, not preprocessor lines or type aliases.');

  const args = new Set<number>();
  const re = /\b(?:RgbArg|IntArg|Int32Arg|PercentArg|TimeArg|ColorArg|OptionArg|StyleOption)\s*<\s*([A-Z0-9_]+|\d+)\s*,/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ARG_NAMES[m[1]];
    if (n) args.add(n);
  }
  // Fett263 aliases that hide the argument inside a helper.
  if (/\bIgnitionTime\b/.test(text)) args.add(5);
  if (/\bRetractionTime\b/.test(text)) args.add(26);

  // Defaults per colour argument: RgbArg<N, Rgb<r,g,b>> or RgbArg<N, NamedColour>.
  const defaults: Record<number, string> = {};
  const dre = /\bRgbArg\s*<\s*([A-Z0-9_]+|\d+)\s*,\s*(?:Rgb\s*<\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*>|([A-Za-z]\w*))\s*>/g;
  for (let m = dre.exec(text); m; m = dre.exec(text)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ARG_NAMES[m[1]];
    if (!n || defaults[n]) continue;
    if (m[2] !== undefined) defaults[n] = rgb8ToHex(Number(m[2]), Number(m[3]), Number(m[4]));
    else if (m[5] && NAMED_COLORS[m[5]]) defaults[n] = NAMED_COLORS[m[5]];
  }
  let preview = '#ffffff';
  const base = /RgbArg\s*<\s*(?:BASE_COLOR_ARG|1)\s*,\s*([A-Za-z0-9_]+)(?:\s*<\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*>)?/.exec(text) ?? /\bRgb\s*<\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*>/.exec(text);
  if (base) {
    if (base.length === 5 && base[2] !== undefined) preview = rgb8ToHex(Number(base[2]), Number(base[3]), Number(base[4]));
    else if (base.length === 5 && NAMED_COLORS[base[1]]) preview = NAMED_COLORS[base[1]];
    else if (base.length === 4) preview = rgb8ToHex(Number(base[1]), Number(base[2]), Number(base[3]));
  }
  return { ok: problems.length === 0, problems, expression: text, header: headerLines.length ? headerLines.join('\n') : null, args: [...args].sort((a, b) => a - b), preview: defaults[1] ?? preview, defaults };
}

function rgb8ToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Runtime arguments of a `builtin P B args...` string as a map of argument number → word. `~` and missing = default. */
export function parseStyleArgs(args: string | null | undefined): Map<number, string> {
  const out = new Map<number, string>();
  if (!args) return out;
  args.trim().split(/\s+/).forEach((w, i) => { if (w && w !== '~') out.set(i + 1, w); });
  return out;
}

/** Inverse of parseStyleArgs: words up to the highest set argument, `~` for gaps. Empty when nothing is set. */
export function formatStyleArgs(map: Map<number, string>): string {
  let max = 0;
  for (const [n, v] of map) if (v && v !== '~' && n > max) max = n;
  if (!max) return '';
  const words: string[] = [];
  for (let n = 1; n <= max; n++) { const v = map.get(n); words.push(v && v !== '~' ? v : '~'); }
  return words.join(' ');
}

/** "65535,0,0" (16-bit per channel as ProffieOS prints) → "#ff0000". 8-bit triples are accepted too. */
export function colorWordToHex(word: string): string | null {
  const m = /^(\d+),(\d+),(\d+)$/.exec(word.trim());
  if (!m) return null;
  const vals = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wide = vals.some((v) => v > 255);
  return rgb8ToHex(...(vals.map((v) => (wide ? Math.round(v / 257) : v)) as [number, number, number]));
}

/** "#ff0000" → "65535,0,0". */
export function hexToColorWord(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return '0,0,0';
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) * 257).join(',');
}

/** What a build compiled: which look sits in which preset slot. Stored per saber after a successful install. */
export interface FirmwareManifest {
  hash: string;
  os: string;
  at: string;
  looks: { id: string; name: string; args: number[]; defaults?: Record<number, string> }[];
  /** Per preset, the look id compiled into each blade slot (index 0 = blade 1). */
  presets: { name: string; looks: string[] }[];
}

/** Where a look is compiled: every (preset, blade) slot holding it, as 0-based preset and 1-based blade. */
export function lookSlots(manifest: FirmwareManifest, lookId: string): { preset: number; blade: number }[] {
  const out: { preset: number; blade: number }[] = [];
  manifest.presets.forEach((p, pi) => p.looks.forEach((id, bi) => { if (id === lookId) out.push({ preset: pi, blade: bi + 1 }); }));
  return out;
}

/** The look compiled into a `builtin P B` slot, if the manifest knows it. */
export function lookAtSlot(manifest: FirmwareManifest, preset: number, blade: number): FirmwareManifest['looks'][number] | null {
  const id = manifest.presets[preset]?.looks[blade - 1];
  return id ? manifest.looks.find((l) => l.id === id) ?? null : null;
}
