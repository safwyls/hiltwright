// Windows bootloader driver. The STM32 ROM bootloader (0483:df11) needs WinUSB bound once per computer before
// dfu-util can talk to it. ProffieOS's author publishes a small libwdi-based installer for exactly that; Hiltwright
// downloads it from his site on the owner's click, checks it, and launches it elevated. Nothing is bundled.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { download, type Progress } from './toolchain';
import { describeBootloader, usbState, waitFor } from './flash';

export const DRIVER_URL = 'https://fredrik.hubbe.net/lightsaber/proffie-dfu-setup.exe';
/** Published size of the installer (unchanged since February 2023). A different size means a different file. */
export const DRIVER_BYTES = 3034643;
/** SHA-256 of the installer, as downloaded on a clean PC on 2026-09-20. A different hash is refused, never run. */
export const DRIVER_SHA256: string | null = '4773c8693cf62777cd8da4c95441690e7ae7c4171e8c1d533b1f6225f3bdc29e';

export interface DriverResult { ok: boolean; text: string }

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Download (if needed), verify, run elevated, then wait for WinUSB to bind to the bootloader. */
export async function installBootloaderDriver(dir: string, onLine: Progress): Promise<DriverResult> {
  if (process.platform !== 'win32') return { ok: true, text: 'No driver is needed on this system.' };
  const before = await usbState();
  if (!before.bootloaderPresent) return { ok: false, text: 'The board is not in bootloader mode. Hold BOOT, tap RESET, release BOOT, then try again.' };
  if (/winusb/i.test(before.bootloaderDriver ?? '')) return { ok: true, text: 'The driver is already installed.' };

  await mkdir(dir, { recursive: true });
  const exe = join(dir, 'proffie-dfu-setup.exe');
  let have = false;
  try { have = (await stat(exe)).size === DRIVER_BYTES; } catch { /* not downloaded yet */ }
  if (!have) {
    await rm(exe, { force: true });
    await download(DRIVER_URL, exe, onLine);
  }
  // Verify right before launching: this file is about to run with administrator rights.
  const size = (await stat(exe)).size;
  const hash = await sha256(exe);
  onLine(`installer ${size} bytes, sha256 ${hash}`);
  if (size !== DRIVER_BYTES || (DRIVER_SHA256 && hash !== DRIVER_SHA256)) {
    await rm(exe, { force: true });
    return { ok: false, text: 'The downloaded driver installer is not the file Hiltwright expects, so it was not run. Use the setup page instead.' };
  }

  onLine('asking Windows for administrator approval');
  const launched = await new Promise<{ ok: boolean; err: string }>((resolve) => {
    const ps = `try { Start-Process -FilePath '${exe.replace(/'/g, "''")}' -Verb RunAs -Wait -ErrorAction Stop; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 10 * 60 * 1000, windowsHide: true }, (err, stdout) => resolve({ ok: !err, err: String(stdout || err || '').trim() }));
  });
  if (!launched.ok) {
    const declined = /cancel/i.test(launched.err);
    return { ok: false, text: declined ? 'Windows asked for administrator approval and it was declined. The driver cannot be installed without it.' : `The driver installer could not be started: ${launched.err.slice(0, 200)}` };
  }

  onLine('installer finished; waiting for Windows to bind the driver');
  const bound = await waitFor((u) => u.bootloaderPresent && /winusb/i.test(u.bootloaderDriver ?? ''), 30000, onLine);
  if (bound) return { ok: true, text: 'Driver installed. The bootloader is ready.' };
  const now = await usbState();
  if (!now.bootloaderPresent) return { ok: false, text: 'The installer ran, but the board left bootloader mode. Hold BOOT, tap RESET, release BOOT, then press Check again.' };
  return { ok: false, text: `The installer ran, but Windows still has no usable driver for the bootloader. ${describeBootloader(now).text}` };
}
