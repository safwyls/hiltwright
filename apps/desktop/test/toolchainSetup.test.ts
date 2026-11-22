// Baseline audit (baseline-firmware toolchain 2.3, 2.4, 2.6): when the setup refuses to start, and how it recovers
// from a download that failed part-way. The system calls are stood in for (installToolchain's `sys`); `download` itself
// is tested against a stubbed fetch.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORE_VERSION, PROFFIEOS_SHA256, cancelSetup, download, ensureToolchainRoot, folderOpenToOthers, folderTrust, foreignEntries, installToolchain, judgeFolderAcl, lockFolder, parseForeignCount, pickToolchainRoot, plannedToolchainRoot, setupOnce, toolchainPaths, toolchainStatus, type FolderTrust, type ToolchainStatus, type ToolchainSys } from '../src/main/toolchain';
import { toolchainBlockers } from '../src/shared/toolchainChecks';

const status = (root: string, over: Partial<ToolchainStatus> = {}): ToolchainStatus => ({
  root, cli: true, cliVersion: '1.3.1', core: true, gcc: true, dfuUtil: 'dfu-util.exe', proffieOS: false, proffieOSVersion: null,
  ready: false, freeBytes: 100 * 1073741824, pathTooLong: false, versions: { cli: '1.3.1', core: '4.6', proffieOS: null }, open: false, ...over,
});
/** A setup where arduino-cli and the core are in place and only ProffieOS is missing; downloads fail as `fail` says. */
function fakeSys(root: string, fail: (url: string, n: number) => boolean) {
  const downloads: string[] = [];
  const sys: ToolchainSys = {
    run: vi.fn(async () => ({ code: 0, stdout: '', stderr: '', ms: 0 })),
    download: async (url, dest) => { downloads.push(url); if (fail(url, downloads.length)) throw new Error('Download failed: the network dropped'); await writeFile(dest, 'zip'); },
    extract: async (_zip, into) => { await mkdir(join(into, 'ProffieOS-8.10'), { recursive: true }); await writeFile(join(into, 'ProffieOS-8.10', 'ProffieOS.ino'), '//'); },
    status: async (r) => { const os = existsSync(join(r, 'ProffieOS', 'ProffieOS.ino')); return status(r, { proffieOS: os, ready: os }); },
    // The fake downloads are the three bytes 'zip': pin those, as a real setup pins the published files.
    expected: { cli: {}, proffieOS: createHash('sha256').update('zip').digest('hex') },
  };
  return { sys, downloads };
}

describe('toolchain audit', () => {
  it('2.3 a folder path that is too long: the setup refuses before downloading anything, and says the length', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-tc-'));
    const long = 'C:\\Users\\a-rather-long-user-name\\AppData\\Local\\Hiltwright\\tc';
    const { sys, downloads } = fakeSys(root, () => false);
    sys.status = async () => status(long, { pathTooLong: true });
    await expect(installToolchain(root, () => undefined, sys)).rejects.toThrow(`(${long.length} characters, at most 40)`);
    expect(downloads).toEqual([]);
    expect(toolchainBlockers(status(long, { pathTooLong: true })).pathTooLong).not.toBeNull();
  });

  // FST-2, fixed in toolchain-integrity: the panel gives the path's length and no development switch.
  it('2.3 the panel says the path is too long in plain words with its length', () => {
    const long = 'C:\\Users\\a-rather-long-user-name\\AppData\\Local\\Hiltwright\\tc';
    const panel = toolchainBlockers(status(long, { pathTooLong: true })).pathTooLong!.panel;
    expect(panel).toContain(String(long.length));
    expect(panel).not.toMatch(/HILTWRIGHT_/);
  });

  it('2.4 low disk space: the setup refuses before downloading anything, and the panel disables the button', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-tc-'));
    const { sys, downloads } = fakeSys(root, () => false);
    sys.status = async (r) => status(r, { freeBytes: 1073741824 });
    await expect(installToolchain(root, () => undefined, sys)).rejects.toThrow('Not enough free space: 1.0 GB free');
    expect(downloads).toEqual([]);
    expect(toolchainBlockers(status(root, { freeBytes: 1073741824 })).lowSpace?.panel).toMatch(/Not enough free space/);
    // A finished toolchain needs no space, so nothing blocks it.
    expect(toolchainBlockers(status(root, { freeBytes: 1073741824, ready: true })).lowSpace).toBeNull();
  });

  it('2.6 the network drops mid-install: a retry installs only what is missing, and a finished setup changes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-tc-'));
    const { sys, downloads } = fakeSys(root, (_url, n) => n === 1);
    await expect(installToolchain(root, () => undefined, sys)).rejects.toThrow(/network dropped/);
    expect(existsSync(join(root, 'ProffieOS'))).toBe(false);
    const after = await installToolchain(root, () => undefined, sys);
    expect(after.ready).toBe(true);
    expect(downloads).toHaveLength(2);
    expect(downloads.every((u) => /ProffieOS/.test(u))).toBe(true);
    expect(sys.run).not.toHaveBeenCalled();
    await installToolchain(root, () => undefined, sys);
    expect(downloads).toHaveLength(2);
  });
});

describe('download', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('never leaves a partial file under the real name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-dl-'));
    const dest = join(dir, 'ProffieOS-v8.10.zip');
    let n = 0;
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
      pull(c) { if (n++ === 0) c.enqueue(new Uint8Array(500)); else c.error(new Error('connection reset')); },
    }), { headers: { 'content-length': '1000' } }));
    await expect(download('https://example.invalid/p.zip', dest, () => undefined)).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(1000), { headers: { 'content-length': '1000' } }));
    await download('https://example.invalid/p.zip', dest, () => undefined);
    expect(existsSync(dest)).toBe(true);
    expect(await readdir(dir)).toEqual(['ProffieOS-v8.10.zip']);
  });
});

// toolchain-integrity: pinned downloads, versions read back, stalls, cancelling, one setup at a time, the folder.
describe('a pinned, checked toolchain', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a download that is not the pinned file is deleted, not unpacked, and the setup stops naming the part', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-tc-'));
    const { sys } = fakeSys(root, () => false);
    const extract = vi.spyOn(sys, 'extract');
    sys.expected = undefined; // the real pins: 'zip' is not the ProffieOS archive
    await expect(installToolchain(root, () => undefined, sys)).rejects.toThrow('The ProffieOS source download is not the file Hiltwright expects, so it was not used.');
    expect(extract).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'ProffieOS-v8.10.zip'))).toBe(false);
    expect(existsSync(join(root, 'ProffieOS'))).toBe(false);
  });

  it('a verified unpack stamps the source, and the stamp and the pinned core version drive ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-tc-'));
    const hw = join(root, 'arduino-data', 'packages', 'proffieboard');
    // The board support keeps dfu-util in a folder named for the system (as findDfuUtil looks for it).
    const tools = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux';
    await mkdir(join(hw, 'hardware', 'stm32l4', CORE_VERSION, 'tools', tools), { recursive: true });
    await writeFile(join(hw, 'hardware', 'stm32l4', CORE_VERSION, 'tools', tools, process.platform === 'win32' ? 'dfu-util.exe' : 'dfu-util'), '');
    await mkdir(join(hw, 'tools', 'arm-none-eabi-gcc'), { recursive: true });
    await mkdir(join(root, 'ProffieOS'), { recursive: true });
    await writeFile(join(root, 'ProffieOS', 'ProffieOS.ino'), '//');
    let st = await toolchainStatus(root);
    expect(st).toMatchObject({ core: true, gcc: true, proffieOS: false, versions: { core: CORE_VERSION, proffieOS: 'unknown (not from a checked download)' } });
    expect(st.dfuUtil).toBeTruthy();
    await writeFile(join(root, 'ProffieOS', '.hiltwright-source.json'), JSON.stringify({ tag: 'v8.10', sha256: PROFFIEOS_SHA256 }));
    st = await toolchainStatus(root);
    expect(st).toMatchObject({ proffieOS: true, proffieOSVersion: 'v8.10', versions: { proffieOS: 'v8.10' } });
    expect(st.ready).toBe(false); // no arduino-cli here
    // A different board support version is not the pinned one.
    await rename(join(hw, 'hardware', 'stm32l4', CORE_VERSION), join(hw, 'hardware', 'stm32l4', '4.5'));
    st = await toolchainStatus(root);
    expect(st).toMatchObject({ core: false, dfuUtil: null, versions: { core: '4.5' } });
  });

  it('a stalled download stops, and nothing is left under its real name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-dl-'));
    vi.stubGlobal('fetch', async (_u: string, init: { signal: AbortSignal }) => new Response(new ReadableStream({
      start(c) { c.enqueue(new Uint8Array(10)); init.signal.addEventListener('abort', () => c.error(new Error('aborted'))); },
    }), { headers: { 'content-length': '1000' } }));
    await expect(download('https://example.invalid/p.zip', join(dir, 'p.zip'), () => undefined, { stallMs: 150 })).rejects.toThrow(/The download stalled: nothing arrived/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('cancelling stops a download at once, and nothing is left under its real name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-dl-'));
    vi.stubGlobal('fetch', async (_u: string, init: { signal: AbortSignal }) => new Response(new ReadableStream({
      start(c) { c.enqueue(new Uint8Array(10)); init.signal.addEventListener('abort', () => c.error(new Error('aborted'))); },
    }), { headers: { 'content-length': '1000' } }));
    const ctrl = new AbortController();
    const p = download('https://example.invalid/p.zip', join(dir, 'p.zip'), () => undefined, { signal: ctrl.signal, stallMs: 60000 });
    setTimeout(() => ctrl.abort(), 50);
    await expect(p).rejects.toThrow('The setup was cancelled.');
    expect(await readdir(dir)).toEqual([]);
  });

  it('only one setup runs at a time: starting again joins it, and cancel stops it', async () => {
    let starts = 0;
    let seen!: AbortSignal;
    const start = (signal: AbortSignal) => { starts++; seen = signal; return new Promise<ToolchainStatus>((_r, reject) => signal.addEventListener('abort', () => reject(new Error('The setup was cancelled.')))); };
    const a = setupOnce(start);
    const b = setupOnce(start);
    expect(b).toBe(a);
    expect(starts).toBe(1);
    expect(cancelSetup()).toBe(true);
    expect(seen.aborted).toBe(true);
    await expect(a).rejects.toThrow('cancelled');
    expect(cancelSetup()).toBe(false);
  });

  it('choosing the toolchain folder creates nothing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'hw-pd-'));
    const was = { ProgramData: process.env.ProgramData, LOCALAPPDATA: process.env.LOCALAPPDATA, SystemDrive: process.env.SystemDrive };
    try {
      process.env.ProgramData = base; process.env.LOCALAPPDATA = join(base, 'nowhere'); process.env.SystemDrive = join(base, 'nodrive');
      const planned = plannedToolchainRoot(join(base, 'userData'));
      // (Under a long temp path every candidate is too long and it falls back to the data folder; either way nothing is made.)
      expect(existsSync(planned)).toBe(false);
      expect(await readdir(base)).toEqual([]);
    } finally { Object.assign(process.env, was); }
  });
});

// #20: who may own the toolchain folder or change it, judged from its permissions as folderTrust's script prints them.
describe('the toolchain folder ownership check', () => {
  const ME = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
  const OTHER = 'S-1-5-21-1111111111-2222222222-3333333333-1002';
  const FULL = 2032127;
  const READ_RUN = 1179817;
  const MODIFY = 1245631;
  const locked = [`me ${ME}`, `owner ${ME}`, `ace Allow S-1-5-18 ${FULL}`, `ace Allow S-1-5-32-544 ${FULL}`, `ace Allow ${ME} ${FULL}`, `ace Allow S-1-5-32-545 ${READ_RUN}`];

  it('a folder locked as Hiltwright locks it passes, owned by this account, Administrators or SYSTEM', () => {
    expect(judgeFolderAcl(locked.join('\r\n'))).toEqual({ trusted: true, foreignOwner: false, owner: ME, writers: [] });
    for (const owner of ['S-1-5-32-544', 'S-1-5-18']) expect(judgeFolderAcl([locked[0], `owner ${owner}`, ...locked.slice(2)].join('\n'))?.trusted).toBe(true);
  });

  it('a folder another account owns fails, even when no one else holds a right to change it', () => {
    // The attack in #20: another account makes the folder, owns it, and removes everyone else's write right.
    const t = judgeFolderAcl([`me ${ME}`, `owner ${OTHER}`, `ace Allow ${OTHER} ${FULL}`, `ace Allow S-1-5-32-545 ${READ_RUN}`].join('\n'));
    expect(t).toMatchObject({ trusted: false, foreignOwner: true, owner: OTHER });
  });

  it('any other account with a right to change it fails: an allow-list, not only Users and Everyone', () => {
    const t = judgeFolderAcl([...locked, `ace Allow ${OTHER} ${MODIFY}`].join('\n'));
    expect(t).toMatchObject({ trusted: false, foreignOwner: false, writers: [OTHER] });
    // Each right alone is enough: write, append (create folders), delete, change permissions, take ownership, generic write.
    for (const right of [0x2, 0x4, 0x10000, 0x40000, 0x80000, 0x40000000]) expect(judgeFolderAcl([...locked, `ace Allow ${OTHER} ${right}`].join('\n'))?.trusted).toBe(false);
  });

  it('the default %ProgramData% permissions, where Users can create files, fail', () => {
    const programData = [`me ${ME}`, `owner ${ME}`, `ace Allow S-1-5-18 ${FULL}`, `ace Allow S-1-5-32-544 ${FULL}`, 'ace Allow S-1-3-0 268435456', `ace Allow S-1-5-32-545 ${READ_RUN}`, 'ace Allow S-1-5-32-545 278'];
    expect(judgeFolderAcl(programData.join('\n'))).toMatchObject({ trusted: false, writers: ['S-1-5-32-545'] });
  });

  it('read rights, deny entries and CREATOR OWNER do not count as another account changing it', () => {
    const t = judgeFolderAcl([...locked, `ace Allow ${OTHER} ${READ_RUN}`, `ace Allow ${OTHER} -2147483648`, `ace Deny ${OTHER} ${FULL}`, 'ace Allow S-1-3-0 268435456'].join('\n'));
    expect(t?.trusted).toBe(true);
  });

  it('output that is not the check (an error, or no owner) is not judged', () => {
    expect(judgeFolderAcl('Exception calling "GetAccessControl" with "1" argument(s): "Access to the path is denied."')).toBeNull();
    expect(judgeFolderAcl(locked.filter((l) => !l.startsWith('owner')).join('\n'))).toBeNull();
    expect(judgeFolderAcl('')).toBeNull();
    expect(parseForeignCount('foreign 0')).toBe(0);
    expect(parseForeignCount('foreign 12\r\n')).toBe(12);
    expect(parseForeignCount('Exception: denied')).toBeNull();
  });
});

describe('choosing the toolchain folder (#20)', () => {
  const own = 'C:\\Users\\al\\AppData\\Local\\Hiltwright\\tc';
  const pd = 'C:\\ProgramData\\Hiltwright';
  const sd = 'C:\\Hiltwright';
  const pick = (c: { perUser: string | null }, installed: string[], trusted: string[] = []) => pickToolchainRoot({ perUser: c.perUser, shared: [pd, sd], fallback: 'U:\\data\\toolchain' }, { installed: (p) => installed.includes(p), parentExists: () => true, trusted: (p) => trusted.includes(p) });

  it("this account's own folder comes first when it fits", () => {
    expect(pick({ perUser: own }, [])).toBe(own);
    expect(pick({ perUser: own }, [own, pd], [pd])).toBe(own);
  });

  it('an existing shared install keeps working when it passes the check, and is passed over when it fails', () => {
    expect(pick({ perUser: own }, [pd], [pd])).toBe(pd);
    expect(pick({ perUser: own }, [pd])).toBe(own);
    expect(pick({ perUser: own }, [pd, sd], [sd])).toBe(sd);
  });

  it("with no room for this account's own folder, a shared one is used, and one that fails the check shows Repair", () => {
    expect(pick({ perUser: null }, [])).toBe(pd);
    expect(pick({ perUser: null }, [pd])).toBe(pd);
    expect(pick({ perUser: null }, [sd], [])).toBe(sd);
  });
});

describe.skipIf(process.platform !== 'win32')('the toolchain folder lock (Windows)', () => {
  it('a folder standard users can write is reported open, and locking it leaves it changeable only by this account and administrators', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-lock-'));
    execFileSync('icacls', [dir, '/grant', '*S-1-5-32-545:(OI)(CI)M']);
    expect(await folderOpenToOthers(dir)).toBe(true);
    const r = await lockFolder(dir, false);
    expect(r).toEqual({ ok: true, text: 'Locked.' });
    expect(await folderOpenToOthers(dir)).toBe(false);
    // This account can still write in it, and owns it (#20).
    await writeFile(join(dir, 'still-mine.txt'), 'ok');
    const acl = execFileSync('icacls', [dir]).toString();
    expect(acl).not.toMatch(/\(I\)/); // nothing inherited any more
    expect(await folderTrust(dir)).toMatchObject({ trusted: true, foreignOwner: false, writers: [] });
  });

  it('locking a folder that holds files also gives them to this account and makes them follow the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-lock-'));
    await mkdir(join(dir, 'arduino-cli'));
    await writeFile(join(dir, 'arduino-cli', 'a.txt'), 'x');
    execFileSync('icacls', [join(dir, 'arduino-cli', 'a.txt'), '/grant', '*S-1-5-32-545:M']);
    expect(await lockFolder(dir, false)).toEqual({ ok: true, text: 'Locked.' });
    const acl = execFileSync('icacls', [join(dir, 'arduino-cli', 'a.txt')]).toString();
    expect(acl).not.toMatch(/BUILTIN\\Users:\(M\)|S-1-5-32-545:\(M\)/); // the file's own grant is gone
    expect(await foreignEntries(dir)).toBe(0);
  });

  it('nothing is run from a folder that fails the check, and the build and flasher refuse it, until it is locked', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-trust-'));
    // A stand-in arduino-cli: Node itself, which runs `marker.cjs` first through NODE_OPTIONS, so a run leaves a file.
    await mkdir(join(root, 'arduino-cli'));
    await copyFile(process.execPath, join(root, 'arduino-cli', 'arduino-cli.exe'));
    const marker = join(root, 'ran.txt');
    const hook = join(tmpdir(), `hw-hook-${process.pid}.cjs`);
    await writeFile(hook, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const was = process.env.NODE_OPTIONS;
    try {
      process.env.NODE_OPTIONS = `--require ${JSON.stringify(hook)}`;
      execFileSync('icacls', [root, '/grant', '*S-1-5-32-545:(OI)(CI)M']);
      const st = await toolchainStatus(root);
      expect(st).toMatchObject({ open: true, openWhy: 'writers', ready: false, cliVersion: null });
      expect(existsSync(marker)).toBe(false);
      expect(() => toolchainPaths(root)).toThrow(/will not run the compiler or the flasher/);
      await expect(installToolchain(root, () => undefined)).rejects.toThrow(/another Windows account owns the folder or can change it/);
      expect((await lockFolder(root, false)).ok).toBe(true);
      expect(await toolchainStatus(root)).toMatchObject({ open: false, openWhy: null });
      expect(existsSync(marker)).toBe(true); // checked and closed: now it runs
      expect(toolchainPaths(root).root).toBe(root);
    } finally {
      if (was === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = was;
    }
  });

  it('setup passes over a folder that fails the check and already holds files, and uses a new one that passes', async () => {
    const base = await mkdtemp(join(tmpdir(), 'hw-ens-'));
    const was = { ProgramData: process.env.ProgramData, LOCALAPPDATA: process.env.LOCALAPPDATA, SystemDrive: process.env.SystemDrive };
    try {
      // Every real candidate too long, so only the planned folder is tried.
      const long = join(base, 'x'.repeat(50));
      process.env.ProgramData = long; process.env.LOCALAPPDATA = long; process.env.SystemDrive = long;
      const taken = join(base, 'taken');
      await mkdir(taken);
      await writeFile(join(taken, 'arduino-cli.exe'), 'planted');
      const no = async (): Promise<FolderTrust> => ({ trusted: false, foreignOwner: true, owner: 'S-1-5-21-9', writers: [] });
      const lines: string[] = [];
      await expect(ensureToolchainRoot(taken, join(base, 'userData'), (l) => lines.push(l), no)).rejects.toThrow('could not find a toolchain folder that only administrators and your account can change');
      expect(lines.join('\n')).toMatch(/not using .*taken/);
      const fresh = join(base, 'fresh');
      expect(await ensureToolchainRoot(fresh, join(base, 'userData'), () => undefined)).toBe(fresh);
      expect(await folderTrust(fresh)).toMatchObject({ trusted: true });
    } finally { Object.assign(process.env, was); }
  });
});
