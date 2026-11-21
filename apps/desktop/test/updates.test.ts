// In-app updates: the decisions (shared/updates.ts), main's runner with electron-updater stood in for
// (main/updates.ts), the page's job count (renderer work.ts) and the build settings that make the update files.
// Nothing here loads electron-updater or reaches the network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_EVERY_MS, FIRST_CHECK_MS, NETWORK_NOTE, SHARED_STAGING_ID, WORK_CHANNELS, actionLabel, actionsFor, checksOnStart, chipText, initialState, isOffline, nextCheckIn,
  nextState, plainReason, pretendState, restartRefusal, statusText, type UpdateState,
} from '../src/shared/updates';
import { Updates, WorkCounter, configure, pickAutoUpdater, type UpdaterLike, type UpdatesSys } from '../src/main/updates';
import { duringWork, workNow } from '../src/renderer/src/work';
import { TOUR_ALLOWED, TOUR_BLOCKED } from '../src/main/tourGuard';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const AT = '2026-11-18T10:00:00.000Z';
const start = (): UpdateState => initialState('0.2.0-beta.1', true);
const checking = (asked: boolean) => nextState(start(), { type: 'check', asked });

describe('the update states', () => {
  it('a development run checks nothing and never leaves "off"', () => {
    const off = initialState('0.2.0-beta.1', false);
    expect(off.phase).toBe('off');
    expect(nextState(off, { type: 'check', asked: true })).toBe(off);
    expect(actionsFor(off)).toEqual([]);
    expect(nextCheckIn({ on: true, phase: 'off', checkedBefore: false })).toBeNull();
  });

  it('a check finds a newer version, which is downloaded only when asked, then waits for its restart', () => {
    let s = checking(false);
    expect(s.phase).toBe('checking');
    s = nextState(s, { type: 'found', version: '0.2.0-beta.2', at: AT });
    expect(s).toMatchObject({ phase: 'available', version: '0.2.0-beta.2', checkedAt: AT });
    expect(actionsFor(s)).toEqual(['download', 'check']);
    expect(chipText(s)).toBe('Version 0.2.0-beta.2 is available');
    s = nextState(s, { type: 'download' });
    s = nextState(s, { type: 'progress', percent: 41.6 });
    expect(s).toMatchObject({ phase: 'downloading', percent: 42 });
    expect(actionsFor(s)).toEqual([]);
    expect(statusText(s)).toBe('Downloading version 0.2.0-beta.2: 42%');
    s = nextState(s, { type: 'downloaded', version: '0.2.0-beta.2' });
    expect(s.phase).toBe('ready');
    expect(actionsFor(s)).toEqual(['restart']);
    expect(chipText(s)).toBe('Restart to update');
    // A later check never throws a downloaded update away.
    expect(nextState(s, { type: 'check', asked: true })).toBe(s);
  });

  it('nothing newer: "You have the latest version", and no chip', () => {
    const s = nextState(checking(true), { type: 'none', at: AT });
    expect(statusText(s)).toBe('You have the latest version.');
    expect(chipText(s)).toBeNull();
    expect(actionsFor(s)).toEqual(['check']);
  });

  it('a check nobody asked for fails quietly; one the owner asked for says why', () => {
    const quiet = nextState(checking(false), { type: 'error', message: 'HttpError: 503 Service Unavailable' });
    expect(quiet.phase).toBe('idle');
    expect(quiet.error).toBeNull();
    const shown = nextState(checking(true), { type: 'error', message: 'HttpError: 503 Service Unavailable' });
    expect(shown).toMatchObject({ phase: 'failed', failedAt: 'check' });
    expect(statusText(shown)).toBe('Could not check: GitHub had a problem answering. Try again later.');
    expect(chipText(shown)).toBeNull();
    // A quiet failure after a version was found keeps showing that version.
    const found = nextState(checking(false), { type: 'found', version: '0.2.0-beta.2', at: AT });
    expect(nextState(nextState(found, { type: 'check', asked: false }), { type: 'error', message: 'boom' }).phase).toBe('available');
  });

  it('offline is not an error, even when asked', () => {
    for (const m of ['net::ERR_INTERNET_DISCONNECTED', 'getaddrinfo ENOTFOUND github.com', 'net::ERR_NAME_NOT_RESOLVED']) {
      expect(isOffline(m), m).toBe(true);
      const s = nextState(checking(true), { type: 'error', message: m, at: AT });
      expect(s.phase).toBe('offline');
      expect(s.error).toBeNull();
      expect(statusText(s)).toBe('This computer is offline, so nothing was checked. Hiltwright tries again later.');
    }
  });

  it('a failed download can be tried again', () => {
    let s = nextState(nextState(checking(true), { type: 'found', version: '0.2.0-beta.2', at: AT }), { type: 'download' });
    s = nextState(s, { type: 'error', message: 'sha512 checksum mismatch, expected abc' });
    expect(s).toMatchObject({ phase: 'failed', failedAt: 'download' });
    expect(statusText(s)).toBe('Could not download: the downloaded file did not match its checksum, so it was thrown away.');
    expect(actionsFor(s)).toEqual(['download', 'check']);
    expect(actionLabel('download', s)).toBe('Try the download again');
    expect(chipText(s)).toBe('Update did not finish');
    expect(nextState(s, { type: 'download' }).phase).toBe('downloading');
  });

  it('electron-updater failures are said plainly', () => {
    expect(plainReason('Unable to find latest version on GitHub ... ERR_UPDATER_LATEST_VERSION_NOT_FOUND')).toBe('no Hiltwright release was found on GitHub.');
    expect(plainReason('Cannot find latest.yml in the latest release artifacts')).toBe('the newest release on GitHub is missing its update file (latest.yml).');
    expect(plainReason('ENOENT: no such file or directory, open resources/app-update.yml')).toBe('this copy of Hiltwright was not built with update information.');
    expect(plainReason('something odd')).toBe('something unexpected went wrong. The run log has the details.');
  });

  it('checks by themselves: a little after start, then every few hours, and only with the setting on', () => {
    expect(FIRST_CHECK_MS).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(CHECK_EVERY_MS).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000);
    expect(nextCheckIn({ on: true, phase: 'idle', checkedBefore: false })).toBe(FIRST_CHECK_MS);
    expect(nextCheckIn({ on: true, phase: 'latest', checkedBefore: true })).toBe(CHECK_EVERY_MS);
    expect(nextCheckIn({ on: true, phase: 'idle', checkedBefore: true })).toBe(CHECK_EVERY_MS);
    expect(nextCheckIn({ on: false, phase: 'idle', checkedBefore: false })).toBeNull();
    for (const phase of ['available', 'downloading', 'ready'] as const) expect(nextCheckIn({ on: true, phase, checkedBefore: true })).toBeNull();
  });

  it('the setting is on unless the owner turned it off', () => {
    expect(checksOnStart(null)).toBe(true);
    expect(checksOnStart('1')).toBe(true);
    expect(checksOnStart('0')).toBe(false);
  });

  it('says plainly what a check sends', () => {
    expect(NETWORK_NOTE).toMatch(/sends nothing about your sabers or you/);
    expect(NETWORK_NOTE).not.toMatch(/—/);
  });

  it('the development aid pretends each state', () => {
    expect(pretendState('available', '0.2.0-beta.1')?.phase).toBe('available');
    expect(pretendState('downloading:30', '0.2.0-beta.1')).toMatchObject({ phase: 'downloading', percent: 30 });
    expect(pretendState('ready', '0.2.0-beta.1')?.phase).toBe('ready');
    expect(pretendState('failed', '0.2.0-beta.1')?.phase).toBe('failed');
    expect(pretendState('nonsense', '0.2.0-beta.1')).toBeNull();
  });
});

describe('Restart to update waits for what must not be cut short', () => {
  it('names what to wait for', () => {
    expect(restartRefusal({ work: [], cardShared: false })).toBeNull();
    expect(restartRefusal({ work: ['build'], cardShared: false })).toBe('Wait for the build to finish, then restart to update.');
    expect(restartRefusal({ work: ['install'], cardShared: false })).toBe('Wait for the firmware install to finish, then restart to update.');
    expect(restartRefusal({ work: ['restore'], cardShared: false })).toBe('Wait for Put back to finish, then restart to update.');
    expect(restartRefusal({ work: ['copy'], cardShared: false })).toBe('Wait for the copy to the card to finish, then restart to update.');
    expect(restartRefusal({ work: ['share'], cardShared: false })).toBe("Wait for the saber's card to be shared or given back, then restart to update.");
    expect(restartRefusal({ work: [], cardShared: true })).toBe("Give the saber's card back on Live › Card first, then restart to update.");
    // The install is named first: it is the one that matters most.
    expect(restartRefusal({ work: ['copy', 'build', 'install'], cardShared: true })).toBe('Wait for the firmware install to finish, then restart to update.');
  });

  it('every long job main runs is a request it answers', () => {
    const ipc = read('../src/main/ipc.ts');
    for (const c of Object.keys(WORK_CHANNELS)) expect(ipc, c).toContain(`'${c}'`);
    for (const c of ['build:run', 'flash:write', 'flash:backup', 'flash:restore', 'sd:copyFont', 'fontlib:copyToCard', 'packs:copyFontToCard', 'import:xenoFont']) expect(WORK_CHANNELS[c], c).toBeTruthy();
    expect(ipc).toMatch(/fn = work\.wrap\(WORK_CHANNELS\[channel\], fn\);/);
  });

  it('main counts a job from its start until it is answered, failed ones too', async () => {
    const w = new WorkCounter();
    let release!: () => void;
    const slow = w.wrap('build', () => new Promise<void>((r) => { release = r; }));
    const failing = w.wrap('copy', async () => { throw new Error('no'); });
    const p = slow();
    expect(w.now()).toEqual(['build']);
    await expect(failing()).rejects.toThrow('no');
    expect(w.now()).toEqual(['build']);
    release(); await p;
    expect(w.now()).toEqual([]);
    expect(w.wrap(undefined, () => 1)).toBeTypeOf('function');
  });

  it('the page counts its sequences the same way', async () => {
    let release!: () => void;
    const p = duringWork('install', () => new Promise<void>((r) => { release = r; }));
    expect(workNow()).toEqual(['install']);
    await expect(duringWork('copy', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(workNow()).toEqual(['install']);
    release(); await p;
    expect(workNow()).toEqual([]);
  });
});

function fakeUpdater(over: Partial<UpdaterLike> = {}) {
  const handlers: Record<string, (v: never) => void> = {};
  const u: UpdaterLike & { handlers: typeof handlers } = {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false, allowDowngrade: true, requestHeaders: null, logger: null,
    checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.2.0-beta.2' } })),
    downloadUpdate: vi.fn(async () => { handlers['download-progress']?.({ percent: 50 } as never); return ['x.exe']; }),
    quitAndInstall: vi.fn(),
    on: ((event: string, cb: (v: never) => void) => { handlers[event] = cb; return u; }) as UpdaterLike['on'],
    handlers,
    ...over,
  };
  return u;
}

function makeSys(u: UpdaterLike, over: Partial<UpdatesSys> = {}) {
  const emitted: UpdateState[] = [];
  const lines: string[] = [];
  const load = vi.fn(async () => u);
  const sys: UpdatesSys = { packaged: true, version: '0.2.0-beta.1', load, emit: (s) => emitted.push(s), workInMain: () => [], log: (l) => lines.push(l), now: () => new Date(AT), ...over };
  return { sys, emitted, lines, load };
}

describe("main's updater", () => {
  it('sets electron-updater up to download and install only when asked', () => {
    const u = fakeUpdater();
    configure(u, () => undefined);
    expect(u.autoDownload).toBe(false);
    expect(u.autoInstallOnAppQuit).toBe(false);
    expect(u.allowPrerelease).toBe(true);
    expect(u.allowDowngrade).toBe(false);
    expect(u.requestHeaders).toEqual({ 'x-user-staging-id': SHARED_STAGING_ID });
  });

  it('a development run never loads electron-updater', async () => {
    const u = fakeUpdater();
    const { sys, load } = makeSys(u, { packaged: false });
    const up = new Updates(sys);
    expect((await up.check(true)).phase).toBe('off');
    expect((await up.download()).phase).toBe('off');
    expect((await up.install({ work: [], cardShared: false })).ok).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('checks, downloads with progress, then restarts to install when nothing is running', async () => {
    const u = fakeUpdater();
    const { sys, emitted } = makeSys(u);
    const up = new Updates(sys);
    expect((await up.check(false)).phase).toBe('available');
    expect(u.downloadUpdate).not.toHaveBeenCalled();
    expect((await up.download()).phase).toBe('ready');
    expect(emitted.map((s) => s.phase)).toEqual(['checking', 'available', 'downloading', 'downloading', 'ready']);
    expect(emitted[3].percent).toBe(50);
    expect(await up.install({ work: [], cardShared: false })).toEqual({ ok: true, text: 'Restarting to update.' });
    expect(u.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('refuses to restart while the page or main is busy, and says what to wait for', async () => {
    const u = fakeUpdater();
    let mainWork: ('build' | 'copy')[] = ['copy'];
    const { sys } = makeSys(u, { workInMain: () => mainWork });
    const up = new Updates(sys);
    await up.check(true); await up.download();
    expect(await up.install({ work: [], cardShared: false })).toEqual({ ok: false, text: 'Wait for the copy to the card to finish, then restart to update.' });
    mainWork = [];
    expect((await up.install({ work: [], cardShared: true })).text).toBe("Give the saber's card back on Live › Card first, then restart to update.");
    expect((await up.install({ work: ['restore'], cardShared: false })).text).toBe('Wait for Put back to finish, then restart to update.');
    expect(u.quitAndInstall).not.toHaveBeenCalled();
  });

  it('nothing to install before a download', async () => {
    const u = fakeUpdater();
    const up = new Updates(makeSys(u).sys);
    expect(await up.install({ work: [], cardShared: false })).toEqual({ ok: false, text: 'No update is downloaded yet.' });
    expect(u.quitAndInstall).not.toHaveBeenCalled();
  });

  it('the same version is not offered', async () => {
    const u = fakeUpdater({ checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.2.0-beta.1' } })) });
    expect((await new Updates(makeSys(u).sys).check(true)).phase).toBe('latest');
  });

  it('a failed check is quiet unless asked; offline is never an error', async () => {
    const u = fakeUpdater({ checkForUpdates: vi.fn(async () => { throw new Error('HttpError: 500'); }) });
    const up = new Updates(makeSys(u).sys);
    expect((await up.check(false)).phase).toBe('idle');
    expect(await up.check(true)).toMatchObject({ phase: 'failed', error: 'GitHub had a problem answering. Try again later.' });
    const off = fakeUpdater({ checkForUpdates: vi.fn(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); }) });
    expect((await new Updates(makeSys(off).sys).check(true)).phase).toBe('offline');
  });

  it('the development aid pretends every step without loading electron-updater', async () => {
    const u = fakeUpdater();
    const { sys, load } = makeSys(u, { packaged: false, pretend: 'available' });
    const up = new Updates(sys);
    expect(up.state().phase).toBe('available');
    expect((await up.download()).phase).toBe('ready');
    expect((await up.install({ work: [], cardShared: false })).ok).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });
});

describe('the tour and the build settings', () => {
  it('during the tour only the state can be read; a check is answered quietly with it', () => {
    expect(TOUR_ALLOWED.has('updates:state')).toBe(true);
    for (const c of ['updates:check', 'updates:download', 'updates:install']) expect(TOUR_BLOCKED.has(c), c).toBe(true);
    expect(read('../src/main/ipc.ts')).toMatch(/handle\('updates:check', \(_e, asked: unknown\) => updates\.check\(asked === true\), \(\) => updates\.state\(\)\);/);
  });

  it('the build writes the update files for GitHub, and dist never publishes', () => {
    const pkg = JSON.parse(read('../package.json')) as { scripts: Record<string, string>; dependencies: Record<string, string>; build: { publish: unknown; win: Record<string, unknown> } };
    expect(pkg.dependencies['electron-updater']).toBeTruthy();
    expect(pkg.build.publish).toEqual([{ provider: 'github', owner: 'safwyls', repo: 'hiltwright', releaseType: 'prerelease' }]);
    expect(pkg.scripts.dist).toMatch(/--publish never/);
    // Unsigned, and the updater must not ask the downloaded installer for a signature.
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(false);
  });
});

describe('loading electron-updater (0.2.0-beta.2: every check failed with "Cannot set properties of undefined")', () => {
  it('finds autoUpdater on the default export, where an ES import of the real package puts it', async () => {
    const mod = await import('electron-updater') as unknown as Record<string, unknown> & { default: object };
    // Not read here: its getter starts the updater, which needs a running Electron app. Where it is defined is enough.
    expect(Object.getOwnPropertyNames(mod).includes('autoUpdater') || Object.getOwnPropertyNames(mod.default).includes('autoUpdater')).toBe(true);
    const fake = fakeUpdater({});
    expect(pickAutoUpdater({ default: { autoUpdater: fake } })).toBe(fake);
    expect(pickAutoUpdater({ autoUpdater: fake })).toBe(fake);
  });
  it('says so plainly when the package gives none', () => {
    expect(() => pickAutoUpdater({})).toThrow(/did not give an autoUpdater/);
    expect(() => pickAutoUpdater(null)).toThrow(/did not give an autoUpdater/);
  });
});
