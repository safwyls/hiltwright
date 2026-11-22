// Which board a bootloader is, and which one dfu-util talks to (install-target-safety, design D3 and D6). The listings
// are the ones taken from the owner's V2.2 hote2 and V3.9, both in their bootloaders together (task 1.1).

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[][] = [];
let listing = '';
/** What the next flash read returns: firmware of the size asked for, all erased, garbage, or a short read. */
let nextRead: 'firmware' | 'erased' | 'garbage' | 'short' = 'firmware';
const readImage = (bytes: number) => {
  if (nextRead === 'short') return Buffer.alloc(1024, 0x11);
  const b = Buffer.alloc(bytes, nextRead === 'erased' ? 0xff : 0x11);
  if (nextRead === 'firmware') { b[3] = 0x20; b[7] = 0x08; }
  return b;
};
vi.mock('../src/main/toolchain', () => ({
  toolchainPaths: () => ({}),
  findDfuUtil: async () => 'dfu-util.exe',
  run: async (_exe: string, args: string[]) => {
    calls.push(args);
    if (args[0] === '-l') return { code: 0, stdout: listing, stderr: '', ms: 1 };
    const u = args.indexOf('-U');
    const size = Number(/0x08000000:(\d+)/.exec(args[args.indexOf('-s') + 1] ?? '')?.[1] ?? 16);
    if (u >= 0) writeFileSync(args[u + 1], readImage(size));
    return { code: 0, stdout: 'Download done.', stderr: '', ms: 1 };
  },
}));

const { backAfter, backupFlash, backupSizeMismatch, boardForFlash, dfuDeviceArgs, flashTarget, imageKind, isPartialRead, leaveBootloader, listBackups, newBootloaders, parseDfuList, pickDevice, rememberWrite, restoreBackup, serialFromInstanceId, usbStateFrom, writeFirmware } = await import('../src/main/flash');

const HOTE2 = '209133815232';
const V3 = '207A349A5430';
const line = (devnum: number, path: string, alt: number, name: string, serial: string) => `Found DFU: [0483:df11] ver=2200, devnum=${devnum}, cfg=1, intf=0, path="${path}", alt=${alt}, name="${name}", serial="${serial}"`;
const board = (devnum: number, path: string, flash: string, serial: string) => [
  line(devnum, path, 3, '@Device Feature/0xFFFF0000/01*004 e', serial),
  line(devnum, path, 2, '@OTP Memory /0x1FFF7000/01*0001Ke', serial),
  line(devnum, path, 1, '@Option Bytes  /0x1FFF7800/01*040 e', serial),
  line(devnum, path, 0, `@Internal Flash  /0x08000000/${flash}`, serial),
];
const BOTH = ['dfu-util 0.9', '', ...board(56, '1-9.1', '0128*0002Kg', HOTE2), ...board(55, '1-9.2', '0256*0002Kg', V3)].join('\r\n');

describe('reading the bootloaders', () => {
  it('a listing with hote2 and the V3: one device each, with its serial and flash size', () => {
    expect(parseDfuList(BOTH)).toEqual([{ serial: HOTE2, flashBytes: 262144 }, { serial: V3, flashBytes: 524288 }]);
  });

  it('a bootloader that gives no serial is still one device, told apart by its USB path', () => {
    const noSerial = [...board(7, '1-3', '0128*0002Kg', ''), ...board(8, '1-4', '0256*0002Kg', '')].join('\n');
    expect(parseDfuList(noSerial)).toEqual([{ serial: null, flashBytes: 262144 }, { serial: null, flashBytes: 524288 }]);
  });

  it('the board for a flash size: 256 KB is a V2, 512 KB a V3, anything else unknown', () => {
    expect(boardForFlash(262144)).toBe('V2');
    expect(boardForFlash(524288)).toBe('V3');
    expect(boardForFlash(131072)).toBeNull();
    expect(boardForFlash(null)).toBeNull();
  });

  it('the serial in an instance id, and none in an id Windows made up', () => {
    expect(serialFromInstanceId(`USB\\VID_0483&PID_DF11\\${HOTE2}`)).toBe(HOTE2);
    expect(serialFromInstanceId('USB\\VID_0483&PID_DF11\\5&3A692CE1&0&9')).toBeNull();
  });

  it('the USB state lists each bootloader and running board once, leaving out their interfaces', () => {
    const s = usbStateFrom([
      { InstanceId: `USB\\VID_1209&PID_6668\\${HOTE2}`, Service: 'usbccgp', Problem: 0 },
      { InstanceId: 'USB\\VID_1209&PID_6668&MI_00\\7&380A8E11&0&0000', Service: 'usbser', Problem: 0 },
      { InstanceId: `USB\\VID_0483&PID_DF11\\${V3}`, Service: 'WinUSB', Problem: 0 },
      { InstanceId: 'USB\\VID_0483&PID_DF11\\5&3A692CE1&0&9', Service: null, Problem: 28 },
    ]);
    expect(s.runtimeSerials).toEqual([HOTE2]);
    expect(s.bootloaders).toEqual([{ serial: V3, driver: 'WinUSB', problem: 0 }, { serial: null, driver: null, problem: 28 }]);
    expect([s.runtimePresent, s.bootloaderPresent, s.bootloaderDriver]).toEqual([true, true, 'WinUSB']);
  });

  it('the bootloaders that appeared after a reboot are the ones not there before', () => {
    const s = usbStateFrom([{ InstanceId: `USB\\VID_0483&PID_DF11\\${V3}`, Service: 'WinUSB', Problem: 0 }, { InstanceId: `USB\\VID_0483&PID_DF11\\${HOTE2}`, Service: 'WinUSB', Problem: 0 }]);
    expect(newBootloaders(s, [V3]).map((b) => b.serial)).toEqual([HOTE2]);
    expect(newBootloaders(s, [])).toHaveLength(2);
  });

  it('the device for a serial is that one; with no serial, only a single bootloader is taken', () => {
    const devs = parseDfuList(BOTH);
    expect(pickDevice(devs, V3)).toEqual({ serial: V3, flashBytes: 524288 });
    expect(pickDevice(devs, 'NOPE')).toBeNull();
    expect(pickDevice(devs, null)).toBeNull();
    expect(pickDevice([devs[0]], null)).toEqual(devs[0]);
  });
});

describe('talking to one board', () => {
  let dir: string;
  beforeEach(() => { calls.length = 0; listing = BOTH; nextRead = 'firmware'; dir = mkdtempSync(join(tmpdir(), 'hw-flash-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('dfu-util is given the running and bootloader ids, and the serial when there is one', () => {
    expect(dfuDeviceArgs(V3)).toEqual(['-d', '1209:6668,0483:df11', '-S', V3]);
    expect(dfuDeviceArgs(null)).toEqual(['-d', '1209:6668,0483:df11']);
  });

  it('the target for the V3 is its 512 KB and board type', async () => {
    expect(await flashTarget(dir, V3)).toEqual({ serial: V3, flashBytes: 524288, board: 'V3', found: true });
    expect((await flashTarget(dir, null)).found).toBe(false);
  });

  it('a backup reads the whole flash of the board named, and only that board', async () => {
    const r = await backupFlash(dir, join(dir, 'backups'), 'before-install', () => undefined, null, HOTE2);
    expect(r.ok).toBe(true);
    const read = calls.find((a) => a.includes('-U'))!;
    expect(read.slice(0, 4)).toEqual(['-d', '1209:6668,0483:df11', '-S', HOTE2]);
    expect(read).toContain('0x08000000:262144');
  });

  it('a backup with two bootloaders and no serial reads nothing', async () => {
    const r = await backupFlash(dir, join(dir, 'backups'), 'before-install', () => undefined, null, null);
    expect(r.ok).toBe(false);
    expect(calls.some((a) => a.includes('-U'))).toBe(false);
  });

  it('a write goes to the board named', async () => {
    const f = join(dir, 'fw.dfu'); writeFileSync(f, Buffer.alloc(100));
    await writeFirmware(dir, f, () => undefined, V3);
    expect(calls.at(-1)!.slice(0, 4)).toEqual(['-d', '1209:6668,0483:df11', '-S', V3]);
  });

  it('leaving the bootloader reads 4 bytes of the board named, ending with leave, and keeps no file', async () => {
    const r = await leaveBootloader(dir, V3, () => undefined);
    expect(r.ok).toBe(true);
    const args = calls.at(-1)!;
    expect(args.slice(0, 4)).toEqual(['-d', '1209:6668,0483:df11', '-S', V3]);
    expect(args).toContain('0x08000000:4:leave');
    expect(existsSync(args[args.indexOf('-U') + 1])).toBe(false);
  });

  it('a 256 KB backup is not put back on a board with 512 KB of flash', async () => {
    const img = Buffer.alloc(262144); img[3] = 0x20; img[7] = 0x08;
    const f = join(dir, 'b.bin'); writeFileSync(f, img);
    const r = await restoreBackup(dir, f, () => undefined, V3, 524288);
    expect(r).toEqual({ ok: false, ms: 0, detail: 'This backup is from a Proffieboard V2 (256 KB); this saber is a Proffieboard V3 (512 KB). Nothing was written.' });
    expect(calls).toHaveLength(0);
    expect(backupSizeMismatch(524288, 262144)).toBe('This backup is from a Proffieboard V3 (512 KB); this saber is a Proffieboard V2 (256 KB). Nothing was written.');
  });
});

// install-safety-nets design D1 (FW7): a backup counts only when it reads back as this board's firmware.
describe('what a backup read is', () => {
  let dir: string;
  beforeEach(() => { calls.length = 0; listing = BOTH; nextRead = 'firmware'; dir = mkdtempSync(join(tmpdir(), 'hw-kind-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const file = (bytes: Buffer) => { const f = join(dir, `i${Math.random()}.bin`); writeFileSync(f, bytes); return f; };

  it('the kinds: firmware, all erased, short, and garbage', async () => {
    const fw = Buffer.alloc(262144, 0x11); fw[3] = 0x20; fw[7] = 0x08;
    expect(await imageKind(file(fw), 262144)).toBe('firmware');
    expect(await imageKind(file(Buffer.alloc(262144, 0xff)), 262144)).toBe('erased');
    expect(await imageKind(file(fw.subarray(0, 100 * 1024)), 262144)).toBe('unusable');
    expect(await imageKind(file(Buffer.alloc(262144, 0x11)), 262144)).toBe('unusable');
    expect(await imageKind(file(fw), 524288)).toBe('unusable');
    expect(await imageKind(join(dir, 'missing.bin'), 262144)).toBe('unusable');
  });

  it("a backup of hote2's firmware counts, and is kept with its config", async () => {
    const r = await backupFlash(dir, join(dir, 'b'), 'before-install', () => undefined, 'config/hiltwright_hote2.h', HOTE2);
    expect(r).toMatchObject({ ok: true, kind: 'firmware' });
    expect(existsSync(r.file!)).toBe(true);
    expect(existsSync(`${r.file!}.json`)).toBe(true);
  });

  it('an erased read is not a backup, and no file is left', async () => {
    nextRead = 'erased';
    const r = await backupFlash(dir, join(dir, 'b'), 'before-install', () => undefined, 'config/x.h', HOTE2);
    expect(r).toMatchObject({ ok: false, kind: 'erased' });
    expect(r.detail).toMatch(/no firmware on it/);
    expect(readdirSync(join(dir, 'b'))).toEqual([]);
  });

  it('a garbage or short read is not a backup; the file stays, and the list marks it unusable', async () => {
    for (const bad of ['garbage', 'short'] as const) {
      nextRead = bad;
      const r = await backupFlash(dir, join(dir, bad), 'before-install', () => undefined, null, HOTE2);
      expect(r).toMatchObject({ ok: false, kind: 'unusable' });
      expect(existsSync(r.file!)).toBe(true);
      const [listed] = await listBackups(join(dir, bad));
      expect(listed.valid).toBe(false);
    }
  });

  // Issue #12: a write that failed part way can leave new vectors in front of old code, which reads as firmware.
  it('after a write that did not finish, the next read is a partial read: kept, never listed as a backup or put back', async () => {
    const backups = join(dir, 'b');
    await rememberWrite(backups, { ok: false, ms: 900, detail: 'dfu-util: Error during download' });
    const r = await backupFlash(dir, backups, 'before-restore', () => undefined, null, HOTE2);
    expect(r).toMatchObject({ ok: false, kind: 'partial' });
    expect(r.detail).toMatch(/did not finish/);
    expect(existsSync(r.file!)).toBe(true);
    expect(isPartialRead(basename(r.file!))).toBe(true);
    const [listed] = await listBackups(backups);
    expect(listed.valid).toBe(false);
    calls.length = 0;
    expect((await restoreBackup(dir, r.file!, () => undefined, HOTE2, 262144)).ok).toBe(false);
    expect(calls).toHaveLength(0);
    // A write that then succeeds makes the next read a backup again.
    await rememberWrite(backups, { ok: true, ms: 900, detail: 'wrote' });
    expect(await backupFlash(dir, backups, 'before-install', () => undefined, null, HOTE2)).toMatchObject({ ok: true, kind: 'firmware' });
  });

  it('a write refused before anything was sent leaves the next read a backup', async () => {
    const backups = join(dir, 'b');
    await rememberWrite(backups, { ok: false, ms: 0, detail: 'That file is not a full flash backup (256 KB or 512 KB).' });
    await rememberWrite(backups, { ok: false, ms: 5, detail: 'not the build just made', refused: true });
    expect(await backupFlash(dir, backups, 'before-install', () => undefined, null, HOTE2)).toMatchObject({ ok: true, kind: 'firmware' });
  });
});

// install-safety-nets 1.1: once in eleven leaves, the V3.9 came back running without a USB serial.
describe('the saber running again', () => {
  const V3_NO_SERIAL = 'USB\\VID_1209&PID_6668\\6&3026EF5A&0&2';
  const state = (ids: string[]) => usbStateFrom(ids.map((InstanceId) => ({ InstanceId, Service: null, Problem: 0 })));

  it('a board with no serial is counted apart from the ones with a serial', () => {
    const s = state([V3_NO_SERIAL, `USB\\VID_1209&PID_6668\\${HOTE2}`]);
    expect([s.runtimeSerials, s.runtimeNoSerial]).toEqual([[HOTE2], 1]);
  });

  it('back: its serial is running and its bootloader gone', () => {
    expect(backAfter(state([`USB\\VID_1209&PID_6668\\${V3}`]), V3, 0)).toBe(true);
    expect(backAfter(state([`USB\\VID_0483&PID_DF11\\${V3}`]), V3, 0)).toBe(false);
  });

  it('back without its serial: a serial-less board that was not there before, with its bootloader gone', () => {
    expect(backAfter(state([V3_NO_SERIAL]), V3, 0)).toBe(true);
    // A serial-less board that was already running before the wait is somebody else.
    expect(backAfter(state([V3_NO_SERIAL]), V3, 1)).toBe(false);
    expect(backAfter(state([V3_NO_SERIAL, `USB\\VID_0483&PID_DF11\\${V3}`]), V3, 0)).toBe(false);
  });

  it('with no serial to wait for, any running board and no bootloader', () => {
    expect(backAfter(state([V3_NO_SERIAL]), null, 0)).toBe(true);
    expect(backAfter(state([V3_NO_SERIAL, `USB\\VID_0483&PID_DF11\\${HOTE2}`]), null, 0)).toBe(false);
  });
});
