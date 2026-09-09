// SD card service: find a ProffieOS card in a card reader, list and check its fonts and tracks, copy fonts in.
// The card is any mounted volume with the ProffieOS layout (font folders with hum sounds, a tracks folder, presets.ini).

import { execFile } from 'node:child_process';
import { cp, open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { checkFont, classifySound, parseWavHeader, type FontFile, type FontReport } from '@hiltwright/core';

export interface CardInfo {
  root: string;
  label: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  /** Looks like a ProffieOS card: has presets.ini or at least one font folder. */
  proffie: boolean;
  hasPresetsIni: boolean;
}

export interface FontEntry {
  name: string;
  path: string;
  report: FontReport;
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** Candidate roots: removable volumes on Windows, /Volumes and /media elsewhere, plus an override for development. */
async function candidateRoots(): Promise<{ root: string; label: string | null; free: number | null; total: number | null }[]> {
  const override = process.env.HILTWRIGHT_SD_ROOT;
  if (override) return [{ root: override, label: 'dev override', free: null, total: null }];
  if (process.platform === 'win32') {
    const script = `Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object DeviceID, VolumeName, FreeSpace, Size | ConvertTo-Json`;
    const out = await new Promise<string>((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout)));
    try {
      const parsed = JSON.parse(out || '[]') as { DeviceID: string; VolumeName: string; FreeSpace: number; Size: number } | { DeviceID: string; VolumeName: string; FreeSpace: number; Size: number }[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.filter((d) => d.DeviceID).map((d) => ({ root: `${d.DeviceID}\\`, label: d.VolumeName || null, free: Number(d.FreeSpace) || null, total: Number(d.Size) || null }));
    } catch { return []; }
  }
  const bases = process.platform === 'darwin' ? ['/Volumes'] : ['/media', '/run/media', '/mnt'];
  const out: { root: string; label: string | null; free: number | null; total: number | null }[] = [];
  for (const b of bases) {
    try { for (const name of await readdir(b)) out.push({ root: join(b, name), label: name, free: null, total: null }); } catch { /* not present */ }
  }
  return out;
}

async function looksLikeFont(dir: string): Promise<boolean> {
  try {
    const names = await readdir(dir);
    return names.some((n) => /^(hum\d*|font\d*|out\d*|poweron\d*)\.wav$/i.test(n));
  } catch { return false; }
}

export async function locateCards(): Promise<CardInfo[]> {
  const out: CardInfo[] = [];
  for (const c of await candidateRoots()) {
    if (!(await isDir(c.root))) continue;
    const hasPresetsIni = await exists(join(c.root, 'presets.ini')) || await exists(join(c.root, 'presets.tmp'));
    let fontDirs = 0;
    try {
      for (const name of await readdir(c.root)) {
        if (name.startsWith('.') || name.toLowerCase() === 'tracks') continue;
        const p = join(c.root, name);
        if (await isDir(p) && await looksLikeFont(p)) { fontDirs++; if (fontDirs >= 1) break; }
      }
    } catch { /* unreadable */ }
    out.push({ root: c.root, label: c.label, freeBytes: c.free, totalBytes: c.total, proffie: hasPresetsIni || fontDirs > 0, hasPresetsIni });
  }
  return out;
}

async function readFontFiles(dir: string): Promise<FontFile[]> {
  const files: FontFile[] = [];
  for (const name of await readdir(dir)) {
    if (!/\.wav$/i.test(name)) continue;
    const p = join(dir, name);
    const s = await stat(p);
    if (!s.isFile()) continue;
    let wav = null;
    try {
      const fh = await open(p, 'r');
      try {
        const buf = new Uint8Array(256);
        const { bytesRead } = await fh.read(buf, 0, 256, 0);
        wav = parseWavHeader(buf.subarray(0, bytesRead));
      } finally { await fh.close(); }
    } catch { /* unreadable file */ }
    files.push({ name, size: s.size, wav });
  }
  return files;
}

export async function checkFontDir(dir: string): Promise<FontEntry> {
  const files = await readFontFiles(dir);
  return { name: basename(dir), path: dir, report: checkFont(files) };
}

export async function listFonts(root: string): Promise<FontEntry[]> {
  const out: FontEntry[] = [];
  for (const name of (await readdir(root)).sort((a, b) => a.localeCompare(b))) {
    if (name.startsWith('.') || name.startsWith('$') || /^(tracks|system volume information)$/i.test(name)) continue;
    const p = join(root, name);
    if (!(await isDir(p)) || !(await looksLikeFont(p))) continue;
    out.push(await checkFontDir(p));
  }
  return out;
}

export async function listTracks(root: string): Promise<{ name: string; size: number }[]> {
  const dir = join(root, 'tracks');
  if (!(await isDir(dir))) return [];
  const out: { name: string; size: number }[] = [];
  for (const name of await readdir(dir)) {
    if (!/\.wav$/i.test(name)) continue;
    out.push({ name: `tracks/${name}`, size: (await stat(join(dir, name))).size });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Copy a font folder onto the card. Refuses to overwrite an existing folder unless `replace` is set. */
export async function copyFont(src: string, root: string, replace = false): Promise<FontEntry> {
  const name = basename(src);
  if (!/^[^\\/:*?"<>|]+$/.test(name)) throw new Error('Font folder name is not valid on an SD card');
  const dst = join(root, name);
  if (!replace && await exists(dst)) throw new Error(`${name} is already on the card`);
  await cp(src, dst, { recursive: true, force: replace, errorOnExist: !replace });
  return checkFontDir(dst);
}

export function soundKind(fileName: string): string {
  return classifySound(fileName).kind;
}
