// SD card service: find a ProffieOS card in a card reader, list and check its fonts and tracks, copy fonts in.
// The card is any mounted volume with the ProffieOS layout (font folders with hum sounds, a tracks folder, presets.ini).

import { execFile } from 'node:child_process';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { WAV_HEADER_BYTES, checkFontListing, classifySound, hasMenuSounds, mixedSounds, parsePresetsIni, parseVoicePackIni, type FontListingEntry, type FontReport, type PresetRecord, type VoicePackStatus } from '@hiltwright/core';

export interface CardInfo {
  root: string;
  label: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  /** Looks like a ProffieOS card: has presets.ini or at least one font folder. */
  proffie: boolean;
  hasPresetsIni: boolean;
  /** The USB serial of the Proffieboard this drive belongs to: the saber is sharing its own card (card-safety D3). */
  saberSerial: string | null;
  /** The file system Windows reports for the card (FAT32, exFAT, NTFS...), or null when it does not say. */
  fileSystem: string | null;
  /** Nothing on it but the system's own files: a blank card fonts can be copied onto (card-safety 2.4). */
  empty: boolean;
  /** The volume serial number Windows reports, unchanged until the card is formatted: how a saber knows its card. */
  volumeSerial: string | null;
  /** The volume in that drive when it was looked at (volumeId): checked again before every write to it (issue #9). */
  volumeId: string | null;
  /** The font and name of each preset in its presets.ini, or null when it has none. */
  presets: { font: string; name: string }[] | null;
  /** How many times this app has written to it since it started (copies, the voice pack, presets removed). */
  writes: number;
}

/** Names Windows and macOS put on a card by themselves, which do not make it anything but empty. */
const SYSTEM_ENTRY = /^(system volume information|\$recycle\.bin|\..*)$/i;
/** Whether a card's top level has nothing but the system's own entries. */
export function isEmptyCard(names: string[]): boolean {
  return names.every((n) => SYSTEM_ENTRY.test(n));
}

export interface FontEntry {
  name: string;
  path: string;
  report: FontReport;
}

/**
 * How many times this app has written to each card since it started, by drive root. The page keeps what it last read
 * from a card while this, the card's serial number and its free space are unchanged, so it need not read it again.
 */
const written = new Map<string, number>();
const rootKey = (root: string) => root.replace(/[\\/]+$/, '').toLowerCase();
export function noteCardWritten(root: string): void { const k = rootKey(root); written.set(k, (written.get(k) ?? 0) + 1); }
export function cardWrites(root: string): number { return written.get(rootKey(root)) ?? 0; }

export async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

export async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/**
 * Which volume is in the drive at `root` now, as 8 or more hex digits; null when it does not open. On Windows this is
 * the volume serial number (what `vol E:` shows), so a different card put in the same reader reads differently;
 * elsewhere it is the device number of the mount. Both sides of the check (the look, and just before a write) read
 * it the same way, so they cannot disagree about one card.
 */
export async function volumeId(root: string): Promise<string | null> {
  try { return (await stat(root, { bigint: true })).dev.toString(16).toUpperCase().padStart(8, '0'); } catch { return null; }
}

/** "E:" for a Windows drive root, else the path as it is: how a card is named in a message. */
export const driveName = (root: string) => (/^[A-Za-z]:[\\/]?$/.test(root) ? root.slice(0, 2).toUpperCase() : root);

/**
 * Refuse a write when the drive at `root` holds a different volume from the one the page read (`want`), or none, or
 * when what was read is not known: a card swapped in the same reader must not get another saber's fonts or lose its
 * presets file (issue #9).
 */
export async function checkSameCard(root: string, want: string | null): Promise<void> {
  const now = await volumeId(root);
  if (!want || now !== want) {
    console.log(`[sd] ${root}: the volume is ${now ?? 'gone'}, the look saw ${want ?? 'nothing known'}; write refused`);
    throw new Error(`The card in ${driveName(root)} is not the one Hiltwright read. Look again.`);
  }
}

type Candidate = { root: string; label: string | null; free: number | null; total: number | null; saberSerial: string | null; fileSystem: string | null; volumeSerial: string | null };

/**
 * Windows' removable drives, each followed through its partition and disk drive up the PnP tree. A drive whose
 * ancestors include `USB\VID_1209&PID_6668\<serial>` is a Proffieboard sharing its own card (card-safety D3).
 */
const DRIVES_SCRIPT = [
  '$out = @()',
  'foreach ($ld in Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }) {',
  '  $owner = $null',
  '  try {',
  '    $disk = Get-CimAssociatedInstance -InputObject $ld -ResultClassName Win32_DiskPartition | ForEach-Object { Get-CimAssociatedInstance -InputObject $_ -ResultClassName Win32_DiskDrive } | Select-Object -First 1',
  '    $id = $disk.PNPDeviceID',
  '    for ($i = 0; $i -lt 4 -and $id; $i++) {',
  "      if ($id -match '^USB\\\\VID_1209&PID_6668\\\\([^\\\\]+)$') { $owner = $Matches[1]; break }",
  '      $id = (Get-PnpDeviceProperty -InstanceId $id -KeyName DEVPKEY_Device_Parent -ErrorAction Stop).Data',
  '    }',
  '  } catch {}',
  '  $out += [pscustomobject]@{ DeviceID = $ld.DeviceID; VolumeName = $ld.VolumeName; FreeSpace = $ld.FreeSpace; Size = $ld.Size; FileSystem = $ld.FileSystem; VolumeSerial = $ld.VolumeSerialNumber; Owner = $owner }',
  '}',
  'ConvertTo-Json -InputObject @($out)',
].join('\n');

/** The drive list the script prints: one object or a list, with the Proffieboard serial each drive belongs to, if any. */
export function parseRemovableDrives(stdout: string): Candidate[] {
  try {
    const parsed = JSON.parse(stdout || '[]') as unknown;
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as { DeviceID?: unknown; VolumeName?: unknown; FreeSpace?: unknown; Size?: unknown; FileSystem?: unknown; VolumeSerial?: unknown; Owner?: unknown }[];
    return list.filter((d) => d && typeof d.DeviceID === 'string' && d.DeviceID).map((d) => ({
      root: `${d.DeviceID as string}\\`,
      label: typeof d.VolumeName === 'string' && d.VolumeName ? d.VolumeName : null,
      free: Number(d.FreeSpace) || null,
      total: Number(d.Size) || null,
      fileSystem: typeof d.FileSystem === 'string' && d.FileSystem.trim() ? d.FileSystem.trim() : null,
      saberSerial: typeof d.Owner === 'string' && /^[0-9A-Za-z]+$/.test(d.Owner) ? d.Owner : null,
      volumeSerial: typeof d.VolumeSerial === 'string' && /^[0-9A-Fa-f]{8}$/.test(d.VolumeSerial) ? d.VolumeSerial.toUpperCase() : null,
    }));
  } catch { return []; }
}

/**
 * Candidate roots: removable volumes on Windows, /Volumes and /media elsewhere, plus an override for development.
 * `failed` says why the drive list could not be read (Windows did not answer in time, or the query failed), which is
 * not the same as "no drives": while a card shared over USB is being opened, Windows can be slow to answer.
 */
async function candidateRoots(): Promise<{ list: Candidate[]; failed: string | null }> {
  const override = process.env.HILTWRIGHT_SD_ROOT;
  // Dev aid: HILTWRIGHT_SD_FS names the override card's file system (for example exFAT), to see the page's warning.
  // HILTWRIGHT_SD_SERIAL gives it a volume serial number, to try linking a card to a saber.
  if (override) return { list: [{ root: override, label: 'dev override', free: null, total: null, saberSerial: null, fileSystem: process.env.HILTWRIGHT_SD_FS?.trim() || null, volumeSerial: process.env.HILTWRIGHT_SD_SERIAL?.trim().toUpperCase() || null }], failed: null };
  if (process.platform === 'win32') {
    // 15 s: while a card shared over USB is being read, Windows answers slowly. A list that did not come back is
    // reported as such, never as an empty list (2026-11-18: the V3's card took minutes to open).
    return await new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', DRIVES_SCRIPT], { timeout: DRIVE_LIST_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (!err) { resolve({ list: parseRemovableDrives(stdout), failed: null }); return; }
      const failed = driveListFailure(err);
      console.log(`[sd] the drive list failed: ${failed}: ${String(err).slice(0, 200)}`);
      resolve({ list: [], failed });
    }));
  }
  if (process.platform === 'darwin') {
    // Only volumes in a card's formats: everything under /Volumes would include the Mac's own disk.
    const text = await new Promise<string | null>((resolve) => execFile('mount', [], { timeout: DRIVE_LIST_TIMEOUT_MS }, (err, stdout) => resolve(err ? null : stdout)));
    if (text === null) return { list: [], failed: 'the drive query failed' };
    const list = parseMacMounts(text);
    for (const c of list) {
      try { const f = await statfs(c.root); c.free = Number(f.bavail) * Number(f.bsize); c.total = Number(f.blocks) * Number(f.bsize); } catch { /* sizes unknown */ }
    }
    return { list, failed: null };
  }
  const bases = ['/media', '/run/media', '/mnt'];
  const out: Candidate[] = [];
  for (const b of bases) {
    try { for (const name of await readdir(b)) out.push({ root: join(b, name), label: name, free: null, total: null, saberSerial: null, fileSystem: null, volumeSerial: null }); } catch { /* not present */ }
  }
  return { list: out, failed: null };
}

/**
 * The cards in macOS's `mount` listing: volumes under /Volumes whose file system is one a card has (FAT, shown as
 * msdos, or exFAT). A line reads `/dev/disk4s1 on /Volumes/SABER (msdos, local, nodev, nosuid, noowners)`. The Mac's
 * own disks (apfs, hfs) and network and image mounts of other kinds are left out.
 */
export function parseMacMounts(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\S+ on (\/Volumes\/.+) \(([a-z0-9_]+)[,)]/i.exec(line);
    if (!m) continue;
    const fs = m[2].toLowerCase();
    if (fs !== 'msdos' && fs !== 'exfat') continue;
    out.push({ root: m[1], label: m[1].slice('/Volumes/'.length), free: null, total: null, saberSerial: null, fileSystem: fs === 'exfat' ? 'exFAT' : 'FAT32', volumeSerial: null });
  }
  return out;
}

const DRIVE_LIST_TIMEOUT_MS = 15_000;
/** Why the drive query did not answer, in words for the log and the page. */
export function driveListFailure(err: unknown): string {
  const e = err as { killed?: boolean; signal?: unknown; code?: unknown } | null;
  if (e && (e.killed || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT')) return `Windows did not answer within ${DRIVE_LIST_TIMEOUT_MS / 1000} s`;
  return 'the drive query failed';
}

/**
 * ProffieOS reads a font's sounds either flat (`hum01.wav` in the font folder) or from one subfolder per effect
 * (`hum/hum01.wav`, or `hum/001.wav`). Many fonts use the second, so both count.
 */
const CORE_SOUND = /^(hum\d*|font\d*|out\d*|poweron\d*|in\d*)\.wav$/i;
const CORE_FOLDER = /^(hum|font|out|poweron|in)$/i;
export async function looksLikeFont(dir: string): Promise<boolean> {
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
  // Hiltwright's own reading of the card holds files open, and Windows will not eject a drive with files open.
  await stopReading(root);
  if (process.platform === 'win32') {
    const letter = root.replace(/[\\/]+$/, '');
    if (!/^[A-Za-z]:$/.test(letter)) return { ok: false, detail: `Not a drive letter: ${root}` };
    const script = `$sh = New-Object -ComObject Shell.Application; $v = $sh.NameSpace(17).ParseName('${letter}'); if ($v -eq $null) { 'gone' } else { $v.InvokeVerb('Eject'); for ($i = 0; $i -lt 16 -and (Test-Path '${letter}\\'); $i++) { Start-Sleep -Milliseconds 500 }; if (Test-Path '${letter}\\') { 'still-there' } else { 'ejected' } }`;
    // Windows can take more than one try to let go once Hiltwright's own reading has stopped: on hote2 the second
    // try, five seconds after the first, ejected at once (card-safety 4.1, 2026-11-14). So up to three, quietly.
    let out = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      out = await new Promise<string>((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true }, (err, stdout) => resolve(err ? `error ${String(err)}` : String(stdout).trim())));
      if (out === 'ejected' || out === 'gone') return { ok: true, detail: attempt > 1 ? `${out} (try ${attempt})` : out };
      if (out !== 'still-there') break;
    }
    return { ok: false, detail: out === 'still-there' ? 'Windows would not let go of the card because something still has it open. Close any File Explorer window showing the card, and any program with a file from it open, then press Give the card back again. The saber keeps sharing its card until then.' : out };
  }
  const cmd = process.platform === 'darwin' ? ['diskutil', ['eject', root]] as const : ['udisksctl', ['unmount', '-b', root]] as const;
  const out = await new Promise<string>((resolve) => execFile(cmd[0], [...cmd[1]], { timeout: 15000 }, (err, stdout, stderr) => resolve(err ? `error ${String(stderr || err)}` : 'ejected')));
  return { ok: out === 'ejected', detail: out };
}

/**
 * Reads of a card under way, so giving a shared card back can stop them: over USB, listing a card's fonts takes
 * minutes, and the files it holds open stop Windows ejecting the drive (card-safety 4.1, 2026-11-14).
 */
const reads = new Map<string, { active: number; gen: number }>();
const cardKey = (root: string) => root.replace(/[\\/]+$/, '').toUpperCase();
function beginRead(root: string): { stopped: () => boolean; end: () => void } {
  const k = cardKey(root);
  const r = reads.get(k) ?? { active: 0, gen: 0 };
  reads.set(k, r);
  r.active++;
  const gen = r.gen;
  return { stopped: () => r.gen !== gen, end: () => { r.active = Math.max(0, r.active - 1); } };
}
/** Stop every read of this card and wait, up to 10 s, for them to let go of its files. */
export async function stopReading(root: string, waitMs = 10_000): Promise<void> {
  const r = reads.get(cardKey(root));
  if (!r) return;
  r.gen++;
  for (const until = Date.now() + waitMs; r.active > 0 && Date.now() < until;) await new Promise((res) => setTimeout(res, 100));
}
const STOPPED = 'Stopped: the card is being given back.';

/** The sounds a listen needs. Everything else in a font (tracks, ini files, quotes) stays on the card. */
const PLAYABLE = /^(hum|humm|out|poweron|fastout|preon|in|poweroff|pwroff|pstoff|clsh|clash|blst|blaster|stab|force|font|boot|lock|lockup|bgnlock|endlock|drag|bgndrag|enddrag|lb|bgnlb|endlb|swingl|swingh|lswing|hswing|swng|swing|tr)$/i;
const FONT_BYTES_CAP = 120 * 1024 * 1024;

export interface FontSounds { name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string>; bytes: number; skipped: number }

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.+?)\s*$/.exec(line); if (m) out[m[1]] = m[2]; }
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
    // Inside a sound's folder: its wavs, or numbered folders of wavs (tr/001/000.wav, the style transition sounds).
    try { for (const f of await readdir(p)) { if (/\.wav$/i.test(f)) wanted.push({ key: `${name}/${f}`, p: join(p, f) }); else if (/^\d+$/.test(f) && (await isDir(join(p, f)))) { for (const g of await readdir(join(p, f))) if (/\.wav$/i.test(g)) wanted.push({ key: `${name}/${f}/${g}`, p: join(p, f, g) }); } } } catch { /* unreadable */ }
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

/**
 * One look for drives: the cards found, or that Windows did not answer (`answered: false`), which callers must not
 * read as "no card". `ms` is how long the look took.
 */
export type DriveLook = { answered: true; cards: CardInfo[]; ms: number } | { answered: false; detail: string; ms: number };

/** The cards found; an empty list also when Windows did not answer. Use `lookForCards` to tell the two apart. */
export async function locateCards(): Promise<CardInfo[]> {
  const look = await lookForCards();
  return look.answered ? look.cards : [];
}

/**
 * The font and name of each preset in the card's presets.ini (presets.tmp when there is no .ini), so the app can tell
 * whose card it is by the presets the saber last reported. Null when there is neither, or it cannot be read.
 */
async function cardPresets(root: string): Promise<{ font: string; name: string }[] | null> {
  for (const file of ['presets.ini', 'presets.tmp']) {
    try {
      const p = join(root, file);
      if ((await stat(p)).size > 512 * 1024) return null;
      return parsePresetsIni(await readFile(p, 'utf8')).presets.slice(0, 200).map((x) => ({ font: x.font, name: x.name }));
    } catch { /* not there: try the other */ }
  }
  return null;
}

/** Drive letters that once took too long to answer (a network drive gone away): not asked again this run. */
const slowDrives = new Set<string>();
const DRIVE_ANSWER_MS = 1500;

/** A drive mounted now, and which volume is in it (volumeId): a card swapped for another in the same reader reads differently. */
export interface MountedDrive { root: string; volumeId: string | null }

/** Which volume is at `root`, or 'slow' when it does not answer within `ms`, or null when it does not open. */
function askDrive(root: string, ms: number): Promise<string | null | 'slow'> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('slow'), ms);
    volumeId(root).then((id) => { clearTimeout(t); resolve(id); });
  });
}

/**
 * The drives mounted now, by their roots, each with the volume in it: a cheap check, asked every few seconds so a
 * card put in a reader, taken out, or swapped for another at the same letter (issue #9) is noticed without the full
 * look, which runs PowerShell and reads every card. On Windows each letter D: to Z: is asked whether it opens; an
 * empty card reader slot says no at once, and a letter that takes longer than 1.5 s is not asked again this run.
 */
export async function mountedRoots(): Promise<MountedDrive[]> {
  const override = process.env.HILTWRIGHT_SD_ROOT;
  if (override) return (await isDir(override)) ? [{ root: override, volumeId: await volumeId(override) }] : [];
  if (process.platform === 'win32') {
    const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !slowDrives.has(l));
    const answers = await Promise.all(letters.map(async (l): Promise<MountedDrive | null> => {
      const root = `${l}:\\`;
      const id = await askDrive(root, DRIVE_ANSWER_MS);
      if (id === 'slow') { slowDrives.add(l); return null; }
      return id ? { root, volumeId: id } : null;
    }));
    return answers.filter((a): a is MountedDrive => !!a);
  }
  const bases = process.platform === 'darwin' ? ['/Volumes'] : ['/media', '/run/media', '/mnt'];
  const roots: string[] = [];
  for (const b of bases) { try { for (const n of await readdir(b)) roots.push(join(b, n)); } catch { /* not present */ } }
  roots.sort();
  return Promise.all(roots.map(async (root) => { const id = await askDrive(root, DRIVE_ANSWER_MS); return { root, volumeId: id === 'slow' ? null : id }; }));
}

export async function lookForCards(): Promise<DriveLook> {
  const started = Date.now();
  const { list, failed } = await candidateRoots();
  if (failed) return { answered: false, detail: failed, ms: Date.now() - started };
  const out: CardInfo[] = [];
  for (const c of list) {
    if (!(await isDir(c.root))) continue;
    // Which volume this look read, taken before reading it: every later write checks the drive still holds it.
    const id = await volumeId(c.root);
    const hasPresetsIni = await exists(join(c.root, 'presets.ini')) || await exists(join(c.root, 'presets.tmp'));
    let fontDirs = 0;
    let names: string[] = [];
    try { names = await readdir(c.root); } catch { /* unreadable */ }
    try {
      for (const name of names) {
        if (name.startsWith('.') || name.toLowerCase() === 'tracks') continue;
        const p = join(c.root, name);
        if (await isDir(p) && await looksLikeFont(p)) { fontDirs++; if (fontDirs >= 1) break; }
      }
    } catch { /* unreadable */ }
    out.push({ root: c.root, label: c.label, freeBytes: c.free, totalBytes: c.total, proffie: hasPresetsIni || fontDirs > 0, hasPresetsIni, saberSerial: c.saberSerial, fileSystem: c.fileSystem, empty: isEmptyCard(names), volumeSerial: c.volumeSerial, volumeId: id, presets: hasPresetsIni ? await cardPresets(c.root) : null, writes: cardWrites(c.root) });
  }
  const ms = Date.now() - started;
  if (ms > 3000) console.log(`[sd] the drive list took ${ms} ms (${out.length} removable volume(s))`);
  return { answered: true, cards: out, ms };
}

/** `fn` over every item, `n` at a time, results in the items' order. */
export async function inBatches<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  // Every worker is waited for, even after one fails: a stopped reading of a card must have let go of every file
  // before the caller hears of it, or Windows cannot eject the card.
  const done = await Promise.allSettled(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  const failed = done.find((d): d is PromiseRejectedResult => d.status === 'rejected');
  if (failed) throw failed.reason;
  return out;
}

/** Every wav in a font folder, three levels deep, as paths within it. Hidden entries and packaging junk are not looked into. */
async function walkWavs(dir: string, prefix = '', depth = 0): Promise<string[]> {
  const out: string[] = [];
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return out; }
  for (const n of names) {
    if (n.startsWith('.') || n === '__MACOSX') continue;
    const p = join(dir, n);
    if (/\.wav$/i.test(n)) out.push(prefix + n);
    else if (depth < 3 && (await isDir(p))) out.push(...(await walkWavs(p, `${prefix}${n}/`, depth + 1)));
  }
  return out;
}

/**
 * The listing both fonts pages feed the one checker (core's checkFontListing): every wav of a font with its size and
 * first bytes. Sizes and headers are read many at a time: a font is a hundred small files.
 */
export async function readFontListing(dir: string, stopped: () => boolean = () => false): Promise<FontListingEntry[]> {
  const rels = await walkWavs(dir);
  const found = await inBatches(rels, 24, async (rel): Promise<FontListingEntry | null> => {
    if (stopped()) throw new Error(STOPPED);
    const p = join(dir, ...rel.split('/'));
    try {
      const s = await stat(p);
      if (!s.isFile()) return null;
      let header: Uint8Array | null = null;
      try {
        const fh = await open(p, 'r');
        try {
          const buf = new Uint8Array(WAV_HEADER_BYTES);
          const { bytesRead } = await fh.read(buf, 0, WAV_HEADER_BYTES, 0);
          header = buf.subarray(0, bytesRead);
        } finally { await fh.close(); }
      } catch { /* unreadable file */ }
      return { path: rel, size: s.size, header };
    } catch { return null; }
  });
  return found.filter((e): e is FontListingEntry => !!e);
}

export async function checkFontDir(dir: string, stopped?: () => boolean): Promise<FontEntry> {
  return { name: basename(dir), path: dir, report: checkFontListing(await readFontListing(dir, stopped)).report };
}

export async function listFonts(root: string): Promise<FontEntry[]> {
  const read = beginRead(root);
  try {
    const out: FontEntry[] = [];
    for (const name of (await readdir(root)).sort((a, b) => a.localeCompare(b))) {
      if (read.stopped()) throw new Error(STOPPED);
      if (name.startsWith('.') || name.startsWith('$') || /^(tracks|system volume information)$/i.test(name)) continue;
      const p = join(root, name);
      if (!(await isDir(p)) || !(await looksLikeFont(p))) continue;
      out.push(await checkFontDir(p, read.stopped));
    }
    return out;
  } finally { read.end(); }
}

/** The Fett263 voice pack in the card's common folder: voicepack.ini and the menu number sounds. */
export async function readVoicePack(root: string): Promise<VoicePackStatus> {
  const common = join(root, 'common');
  let text: string | null = null;
  try { text = await readFile(join(common, 'voicepack.ini'), 'utf8'); } catch { /* no file */ }
  let entries: { name: string; isFolder: boolean }[] = [];
  try { entries = (await readdir(common, { withFileTypes: true })).map((d) => ({ name: d.name, isFolder: d.isDirectory() })); } catch { /* no common folder */ }
  return { ...parseVoicePackIni(text), menuSounds: hasMenuSounds(entries.map((e) => e.name)), mixed: mixedSounds(entries) };
}

export async function listTracks(root: string): Promise<{ name: string; size: number }[]> {
  const read = beginRead(root);
  try {
    const dir = join(root, 'tracks');
    if (!(await isDir(dir))) return [];
    const out: { name: string; size: number }[] = [];
    for (const name of await readdir(dir)) {
      if (read.stopped()) throw new Error(STOPPED);
      if (!/\.wav$/i.test(name)) continue;
      out.push({ name: `tracks/${name}`, size: (await stat(join(dir, name))).size });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } finally { read.end(); }
}

export interface CopyOptions {
  /** Replace a font of the same name: the owner has confirmed. Without it an existing font is refused. */
  replace?: boolean;
  /** Called after each file, with the files copied so far and the total. */
  onProgress?: (done: number, total: number) => void;
  /** The card's free space, for tests. Read from the card itself when not given. */
  freeBytes?: number | null;
  /** How one file is copied, for tests that make a copy fail part way. */
  copyOne?: (from: string, to: string) => Promise<void>;
}

const COPYING = '.hiltwright-copy-';
const OLD = '.hiltwright-old-';
const mbText = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;

/** Every file under `dir`, with its size, relative to `dir`. */
export async function filesUnder(dir: string): Promise<{ rel: string; size: number }[]> {
  const out: { rel: string; size: number }[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) out.push({ rel: relative(dir, p), size: (await stat(p)).size });
    }
  };
  await walk(dir);
  return out;
}

export async function cardFree(root: string): Promise<number | null> {
  try { const s = await statfs(root); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

/**
 * What an earlier copy left behind (card-safety D5): an unfinished copy is removed; a replace cut short between its
 * two renames has its old font put back, or removed once the new one is in place.
 */
/** Hidden copy folders being filled right now, by path in lower case. */
const liveCopies = new Set<string>();

async function clearLeftovers(root: string): Promise<void> {
  let names: string[] = [];
  try { names = await readdir(root); } catch { return; }
  for (const n of names) {
    // A copy still filling its folder is not a leftover (issue #6): only one abandoned by a stopped run is cleared.
    if (n.startsWith(COPYING)) { if (!liveCopies.has(join(root, n).toLowerCase())) await rm(join(root, n), { recursive: true, force: true }); }
    else if (n.startsWith(OLD)) {
      const font = join(root, n.slice(OLD.length));
      if (await exists(font)) await rm(join(root, n), { recursive: true, force: true });
      else await rename(join(root, n), font);
    }
  }
}

/**
 * Copy a font folder onto the card, all or nothing (card-safety D5). The font appears under its name only once every
 * file is there: the copy goes into a hidden folder on the card and is renamed into place. A replace keeps the old
 * font until the new copy is complete, then swaps it out, so old and new files never mix. The space is checked first.
 */
export async function copyFont(src: string, root: string, options: CopyOptions | boolean = {}): Promise<FontEntry> {
  const o: CopyOptions = typeof options === 'boolean' ? { replace: options } : options;
  const name = basename(src);
  if (!/^[^\\/:*?"<>|]+$/.test(name)) throw new Error('Font folder name is not valid on an SD card');
  if (/[;,]/.test(name)) throw new Error(`"${name}" has a ; or , in its name, which ProffieOS reads as a break between font folders. Rename the folder first.`);
  await clearLeftovers(root);
  noteCardWritten(root);
  const dst = join(root, name);
  if (!o.replace && await exists(dst)) throw new Error(`${name} is already on the card`);
  const files = await filesUnder(src);
  const bytes = files.reduce((a, f) => a + f.size, 0);
  const free = o.freeBytes !== undefined ? o.freeBytes : await cardFree(root);
  if (free != null && bytes + Math.max(1e6, bytes * 0.02) > free) throw new Error(`${name} needs ${mbText(bytes)} and the card has ${mbText(free)} free.`);
  const tmp = join(root, `${COPYING}${name}`);
  const copyOne = o.copyOne ?? ((from: string, to: string) => copyFile(from, to));
  const live = tmp.toLowerCase();
  if (liveCopies.has(live)) throw new Error(`${name} is already being copied to this card.`);
  liveCopies.add(live);
  try {
    return await fillAndPlace();
  } finally {
    liveCopies.delete(live);
  }

  async function fillAndPlace(): Promise<FontEntry> {
  try {
    await mkdir(tmp, { recursive: true });
    let done = 0;
    for (const f of files) {
      const to = join(tmp, f.rel);
      await mkdir(dirname(to), { recursive: true });
      await copyOne(join(src, f.rel), to);
      o.onProgress?.(++done, files.length);
    }
    // Every file the font has must be in the copy before it takes the font's name (issue #6).
    const landed = (await filesUnder(tmp)).length;
    if (landed !== files.length) throw Object.assign(new Error(`only ${landed} of ${files.length} files arrived`), { code: 'INCOMPLETE' });
  } catch (err) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    // In plain words, with the system's own code kept for the log (card-safety 4.1: a card pulled mid-copy read
    // "UNKNOWN: unknown error, copyfile …").
    const code = (err as { code?: string }).code ?? (err instanceof Error ? err.message.split(':')[0] : String(err));
    console.log(`[sd] copy of ${name} to ${root} stopped: ${String(err)}`);
    throw new Error(`The copy of ${name} stopped part way: the card could not be written to (${code}). Nothing was left on the card under ${name}. Check the card is in, then copy it again.`);
  }
  if (!o.replace) {
    if (await exists(dst)) { await rm(tmp, { recursive: true, force: true }); throw new Error(`${name} is already on the card`); }
    await rename(tmp, dst);
  } else {
    const old = join(root, `${OLD}${name}`);
    const had = await exists(dst);
    if (had) await rename(dst, old);
    try {
      await rename(tmp, dst);
    } catch (err) {
      if (had) await rename(old, dst).catch(() => undefined);
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
    if (had) await rm(old, { recursive: true, force: true });
  }
  return checkFontDir(dst);
  }
}

export function soundKind(fileName: string): string {
  return classifySound(fileName).kind;
}

/**
 * Config files an installer left on the card: `.h` files at its top or in a `config` folder that hold a BladeConfig
 * table. Their text is read so the wiring they describe can be compared with the saber's (configWiring.ts).
 */
export async function findConfigFiles(root: string): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const dir of ['', 'config']) {
    let names: string[] = [];
    try { names = await readdir(join(root, dir)); } catch { continue; }
    for (const n of names.filter((x) => /\.h$/i.test(x)).sort()) {
      const p = join(root, dir, n);
      try {
        if ((await stat(p)).size > 512 * 1024) continue;
        const text = await readFile(p, 'utf8');
        if (/\bBladeConfig\b/.test(text)) out.push({ name: dir ? `${dir}/${n}` : n, text });
      } catch { /* unreadable: skip */ }
      if (out.length >= 8) return out;
    }
  }
  return out;
}

/** Where the card's own presets go before they are removed, and how the list ProffieOS would load is kept. */
export interface KeepPresets {
  /** A new folder: each presets file on the card is copied into it unchanged. */
  dir: string;
  /** Keep the list as a snapshot the owner can put back. */
  snapshot: (presets: PresetRecord[]) => Promise<unknown>;
}

/**
 * Remove presets.ini and presets.tmp from a card in a reader, so the saber starts with the presets its firmware
 * carries once the card is back in it (staged presets, installed while the card is out). Returns the files removed.
 *
 * With `keep`, the card's own files are kept first (issue #7): copied unchanged into `keep.dir`, and the list
 * ProffieOS would load from them kept as a snapshot. That is what the saber really had, edits made on it included,
 * where the app's last reading may be older, or the new firmware's own list. If either cannot be kept, nothing is
 * removed. presets.tmp goes before presets.ini, and the card is checked afterwards: a file left behind is an error.
 */
export async function clearPresetsFiles(root: string, keep?: KeepPresets): Promise<string[]> {
  const order = ['presets.tmp', 'presets.ini'];
  const found: string[] = [];
  for (const f of order) if (await exists(join(root, f))) found.push(f);
  if (keep && found.length) {
    await mkdir(keep.dir, { recursive: true });
    const read: { presets: PresetRecord[]; complete: boolean; at: number }[] = [];
    for (const f of found) {
      const p = join(root, f);
      const data = await readFile(p);
      await writeFile(join(keep.dir, f), data);
      const parsed = data.length <= 2 * 1024 * 1024 ? parsePresetsIni(data.toString('utf8')) : { presets: [], terminated: false };
      read.push({ presets: parsed.presets, complete: parsed.terminated, at: (await stat(p)).mtimeMs });
    }
    // The list ProffieOS would load: a complete file before a cut-short one, then the one saved last (it alternates
    // its saves between the two files).
    const best = read.filter((r) => r.presets.length).sort((a, b) => Number(b.complete) - Number(a.complete) || b.at - a.at)[0];
    if (best) await keep.snapshot(best.presets);
    console.log(`[sd] kept ${found.join(' and ')} from ${root} in ${keep.dir}${best ? ` (${best.presets.length} presets as a snapshot)` : ''}`);
  }
  const removed: string[] = [];
  for (const f of found) { await rm(join(root, f), { force: true }); removed.push(f); }
  if (removed.length) { noteCardWritten(root); console.log(`[sd] removed ${removed.join(' and ')} from ${root}`); }
  const left: string[] = [];
  for (const f of order) if (await exists(join(root, f))) left.push(f);
  if (left.length) throw new Error(`${left.join(' and ')} could not be removed from the card.`);
  return removed.reverse();
}

/** Whether a folder of this name is on the card: the font library offers Replace when it is (card-safety 2.5). */
export async function hasFolder(root: string, name: string): Promise<boolean> {
  return isDir(join(root, basename(name)));
}
