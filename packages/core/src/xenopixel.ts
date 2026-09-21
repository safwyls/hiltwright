// Xenopixel (XENO3) SD cards: numbered font folders, each with a `fontconfig.ini` and sounds named `hum (1).wav`.
// This reads that layout and plans its conversion to a ProffieOS font folder. Facts about the format come from the
// vendors' setting guides (one line `Name=(R,G,B),A,B,C,D,E,F,G,H`, colours 0-255) and from the name differences
// published with NoSloppy's SoundFontNamingConverter (blaster/blst, clash/clsh, swing/swng, begin*/bgn*, ...).

export interface XenoFontConfig {
  /** Display name: the text before `=`. */
  name: string;
  /** Blade colour, 0-255 per channel. */
  color: { r: number; g: number; b: number };
  /** A: blade effect. 0 fire, 1 steady, 2 unstable, 3 rainbow, 4 candy, 5 crack, 6 pulse, 7 flashing. */
  bladeEffect: number | null;
  /** F: blade style. 0 standard, 1 velocity, 2 torch, 3 blaster mode, 4 ghost, 5+ special pre-ons. */
  bladeStyle: number | null;
  /** G and H: ignition and retraction speed, in the board's own units (defaults 200 and 500; higher is slower). */
  ignitionSpeed: number | null;
  retractionSpeed: number | null;
  /** All eight numbers after the colour, as written. */
  raw: number[];
}

export const XENO_BLADE_EFFECTS = ['Fire', 'Steady', 'Unstable', 'Rainbow', 'Candy', 'Crack', 'Pulse', 'Flashing'] as const;

/** Parse the first config line of a fontconfig.ini. Null when no line has the `Name=(R,G,B),...` shape. */
export function parseXenoFontConfig(text: string): XenoFontConfig | null {
  for (const rawLine of text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim().replace(/^"|"$/g, '');
    const m = /^(.*?)\s*=\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*((?:,\s*-?\d+\s*)*)$/.exec(line);
    if (!m) continue;
    const clamp = (v: string) => Math.max(0, Math.min(255, Number(v)));
    const raw = m[5].split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    return {
      name: m[1].trim(),
      color: { r: clamp(m[2]), g: clamp(m[3]), b: clamp(m[4]) },
      bladeEffect: raw[0] ?? null,
      bladeStyle: raw[5] ?? null,
      ignitionSpeed: raw[6] ?? null,
      retractionSpeed: raw[7] ?? null,
      raw,
    };
  }
  return null;
}

/** Xenopixel sound names that differ from ProffieOS's. Everything else (hum, in, out, lock, drag, melt, stab, spin, font, preon, ...) is shared. */
const XENO_TO_PROFFIE: Record<string, string> = {
  blaster: 'blst', clash: 'clsh', swing: 'swng', begindrag: 'bgndrag', beginlock: 'bgnlock', beginmelt: 'bgnmelt',
  postoff: 'pstoff', beginlightingblock: 'bgnlb', endlightingblock: 'endlb', lightingblock: 'lb', poweron: 'boot',
};

export interface XenoFileMove { from: string; to: string }
export interface XenoFontPlan {
  moves: XenoFileMove[];
  /** Files left behind on purpose (the config, non-audio clutter). */
  skipped: string[];
  tracks: number;
  sounds: number;
}

/**
 * Plan the copy of one Xenopixel font folder into a ProffieOS font folder. `hum (1).wav` becomes `hum01.wav`,
 * differing effect names are translated, and music (`track (1).wav`) goes to a `tracks` subfolder.
 */
export function planXenoFont(fileNames: string[]): XenoFontPlan {
  const moves: XenoFileMove[] = [];
  const skipped: string[] = [];
  const taken = new Set<string>();
  let tracks = 0;
  let sounds = 0;
  const sorted = [...fileNames].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const from of sorted) {
    const m = /^(.*?)(?:\s*\((\d+)\))?\.wav$/i.exec(from);
    if (!m) { skipped.push(from); continue; }
    const base = m[1].trim().toLowerCase().replace(/\s+/g, '');
    const n = m[2] ? Number(m[2]) : 1;
    if (base === 'track' || base === 'tracks' || base === 'music') {
      let to = `tracks/track${String(n).padStart(2, '0')}.wav`;
      while (taken.has(to)) to = `tracks/track${String(++tracks + 50).padStart(2, '0')}.wav`;
      taken.add(to); moves.push({ from, to }); tracks++;
      continue;
    }
    const name = XENO_TO_PROFFIE[base] ?? base;
    let k = n;
    let to = `${name}${String(k).padStart(2, '0')}.wav`;
    while (taken.has(to)) to = `${name}${String(++k).padStart(2, '0')}.wav`;
    taken.add(to); moves.push({ from, to }); sounds++;
  }
  return { moves, skipped, tracks, sounds };
}

/** A folder name that is safe on a FAT card and in a ProffieOS font path (no separators, `;` or `,`). */
export function proffieFolderName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|;,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned || fallback;
}

/** 0-255 colour as the 16-bit `r,g,b` word ProffieOS style arguments use, and as hex for swatches. */
export function xenoColorWord(c: { r: number; g: number; b: number }): string {
  return [c.r, c.g, c.b].map((v) => v * 257).join(',');
}
export function xenoColorHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
