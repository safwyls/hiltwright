// SD card service: find a ProffieOS card in a card reader, list and check its fonts and tracks, copy fonts in.
// The card is any mounted volume with the ProffieOS layout (font folders with hum sounds, a tracks folder, presets.ini).

import { execFile } from 'node:child_process';
import { cp, open, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { checkFont, classifySound, hasMenuSounds, parseVoicePackIni, parseWavHeader, type FontFile, type FontReport, type VoicePackStatus } from '@hiltwright/core';

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

/**
 * ProffieOS reads a font's sounds either flat (`hum01.wav` in the font folder) or from one subfolder per effect
 * (`hum/hum01.wav`, or `hum/001.wav`). Many fonts use the second, so both count.
 */
const CORE_SOUND = /^(hum\d*|font\d*|out\d*|poweron\d*|in\d*)\.wav$/i;
const CORE_FOLDER = /^(hum|font|out|poweron|in)$/i;
async function looksLikeFont(dir: string): Promise<boolean> {
  try {
    const names = await readdir(dir);
    if (names.some((n) => CORE_SOUND.test(n))) return true;
    for (const n of names) {
      if (!CORE_FOLDER.test(n)) continue;
      try { if ((await readdir(join(dir, n))).some((f) => /\.wav$/i.test(f))) return true; } catch { /* not a folder */ }
    }
    return false;
  } catch { return false; }
}

/**
 * Ask the OS to eject the volume at `root`: flushes any writes Windows is still holding and dismounts it, the same
 * as "Safely remove". Done before the saber is told to take its card back, otherwise a half-written font is lost.
 */
export async function ejectVolume(root: string): Promise<{ ok: boolean; detail: string }> {
  if (process.platform === 'win32') {
    const letter = root.replace(/[\\/]+$/, '');
    if (!/^[A-Za-z]:$/.test(letter)) return { ok: false, detail: `Not a drive letter: ${root}` };
    const script = `$sh = New-Object -ComObject Shell.Application; $v = $sh.NameSpace(17).ParseName('${letter}'); if ($v -eq $null) { 'gone' } else { $v.InvokeVerb('Eject'); Start-Sleep -Milliseconds 1500; if (Test-Path '${letter}\\') { 'still-there' } else { 'ejected' } }`;
    const out = await new Promise<string>((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true }, (err, stdout) => resolve(err ? `error ${String(err)}` : String(stdout).trim())));
    if (out === 'ejected' || out === 'gone') return { ok: true, detail: out };
    return { ok: false, detail: out === 'still-there' ? 'Windows did not release the drive. Close any window or program that has files on it open, then try again.' : out };
  }
  const cmd = process.platform === 'darwin' ? ['diskutil', ['eject', root]] as const : ['udisksctl', ['unmount', '-b', root]] as const;
  const out = await new Promise<string>((resolve) => execFile(cmd[0], [...cmd[1]], { timeout: 15000 }, (err, stdout, stderr) => resolve(err ? `error ${String(stderr || err)}` : 'ejected')));
  return { ok: out === 'ejected', detail: out };
}

/** The sounds a listen needs. Everything else in a font (tracks, ini files, quotes) stays on the card. */
const PLAYABLE = /^(hum|humm|out|poweron|in|poweroff|clsh|clash|blst|blaster|stab|force|font|boot|lock|lockup|bgnlock|endlock|drag|bgndrag|enddrag|lb|bgnlb|endlb|swingl|swingh|lswing|hswing|swng|swing)$/i;
const FONT_BYTES_CAP = 120 * 1024 * 1024;

export interface FontSounds { name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string>; bytes: number; skipped: number }

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line); if (m) out[m[1]] = m[2]; }
  return out;
}

/**
 * Every playable wav in a font folder, flat or one folder per sound, keyed by its path within the font. Reading
 * over the saber's USB link is slow, so `onFile` reports each one as it lands.
 */
export async function readFontSounds(fontDir: string, onFile?: (name: string, done: number, total: number) => void): Promise<FontSounds> {
  const wanted: { key: string; p: string }[] = [];
  for (const name of await readdir(fontDir)) {
    const p = join(fontDir, name);
    const m = /^([a-z]+)\d*\.wav$/i.exec(name);
    if (m) { if (PLAYABLE.test(m[1])) wanted.push({ key: name, p }); continue; }
    if (name.startsWith('.') || !PLAYABLE.test(name) || !(await isDir(p))) continue;
    try { for (const f of await readdir(p)) if (/\.wav$/i.test(f)) wanted.push({ key: `${name}/${f}`, p: join(p, f) }); } catch { /* unreadable */ }
  }
  const files: Record<string, ArrayBuffer> = {};
  let bytes = 0; let skipped = 0; let done = 0;
  for (const w of wanted) {
    try {
      const s = await stat(w.p);
      if (bytes + s.size > FONT_BYTES_CAP) { skipped++; continue; }
      const buf = await readFile(w.p);
      files[w.key] = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      bytes += s.size;
    } catch { skipped++; }
    onFile?.(w.key, ++done, wanted.length);
  }
  const readIni = async (n: string) => { try { return parseIni(await readFile(join(fontDir, n), 'utf8')); } catch { return {}; } };
  return { name: basename(fontDir), files, ini: await readIni('config.ini'), smoothsw: await readIni('smoothsw.ini'), bytes, skipped };
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

/** The font's wavs: those in the folder itself, and those one level down in an effect's subfolder. */
async function readFontFiles(dir: string): Promise<FontFile[]> {
  const files: FontFile[] = [];
  const entries: { name: string; p: string }[] = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if (/\.wav$/i.test(name)) { entries.push({ name, p }); continue; }
    if (name.startsWith('.') || !(await isDir(p))) continue;
    // A subfolder's files are named for the folder so the checker sees `hum/001.wav` as a hum: ProffieOS does the same.
    try { for (const f of await readdir(p)) if (/\.wav$/i.test(f)) entries.push({ name: /^\d+\.wav$/i.test(f) ? `${name}${f}` : f, p: join(p, f) }); } catch { /* unreadable */ }
  }
  for (const { name, p } of entries) {
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

/** The Fett263 voice pack in the card's common folder: voicepack.ini and the menu number sounds. */
export async function readVoicePack(root: string): Promise<VoicePackStatus> {
  const common = join(root, 'common');
  let text: string | null = null;
  try { text = await readFile(join(common, 'voicepack.ini'), 'utf8'); } catch { /* no file */ }
  let names: string[] = [];
  try { names = await readdir(common); } catch { /* no common folder */ }
  return { ...parseVoicePackIni(text), menuSounds: hasMenuSounds(names) };
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
