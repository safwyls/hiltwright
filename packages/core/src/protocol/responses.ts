// Parsers for the simple query commands. Each takes the lines the client collected for one command.

import { isNoise, isWhut } from './lines';

export interface VersionInfo {
  /** First line: `v7.8` on OS 7, or the `$Id: ...$` line on OS 8. */
  version: string;
  config: string | null;
  prop: string | null;
  buttons: number | null;
  installed: string | null;
  /** Major version parsed from the version line when possible. */
  major: number | null;
}

export function parseVersion(lines: string[]): VersionInfo | null {
  const ls = lines.filter((l) => l.trim() && !isNoise(l));
  if (!ls.length || isWhut(ls[0])) return null;
  // The board may print an unsolicited line (a battery reading on connect, for one) ahead of the version string.
  const start = ls.findIndex((l) => /^v\d+\.\d+/.test(l.trim()) || /\$Id/.test(l));
  if (start < 0) return null;
  const info: VersionInfo = { version: ls[start].trim(), config: null, prop: null, buttons: null, installed: null, major: null };
  const v = /v(\d+)\.(\d+)/.exec(info.version);
  if (v) info.major = Number(v[1]);
  // OS 8 source ships with a git keyword as its version string ("$Id: <sha> $"); show the short hash instead.
  const id = /^\$Id:\s*([0-9a-f]{7})[0-9a-f]*\s*\$$/.exec(info.version);
  if (id) info.version = `git-${id[1]}`;
  for (const l of ls.slice(start + 1)) {
    let m: RegExpExecArray | null;
    if ((m = /^(config\/\S+)$/.exec(l.trim()))) info.config = m[1];
    else if ((m = /^prop:\s*(.+)$/.exec(l))) info.prop = m[1].trim();
    else if ((m = /^buttons:\s*(\d+)$/.exec(l))) info.buttons = Number(m[1]);
    else if ((m = /^installed:\s*(.+)$/.exec(l))) info.installed = m[1].trim();
  }
  return info;
}

export function parseBattery(lines: string[]): number | null {
  for (const l of lines) {
    const m = /^Battery voltage:\s*([\d.]+)/.exec(l);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Commands that answer with a single integer: get_volume, get_preset, get_variation. */
export function parseInteger(lines: string[]): number | null {
  for (const l of lines) {
    if (isNoise(l) || isWhut(l)) continue;
    const m = /^-?\d+$/.exec(l.trim());
    if (m) return Number(m[0]);
  }
  return null;
}

/** `id` prints `ID: 916.00`, the measured Blade ID resistance in ohms. */
export function parseId(lines: string[]): number | null {
  for (const l of lines) {
    // 7.8 `id` prints "ID: 916.00"; 8.10 has no `id` and `scanid` prints "BLADE ID: 916.00".
    const m = /^(?:BLADE )?ID:\s*([\d.]+)/.exec(l);
    if (m) return Number(m[1]);
  }
  return null;
}

/** list_fonts and list_tracks print one entry per line, then the SD unmount notice. */
export function parseList(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l && !isNoise(l) && !isWhut(l));
}

export interface ScanIdInfo {
  /** Index of the BladeConfig row the board selected. */
  bladeConfig: number | null;
  /** Pixel counts of the WS2811-style blades it reported, in blade order. */
  pixelBlades: number[];
}

/** `scanid` re-runs blade detection and prints `blade = N` plus one `WS2811 Blade with N leds.` per pixel blade. */
export function parseScanId(lines: string[]): ScanIdInfo {
  const info: ScanIdInfo = { bladeConfig: null, pixelBlades: [] };
  for (const l of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^blade = (\d+)$/.exec(l))) info.bladeConfig = Number(m[1]);
    else if ((m = /^WS2811 Blade with (\d+) leds\.$/.exec(l))) info.pixelBlades.push(Number(m[1]));
  }
  return info;
}

/** True when the board rejected the command (`Whut? :cmd`). Older or trimmed firmware lacks many commands. */
export function wasRejected(lines: string[]): boolean {
  return lines.some(isWhut);
}
