// The install and restore sequences of Build & Flash, run against a fake USB world: which boards are running, which
// are in their bootloaders, and each one's flash. Baseline audit (baseline-firmware firmware-install 5.5, 5.11, 5.13),
// and install-target-safety (design D3-D6): which board is written, and every refusal before anything is touched.

import { describe, expect, it, vi } from 'vitest';
import type { SaberConfigModel } from '@hiltwright/core';
import type { BackupInfo, BuildResult, SaberRecord, UsbState } from '../src/shared/api';
import { STOPPED_HINT, applyStagedPresets, checkBoard, installSequence, samePresets, restoreSequence, writeFromBootloader, type InstallDeps, type InstallJob, type InstallReport } from '../src/renderer/src/installFlow';

const HOTE2 = '209133815232';
const V3 = '207A349A5430';
const model = { name: 'hiltwright_hote2', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263', blades: [], presets: [] } as unknown as SaberConfigModel;
const saberRec = (over: Partial<SaberRecord> = {}): SaberRecord => ({ id: 's1', name: 'hote2', identity: { usbSerial: HOTE2 }, ...over } as unknown as SaberRecord);
const v3Rec: SaberRecord = { id: 's3', name: 'The V3', identity: { usbSerial: V3 } } as unknown as SaberRecord;
const build = (board: 'V2' | 'V3' = 'V2') => ({ ok: true, board, dfuPath: 'C:\\b\\s1\\ProffieOS.ino.dfu', manifest: { hash: 'abc', looks: [] }, os: 'v8.10' }) as unknown as BuildResult;
const jobFor = (over: Partial<InstallJob> = {}): InstallJob => ({
  saber: saberRec(), model, result: build(), connected: true,
  info: { version: { config: 'config/hiltwright_hote2.h' } } as unknown as InstallJob['info'], ...over,
});

/** The boards plugged in: serial → flash size, and whether each is running or in its bootloader. */
type Board = { serial: string | null; flash: number; mode: 'run' | 'boot' };
type Over = {
  backup?: { ok: boolean; detail?: string; kind?: 'firmware' | 'erased' | 'unusable' | 'partial'; file?: string }; write?: () => Promise<{ ok: boolean; detail: string }>; runtime?: boolean; confirm?: boolean;
  /** The owner's answer when the board cannot be backed up and the install asks whether to go on (issue #12). Absent: never asked. */
  noBackup?: boolean;
  connectedSerial?: string; noDriver?: boolean; reached?: SaberRecord | null; leaveFails?: boolean;
  /** What the saber reports when it is read after the reconnect. */
  comesBackAs?: { config: string | null; version: string | null };
  recordFails?: string;
  /** Staged presets: what the new firmware has compiled in, whether the saber keeps its own after a restart, and whether the restart fails. */
  compiled?: { font: string; track: string; name: string }[]; keepsOwn?: boolean; restartFails?: boolean;
  /** Its SD card is out (in a reader): it starts with its firmware's presets, there being no presets.ini to read. */
  cardOut?: boolean;
  /** Its presets file went on the card trip before the install: it comes back with the compiled presets at once. */
  clearedOnTrip?: boolean;
};
/** The saber read after a reconnect: the record for that serial, just seen, reporting what `comesBackAs` says. */
const readBack = (serial: string | null | undefined, over: Over): SaberRecord | null => {
  const rec = serial === V3 ? v3Rec : serial === HOTE2 || serial == null ? saberRec() : null;
  if (!rec) return null;
  const said = over.comesBackAs ?? { config: rec.id === 's3' ? 'config/hiltwright_v3.h' : 'config/hiltwright_hote2.h', version: 'v8.10 hiltwright abc' };
  return { ...rec, lastSeen: new Date(Date.now() + 1000).toISOString(), identity: { ...rec.identity, configName: said.config, version: said.version } } as SaberRecord;
};
function world(boards: Board[], over: Over = {}) {
  const calls: string[] = [];
  const reports: InstallReport[] = [];
  let reached: SaberRecord | null = null;
  // The presets the saber reports, and whether its presets file has been removed.
  let onSaber = over.clearedOnTrip && over.compiled ? over.compiled.map((c) => ({ ...c, styles: ['builtin 0 1'], variation: 0 })) : [{ font: 'Old;common', track: '', styles: ['builtin 0 1'], name: 'Old', variation: 0 }];
  let removed = false;
  const connectedSerial = over.connectedSerial ?? HOTE2;
  const usb = (): UsbState => {
    const boots = boards.filter((b) => b.mode === 'boot');
    return {
      runtimePresent: boards.some((b) => b.mode === 'run'), bootloaderPresent: boots.length > 0, bootloaderDriver: boots.length ? 'WinUSB' : null, bootloaderProblem: null,
      bootloaders: boots.map((b) => ({ serial: b.serial, driver: over.noDriver ? null : 'WinUSB', problem: over.noDriver ? 28 : 0 })),
      runtimeSerials: boards.filter((b) => b.mode === 'run' && b.serial).map((b) => b.serial!),
      runtimeNoSerial: boards.filter((b) => b.mode === 'run' && !b.serial).length,
    };
  };
  const deps: InstallDeps = {
    flash: {
      usb: vi.fn(async () => { calls.push('usb'); return usb(); }),
      waitForBootloader: vi.fn(async (_ms: number, before?: (string | null)[]) => {
        calls.push('waitForBootloader');
        const fresh = usb().bootloaders.filter((b) => !(before ?? []).includes(b.serial));
        return { ok: fresh.length > 0 && !over.noDriver, text: over.noDriver ? 'Windows has no usable driver' : 'Bootloader ready (WinUSB).', serials: fresh.map((b) => b.serial) };
      }),
      target: vi.fn(async (serial: string | null) => {
        calls.push(`target ${serial}`);
        const boots = boards.filter((b) => b.mode === 'boot');
        const b = serial ? boots.find((x) => x.serial === serial) : boots.length === 1 ? boots[0] : undefined;
        const board = b?.flash === 262144 ? 'V2' as const : b?.flash === 524288 ? 'V3' as const : null;
        return { serial, flashBytes: b?.flash ?? null, board, found: !!b };
      }),
      leave: vi.fn(async (serial: string | null) => {
        calls.push(`leave ${serial}`);
        if (over.leaveFails) return { ok: false, ms: 1, detail: 'dfu-util: error' };
        for (const b of boards) if (b.mode === 'boot' && b.serial === serial) b.mode = 'run';
        return { ok: true, ms: 1, detail: 'left the bootloader' };
      }),
      backup: vi.fn(async (_id: string, _l: string, _c?: string | null, serial?: string | null) => { calls.push(`backup ${serial}`); return { ok: true, ms: 1, detail: 'backup written', file: 'C:\\backups\\before-install.bin', kind: 'firmware' as const, ...over.backup }; }),
      write: vi.fn(async (_id: string, _p: string, serial?: string | null) => {
        calls.push(`write ${serial}`);
        const r = over.write ? { ms: 1, ...(await over.write()) } : { ok: true, ms: 1, detail: 'wrote' };
        if (r.ok) for (const b of boards) if (b.mode === 'boot' && b.serial === serial) b.mode = 'run';
        return r;
      }),
      restore: vi.fn(async (_id: string, _f: string, serial?: string | null) => { calls.push(`restore ${serial}`); for (const b of boards) if (b.serial === serial) b.mode = 'run'; return { ok: true, ms: 1, detail: 'restored' }; }),
      waitForRuntime: vi.fn(async (_ms: number, serial?: string | null) => { calls.push(`waitForRuntime ${serial}`); return over.runtime ?? true; }),
    },
    snapshots: { save: vi.fn() },
    noteBootloader: vi.fn(async (id: string, seen: { serial: string | null; flashBytes: number }) => { calls.push(`note ${id} ${seen.serial} ${seen.flashBytes}`); return {} as SaberRecord; }),
    sabers: [saberRec(), v3Rec],
    confirmTarget: vi.fn(async (name: string) => { calls.push(`ask ${name}`); return over.confirm ?? true; }),
    ...(over.noBackup !== undefined ? { confirmNoBackup: vi.fn(async (name: string) => { calls.push(`ask no backup ${name}`); return over.noBackup!; }) } : {}),
    board: {
      info: null,
      send: vi.fn(async (cmd: string) => { calls.push(cmd); if (cmd === 'del presets.ini') removed = true; return { lines: [] }; }),
      restartSaber: vi.fn(async () => {
        calls.push('restart');
        if (over.restartFails) return false;
        if ((removed || over.cardOut) && !over.keepsOwn && over.compiled) onSaber = over.compiled.map((c) => ({ ...c, styles: ['builtin 0 1'], variation: 0 }));
        return true;
      }),
      currentPresets: vi.fn(() => onSaber),
      rebootToBootloader: vi.fn(async () => { calls.push('reboot'); for (const b of boards) if (b.serial === connectedSerial) b.mode = 'boot'; return true; }),
      connect: vi.fn(async (_i?: boolean, o?: { serial?: string | null }) => { calls.push(`connect ${o?.serial ?? null}`); reached = over.reached !== undefined ? over.reached : readBack(o?.serial, over); }),
      expectAfterInstall: vi.fn(),
      reachNext: vi.fn(async (serial: string | null) => { calls.push(`reach ${serial}`); return true; }),
      currentSaber: vi.fn(() => reached),
      updateSaber: vi.fn(async () => { calls.push('updateSaber'); if (over.recordFails) throw new Error(over.recordFails); }),
    } as unknown as InstallDeps['board'],
    report: (r) => reports.push(r),
    sleep: async () => undefined,
  };
  /** What the page shows at the end: the last step and note reported. */
  const shown = () => ({ step: [...reports].reverse().find((r) => r.step)?.step, note: [...reports].reverse().find((r) => r.note !== undefined)?.note ?? null });
  const touched = () => calls.filter((c) => /^(backup|write|restore)/.test(c));
  /** The notes shown under the main one, from the last report that set them. */
  const extra = () => [...reports].reverse().find((r) => r.notes !== undefined)?.notes ?? [];
  return { deps, calls, shown, touched, boards, extra };
}
const hote2 = (mode: Board['mode'] = 'run'): Board => ({ serial: HOTE2, flash: 262144, mode });
const theV3 = (mode: Board['mode'] = 'run'): Board => ({ serial: V3, flash: 524288, mode });

describe('firmware-install audit', () => {
  it('a normal install: reboot, check, backup, write, record, wait, reconnect, check, and "Installed and checked" with the backup location', async () => {
    const f = world([hote2()]);
    await installSequence(f.deps, jobFor());
    expect(f.calls).toEqual(['usb', 'reboot', 'waitForBootloader', `target ${HOTE2}`, `note s1 ${HOTE2} 262144`, `backup ${HOTE2}`, `reach ${HOTE2}`, `write ${HOTE2}`, 'updateSaber', `waitForRuntime ${HOTE2}`, `connect ${HOTE2}`]);
    expect(f.shown()).toEqual({ step: 'done', note: { tone: 'green', text: 'Installed and checked: the saber reports config/hiltwright_hote2.h, v8.10 hiltwright abc. Backup of the previous firmware: C:\\backups\\before-install.bin' } });
    expect(f.deps.board.expectAfterInstall).toHaveBeenCalledWith('s1', 'config/hiltwright_hote2.h');
  });

  it('5.5 the backup fails: the install stops with "Backup failed, so nothing was written", and nothing is written', async () => {
    const f = world([hote2()], { backup: { ok: false, detail: 'dfu-util: Cannot open DFU device' } });
    await installSequence(f.deps, jobFor());
    expect(f.deps.flash.write).not.toHaveBeenCalled();
    expect(f.shown().step).toBe('failed');
    expect(f.shown().note?.text).toMatch(/^Backup failed, so nothing was written\./);
  });

  it('5.11 the saber does not come back: the page says it was written and asks to unplug, replug and connect', async () => {
    const f = world([hote2()], { runtime: false });
    await installSequence(f.deps, jobFor());
    expect(f.calls.some((c) => c.startsWith('connect'))).toBe(false);
    expect(f.shown().note).toEqual({ tone: 'amber', text: 'The firmware was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' });
    // FW9 (install-safety-nets): the record already holds the new firmware, written before the wait.
    expect(f.calls.indexOf('updateSaber')).toBeLessThan(f.calls.indexOf(`waitForRuntime ${HOTE2}`));
  });

  it('5.13 an unexpected error: the page shows "Stopped" with the error, the BOOT/RESET steps and the backup reminder', async () => {
    const f = world([hote2()], { write: async () => { throw new Error('dfu-util crashed'); } });
    await installSequence(f.deps, jobFor());
    expect(f.shown().step).toBe('failed');
    expect(f.shown().note).toEqual({ tone: 'red', text: 'Error: dfu-util crashed' });
    expect(STOPPED_HINT).toMatch(/hold BOOT, tap RESET, release BOOT/);
    expect(STOPPED_HINT).toMatch(/backup can always be put back from the Backups tab/);
  });

  it('the bootloader has no driver yet: the install pauses at the driver step with nothing touched', async () => {
    const f = world([hote2()], { noDriver: true });
    await installSequence(f.deps, jobFor());
    expect(f.shown().step).toBe('driver');
    expect(f.touched()).toEqual([]);
  });
});

describe('the board type (design D3)', () => {
  it('a V2 build on a board whose bootloader reports 512 KB: stopped with the words, and nothing read or written', async () => {
    const f = world([theV3()], { connectedSerial: V3 });
    await installSequence(f.deps, jobFor({ saber: v3Rec }));
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toBe('This saber is a Proffieboard V3, but this firmware was built for a V2. Nothing was written. Choose V3 on the Wiring page and build again. The saber is back on the firmware it had.');
    expect(f.calls).toContain(`leave ${V3}`);
    // The board is learnt all the same, so the Wiring page shows the saber's real board.
    expect(f.calls).toContain(`note s3 ${V3} 524288`);
  });

  it('a board Hiltwright knows is a V3 is not even rebooted for a V2 build', async () => {
    const f = world([theV3()], { connectedSerial: V3 });
    await installSequence(f.deps, jobFor({ saber: { ...v3Rec, bootloader: { serial: V3, flashBytes: 524288, board: 'V3', at: '' } } }));
    expect(f.calls).toEqual([]);
    expect(f.shown().note?.text).toBe('This saber is a Proffieboard V3, but this firmware was built for a V2. Nothing was written. Choose V3 on the Wiring page and build again.');
  });

  it('a flash size Hiltwright does not know: stopped, nothing written', async () => {
    const f = world([{ serial: HOTE2, flash: 131072, mode: 'run' }]);
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toMatch(/^Hiltwright does not recognise this board \(its bootloader reports 128 KB of flash\)\. Nothing was written\./);
  });

  it('a V3 build on the V3: goes ahead, and its board is remembered', async () => {
    const f = world([theV3()], { connectedSerial: V3 });
    await installSequence(f.deps, jobFor({ saber: v3Rec, result: build('V3') }));
    expect(f.calls).toContain(`note s3 ${V3} 524288`);
    expect(f.shown().step).toBe('done');
  });
});

describe('which board (design D4, D6)', () => {
  it('two sabers plugged in: only the connected one is rebooted, checked, backed up and written', async () => {
    const f = world([theV3(), hote2()]);
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
    expect(f.boards.find((b) => b.serial === V3)!.mode).toBe('run');
  });

  it('another board already in its bootloader while installing the connected saber: the new one is the target', async () => {
    const f = world([theV3('boot'), hote2()]);
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
  });

  it('two bootloaders appear after one reboot: stopped, nothing read', async () => {
    const f = world([hote2(), { serial: 'OTHER1', flash: 262144, mode: 'run' }]);
    (f.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => { for (const b of f.boards) b.mode = 'boot'; return true; });
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toBe('More than one board is in bootloader mode. Unplug the other Proffieboards, then press Install again.');
  });

  // Issue #4: the connected saber ignores or delays its reboot while another board enters its bootloader.
  const othersBootloaderInstead = (f: ReturnType<typeof world>, serial: string) => (f.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls(f).push('reboot'); for (const b of f.boards) if (b.serial === serial) b.mode = 'boot'; return true; });
  const calls = (f: ReturnType<typeof world>) => f.calls;

  it('another known saber enters its bootloader while this one keeps running: refused, nothing paired, backed up or written (issue #4)', async () => {
    const f = world([hote2(), theV3()]);
    othersBootloaderInstead(f, V3);
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([]);
    expect(f.calls.filter((c) => c.startsWith('note'))).toEqual([]);
    expect(f.shown().note?.text).toMatch(/The V3/);
  });

  it('an unknown board enters its bootloader while this one keeps running: "ignored the reboot", nothing touched (issue #4)', async () => {
    const f = world([hote2(), { serial: 'STRANGER1', flash: 262144, mode: 'run' }]);
    othersBootloaderInstead(f, 'STRANGER1');
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([]);
    expect(f.calls.filter((c) => c.startsWith('note') || c.startsWith('ask'))).toEqual([]);
    expect(f.shown().step).toBe('failed');
  });

  it('a board with another serial appears after this saber left: asked, and never paired on the answer (issue #4)', async () => {
    const f = world([hote2(), { serial: 'STRANGER1', flash: 262144, mode: 'run' }]);
    (f.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      f.calls.push('reboot');
      for (const b of f.boards) if (b.serial === 'STRANGER1') b.mode = 'boot';
      f.boards.splice(f.boards.findIndex((b) => b.serial === HOTE2), 1); // this saber unplugged
      return true;
    });
    await installSequence(f.deps, jobFor());
    expect(f.calls).toContain('ask hote2');
    expect(f.calls.filter((c) => c.startsWith('note'))).toEqual([]);
    expect(f.touched()).toEqual(['backup STRANGER1', 'write STRANGER1']);
    const g = world([hote2(), { serial: 'STRANGER1', flash: 262144, mode: 'run' }], { confirm: false });
    (g.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => { for (const b of g.boards) if (b.serial === 'STRANGER1') b.mode = 'boot'; g.boards.splice(g.boards.findIndex((b) => b.serial === HOTE2), 1); return true; });
    await installSequence(g.deps, jobFor());
    expect(g.touched()).toEqual([]);
  });

  it('checking the board: another board that appears is not read or remembered (issue #4)', async () => {
    const f = world([hote2(), theV3()]);
    othersBootloaderInstead(f, V3);
    const r = await checkBoard(f.deps, saberRec());
    expect(r.tone).toBe('red');
    expect(r.board).toBeNull();
    expect(f.calls.filter((c) => c.startsWith('note') || c.startsWith('target'))).toEqual([]);
  });

  it("this saber's board already in its bootloader, not connected: recognised by its serial, no reboot, no question", async () => {
    const f = world([hote2('boot')]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.calls).not.toContain('reboot');
    expect(f.deps.confirmTarget).not.toHaveBeenCalled();
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
    expect(f.calls).toContain(`note s1 ${HOTE2} 262144`);
  });

  it('recognised by the serial its bootloader showed before, when that differs from its running serial', async () => {
    const f = world([{ serial: '206033865232', flash: 262144, mode: 'boot' }]);
    await installSequence(f.deps, jobFor({ connected: false, saber: saberRec({ bootloader: { serial: '206033865232', flashBytes: 262144, board: 'V2', at: '' } }) }));
    expect(f.deps.confirmTarget).not.toHaveBeenCalled();
    expect(f.touched()).toEqual(['backup 206033865232', 'write 206033865232']);
  });

  it("another saber's board in its bootloader: stopped, naming it, nothing read or written", async () => {
    const f = world([theV3('boot')]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toMatch(/^The board in bootloader mode is The V3, not hote2\. Nothing was written\./);
  });

  it('a board nobody knows: the owner is asked, naming the saber; Cancel touches nothing', async () => {
    const f = world([{ serial: 'NEW123', flash: 262144, mode: 'boot' }], { confirm: false });
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.deps.confirmTarget).toHaveBeenCalledWith('hote2');
    expect(f.touched()).toEqual([]);
    expect(f.shown()).toEqual({ step: 'built', note: null });
  });

  it('a board nobody knows, confirmed: installed, but the pairing is not remembered when the saber does not come back as itself', async () => {
    const f = world([{ serial: 'NEW123', flash: 262144, mode: 'boot' }]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.touched()).toEqual(['backup NEW123', 'write NEW123']);
    expect(f.calls.some((c) => c.startsWith('note'))).toBe(false);
    expect(f.calls).toContain('waitForRuntime null');
  });

  it('a board nobody knows, confirmed, that comes back running as this saber: now the pairing is remembered', async () => {
    const f = world([{ serial: 'BOOT999', flash: 262144, mode: 'boot' }]);
    (f.deps.flash.write as ReturnType<typeof vi.fn>).mockImplementation(async (_id: string, _p: string, serial?: string | null) => {
      f.calls.push(`write ${serial}`);
      f.boards[0] = { serial: HOTE2, flash: 262144, mode: 'run' };
      return { ok: true, ms: 1, detail: 'wrote' };
    });
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.calls).toContain('note s1 BOOT999 262144');
    expect(f.calls).toContain(`connect ${HOTE2}`);
  });

  it('a mistaken confirmation: a V3 board said to be the V2 saber is still refused by its flash size', async () => {
    const f = world([{ serial: 'NEW123', flash: 524288, mode: 'boot' }]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toMatch(/^This saber is a Proffieboard V3, but this firmware was built for a V2/);
  });

  it('two bootloaders, neither this saber: stopped, nothing read', async () => {
    const f = world([{ serial: 'A1', flash: 262144, mode: 'boot' }, { serial: 'B2', flash: 262144, mode: 'boot' }]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toBe('More than one board is in bootloader mode. Unplug the other Proffieboards, then press Install again.');
  });

  it('two bootloaders, one of them this saber: that one is written', async () => {
    const f = world([theV3('boot'), hote2('boot')]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
  });

  it('after the driver step, writing from the bootloader finds the saber by its serial again', async () => {
    const f = world([theV3('run'), hote2('boot')]);
    await writeFromBootloader(f.deps, jobFor());
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
  });
});

describe('reconnecting to the installed saber (design D6, HW-2026-09-25c)', () => {
  it('from before the write, only the saber being installed may be opened; the reconnect asks for it by serial', async () => {
    const f = world([theV3(), hote2()]);
    await installSequence(f.deps, jobFor());
    expect(f.calls.indexOf(`reach ${HOTE2}`)).toBeLessThan(f.calls.indexOf(`write ${HOTE2}`));
    expect(f.calls).toContain(`connect ${HOTE2}`);
    expect(f.shown().note?.tone).toBe('green');
  });

  it('when another saber answers the reconnect, the page says which', async () => {
    const f = world([theV3(), hote2()], { reached: v3Rec });
    await installSequence(f.deps, jobFor());
    expect(f.shown()).toEqual({ step: 'done', note: { tone: 'amber', text: 'Installed on hote2. Reconnected to The V3, which is also plugged in, so the install was not checked. Backup of the previous firmware: C:\\backups\\before-install.bin' } });
  });

  it('a board the owner vouched for is not waited on by serial: any board coming back will do', async () => {
    const f = world([{ serial: 'NEW123', flash: 262144, mode: 'boot' }]);
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.calls.some((c) => c.startsWith('reach'))).toBe(false);
    expect(f.calls).toContain('connect null');
  });
});

describe('what is recorded (design D5)', () => {
  it('the record after the install is the model the job carries, the one the build was made from', async () => {
    const f = world([hote2()]);
    const builtFrom = { ...model, name: 'hiltwright_built' } as SaberConfigModel;
    await installSequence(f.deps, jobFor({ model: builtFrom }));
    expect(f.deps.board.expectAfterInstall).toHaveBeenCalledWith('s1', 'config/hiltwright_built.h');
    expect(f.deps.board.updateSaber).toHaveBeenCalledWith(expect.objectContaining({ model: expect.objectContaining({ name: 'hiltwright_built' }) }), 's1');
  });
});

describe('putting a backup back', () => {
  const backup = (bytes: number): BackupInfo => ({ file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'before install', bytes, valid: true, configName: 'config/hiltwright_hote2.h' });

  it('a 256 KB backup on a board whose bootloader reports 512 KB: stopped, nothing written', async () => {
    const f = world([theV3()], { connectedSerial: V3 });
    await restoreSequence(f.deps, v3Rec, backup(262144), true);
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toMatch(/^This backup is from a Proffieboard V2 \(256 KB\); this saber is a Proffieboard V3 \(512 KB\)\. Nothing was written\./);
  });

  it("the saber's own backup goes back to its own board, and it reconnects to it", async () => {
    const f = world([theV3(), hote2()]);
    await restoreSequence(f.deps, saberRec(), backup(262144), true);
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
    expect(f.calls).toContain(`connect ${HOTE2}`);
    expect(f.shown().step).toBe('done');
  });

  it("another saber's board in its bootloader: a restore is refused like an install", async () => {
    const f = world([theV3('boot')]);
    await restoreSequence(f.deps, saberRec(), backup(262144), false);
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toMatch(/^The board in bootloader mode is The V3, not hote2\./);
  });
});

// Design D8: checking the board without installing anything.
describe('checking the board', () => {
  it('the V3: rebooted, 512 KB read and remembered, sent back, reconnected; nothing backed up or written', async () => {
    const f = world([theV3()], { connectedSerial: V3 });
    const r = await checkBoard(f.deps, v3Rec);
    expect(r).toEqual({ tone: 'green', text: 'This saber is a Proffieboard V3. Nothing was written.', board: 'V3' });
    expect(f.calls).toEqual(['usb', 'reboot', 'waitForBootloader', `target ${V3}`, `note s3 ${V3} 524288`, `leave ${V3}`, `reach ${V3}`, `waitForRuntime ${V3}`, `connect ${V3}`]);
    expect(f.touched()).toEqual([]);
    expect(f.boards[0].mode).toBe('run');
  });

  it('no bootloader driver yet: the words, how to get back, and nothing more is tried', async () => {
    const f = world([theV3()], { connectedSerial: V3, noDriver: true });
    const r = await checkBoard(f.deps, v3Rec);
    expect(r.tone).toBe('amber');
    expect(r.text).toBe('Windows has no driver for the bootloader yet. It is installed with the first flash on Build & Flash; choose the board yourself for now. To bring the saber back to its firmware, press RESET on the board, or unplug it and plug it back in.');
    expect(f.calls.some((c) => /^(target|leave|note)/.test(c))).toBe(false);
  });

  it('two bootloaders appear: nothing is read, and the owner is told how to get back', async () => {
    const f = world([theV3(), { serial: 'OTHER1', flash: 262144, mode: 'run' }], { connectedSerial: V3 });
    (f.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => { for (const b of f.boards) b.mode = 'boot'; return true; });
    const r = await checkBoard(f.deps, v3Rec);
    expect(r.text).toMatch(/^More than one board is in bootloader mode\./);
    expect(f.calls.some((c) => /^(target|leave|note)/.test(c))).toBe(false);
  });

  it('a flash size Hiltwright does not know: sent back all the same, not remembered, and said', async () => {
    const f = world([{ serial: V3, flash: 131072, mode: 'run' }], { connectedSerial: V3 });
    const r = await checkBoard(f.deps, v3Rec);
    expect(r).toEqual({ tone: 'amber', text: 'Hiltwright does not recognise this board (its bootloader reports 128 KB of flash). Nothing was written. Choose the board yourself.', board: null });
    expect(f.calls).toContain(`leave ${V3}`);
    expect(f.calls.some((c) => c.startsWith('note'))).toBe(false);
  });

  it('the saber cannot be sent back: the board found, and the RESET words', async () => {
    const f = world([theV3()], { connectedSerial: V3, leaveFails: true });
    const r = await checkBoard(f.deps, v3Rec);
    expect(r).toEqual({ tone: 'amber', text: 'This saber is a Proffieboard V3. Hiltwright could not send it back to its firmware. To bring the saber back to its firmware, press RESET on the board, or unplug it and plug it back in.', board: 'V3' });
    expect(f.calls.some((c) => c.startsWith('connect'))).toBe(false);
  });
});

// install-safety-nets design D2 (FW29): a stop before the write sends this saber's board back to its firmware.
describe('stopping before the write', () => {
  it('a failed backup: nothing written, the saber sent back and reconnected, and said so', async () => {
    const f = world([hote2()], { backup: { ok: false, detail: 'dfu-util: Cannot open DFU device', kind: undefined } });
    await installSequence(f.deps, jobFor());
    expect(f.deps.flash.write).not.toHaveBeenCalled();
    expect(f.calls.slice(-4)).toEqual([`leave ${HOTE2}`, `reach ${HOTE2}`, `waitForRuntime ${HOTE2}`, `connect ${HOTE2}`]);
    expect(f.shown().note?.text).toBe('Backup failed, so nothing was written. dfu-util: Cannot open DFU device The saber is back on the firmware it had.');
  });

  it('when the board cannot be sent back, the RESET words', async () => {
    const f = world([hote2()], { backup: { ok: false, detail: 'x' }, leaveFails: true });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note?.text).toMatch(/To bring the saber back to its firmware, press RESET on the board, or unplug it and plug it back in\.$/);
  });

  it('a failed write leaves the board in its bootloader, naming the backup', async () => {
    const f = world([hote2()], { write: async () => ({ ok: false, detail: 'dfu-util: Error during download' }) });
    await installSequence(f.deps, jobFor());
    expect(f.calls.some((c) => c.startsWith('leave'))).toBe(false);
    expect(f.shown().note?.text).toMatch(/^Writing failed\. The backup from just now is at C:.+before-install\.bin\./);
    expect(f.calls).not.toContain('updateSaber');
  });

  it("another saber's board, or two bootloaders, are left alone", async () => {
    const a = world([theV3('boot')]);
    await installSequence(a.deps, jobFor({ connected: false }));
    const b = world([{ serial: 'A1', flash: 262144, mode: 'boot' }, { serial: 'B2', flash: 262144, mode: 'boot' }]);
    await installSequence(b.deps, jobFor({ connected: false }));
    for (const f of [a, b]) expect(f.calls.some((c) => c.startsWith('leave'))).toBe(false);
  });

  it('a saber that ignores the reboot and keeps running: said so, nothing touched', async () => {
    const f = world([hote2()]);
    (f.deps.board.rebootToBootloader as ReturnType<typeof vi.fn>).mockImplementation(async () => true);
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([]);
    expect(f.shown().note?.text).toBe('The saber did not restart into bootloader mode; it is still running its firmware. Hold BOOT, tap RESET, release BOOT, then press Install again.');
  });
});

// Design D1, D4 (FW7, FW8): backups that count, in the install and before a restore.
describe('backups in the sequences', () => {
  it('a blank board (an erased read): the install goes on, and says there was nothing to back up', async () => {
    const f = world([hote2()], { backup: { ok: false, kind: 'erased', detail: 'erased', file: undefined } });
    await installSequence(f.deps, jobFor());
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
    expect(f.shown()).toEqual({ step: 'done', note: { tone: 'green', text: 'Installed and checked: the saber reports config/hiltwright_hote2.h, v8.10 hiltwright abc.' } });
    expect(f.extra()).toEqual([{ tone: 'amber', text: 'The board had no firmware on it, so there was nothing to back up.' }]);
  });

  it('an unusable read: stopped with nothing written, and the saber sent back', async () => {
    const f = world([hote2()], { backup: { ok: false, kind: 'unusable', detail: 'The read was not usable firmware (it may be short, protected, or damaged).' } });
    await installSequence(f.deps, jobFor());
    expect(f.deps.flash.write).not.toHaveBeenCalled();
    expect(f.calls).toContain(`leave ${HOTE2}`);
    expect(f.shown().note?.text).toMatch(/^Backup failed, so nothing was written\. The read was not usable firmware/);
  });

  it('a restore backs up what is on the board first, labelled before-restore', async () => {
    const f = world([hote2()]);
    await restoreSequence(f.deps, saberRec(), { file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'before install', bytes: 262144, valid: true, configName: 'config/hiltwright_hote2.h' }, true);
    expect(f.deps.flash.backup).toHaveBeenCalledWith('s1', 'before-restore', null, HOTE2);
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
  });

  it('a restore whose read of the board fails: the chosen backup is put back all the same, with an amber note (issue #12)', async () => {
    const f = world([hote2()], { backup: { ok: false, detail: 'dfu-util: error' } });
    await restoreSequence(f.deps, saberRec(), { file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'x', bytes: 262144, valid: true, configName: null }, true);
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
    expect(f.calls.some((c) => c.startsWith('leave'))).toBe(false);
    expect(f.shown().step).toBe('done');
    expect(f.extra()).toEqual([{ tone: 'amber', text: 'What was on the board could not be backed up, so Hiltwright went on and put back the backup you chose. dfu-util: error' }]);
  });

  // Issue #12: a write that fails during or just after the erase leaves a board that reads as neither firmware nor
  // erased. The restore Hiltwright then points to must still go through.
  it('a failed write, then a restore: the unreadable board is read for the record, and the good backup is written', async () => {
    const f = world([hote2()], { write: async () => ({ ok: false, detail: 'dfu-util: Error during download' }) });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note?.text).toMatch(/^Writing failed\./);
    expect(f.boards[0].mode).toBe('boot');
    (f.deps.flash.backup as ReturnType<typeof vi.fn>).mockImplementation(async (_id: string, _l: string, _c?: string | null, serial?: string | null) => {
      f.calls.push(`backup ${serial}`);
      return { ok: false, ms: 1, kind: 'unusable', file: 'C:\\backups\\before-restore.bin', detail: 'The read was not usable firmware (it may be short, protected, or damaged).' };
    });
    const good: BackupInfo = { file: '2026-09-27T10-00-00-000Z-before-install.bin', at: '2026-09-27T10:00:00.000Z', label: 'before-install', bytes: 262144, valid: true, configName: 'config/hiltwright_hote2.h' };
    await restoreSequence(f.deps, saberRec(), good, false);
    expect(f.touched().slice(-2)).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
    expect(f.deps.flash.restore).toHaveBeenCalledWith('s1', good.file, HOTE2);
    expect(f.shown().step).toBe('done');
    expect(f.shown().note?.tone).toBe('green');
    expect(f.extra()).toEqual([{ tone: 'amber', text: 'What was on the board could not be backed up, so Hiltwright went on and put back the backup you chose. The read was not usable firmware (it may be short, protected, or damaged). What was read is kept at C:\\backups\\before-restore.bin in case it helps find the fault. It is not listed as a backup.' }]);
  });

  it('a partial read before a restore (it starts like firmware, but the last write did not finish): the restore goes on (issue #12)', async () => {
    const f = world([hote2('boot')], { backup: { ok: false, kind: 'partial', file: 'C:\\backups\\x-partial-read-before-restore.bin', detail: 'The last write to this board did not finish, so what it holds now may be half written. It was read, but not kept as a backup.' } });
    await restoreSequence(f.deps, saberRec(), { file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'x', bytes: 262144, valid: true, configName: null }, false);
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
    expect(f.extra()[0].text).toMatch(/kept at C:.+partial-read-before-restore\.bin/);
  });

  it('an install on a board that cannot be backed up: asked first; yes writes, with a note that no backup was taken (issue #12)', async () => {
    const unusable = { ok: false, kind: 'unusable' as const, file: 'C:\\backups\\before-install.bin', detail: 'The read was not usable firmware (it may be short, protected, or damaged).' };
    const yes = world([hote2()], { backup: unusable, noBackup: true });
    await installSequence(yes.deps, jobFor());
    expect(yes.deps.confirmNoBackup).toHaveBeenCalledWith('hote2', unusable.detail);
    expect(yes.touched()).toEqual([`backup ${HOTE2}`, `write ${HOTE2}`]);
    expect(yes.shown().step).toBe('done');
    // There is no backup from just now to name.
    expect(yes.shown().note?.text).not.toMatch(/Backup of the previous firmware/);
    expect(yes.extra()[0]).toEqual({ tone: 'amber', text: `No backup was taken this time: you chose to install without one. ${unusable.detail} What was read is kept at C:\\backups\\before-install.bin in case it helps find the fault. It is not listed as a backup.` });
    const no = world([hote2()], { backup: unusable, noBackup: false });
    await installSequence(no.deps, jobFor());
    expect(no.deps.flash.write).not.toHaveBeenCalled();
    expect(no.calls).toContain(`leave ${HOTE2}`);
    expect(no.shown().note?.text).toMatch(/^Backup failed, so nothing was written\./);
  });

  it('an install whose read fails outright is not offered without a backup: stopped as before (issue #12)', async () => {
    const f = world([hote2()], { backup: { ok: false, detail: 'dfu-util: Cannot open DFU device' }, noBackup: true });
    await installSequence(f.deps, jobFor());
    expect(f.deps.confirmNoBackup).not.toHaveBeenCalled();
    expect(f.deps.flash.write).not.toHaveBeenCalled();
  });

  it('an install on a board whose last write did not finish, declined: nothing written, and the board is not sent to that firmware (issue #12)', async () => {
    const f = world([hote2('boot')], { backup: { ok: false, kind: 'partial', file: 'C:\\backups\\p.bin', detail: 'The last write to this board did not finish, so what it holds now may be half written. It was read, but not kept as a backup.' }, noBackup: false });
    await installSequence(f.deps, jobFor({ connected: false }));
    expect(f.deps.flash.write).not.toHaveBeenCalled();
    expect(f.calls.some((c) => c.startsWith('leave'))).toBe(false);
    expect(f.shown()).toEqual({ step: 'failed', note: { tone: 'red', text: 'Backup failed, so nothing was written. The last write to this board did not finish, so what it holds now may be half written. It was read, but not kept as a backup. The board stays in bootloader mode: put a backup back from the Backups tab.' } });
  });

  it('a restore from a board already in its bootloader (after the driver step) is a restore, not an install', async () => {
    const f = world([hote2('boot')]);
    await restoreSequence(f.deps, saberRec(), { file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'x', bytes: 262144, valid: true, configName: null }, false);
    expect(f.calls).not.toContain('reboot');
    expect(f.touched()).toEqual([`backup ${HOTE2}`, `restore ${HOTE2}`]);
    expect(f.deps.flash.write).not.toHaveBeenCalled();
  });
});

// Design D3 (FW9, FW12, HW-2026-09-24c): the record at the write, the check after the return.
describe('record and check', () => {
  const restoreOf = (configName: string | null): BackupInfo => ({ file: 'b.bin', at: '2026-09-27T10:00:00.000Z', label: 'x', bytes: 262144, valid: true, configName });

  it("a restore clears the firmware record before waiting for the saber", async () => {
    const f = world([hote2()], { runtime: false });
    await restoreSequence(f.deps, saberRec(), restoreOf(null), true);
    expect(f.deps.board.updateSaber).toHaveBeenCalledWith({ firmware: null }, 's1');
    expect(f.calls.indexOf('updateSaber')).toBeLessThan(f.calls.indexOf(`waitForRuntime ${HOTE2}`));
  });

  it('the record cannot be saved: still installed, with the problem as a separate warning', async () => {
    const f = world([hote2()], { recordFails: "Error invoking remote method 'library:update': Error: disk full, could not write library.json" });
    await installSequence(f.deps, jobFor());
    expect(f.shown().step).toBe('done');
    expect(f.shown().note?.tone).toBe('green');
    expect(f.extra()).toEqual([{ tone: 'amber', text: 'Installed, but Hiltwright could not update its record of the saber: disk full, could not write library.json' }]);
  });

  it('the saber comes back reporting another config: written, but said plainly, with the backup to hand', async () => {
    const f = world([hote2()], { comesBackAs: { config: 'config/default_proffieboard_config.h', version: 'v8.10 hiltwright abc' } });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note).toEqual({ tone: 'amber', text: 'The firmware was written, but the saber reports config/default_proffieboard_config.h, v8.10 hiltwright abc instead of config/hiltwright_hote2.h, v8.10 hiltwright. If it misbehaves, put the backup from just now back from the Backups tab. Backup of the previous firmware: C:\\backups\\before-install.bin' });
  });

  it('a version without the Hiltwright stamp is a mismatch too', async () => {
    const f = world([hote2()], { comesBackAs: { config: 'config/hiltwright_hote2.h', version: 'v7.14' } });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note?.tone).toBe('amber');
  });

  it('the saber cannot be read after the reconnect: written, not checked', async () => {
    const f = world([hote2()], { reached: null });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note?.text).toMatch(/^The firmware was written, but the saber could not be read to check it\./);
  });

  it('a saber slow to answer after coming back is read again once, 10 s later', async () => {
    const f = world([hote2()]);
    (f.deps.board.connect as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_i?: boolean, o?: { serial?: string | null }) => { f.calls.push(`connect ${o?.serial ?? null}`); });
    await installSequence(f.deps, jobFor());
    expect(f.calls.filter((c) => c.startsWith('connect'))).toHaveLength(2);
    expect(f.shown().note?.text).toMatch(/^Installed and checked:/);
  });

  it('a reading from before the write does not count as the check', async () => {
    const stale = { ...saberRec(), lastSeen: '2026-01-01T00:00:00.000Z', identity: { usbSerial: HOTE2, configName: 'config/hiltwright_hote2.h', version: 'v8.10 hiltwright abc' } } as unknown as SaberRecord;
    const f = world([hote2()], { reached: stale });
    await installSequence(f.deps, jobFor());
    expect(f.shown().note?.text).toMatch(/could not be read to check it/);
  });

  it('a restore is checked against the config its backup recorded', async () => {
    const ok = world([hote2()]);
    await restoreSequence(ok.deps, saberRec(), restoreOf('config/hiltwright_hote2.h'), true);
    expect(ok.shown().note?.text).toMatch(/^Restored the backup from .+, and checked: the saber reports config\/hiltwright_hote2\.h/);
    const off = world([hote2()], { comesBackAs: { config: 'config/other.h', version: 'x' } });
    await restoreSequence(off.deps, saberRec(), restoreOf('config/hiltwright_hote2.h'), true);
    expect(off.shown().note?.tone).toBe('amber');
  });
});

// Design D5 (FW10): main refused to write. Nothing was written, so the board goes back like any stop before the write.
describe('main refusing the write', () => {
  it("stopped with main's words, the saber sent back, and the record untouched", async () => {
    const f = world([hote2()], { write: async () => ({ ok: false, detail: 'This is not the build just made for this saber, so nothing was written. Build again, then install.', refused: true } as { ok: boolean; detail: string }) });
    await installSequence(f.deps, jobFor());
    expect(f.calls).toContain(`leave ${HOTE2}`);
    expect(f.calls).not.toContain('updateSaber');
    expect(f.shown().note?.text).toBe('This is not the build just made for this saber, so nothing was written. Build again, then install. The saber is back on the firmware it had.');
  });
});

// safe-staged-install design D1: staged presets go on only after the install is checked.
describe('staged presets', () => {
  const staged = [{ font: 'Mara;common', track: '', name: 'Mara Jade' }, { font: 'Valkyrie;common', track: '', name: 'Valkyrie' }];
  const stagedModel = { ...model, presets: staged, presetsFrom: { name: 'Set A', at: '2026-09-27T10:00:00.000Z' } } as SaberConfigModel;
  const job = (over: Partial<InstallJob> = {}) => jobFor({ model: stagedModel, ...over });
  const staging = (f: ReturnType<typeof world>) => f.calls.filter((c) => /^(del |restart)/.test(c));

  it('from running mode: nothing removed before the reboot; after the check: snapshot, both files, restart, read back, settled', async () => {
    const f = world([hote2()], { compiled: staged });
    await installSequence(f.deps, job());
    expect(f.calls.indexOf('del presets.ini')).toBeGreaterThan(f.calls.indexOf(`write ${HOTE2}`));
    expect(staging(f)).toEqual(['del presets.ini', 'del presets.tmp', 'restart']);
    expect(f.deps.snapshots.save).toHaveBeenCalledWith('s1', 'Before install with staged presets', [expect.objectContaining({ name: 'Old' })]);
    expect(f.extra().at(-1)).toEqual({ tone: 'green', text: 'Your staged presets are on the saber now; its previous presets are kept as a snapshot.' });
    const models = (f.deps.board.updateSaber as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { model?: SaberConfigModel }).model);
    // At the write the list is still staged; once the saber reports it, it is settled.
    expect(models[0]?.presetsFrom).toBeDefined();
    expect(models.at(-1)?.presetsFrom).toBeUndefined();
  });

  it('from a board already in its bootloader: applied the same way', async () => {
    const f = world([hote2('boot')], { compiled: staged });
    await installSequence(f.deps, job({ connected: false }));
    expect(staging(f)).toEqual(['del presets.ini', 'del presets.tmp', 'restart']);
    expect(f.extra().at(-1)?.tone).toBe('green');
  });

  it('an install that stops leaves the presets untouched: a refused board, a failed backup, a failed write', async () => {
    const refused = world([theV3()], { connectedSerial: V3, compiled: staged });
    await installSequence(refused.deps, jobFor({ saber: v3Rec, model: stagedModel }));
    const backup = world([hote2()], { compiled: staged, backup: { ok: false, detail: 'x' } });
    await installSequence(backup.deps, job());
    const write = world([hote2()], { compiled: staged, write: async () => ({ ok: false, detail: 'x' }) });
    await installSequence(write.deps, job());
    for (const f of [refused, backup, write]) {
      expect(staging(f)).toEqual([]);
      expect(f.deps.snapshots.save).not.toHaveBeenCalled();
    }
  });

  it('a check that does not match, or no reading, or another saber answering: presets untouched, still staged', async () => {
    const mismatch = world([hote2()], { compiled: staged, comesBackAs: { config: 'config/other.h', version: 'v8.10 hiltwright abc' } });
    await installSequence(mismatch.deps, job());
    const none = world([hote2()], { compiled: staged, reached: null });
    await installSequence(none.deps, job());
    const other = world([theV3(), hote2()], { compiled: staged, reached: v3Rec });
    await installSequence(other.deps, job());
    for (const f of [mismatch, none, other]) {
      expect(staging(f)).toEqual([]);
      expect(f.extra().at(-1)?.text).toMatch(/^The install could not be checked, so the saber keeps its own presets for now\. Your staged presets are still waiting/);
    }
  });

  it('the saber still reports its own presets after the restart: stays staged, and says so', async () => {
    const f = world([hote2()], { compiled: staged, keepsOwn: true });
    await installSequence(f.deps, job());
    expect(f.extra().at(-1)).toEqual({ tone: 'amber', text: 'The saber still reports its own presets after its restart. Your staged presets are still waiting; press "Use the staged presets" on Build & Flash to try again.' });
    const models = (f.deps.board.updateSaber as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { model?: SaberConfigModel }).model);
    expect(models.every((m) => m?.presetsFrom)).toBe(true);
  });

  it('the restart fails: stays staged', async () => {
    const f = world([hote2()], { compiled: staged, restartFails: true });
    await installSequence(f.deps, job());
    expect(f.extra().at(-1)?.text).toMatch(/^The saber could not be restarted to pick up the staged presets\./);
  });

  it('applied later, on its own, with no install: the same steps', async () => {
    const f = world([hote2()], { compiled: staged });
    const note = await applyStagedPresets(f.deps, saberRec(), stagedModel, HOTE2);
    expect(note.tone).toBe('green');
    expect(f.touched()).toEqual([]);
    expect(staging(f)).toEqual(['del presets.ini', 'del presets.tmp', 'restart']);
  });

  it('with the card in a reader: its presets files go from the card there, not through the saber, and the note says to put it back', async () => {
    const f = world([hote2()], { compiled: staged, cardOut: true });
    const cleared: string[] = [];
    const deps = { ...f.deps, card: { where: 'reader' as const, root: 'E:\\', clearPresets: async (root: string) => { cleared.push(root); return ['presets.ini']; } } };
    const note = await applyStagedPresets(deps, saberRec(), stagedModel, HOTE2);
    expect(cleared).toEqual(['E:\\']);
    expect(staging(f)).toEqual(['restart']);
    expect(note.tone).toBe('green');
    expect(note.text).toMatch(/card in the reader \(E:\\\): put the card back in the saber/);
  });

  it('with the card out and not in a reader: nothing is sent, nothing restarted, still staged', async () => {
    const f = world([hote2()], { compiled: staged });
    const note = await applyStagedPresets({ ...f.deps, card: { where: 'out' } }, saberRec(), stagedModel, HOTE2);
    expect(staging(f)).toEqual([]);
    expect(f.deps.snapshots.save).not.toHaveBeenCalled();
    expect(note.tone).toBe('amber');
    expect(note.text).toMatch(/SD card is out of the saber/);
  });

  it('a card in the reader whose presets file cannot be removed: no restart, still staged', async () => {
    const f = world([hote2()], { compiled: staged });
    const note = await applyStagedPresets({ ...f.deps, card: { where: 'reader', root: 'E:\\', clearPresets: async () => { throw new Error('EPERM: write protected'); } } }, saberRec(), stagedModel, HOTE2);
    expect(staging(f)).toEqual([]);
    expect(note.text).toMatch(/could not be removed: EPERM: write protected/);
  });

  it('its presets file already went on the card trip: the saber reports the staged list, so it is settled with no restart', async () => {
    const f = world([hote2()], { compiled: staged, clearedOnTrip: true });
    await installSequence(f.deps, job());
    expect(staging(f)).toEqual([]);
    expect(f.extra().at(-1)).toEqual({ tone: 'green', text: 'Your staged presets are on the saber now; its previous presets were kept as a snapshot when the card was prepared.' });
    const models = (f.deps.board.updateSaber as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { model?: SaberConfigModel }).model);
    expect(models.at(-1)?.presetsFrom).toBeUndefined();
  });

  it('samePresets compares names and fonts in order', () => {
    expect(samePresets(staged, staged)).toBe(true);
    expect(samePresets(staged, [...staged].reverse())).toBe(false);
    expect(samePresets(staged, staged.slice(1))).toBe(false);
  });
});
