// Issue #30: a packaged app loads only its own page, its page opens no WebSocket, and its Electron fuses are set so
// the launch environment cannot turn it into Node.js, slip code in, or swap its app.asar. The fuse hook is run here
// against stand-ins; only a real packaged build (npm run dist, or the Test builds workflow) shows it on Electron itself.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUSES, fuseConfig, packagedPaths, setFuses, type PackContext } from '../build/afterPack.mjs';
import { DEV_LIVE_RELOAD, productionCsp } from '../build/csp';
import { devRendererUrl, scrubDevEnv } from '../src/main/devEnv';

const here = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', here), 'utf8')) as { build: Record<string, unknown>; devDependencies: Record<string, string> };

describe('the page a window loads', () => {
  it('a packaged build ignores ELECTRON_RENDERER_URL, and removes it with the development switches', () => {
    expect(devRendererUrl({ ELECTRON_RENDERER_URL: 'http://localhost:5173/' }, true)).toBeNull();
    const env: Record<string, string | undefined> = { ELECTRON_RENDERER_URL: 'https://example.com/', HILTWRIGHT_E2E: '1', PATH: 'x' };
    expect(scrubDevEnv(env, true).sort()).toEqual(['ELECTRON_RENDERER_URL', 'HILTWRIGHT_E2E']);
    expect(env).toEqual({ PATH: 'x' });
  });

  it('a development run loads the development server, and only one on this computer', () => {
    expect(devRendererUrl({ ELECTRON_RENDERER_URL: 'http://localhost:5173/' }, false)).toBe('http://localhost:5173/');
    expect(devRendererUrl({ ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174' }, false)).toBe('http://127.0.0.1:5174');
    for (const url of ['https://example.com/', 'http://localhost.example.com/', 'file:///C:/x/index.html', 'not a url', '']) expect(devRendererUrl({ ELECTRON_RENDERER_URL: url }, false)).toBeNull();
    expect(devRendererUrl({}, false)).toBeNull();
  });
});

describe("the page's Content-Security-Policy", () => {
  const html = readFileSync(new URL('src/renderer/index.html', here), 'utf8');
  const policy = (h: string) => /content="([^"]*)"/.exec(h.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)![0])![1];

  it('in development allows WebSockets only to live reload on this computer', () => {
    const connect = /connect-src ([^;]*)/.exec(policy(html))![1].split(' ');
    expect(connect).toEqual(["'self'", 'blob:', DEV_LIVE_RELOAD]);
  });

  it('in a production build allows no WebSocket at all, and keeps everything else', () => {
    const out = productionCsp(html);
    expect(policy(out)).not.toMatch(/wss?:/);
    expect(/connect-src ([^;]*)/.exec(policy(out))![1]).toBe("'self' blob:");
    expect(policy(out)).toBe(policy(html).replace(` ${DEV_LIVE_RELOAD}`, ''));
    expect(out.replace(policy(out), '')).toBe(html.replace(policy(html), ''));
  });

  it('stops the build when the policy no longer reads as expected', () => {
    expect(() => productionCsp(html.replace(DEV_LIVE_RELOAD, 'ws:'))).toThrow(/no ws:\/\/localhost:\* to remove/);
    expect(() => productionCsp(html.replace(DEV_LIVE_RELOAD, `${DEV_LIVE_RELOAD} wss:`))).toThrow(/would let a production page open WebSockets/);
    expect(() => productionCsp('<html></html>')).toThrow(/no Content-Security-Policy/);
  });
});

describe('Electron fuses (afterPack)', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-fuses-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const win = (): PackContext => ({ appOutDir: dir, electronPlatformName: 'win32', packager: { appInfo: { productFilename: 'Hiltwright' } } });
  const withAsar = (c: PackContext) => { const { asar } = packagedPaths(c); mkdirSync(join(asar, '..'), { recursive: true }); writeFileSync(asar, 'asar'); return c; };
  // The fuse wire as electron reads it: '1' on, '0' off, one per fuse index.
  const wireOf = (config: Record<string, unknown>) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, config[i] === true ? 49 : config[i] === false ? 48 : 49]));

  it('turns RunAsNode, NODE_OPTIONS and the inspector off, and asar-only loading and asar integrity on', () => {
    expect(FUSES).toEqual({ RunAsNode: false, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false, OnlyLoadAppFromAsar: true, EnableEmbeddedAsarIntegrityValidation: true });
    // By index in the fuse wire (@electron/fuses FuseV1Options); cookie encryption, the V8 snapshot and file:// keep Electron's defaults.
    expect(fuseConfig('win32')).toEqual({ version: '1', 0: false, 2: false, 3: false, 4: true, 5: true });
    expect(fuseConfig('darwin')).toMatchObject({ resetAdHocDarwinSignature: true });
  });

  it('flips them on the packaged executable for each platform, then reads them back', async () => {
    const cases: [PackContext, string][] = [
      [win(), join(dir, 'Hiltwright.exe')],
      [{ ...win(), electronPlatformName: 'darwin' }, join(dir, 'Hiltwright.app')],
      [{ ...win(), electronPlatformName: 'linux', packager: { appInfo: { productFilename: 'Hiltwright' }, executableName: 'hiltwright' } }, join(dir, 'hiltwright')],
    ];
    for (const [context, exe] of cases) {
      withAsar(context);
      let set: Record<string, unknown> = {};
      const fuses = { flipFuses: vi.fn(async (_p: string, c: Record<string, unknown>) => { set = c; return 1; }), getCurrentFuseWire: vi.fn(async () => wireOf(set)) };
      await setFuses(context, fuses);
      expect(fuses.flipFuses).toHaveBeenCalledWith(exe, fuseConfig(context.electronPlatformName));
      expect(fuses.getCurrentFuseWire).toHaveBeenCalledWith(exe);
    }
  });

  it('refuses to package an app that is not in app.asar', async () => {
    const fuses = { flipFuses: vi.fn(async () => 1), getCurrentFuseWire: vi.fn(async () => ({})) };
    await expect(setFuses(win(), fuses)).rejects.toThrow(/No app\.asar .*do not set "asar": false/);
    expect(fuses.flipFuses).not.toHaveBeenCalled();
  });

  it('fails the build when a fuse did not take', async () => {
    const fuses = { flipFuses: vi.fn(async () => 1), getCurrentFuseWire: vi.fn(async () => ({ ...wireOf({}), 0: 49, 5: 48 })) };
    await expect(setFuses(withAsar(win()), fuses)).rejects.toThrow('These Electron fuses did not take in ' + join(dir, 'Hiltwright.exe') + ': RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar.');
  });

  // With the real @electron/fuses, on a stand-in binary: the sentinel Electron carries, wire version 1, eight fuses all on.
  it('with the real @electron/fuses, writes the wire of a stand-in Electron binary', async () => {
    const require = createRequire(import.meta.url);
    const sentinel = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
    const exe = join(dir, 'Hiltwright.exe');
    writeFileSync(exe, Buffer.concat([Buffer.from('MZ padding '), Buffer.from(sentinel), Buffer.from([1, 8]), Buffer.alloc(8, 49), Buffer.from(' tail')]));
    await setFuses(withAsar(win()));
    const wire = await (require('@electron/fuses') as { getCurrentFuseWire: (p: string) => Promise<Record<number, number>> }).getCurrentFuseWire(exe);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => String.fromCharCode(wire[i]))).toEqual(['0', '1', '0', '0', '1', '1', '1', '1']);
  });

  // Read only: the Electron this app ships has every fuse the hook sets (its wire is long enough), so packaging will not fail on it.
  it.skipIf(!existsSync(join(createRequire(import.meta.url).resolve('electron'), '..', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')))("the app's own Electron has a wire long enough for every fuse set", async () => {
    const require = createRequire(import.meta.url);
    const exe = join(require.resolve('electron'), '..', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
    const wire = await (require('@electron/fuses') as { getCurrentFuseWire: (p: string) => Promise<Record<string, unknown>> }).getCurrentFuseWire(exe);
    expect(wire.version).toBe('1');
    for (const i of [0, 2, 3, 4, 5]) expect(typeof wire[i]).toBe('number');
  }, 60000);

  it('is the build\'s afterPack hook, with @electron/fuses pinned and the app left in app.asar', () => {
    expect(pkg.build.afterPack).toBe('./build/afterPack.mjs');
    expect(pkg.build.asar).not.toBe(false);
    // One place sets the fuses: electron-builder's own electronFuses would flip them a second time.
    expect(pkg.build.electronFuses).toBeUndefined();
    expect(pkg.devDependencies['@electron/fuses']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
