// Windows bootloader driver. The STM32 ROM bootloader (0483:df11) needs WinUSB bound once per computer before
// dfu-util can talk to it. ProffieOS's author publishes a small libwdi-based installer for exactly that; Hiltwright
// downloads it from his site on the owner's click, checks it, and launches it elevated. Nothing is bundled.

import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
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

/** The exit code the launch script uses when the file is not the expected one (and so was not started). */
export const LAUNCH_MISMATCH = 2;

/**
 * The one PowerShell script that checks the installer and starts it (issue #29). It opens the file so that no one can
 * change, rename or delete it while it is open, checks its size and SHA-256 from that same handle, and starts it with
 * administrator rights (the Windows approval prompt) while still holding it, so the file that runs is the file checked.
 */
export function launchScript(exe: string, expected: { bytes: number; sha256: string | null }): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return [
    `$p = ${q(exe)}`,
    '$fs = $null; $code = 1',
    'try {',
    '  $fs = [System.IO.File]::Open($p, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)',
    `  $want = ${q(expected.sha256 ?? '')}`,
    `  if ($fs.Length -ne ${Math.trunc(expected.bytes)}) { Write-Output "size $($fs.Length)"; $code = ${LAUNCH_MISMATCH} }`,
    '  else {',
    '    $hash = (Get-FileHash -InputStream $fs -Algorithm SHA256).Hash.ToLowerInvariant()',
    `    if ($want -and $hash -ne $want) { Write-Output "sha256 $hash"; $code = ${LAUNCH_MISMATCH} }`,
    '    else { Start-Process -FilePath $p -Verb RunAs -Wait -ErrorAction Stop; $code = 0 }',
    '  }',
    '} catch { Write-Output $_.Exception.Message; $code = 1 }',
    'finally { if ($fs) { $fs.Dispose() } }',
    'exit $code',
  ].join('\n');
}

/** Run the launch script: check the installer and, only when it is the expected file, start it elevated and wait. */
export function launchElevated(exe: string, expected: { bytes: number; sha256: string | null }): Promise<{ ok: boolean; err: string; mismatch?: boolean }> {
  return new Promise((resolve) => {
    // Encoded, so the script reaches PowerShell exactly as written, whatever the path holds.
    const encoded = Buffer.from(launchScript(exe, expected), 'utf16le').toString('base64');
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeout: 10 * 60 * 1000, windowsHide: true }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ ok: !err, err: String(stdout || err || '').trim(), ...(code === LAUNCH_MISMATCH ? { mismatch: true } : {}) });
    });
  });
}

/** The system calls the driver install makes, so a test can stand in for them. The default is the real thing. */
export interface DriverSys {
  platform: NodeJS.Platform;
  usbState: typeof usbState;
  download: typeof download;
  launchElevated: typeof launchElevated;
  waitFor: typeof waitFor;
  /** The file the installer must be: the published size and pinned SHA-256 unless a test says otherwise. */
  expected?: { bytes: number; sha256: string | null };
}
const realDriverSys: DriverSys = { platform: process.platform, usbState, download, launchElevated, waitFor };

/** Download (if needed), verify, run elevated, then wait for WinUSB to bind to the bootloader. */
export async function installBootloaderDriver(dir: string, onLine: Progress, sys: DriverSys = realDriverSys): Promise<DriverResult> {
  const { usbState, download, launchElevated, waitFor } = sys;
  const want = sys.expected ?? { bytes: DRIVER_BYTES, sha256: DRIVER_SHA256 };
  if (sys.platform !== 'win32') return { ok: true, text: 'No driver is needed on this system.' };
  const before = await usbState();
  if (!before.bootloaderPresent) return { ok: false, text: 'The board is not in bootloader mode. Hold BOOT, tap RESET, release BOOT, then try again.' };
  if (/winusb/i.test(before.bootloaderDriver ?? '')) return { ok: true, text: 'The driver is already installed.' };

  await mkdir(dir, { recursive: true });
  // Copies a run that stopped half way left behind (see below).
  for (const n of await readdir(dir).catch(() => [] as string[])) if (/^proffie-dfu-setup-[0-9a-f]{16}\.exe$/.test(n)) await rm(join(dir, n), { force: true }).catch(() => undefined);
  const exe = join(dir, 'proffie-dfu-setup.exe');
  let have = false;
  try { have = (await stat(exe)).size === want.bytes; } catch { /* not downloaded yet */ }
  if (!have) {
    await rm(exe, { force: true });
    await download(DRIVER_URL, exe, onLine);
  }
  // Verify right before launching: this file is about to run with administrator rights.
  const size = (await stat(exe)).size;
  const hash = await sha256(exe);
  onLine(`installer ${size} bytes, sha256 ${hash}`);
  if (size !== want.bytes || (want.sha256 && hash !== want.sha256)) {
    await rm(exe, { force: true });
    return { ok: false, text: 'The downloaded driver installer is not the file Hiltwright expects, so it was not run. Use the setup page instead.' };
  }

  // The file that runs is a fresh copy under a random name, checked again and started by the same script that holds it
  // open, so nothing can swap it between the check and the start (issue #29). The copy goes once the installer closes.
  const run = join(dir, `proffie-dfu-setup-${randomBytes(8).toString('hex')}.exe`);
  await copyFile(exe, run, constants.COPYFILE_EXCL);
  onLine('asking Windows for administrator approval');
  let launched: Awaited<ReturnType<typeof launchElevated>>;
  try { launched = await launchElevated(run, want); } finally { await rm(run, { force: true }).catch(() => undefined); }
  if (launched.mismatch) {
    await rm(exe, { force: true });
    return { ok: false, text: 'The driver installer changed after it was checked, so it was not run. Try again, or use the setup page instead.' };
  }
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
