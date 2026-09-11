// IPC surface. Every handler validates its arguments; the renderer is sandboxed and untrusted by design.

import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { join, resolve } from 'node:path';
import { generateConfig, validateModel, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import { Library, libraryPath } from './library';
import { LooksStore, looksPath } from './looksStore';
import type { LookDef } from '@hiltwright/core';
import { Snapshots } from './snapshots';
import { proffieSerials } from './usb';
import { checkFontDir, copyFont, listFonts, listTracks, locateCards } from './sd';
import { installToolchain, toolchainStatus } from './toolchain';
import { buildFirmware } from './build';
import { backupFlash, describeBootloader, usbState, waitFor, writeFirmware } from './flash';
import type { JobEvent } from '../shared/api';
import type { FirmwareManifest } from '@hiltwright/core';
import type { SaberIdentity } from '../shared/api';

function str(v: unknown, max = 200): string {
  if (typeof v !== 'string' || v.length > max) throw new Error('Expected a short string');
  return v;
}

function presets(v: unknown): PresetRecord[] {
  if (!Array.isArray(v) || v.length > 200) throw new Error('Expected a preset list');
  return v.map((p) => {
    const o = p as Partial<PresetRecord>;
    return {
      font: str(o.font ?? '', 500), track: str(o.track ?? '', 500), name: str(o.name ?? '', 500),
      styles: Array.isArray(o.styles) ? o.styles.map((s) => str(s, 2000)) : [],
      variation: Number.isFinite(o.variation) ? Number(o.variation) : 0,
    };
  });
}

function identity(v: unknown): SaberIdentity {
  const o = (v ?? {}) as Partial<SaberIdentity>;
  const s = (x: unknown) => (typeof x === 'string' ? x.slice(0, 200) : null);
  return {
    usbSerial: s(o.usbSerial), configName: s(o.configName), version: s(o.version), prop: s(o.prop),
    buttons: Number.isFinite(o.buttons) ? Number(o.buttons) : null, installed: s(o.installed),
    pixelBlades: Array.isArray(o.pixelBlades) ? o.pixelBlades.map(Number).filter(Number.isFinite).slice(0, 16) : [],
    bladeConfig: Number.isFinite(o.bladeConfig) ? Number(o.bladeConfig) : null,
  };
}

export function registerIpc(): void {
  const userData = app.getPath('userData');
  const library = new Library(libraryPath(userData));
  const snapshots = new Snapshots(userData);

  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:upsert', (_e, input: unknown) => {
    const o = (input ?? {}) as Record<string, unknown>;
    return library.upsert({
      identity: identity(o.identity), presets: presets(o.presets ?? []),
      fonts: Array.isArray(o.fonts) ? o.fonts.map((f) => str(f, 200)) : [],
      tracks: Array.isArray(o.tracks) ? o.tracks.map((t) => str(t, 500)) : [],
      ...(typeof o.name === 'string' ? { name: str(o.name) } : {}),
    });
  });
  ipcMain.handle('library:rename', (_e, id: unknown, name: unknown) => library.rename(str(id, 40), str(name, 80)));
  ipcMain.handle('library:remove', (_e, id: unknown) => library.remove(str(id, 40)));
  const hexMap = (v: unknown): Record<number, string> => {
    const out: Record<number, string> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (/^\d+$/.test(k) && /^#[0-9a-fA-F]{6}$/.test(String(x))) out[Number(k)] = String(x);
    return out;
  };
  ipcMain.handle('library:update', (_e, id: unknown, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const out: { model?: SaberConfigModel | null; firmware?: FirmwareManifest | null } = {};
    if ('model' in p) out.model = p.model === null ? null : model(p.model);
    if ('firmware' in p) {
      if (p.firmware === null) out.firmware = null;
      else {
        const f = p.firmware as FirmwareManifest;
        if (!f || typeof f !== 'object' || typeof f.hash !== 'string' || !Array.isArray(f.looks) || !Array.isArray(f.presets)) throw new Error('Expected a firmware manifest');
        out.firmware = { hash: str(f.hash, 40), os: str(f.os ?? '', 40), at: str(f.at ?? new Date().toISOString(), 40), looks: f.looks.map((l) => ({ id: str(l.id, 80), name: str(l.name, 120), args: Array.isArray(l.args) ? l.args.map(Number).filter(Number.isFinite) : [], ...(l.defaults ? { defaults: hexMap(l.defaults) } : {}) })), presets: f.presets.map((x) => ({ name: str(x.name, 200), looks: Array.isArray(x.looks) ? x.looks.map((s) => str(s, 80)) : [] })) };
      }
    }
    return library.update(str(id, 40), out);
  });

  const looksStore = new LooksStore(looksPath(userData));
  const look = (v: unknown): LookDef => {
    const l = v as LookDef;
    if (!l || typeof l !== 'object' || !/^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(String(l.id)) || typeof l.code !== 'string') throw new Error('Expected a look');
    return {
      id: l.id, name: str(l.name, 120), source: 'pasted', by: str(l.by ?? '', 120), code: str(l.code, 200000), header: l.header == null ? null : str(l.header, 20000),
      roles: Array.isArray(l.roles) ? l.roles.filter((r): r is LookDef['roles'][number] => ['main', 'crystal', 'accent', 'side', 'motor'].includes(String(r))) : ['main'],
      args: Array.isArray(l.args) ? l.args.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100) : [],
      preview: /^#[0-9a-fA-F]{6}$/.test(String(l.preview)) ? l.preview : '#ffffff', description: str(l.description ?? '', 2000),
      ...(l.defaults ? { defaults: hexMap(l.defaults) } : {}),
    };
  };
  ipcMain.handle('looks:list', () => looksStore.list());
  ipcMain.handle('looks:add', (_e, l: unknown) => looksStore.add(look(l)));
  ipcMain.handle('looks:remove', (_e, id: unknown) => looksStore.remove(str(id, 80)));

  ipcMain.handle('snapshots:list', (_e, id: unknown) => snapshots.list(str(id, 40)));
  ipcMain.handle('snapshots:save', (_e, id: unknown, label: unknown, list: unknown) => snapshots.save(str(id, 40), str(label, 120), presets(list)));
  ipcMain.handle('snapshots:read', (_e, id: unknown, file: unknown) => snapshots.read(str(id, 40), str(file, 200)));

  ipcMain.handle('usb:proffieSerials', () => proffieSerials());

  // SD card via a card reader. Roots must come from locate() so the renderer cannot point us at arbitrary folders.
  let knownRoots = new Set<string>();
  const root = (v: unknown) => { const r = str(v, 500); if (!knownRoots.has(r)) throw new Error('Unknown card'); return r; };
  ipcMain.handle('sd:locate', async () => { const cards = await locateCards(); knownRoots = new Set(cards.map((c) => c.root)); return cards; });
  ipcMain.handle('sd:listFonts', (_e, r: unknown) => listFonts(root(r)));
  ipcMain.handle('sd:listTracks', (_e, r: unknown) => listTracks(root(r)));
  let pickedFonts = new Set<string>();
  ipcMain.handle('sd:pickFont', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose a sound font folder', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const entry = await checkFontDir(res.filePaths[0]);
    pickedFonts.add(entry.path);
    return entry;
  });
  ipcMain.handle('sd:copyFont', (_e, src: unknown, r: unknown, replace: unknown) => {
    const s = str(src, 1000);
    if (!pickedFonts.has(s)) throw new Error('Pick the font folder first');
    return copyFont(s, root(r), replace === true);
  });

  // ---- Tier 2: toolchain, build, flash ----
  const toolchainRoot = process.env.HILTWRIGHT_TOOLCHAIN_DIR || join(userData, 'toolchain');
  const emit = (job: JobEvent['job'], line: string) => {
    const ev: JobEvent = { job, line, at: Date.now() };
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('job:event', ev);
    console.log(`[${job}] ${line}`);
  };
  const model = (v: unknown): SaberConfigModel => {
    const m = v as SaberConfigModel;
    if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !Array.isArray(m.blades) || !Array.isArray(m.presets)) throw new Error('Expected a saber model');
    return m;
  };
  ipcMain.handle('toolchain:status', () => toolchainStatus(toolchainRoot));
  ipcMain.handle('toolchain:install', () => installToolchain(toolchainRoot, (l) => emit('toolchain', l)));
  ipcMain.handle('build:preview', (_e, m: unknown) => {
    const mm = model(m);
    const errors = validateModel(mm);
    const g = generateConfig(mm);
    return { text: g.text, hash: g.hash, warnings: g.warnings, errors };
  });
  ipcMain.handle('build:run', (_e, saberId: unknown, m: unknown, force: unknown) => buildFirmware({ toolchainRoot, saberId: str(saberId, 40), model: model(m), force: force === true, onLine: (l) => emit('build', l) }));
  ipcMain.handle('flash:usb', () => usbState());
  ipcMain.handle('flash:waitForBootloader', async (_e, timeoutMs: unknown) => {
    const s = await waitFor((u) => u.bootloaderPresent, Math.min(Number(timeoutMs) || 15000, 60000), (l) => emit('flash', l));
    if (!s) return { ok: false, text: 'The board did not switch to bootloader mode. Hold BOOT, tap RESET, release BOOT, then try again.' };
    // Give Windows a moment to bind the driver before judging it.
    const bound = (await waitFor((u) => u.bootloaderPresent && /winusb/i.test(u.bootloaderDriver ?? ''), 5000)) ?? s;
    return describeBootloader(bound);
  });
  ipcMain.handle('flash:backup', (_e, saberId: unknown, label: unknown) => backupFlash(toolchainRoot, join(userData, 'sabers', str(saberId, 40), 'backups'), str(label, 60), (l) => emit('flash', l)));
  ipcMain.handle('flash:write', (_e, dfuPath: unknown) => {
    const p = str(dfuPath, 1000);
    // Paths arrive with whatever slashes the builder used; compare them resolved and case-folded (Windows).
    const norm = (x: string) => resolve(x).replace(/[\\/]+/g, '/').toLowerCase();
    if (!norm(p).startsWith(norm(toolchainRoot) + '/')) throw new Error('Only firmware built by Hiltwright can be written');
    return writeFirmware(toolchainRoot, p, (l) => emit('flash', l));
  });
  ipcMain.handle('flash:waitForRuntime', async (_e, timeoutMs: unknown) => !!(await waitFor((u) => u.runtimePresent && !u.bootloaderPresent, Math.min(Number(timeoutMs) || 20000, 60000), (l) => emit('flash', l))));

  ipcMain.handle('app:userDataPath', () => userData);
  ipcMain.handle('app:openPath', async (_e, p: unknown) => {
    const target = str(p, 1000);
    if (!target.startsWith(userData)) throw new Error('Only app data paths can be opened');
    await shell.openPath(target);
  });
}
