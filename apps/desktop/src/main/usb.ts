// Best-effort USB serial lookup. Web Serial only tells the renderer vendor and product ids; the serial number
// is what survives a reflash, so main asks the OS. Windows only for now (PnP instance id of the composite parent).

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { activeWant, setWantedInterfaces } from './serialGate';

const PARENT_RE = /USB\\VID_1209&PID_6668\\([^\\\s"]+)/gi;

/** The Proffieboard serial interfaces whose parent device carries this USB serial, from PnP `InstanceId`/parent pairs. */
export function interfacesOf(list: { id: string; parent: string | null }[], serial: string): string[] {
  const parent = `USB\\VID_1209&PID_6668\\${serial}`.toUpperCase();
  return list.filter((d) => /&MI_00\\/i.test(d.id) && (d.parent ?? '').toUpperCase() === parent).map((d) => d.id);
}

/** Every Proffieboard serial interface present, with its parent device and its name. Windows only; [] elsewhere or on failure. */
export async function proffieInterfaces(): Promise<{ id: string; parent: string | null; name?: string | null }[]> {
  if (process.platform !== 'win32') return [];
  const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_1209&PID_6668&MI_' } | ForEach-Object { [pscustomobject]@{ id = $_.InstanceId; name = $_.FriendlyName; parent = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_Parent' -ErrorAction SilentlyContinue).Data } } | ConvertTo-Json`;
  const out = await new Promise<string>((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout));
  });
  try { const parsed = JSON.parse(out || '[]'); return (Array.isArray(parsed) ? parsed : [parsed]).map((d: { id?: unknown; parent?: unknown; name?: unknown }) => ({ id: String(d.id ?? ''), parent: typeof d.parent === 'string' ? d.parent : null, name: typeof d.name === 'string' ? d.name : null })); } catch { return []; }
}

/** A Proffieboard plugged in and running its firmware: its USB serial, and the COM port Windows gave it. */
export interface PluggedBoard { serial: string; port: string | null }

/**
 * The boards in an interface listing: one per parent device `USB\VID_1209&PID_6668\<serial>`, with the COM port named
 * in its serial interface's name ("USB Serial Device (COM5)"). In order of serial, so the list is stable.
 */
export function boardsFrom(list: { id: string; parent: string | null; name?: string | null }[]): PluggedBoard[] {
  const out = new Map<string, PluggedBoard>();
  for (const d of list) {
    const serial = /^USB\\VID_1209&PID_6668\\([^\\\s"]+)$/i.exec(d.parent ?? '')?.[1];
    if (!serial) continue;
    const port = /\((COM\d+)\)/i.exec(d.name ?? '')?.[1]?.toUpperCase() ?? null;
    const had = out.get(serial);
    if (!had || (!had.port && port)) out.set(serial, { serial, port });
  }
  return [...out.values()].sort((a, b) => a.serial.localeCompare(b.serial));
}

/** Every Proffieboard plugged in now, with its COM port (issue: picking a saber in the Armory). Windows only. */
export async function proffieBoards(): Promise<PluggedBoard[]> {
  return boardsFrom(await proffieInterfaces());
}

/** Look up which interfaces belong to the wanted board. At most one lookup at a time; a new request waits for it. */
let looking: Promise<void> | null = null;
export function lookUpWanted(): Promise<void> {
  const w = activeWant();
  if (!w) return Promise.resolve();
  looking ??= (async () => {
    try { setWantedInterfaces(w.serial, interfacesOf(await proffieInterfaces(), w.serial)); } finally { looking = null; }
  })();
  return looking;
}

/**
 * The programs in an `lsof -F pcn` listing, by name, without this app's own processes. The listing gives one `p<pid>`
 * line per process, then its `c<command>` and an `n<file>` per open file.
 */
export function parseLsofHolders(listing: string, own: number[]): string[] {
  const names = new Set<string>();
  let pid = 0;
  for (const line of listing.split(/\r?\n/)) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || 0;
    else if (line.startsWith('c') && pid && !own.includes(pid)) { const name = line.slice(1).trim(); if (name && !/^Hiltwright( Helper.*)?$|^Electron( Helper.*)?$/i.test(name)) names.add(name); }
  }
  return [...names].sort();
}

/**
 * Which other programs have a USB serial port open now. A port opens for one program at a time, so when the saber's
 * port will not open, this names what to close (the Arduino IDE's Serial Monitor, most often). macOS and Linux, which
 * can say; Windows cannot without administrator rights, so [] there.
 */
export async function portHolders(): Promise<string[]> {
  if (process.platform === 'win32') return [];
  try {
    const all = await readdir('/dev');
    const ports = all.filter((n) => (process.platform === 'darwin' ? /^(cu|tty)\.usbmodem/.test(n) : /^ttyACM\d+$/.test(n))).map((n) => `/dev/${n}`);
    if (!ports.length) return [];
    // +c 0: whole command names, not the first nine letters.
    const out = await new Promise<string>((resolve) => execFile('lsof', ['+c', '0', '-F', 'pcn', ...ports], { timeout: 8000 }, (_err, stdout) => resolve(String(stdout ?? ''))));
    return parseLsofHolders(out, [process.pid, process.ppid]);
  } catch { return []; }
}

export async function proffieSerials(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_1209&PID_6668\\\\' } | ForEach-Object { $_.InstanceId }`;
  const out = await new Promise<string>((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout));
  });
  const serials = new Set<string>();
  for (const m of out.matchAll(PARENT_RE)) serials.add(m[1]);
  return [...serials];
}
