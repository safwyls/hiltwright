// Flash engine: the DFU side of an install. The renderer owns the serial port, so it performs the 1200-baud touch
// (or RebootDFU) and releases the port; main then waits for the bootloader, checks the Windows driver, backs up,
// writes with dfu-util, and waits for the board to come back. Commands are exactly the ones the spike proved.

import { execFile } from 'node:child_process';
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { findDfuUtil, run, toolchainPaths, type Progress } from './toolchain';
import { backupSizeMismatch, boardForFlash } from '../shared/boards';

export { backupSizeMismatch, boardForFlash };

export const RUNTIME_VIDPID = '1209:6668';
export const DFU_VIDPID = '0483:df11';

/** A board sitting in its bootloader. `serial` is null when Windows had to make up an id (the device gave none). */
export interface BootloaderDevice { serial: string | null; driver: string | null; problem: number | null }

export interface UsbState {
  runtimePresent: boolean;
  bootloaderPresent: boolean;
  /** Windows driver service bound to the bootloader, e.g. WinUSB, or null when unbound. */
  bootloaderDriver: string | null;
  bootloaderProblem: number | null;
  /** Every board in its bootloader, and the USB serials of every board running its firmware. */
  bootloaders: BootloaderDevice[];
  runtimeSerials: string[];
  /** Running boards that gave no USB serial (Windows made up their id). The V3.9 came back like this once in eleven leaves. */
  runtimeNoSerial: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The serial in a device's instance id (the part after the last `\`), or null for an id Windows generated. */
export function serialFromInstanceId(id: string): string | null {
  const tail = id.slice(id.lastIndexOf('\\') + 1);
  return tail && !tail.includes('&') ? tail : null;
}

/** The USB state from the PnP devices of the two ids. Interfaces (`&MI_nn`) are left out: only whole devices count. */
export function usbStateFrom(list: { InstanceId: string; Service: string | null; Problem: number | null }[]): UsbState {
  const boots = list.filter((d) => /^USB\\VID_0483&PID_DF11\\/i.test(d.InstanceId));
  const runs = list.filter((d) => /^USB\\VID_1209&PID_6668\\/i.test(d.InstanceId));
  const bootloaders = boots.map((d) => ({ serial: serialFromInstanceId(d.InstanceId), driver: d.Service ?? null, problem: d.Problem == null ? null : Number(d.Problem) }));
  return {
    runtimePresent: runs.length > 0,
    bootloaderPresent: boots.length > 0,
    bootloaderDriver: bootloaders[0]?.driver ?? null,
    bootloaderProblem: bootloaders[0]?.problem ?? null,
    bootloaders,
    runtimeSerials: runs.map((d) => serialFromInstanceId(d.InstanceId)).filter((s): s is string => !!s),
    runtimeNoSerial: runs.filter((d) => !serialFromInstanceId(d.InstanceId)).length,
  };
}

/** What a bootloader's `driver` reads on a system that needs none: the system's own USB access reaches it. */
export const NATIVE_DRIVER = 'native';

/** True when dfu-util can open a bootloader with this driver: WinUSB on Windows, or a system that needs no driver. */
export function driverUsable(driver: string | null | undefined): boolean {
  return driver === NATIVE_DRIVER || /winusb/i.test(driver ?? '');
}

/**
 * The USB state from macOS's device registry (`ioreg -r -c IOUSBHostDevice -l`). Each device is a block that starts
 * `+-o <name>@<location>` and lists properties as `"key" = value`; the ids are decimal there. A device without a
 * `"USB Serial Number"` gave none.
 */
export function usbStateFromIoreg(text: string): UsbState {
  const list: { InstanceId: string; Service: string | null; Problem: number | null }[] = [];
  let n = 0;
  for (const block of text.split(/^[ |]*\+-o /m).slice(1)) {
    const num = (key: string) => { const m = new RegExp(`"${key}" = (\\d+)`).exec(block); return m ? Number(m[1]) : null; };
    const vid = num('idVendor'), pid = num('idProduct');
    const boot = vid === 0x0483 && pid === 0xdf11, runs = vid === 0x1209 && pid === 0x6668;
    if (!boot && !runs) continue;
    const serial = /"(?:USB Serial Number|kUSBSerialNumberString)" = "([^"]+)"/.exec(block)?.[1] ?? null;
    // The same shape Windows gives, so one function judges both: an id with `&` in its tail has no serial.
    const tail = serial && /^[A-Za-z0-9]+$/.test(serial) ? serial : `no&serial&${n++}`;
    list.push({ InstanceId: `USB\\VID_${boot ? '0483&PID_DF11' : '1209&PID_6668'}\\${tail}`, Service: boot ? NATIVE_DRIVER : null, Problem: null });
  }
  return usbStateFrom(list);
}

export async function usbState(): Promise<UsbState> {
  if (process.platform === 'darwin') {
    const out = await new Promise<string>((resolve) => execFile('ioreg', ['-r', '-c', 'IOUSBHostDevice', '-l', '-w', '0'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout)));
    return usbStateFromIoreg(out);
  }
  if (process.platform !== 'win32') {
    // TODO Linux: read the USB devices (lsusb or sysfs). Until then a running board is assumed and no bootloader seen.
    return { runtimePresent: true, bootloaderPresent: false, bootloaderDriver: 'n/a', bootloaderProblem: null, bootloaders: [], runtimeSerials: [], runtimeNoSerial: 0 };
  }
  const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_1209&PID_6668|VID_0483&PID_DF11' } | Select-Object InstanceId, Service, Status, Problem | ConvertTo-Json`;
  const out = await new Promise<string>((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout)));
  let list: { InstanceId: string; Service: string | null; Status: string; Problem: number }[] = [];
  try { const parsed = JSON.parse(out || '[]'); list = Array.isArray(parsed) ? parsed : [parsed]; } catch { list = []; }
  return usbStateFrom(list);
}

/**
 * Whether the saber with this serial is running again: its serial is back and its bootloader gone. A board may also
 * come back without giving a serial at all (seen once on the V3.9, install-safety-nets 1.1): a serial-less running
 * board that was not there when the wait began (`noSerialBefore`) counts too, while this saber's bootloader is gone.
 * With no serial, any running board and no bootloader will do.
 */
export function backAfter(u: UsbState, serial: string | null, noSerialBefore: number): boolean {
  if (!serial) return u.runtimePresent && !u.bootloaderPresent;
  if (u.bootloaders.some((b) => b.serial === serial)) return false;
  return u.runtimeSerials.includes(serial) || u.runtimeNoSerial > noSerialBefore;
}

/** The bootloaders present now that were not in `before` (serials noted before a reboot). */
export function newBootloaders(s: UsbState, before: (string | null)[]): BootloaderDevice[] {
  const was = [...before];
  // A serial-less bootloader counts once per serial-less entry before, so a second one still shows up as new.
  return s.bootloaders.filter((b) => { const i = was.indexOf(b.serial); if (i < 0) return true; was.splice(i, 1); return false; });
}

export async function waitFor(pred: (s: UsbState) => boolean, timeoutMs: number, onLine?: Progress): Promise<UsbState | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await usbState();
    if (pred(s)) return s;
    await sleep(500);
  }
  onLine?.('timed out waiting for the board');
  return null;
}

/** One bootloader in a `dfu-util -l` listing: its serial and the size of its internal flash (null when not reported). */
export interface DfuDevice { serial: string | null; flashBytes: number | null }
export interface DfuInfo { devices: DfuDevice[]; listing: string }

/** Bytes in a DfuSe layout such as `0128*0002Kg` (256 KB) or `0256*0002Kg` (512 KB); segments are comma-separated. */
function layoutBytes(layout: string): number {
  return layout.split(',').reduce((sum, seg) => {
    const m = /(\d+)\*(\d+)([KM])/i.exec(seg);
    return m ? sum + Number(m[1]) * Number(m[2]) * (m[3].toUpperCase() === 'M' ? 1048576 : 1024) : sum;
  }, 0);
}

/**
 * The bootloaders in a `dfu-util -l` listing. Each board is listed once per alt setting (flash, option bytes, OTP,
 * device feature), every line carrying its serial; only the "@Internal Flash" line gives the flash size.
 */
export function parseDfuList(listing: string): DfuDevice[] {
  const byKey = new Map<string, DfuDevice>();
  for (const line of listing.split(/\r?\n/)) {
    if (!/^Found DFU: \[0483:df11\]/i.test(line)) continue;
    const serial = /serial="([^"]*)"/.exec(line)?.[1] || null;
    const key = serial ?? `path:${/path="([^"]*)"/.exec(line)?.[1] ?? ''}`;
    const dev = byKey.get(key) ?? { serial, flashBytes: null };
    const layout = /@Internal Flash\s*\/0x08000000\/([^"]+)"/i.exec(line)?.[1];
    if (layout) dev.flashBytes = layoutBytes(layout);
    byKey.set(key, dev);
  }
  return [...byKey.values()];
}


/**
 * dfu-util's device selection. The running id stays in `-d`: dfu-util compares a .dfu file's id (1209:6668) with it,
 * and refuses the file without it. `-S` limits both the running and the bootloader match to the one board with this
 * serial (a board keeps its serial in the bootloader), so another saber plugged in is never touched.
 */
export function dfuDeviceArgs(serial: string | null): string[] {
  return ['-d', `${RUNTIME_VIDPID},${DFU_VIDPID}`, ...(serial ? ['-S', serial] : [])];
}

/** dfu-util -l: confirms libusb can open the bootloaders and reports each one's serial and DfuSe layout. */
export async function dfuInfo(dfuUtil: string): Promise<DfuInfo> {
  const r = await run(dfuUtil, ['-l'], { timeoutMs: 15000 });
  const listing = r.stdout + r.stderr;
  return { devices: parseDfuList(listing), listing };
}

/**
 * The one bootloader an install or restore may use: the one with this serial, or, with no serial, the only one
 * listed. Null when there is no such single board.
 */
export function pickDevice(devices: DfuDevice[], serial: string | null): DfuDevice | null {
  if (serial) return devices.find((d) => d.serial === serial) ?? null;
  return devices.length === 1 ? devices[0] : null;
}

/** What a bootloader says about the board: its flash size and so its type (null when Hiltwright does not know it). */
export interface FlashTarget { serial: string | null; flashBytes: number | null; board: 'V2' | 'V3' | null; found: boolean }

export async function flashTarget(toolchainRoot: string, serial: string | null): Promise<FlashTarget> {
  const dfuUtil = await findDfuUtil(toolchainPaths(toolchainRoot));
  if (!dfuUtil) return { serial, flashBytes: null, board: null, found: false };
  const dev = pickDevice((await dfuInfo(dfuUtil)).devices, serial);
  return { serial, flashBytes: dev?.flashBytes ?? null, board: boardForFlash(dev?.flashBytes ?? null), found: !!dev };
}

/** What a flash read is: firmware for this chip, all erased (a blank or wiped board), or neither. */
export type ImageKind = 'firmware' | 'erased' | 'unusable';

/**
 * `kind`: for a backup, what the read turned out to be. Only 'firmware' is a backup; an erased read is deleted and
 * anything else is kept, but is never written back. 'partial': it reads as firmware, but the last write to this board
 * did not finish, so it may be half old and half new (issue #12).
 */
export interface FlashStepResult { ok: boolean; ms: number; detail: string; file?: string; kind?: ImageKind | 'partial'; refused?: boolean }

/**
 * Kept in a saber's backups folder while the last write to its board did not finish. A read taken then may be half
 * written even when it starts like firmware, so it is saved as a partial read, never as a backup (issue #12).
 */
const WRITE_FAILED = 'last-write-failed.json';
/** The part of a file name that marks a read kept only to look into a fault: never listed or put back as a backup. */
const PARTIAL_READ = 'partial-read-';
export const isPartialRead = (name: string) => name.includes(`Z-${PARTIAL_READ}`);

/**
 * Remember how a write or restore to this saber's board went, and pass its result on. A write that dfu-util ran and
 * that failed may have left part of an image (`ms` 0: refused before anything was sent, so the board is as it was).
 */
export async function rememberWrite(backupDir: string, r: FlashStepResult): Promise<FlashStepResult> {
  try {
    if (r.ok) await rm(join(backupDir, WRITE_FAILED), { force: true });
    else if (r.ms > 0 && !r.refused) { await mkdir(backupDir, { recursive: true }); await writeFile(join(backupDir, WRITE_FAILED), JSON.stringify({ at: new Date().toISOString() }), 'utf8'); }
  } catch { /* the write's own result still stands; only the label of the next read is lost */ }
  return r;
}

/**
 * Read the whole flash of the board with this serial into a backup file. `configName` is the config the saber
 * reported before its reboot; it is kept beside the image (<file>.json) so that putting this backup back can expect
 * the saber to return reporting it.
 */
export async function backupFlash(toolchainRoot: string, backupDir: string, label: string, onLine: Progress, configName: string | null = null, serial: string | null = null): Promise<FlashStepResult> {
  const p = toolchainPaths(toolchainRoot);
  const dfuUtil = await findDfuUtil(p);
  if (!dfuUtil) return { ok: false, ms: 0, detail: 'dfu-util is not installed with the toolchain.' };
  const info = await dfuInfo(dfuUtil);
  const dev = pickDevice(info.devices, serial);
  if (!dev) return { ok: false, ms: 0, detail: serial ? `The board ${serial} is not in bootloader mode.` : 'More than one board, or none, is in bootloader mode.' };
  if (!dev.flashBytes) return { ok: false, ms: 0, detail: `The bootloader did not report its flash layout.\n${info.listing.slice(-800)}` };
  await mkdir(backupDir, { recursive: true });
  // After a write that did not finish, what the board holds may be half written: the read is named as a partial read
  // from the start, so it is never listed as a backup, even if the app stops before it is judged (issue #12).
  const afterFailedWrite = await stat(join(backupDir, WRITE_FAILED)).then(() => true, () => false);
  const file = join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${afterFailedWrite ? PARTIAL_READ : ''}${label.replace(/[^A-Za-z0-9_-]/g, '_')}.bin`);
  onLine(`reading ${dev.flashBytes} bytes of flash`);
  const r = await run(dfuUtil, [...dfuDeviceArgs(dev.serial), '-a', '0', '-s', `0x08000000:${dev.flashBytes}`, '-U', file], { timeoutMs: 120000, onLine });
  if (r.code !== 0) return { ok: false, ms: r.ms, detail: (r.stderr || r.stdout).slice(-800), file };
  // A backup counts only when it is the board's whole flash and reads back as firmware (FW7).
  const kind = await imageKind(file, dev.flashBytes);
  if (kind === 'erased') {
    // A blank or wiped board: nothing to lose, and nothing worth keeping (putting it back would erase the saber).
    await rm(file, { force: true });
    return { ok: false, ms: r.ms, detail: 'The board had no firmware on it (its flash is erased), so there was nothing to back up.', kind };
  }
  if (kind === 'unusable') return { ok: false, ms: r.ms, detail: 'The read was not usable firmware (it may be short, protected, or damaged).', file, kind };
  if (afterFailedWrite) return { ok: false, ms: r.ms, detail: 'The last write to this board did not finish, so what it holds now may be half written. The board was read, but the read is not kept as a backup.', file, kind: 'partial' };
  if (configName) { try { await writeFile(`${file}.json`, JSON.stringify({ configName }), 'utf8'); } catch { /* the backup still restores; only the match after it is lost */ } }
  return { ok: true, ms: r.ms, detail: `backup written (${dev.flashBytes} bytes)`, file, kind };
}

/** Write a firmware image to the board with this serial (see dfuDeviceArgs). */
export async function writeFirmware(toolchainRoot: string, dfuFile: string, onLine: Progress, serial: string | null = null): Promise<FlashStepResult> {
  const p = toolchainPaths(toolchainRoot);
  const dfuUtil = await findDfuUtil(p);
  if (!dfuUtil) return { ok: false, ms: 0, detail: 'dfu-util is not installed with the toolchain.' };
  const size = (await stat(dfuFile)).size;
  onLine(`writing ${size} bytes`);
  const r = await run(dfuUtil, [...dfuDeviceArgs(serial), '-a', '0', '-s', '0x08000000:leave', '-D', dfuFile], { timeoutMs: 300000, onLine });
  const ok = r.code === 0 && /File downloaded successfully|Download done/i.test(r.stdout + r.stderr);
  return { ok, ms: r.ms, detail: ok ? `wrote ${size} bytes in ${(r.ms / 1000).toFixed(1)} s` : (r.stderr || r.stdout).slice(-800), file: dfuFile };
}

/**
 * Send the board with this serial from its bootloader back to its firmware, writing nothing: dfu-util reads 4 bytes
 * and ends with DfuSe "leave" (measured on hote2 and the V3.9, install-target-safety 1.1). The bytes go to a
 * temporary file, removed afterwards.
 */
export async function leaveBootloader(toolchainRoot: string, serial: string | null, onLine: Progress): Promise<FlashStepResult> {
  const dfuUtil = await findDfuUtil(toolchainPaths(toolchainRoot));
  if (!dfuUtil) return { ok: false, ms: 0, detail: 'dfu-util is not installed with the toolchain.' };
  const file = join(tmpdir(), `hiltwright-leave-${serial ?? 'board'}-${Date.now()}.bin`);
  try {
    const r = await run(dfuUtil, [...dfuDeviceArgs(serial), '-a', '0', '-s', '0x08000000:4:leave', '-U', file], { timeoutMs: 15000, onLine });
    const ok = r.code === 0;
    return { ok, ms: r.ms, detail: ok ? 'left the bootloader' : (r.stderr || r.stdout).slice(-800) };
  } finally {
    await rm(file, { force: true });
  }
}

export interface BackupInfo { file: string; at: string; label: string; bytes: number; valid: boolean; configName: string | null }

/** The config recorded beside a backup when it was taken, or null (older backups, or none known). */
async function backupConfig(path: string): Promise<string | null> {
  try {
    const c = (JSON.parse(await readFile(`${path}.json`, 'utf8')) as { configName?: unknown }).configName;
    return typeof c === 'string' && c.length <= 200 ? c : null;
  } catch { return null; }
}

/**
 * A flash image starts with the initial stack pointer, which on these chips always points into SRAM (0x20xxxxxx).
 * An erased or read-protected dump does not, and must never be written back.
 */
async function looksLikeFirmware(path: string): Promise<boolean> {
  try {
    const fh = await open(path, 'r');
    try { const b = Buffer.alloc(8); await fh.read(b, 0, 8, 0); return b[3] === 0x20 && b[7] === 0x08; } finally { await fh.close(); }
  } catch { return false; }
}

/**
 * What a flash image is. Firmware: exactly `flashBytes` long and starting like firmware. Erased: exactly that long
 * and every byte 0xFF. Anything else, including a short read, is unusable.
 */
export async function imageKind(path: string, flashBytes: number): Promise<ImageKind> {
  let buf: Buffer;
  try { buf = await readFile(path); } catch { return 'unusable'; }
  if (buf.length !== flashBytes) return 'unusable';
  if (buf.every((b) => b === 0xff)) return 'erased';
  return (await looksLikeFirmware(path)) ? 'firmware' : 'unusable';
}

/** Backups taken before installs, newest first. File names carry the time and a label. */
export async function listBackups(backupDir: string): Promise<BackupInfo[]> {
  let names: string[] = [];
  try { names = await readdir(backupDir); } catch { return []; }
  const out: BackupInfo[] = [];
  for (const file of names.filter((n) => /\.bin$/i.test(n))) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(.*)\.bin$/.exec(file);
    const path = join(backupDir, file);
    const st = await stat(path).catch(() => null);
    if (!st) continue;
    // A partial read may start like firmware and still be half written: it is listed, but never as one to put back.
    out.push({ file, at: m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : st.mtime.toISOString(), label: m ? m[6].replace(/_/g, ' ') : file, bytes: st.size, valid: !isPartialRead(file) && (st.size === 262144 || st.size === 524288) && (await imageKind(path, st.size)) === 'firmware', configName: await backupConfig(path) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export const RESTORE_NO_FLASH_SIZE = 'The bootloader did not report its flash size, so Hiltwright cannot tell whether this backup fits the board. Nothing was written.';

/**
 * Write a backup image back to the board with this serial. Refuses anything that does not look like firmware for this
 * chip family, and a backup of another size than the board's flash. With the board's flash size unknown it refuses too,
 * as a backup read does (issue #29).
 */
export async function restoreBackup(toolchainRoot: string, path: string, onLine: Progress, serial: string | null = null, flashBytes: number | null = null): Promise<FlashStepResult> {
  const st = await stat(path).catch(() => null);
  if (!st || (st.size !== 262144 && st.size !== 524288)) return { ok: false, ms: 0, detail: 'That file is not a full flash backup (256 KB or 512 KB).' };
  if (isPartialRead(basename(path))) return { ok: false, ms: 0, detail: 'That file was read after a write that did not finish, so it may be half written. The file was not put back.' };
  if (!(await looksLikeFirmware(path))) return { ok: false, ms: 0, detail: 'That backup does not look like firmware (it may be an erased or protected read), so it was not written.' };
  if (flashBytes == null) return { ok: false, ms: 0, detail: RESTORE_NO_FLASH_SIZE };
  if (st.size !== flashBytes) return { ok: false, ms: 0, detail: backupSizeMismatch(st.size, flashBytes) };
  onLine(`restoring ${st.size} bytes from ${path}`);
  return writeFirmware(toolchainRoot, path, onLine, serial);
}

/** Explain the Windows driver situation in the owner's terms. */
export function describeBootloader(s: UsbState): { ok: boolean; text: string } {
  if (!s.bootloaderPresent) return { ok: false, text: 'The board is not in bootloader mode.' };
  if (s.bootloaderDriver === NATIVE_DRIVER) return { ok: true, text: 'Bootloader ready.' };
  if (/winusb/i.test(s.bootloaderDriver ?? '')) return { ok: true, text: 'Bootloader ready (WinUSB).' };
  return { ok: false, text: `Windows has no usable driver for the bootloader (service ${s.bootloaderDriver ?? 'none'}, problem code ${s.bootloaderProblem ?? '?'}). Install it once with proffie-dfu-setup.exe, then try again.` };
}
