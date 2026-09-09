// Flash engine: the DFU side of an install. The renderer owns the serial port, so it performs the 1200-baud touch
// (or RebootDFU) and releases the port; main then waits for the bootloader, checks the Windows driver, backs up,
// writes with dfu-util, and waits for the board to come back. Commands are exactly the ones the spike proved.

import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { findDfuUtil, run, toolchainPaths, type Progress } from './toolchain';

export const RUNTIME_VIDPID = '1209:6668';
export const DFU_VIDPID = '0483:df11';

export interface UsbState {
  runtimePresent: boolean;
  bootloaderPresent: boolean;
  /** Windows driver service bound to the bootloader, e.g. WinUSB, or null when unbound. */
  bootloaderDriver: string | null;
  bootloaderProblem: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function usbState(): Promise<UsbState> {
  if (process.platform !== 'win32') {
    // TODO macOS/Linux: use dfu-util -l for the bootloader and the serial port list for runtime.
    return { runtimePresent: true, bootloaderPresent: false, bootloaderDriver: 'n/a', bootloaderProblem: null };
  }
  const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_1209&PID_6668|VID_0483&PID_DF11' } | Select-Object InstanceId, Service, Status, Problem | ConvertTo-Json`;
  const out = await new Promise<string>((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout)));
  let list: { InstanceId: string; Service: string | null; Status: string; Problem: number }[] = [];
  try { const parsed = JSON.parse(out || '[]'); list = Array.isArray(parsed) ? parsed : [parsed]; } catch { list = []; }
  const boot = list.find((d) => /VID_0483&PID_DF11/i.test(d.InstanceId));
  return {
    runtimePresent: list.some((d) => /VID_1209&PID_6668/i.test(d.InstanceId)),
    bootloaderPresent: !!boot,
    bootloaderDriver: boot?.Service ?? null,
    bootloaderProblem: boot ? Number(boot.Problem) : null,
  };
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

export interface DfuInfo { flashBytes: number | null; listing: string }

/** dfu-util -l: confirms libusb can open the bootloader and reports the DfuSe layout (128*02Kg = 256 KB). */
export async function dfuInfo(dfuUtil: string): Promise<DfuInfo> {
  const r = await run(dfuUtil, ['-l'], { timeoutMs: 15000 });
  const listing = r.stdout + r.stderr;
  const layout = /@Internal Flash\s*\/0x08000000\/([^"]+)/i.exec(listing)?.[1];
  let flashBytes: number | null = null;
  if (layout) {
    flashBytes = layout.split(',').reduce((sum, seg) => {
      const m = /(\d+)\*(\d+)([KM])/i.exec(seg);
      return m ? sum + Number(m[1]) * Number(m[2]) * (m[3].toUpperCase() === 'M' ? 1048576 : 1024) : sum;
    }, 0);
  }
  return { flashBytes, listing };
}

export interface FlashStepResult { ok: boolean; ms: number; detail: string; file?: string }

export async function backupFlash(toolchainRoot: string, backupDir: string, label: string, onLine: Progress): Promise<FlashStepResult> {
  const p = toolchainPaths(toolchainRoot);
  const dfuUtil = await findDfuUtil(p);
  if (!dfuUtil) return { ok: false, ms: 0, detail: 'dfu-util is not installed with the toolchain.' };
  const info = await dfuInfo(dfuUtil);
  if (!info.flashBytes) return { ok: false, ms: 0, detail: `The bootloader did not report its flash layout.\n${info.listing.slice(-800)}` };
  await mkdir(backupDir, { recursive: true });
  const file = join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label.replace(/[^A-Za-z0-9_-]/g, '_')}.bin`);
  onLine(`reading ${info.flashBytes} bytes of flash`);
  const r = await run(dfuUtil, ['-d', DFU_VIDPID, '-a', '0', '-s', `0x08000000:${info.flashBytes}`, '-U', file], { timeoutMs: 120000, onLine });
  const ok = r.code === 0 && (await stat(file).then((s) => s.size > 0, () => false));
  return { ok, ms: r.ms, detail: ok ? `backup written (${info.flashBytes} bytes)` : (r.stderr || r.stdout).slice(-800), file };
}

export async function writeFirmware(toolchainRoot: string, dfuFile: string, onLine: Progress): Promise<FlashStepResult> {
  const p = toolchainPaths(toolchainRoot);
  const dfuUtil = await findDfuUtil(p);
  if (!dfuUtil) return { ok: false, ms: 0, detail: 'dfu-util is not installed with the toolchain.' };
  const size = (await stat(dfuFile)).size;
  onLine(`writing ${size} bytes`);
  const r = await run(dfuUtil, ['-d', `${RUNTIME_VIDPID},${DFU_VIDPID}`, '-a', '0', '-s', '0x08000000:leave', '-D', dfuFile], { timeoutMs: 300000, onLine });
  const ok = r.code === 0 && /File downloaded successfully|Download done/i.test(r.stdout + r.stderr);
  return { ok, ms: r.ms, detail: ok ? `wrote ${size} bytes in ${(r.ms / 1000).toFixed(1)} s` : (r.stderr || r.stdout).slice(-800), file: dfuFile };
}

/** Explain the Windows driver situation in the owner's terms. */
export function describeBootloader(s: UsbState): { ok: boolean; text: string } {
  if (!s.bootloaderPresent) return { ok: false, text: 'The board is not in bootloader mode.' };
  if (/winusb/i.test(s.bootloaderDriver ?? '')) return { ok: true, text: 'Bootloader ready (WinUSB).' };
  return { ok: false, text: `Windows has no usable driver for the bootloader (service ${s.bootloaderDriver ?? 'none'}, problem code ${s.bootloaderProblem ?? '?'}). Install it once with proffie-dfu-setup.exe, then try again.` };
}
