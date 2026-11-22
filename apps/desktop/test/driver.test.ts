// Baseline audit (baseline-firmware firmware-install 5.9): the Windows driver installer is checked (size and pinned
// SHA-256) right before it runs with administrator rights, and a file that fails is deleted and never launched.

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DRIVER_BYTES, DRIVER_SHA256, installBootloaderDriver, launchElevated, launchScript, type DriverSys } from '../src/main/driver';

const noDriver = { runtimePresent: false, bootloaderPresent: true, bootloaderDriver: null, bootloaderProblem: 28, bootloaders: [{ serial: '209133815232', driver: null, problem: 28 }], runtimeSerials: [], runtimeNoSerial: 0 };

function fakes(file: (dest: string) => Promise<void>) {
  const sys: DriverSys = {
    platform: 'win32',
    usbState: vi.fn(async () => noDriver),
    download: vi.fn(async (_url: string, dest: string) => file(dest)),
    launchElevated: vi.fn(async () => ({ ok: true, err: '' })),
    waitFor: vi.fn(async () => ({ ...noDriver, bootloaderDriver: 'WinUSB', bootloaderProblem: 0 })),
  };
  return sys;
}

describe('firmware-install audit', () => {
  it('5.9 a tampered download: a file of the wrong size is deleted, not run, and the owner is told', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    const sys = fakes((dest) => writeFile(dest, Buffer.alloc(1000)));
    const r = await installBootloaderDriver(dir, () => undefined, sys);
    expect(r).toEqual({ ok: false, text: 'The downloaded driver installer is not the file Hiltwright expects, so it was not run. Use the setup page instead.' });
    expect(sys.launchElevated).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'proffie-dfu-setup.exe'))).toBe(false);
  });

  it('5.9 a tampered download: a file of the right size with the wrong SHA-256 is deleted and not run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    // Already on disk at the right size, so it is not downloaded again; the hash is still checked before running.
    await writeFile(join(dir, 'proffie-dfu-setup.exe'), Buffer.alloc(DRIVER_BYTES));
    const sys = fakes(async () => { throw new Error('should not download'); });
    const r = await installBootloaderDriver(dir, () => undefined, sys);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/not the file Hiltwright expects/);
    expect(sys.download).not.toHaveBeenCalled();
    expect(sys.launchElevated).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'proffie-dfu-setup.exe'))).toBe(false);
  });

  it('launches a file that passes the check, once, and waits for the driver', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    const sys = fakes((dest) => writeFile(dest, Buffer.alloc(DRIVER_BYTES)));
    // Stand in for the published file: pin this file's hash for the test. The real installer is not a file of zeros.
    const sha256 = createHash('sha256').update(Buffer.alloc(DRIVER_BYTES)).digest('hex');
    expect(sha256).not.toBe(DRIVER_SHA256);
    const r = await installBootloaderDriver(dir, () => undefined, { ...sys, expected: { bytes: DRIVER_BYTES, sha256 } });
    expect(r).toEqual({ ok: true, text: 'Driver installed. The bootloader is ready.' });
    expect(sys.launchElevated).toHaveBeenCalledTimes(1);
  });
});

// Issue #29: the file that runs elevated is a fresh copy under a random name, checked and started by one script.
describe('starting the driver installer', () => {
  const zeros = () => createHash('sha256').update(Buffer.alloc(DRIVER_BYTES)).digest('hex');

  it('runs a fresh copy under a random name with the expected size and hash, and removes the copy afterwards', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    const sys = fakes((dest) => writeFile(dest, Buffer.alloc(DRIVER_BYTES)));
    const seen: { exe: string; there: boolean; want: unknown }[] = [];
    sys.launchElevated = vi.fn(async (exe: string, want: { bytes: number; sha256: string | null }) => { seen.push({ exe, there: existsSync(exe), want }); return { ok: true, err: '' }; });
    const expected = { bytes: DRIVER_BYTES, sha256: zeros() };
    await installBootloaderDriver(dir, () => undefined, { ...sys, expected });
    expect(seen).toHaveLength(1);
    expect(basename(seen[0].exe)).toMatch(/^proffie-dfu-setup-[0-9a-f]{16}\.exe$/);
    expect(seen[0].there).toBe(true);
    expect(seen[0].want).toEqual(expected);
    expect(existsSync(seen[0].exe)).toBe(false);
    expect(readdirSync(dir)).toEqual(['proffie-dfu-setup.exe']);
  });

  it('a second run picks another name, and copies a stopped run left behind are cleared', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    await writeFile(join(dir, 'proffie-dfu-setup-0123456789abcdef.exe'), 'left over');
    const sys = fakes((dest) => writeFile(dest, Buffer.alloc(DRIVER_BYTES)));
    const names: string[] = [];
    sys.launchElevated = vi.fn(async (exe: string) => { names.push(basename(exe)); return { ok: true, err: '' }; });
    await installBootloaderDriver(dir, () => undefined, { ...sys, expected: { bytes: DRIVER_BYTES, sha256: zeros() } });
    await installBootloaderDriver(dir, () => undefined, { ...sys, expected: { bytes: DRIVER_BYTES, sha256: zeros() } });
    expect(names[0]).not.toBe(names[1]);
    expect(readdirSync(dir)).toEqual(['proffie-dfu-setup.exe']);
  });

  it('when the script finds the file changed, nothing runs, the download is deleted, and the owner is told', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    const sys = fakes((dest) => writeFile(dest, Buffer.alloc(DRIVER_BYTES)));
    sys.launchElevated = vi.fn(async () => ({ ok: false, err: 'sha256 00', mismatch: true }));
    const r = await installBootloaderDriver(dir, () => undefined, { ...sys, expected: { bytes: DRIVER_BYTES, sha256: zeros() } });
    expect(r).toEqual({ ok: false, text: 'The driver installer changed after it was checked, so it was not run. Try again, or use the setup page instead.' });
    expect(sys.waitFor).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('the script checks size and hash from the handle it holds before it starts anything', () => {
    const s = launchScript("C:\\Users\\O'Neil\\x.exe", { bytes: 3034643, sha256: 'ab'.repeat(32) });
    expect(s).toContain("$p = 'C:\\Users\\O''Neil\\x.exe'");
    expect(s).toContain('[System.IO.FileShare]::Read');
    expect(s.indexOf('Get-FileHash -InputStream $fs')).toBeLessThan(s.indexOf('Start-Process'));
    expect(s).toContain('$fs.Length -ne 3034643');
    expect(s).toContain('-Verb RunAs');
  });

  // Real PowerShell, with a file that does not match: the script must refuse before Start-Process. The file is plain
  // text, so even a broken check could not start a program.
  it.skipIf(process.platform !== 'win32')('the real script refuses a file of the wrong hash or size, starting nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-drv-'));
    const f = join(dir, "not an installer's file.txt");
    await writeFile(f, 'hello');
    const hash = createHash('sha256').update('hello').digest('hex');
    expect(await launchElevated(f, { bytes: 5, sha256: 'ff'.repeat(32) })).toMatchObject({ ok: false, mismatch: true, err: expect.stringContaining('sha256 ' + hash) });
    expect(await launchElevated(f, { bytes: 6, sha256: hash })).toMatchObject({ ok: false, mismatch: true, err: 'size 5' });
    expect(await launchElevated(join(dir, 'missing.exe'), { bytes: 5, sha256: hash })).toMatchObject({ ok: false });
  }, 30000);
});
