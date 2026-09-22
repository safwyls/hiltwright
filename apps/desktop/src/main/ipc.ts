// IPC surface. Every handler validates its arguments; the renderer is sandboxed and untrusted by design.

import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateConfig, isBank, isStyleDoc, isTreeDoc, validateModel, type PresetBank, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import { Library, libraryPath } from './library';
import { LooksStore, looksPath } from './looksStore';
import { BanksStore, banksPath } from './banksStore';
import type { LookDef } from '@hiltwright/core';
import { Snapshots } from './snapshots';
import { proffieSerials } from './usb';
import { checkFontDir, copyFont, listFonts, listTracks, locateCards, readVoicePack, ejectVolume, readFontSounds } from './sd';
import { defaultToolchainRoot, installToolchain, toolchainStatus } from './toolchain';
import { listPacks, packFont, packMesh, userPacksDir } from './packs';
import { buildFirmware } from './build';
import { installBootloaderDriver } from './driver';
import { importXenoFont, scanXenoCard, type XenoFontInfo } from './importer';
import { backupFlash, describeBootloader, listBackups, restoreBackup, usbState, waitFor, writeFirmware } from './flash';
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
  ipcMain.handle('library:plan', (_e, name: unknown, model: unknown) => { const errors = validateModel(model as SaberConfigModel).filter((e) => !/preset/i.test(e)); if (errors.length) throw new Error(errors[0]); return library.plan(str(name, 80), model as SaberConfigModel); });
  ipcMain.handle('library:adopt', (_e, plannedId: unknown, targetId: unknown) => library.adopt(str(plannedId, 40), str(targetId, 40)));
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
        out.firmware = { hash: str(f.hash, 40), bladeId: f.bladeId === true, os: str(f.os ?? '', 40), at: str(f.at ?? new Date().toISOString(), 40), looks: f.looks.map((l) => ({ id: str(l.id, 80), name: str(l.name, 120), args: Array.isArray(l.args) ? l.args.map(Number).filter(Number.isFinite) : [], ...(l.defaults ? { defaults: hexMap(l.defaults) } : {}) })), presets: f.presets.map((x) => ({ name: str(x.name, 200), looks: Array.isArray(x.looks) ? x.looks.map((s) => str(s, 80)) : [] })) };
      }
    }
    return library.update(str(id, 40), out);
  });

  const looksStore = new LooksStore(looksPath(userData));
  const look = (v: unknown): LookDef => {
    const l = v as LookDef;
    if (!l || typeof l !== 'object' || !/^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(String(l.id)) || typeof l.code !== 'string') throw new Error('Expected a look');
    return {
      id: l.id, name: str(l.name, 120), source: l.source === 'built' ? 'built' : 'pasted', by: str(l.by ?? '', 120), code: str(l.code, 200000), header: l.header == null ? null : str(l.header, 20000),
      roles: Array.isArray(l.roles) ? l.roles.filter((r): r is LookDef['roles'][number] => ['main', 'crystal', 'accent', 'side', 'motor'].includes(String(r))) : ['main'],
      args: Array.isArray(l.args) ? l.args.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100) : [],
      preview: /^#[0-9a-fA-F]{6}$/.test(String(l.preview)) ? l.preview : '#ffffff', description: str(l.description ?? '', 2000),
      ...(l.defaults ? { defaults: hexMap(l.defaults) } : {}),
      ...(l.preview2 && /^#[0-9a-fA-F]{6}$/.test(String(l.preview2)) ? { preview2: l.preview2 } : {}),
      // A look built in the style editor: its alias define is what gets compiled, its layers let it be edited again.
      ...(typeof l.define === 'string' ? { define: str(l.define, 200000) } : {}),
      ...(l.usesFx ? { usesFx: true } : {}),
      ...(isStyleDoc(l.style) || isTreeDoc(l.style) ? { style: JSON.parse(JSON.stringify(l.style)) as unknown } : {}),
    };
  };
  // Preset banks: checked for shape, then kept as given (names and font paths are the owner's own text).
  const banksStore = new BanksStore(banksPath(userData));
  const bank = (v: unknown): PresetBank => { if (!isBank(v) || !/^bank_[a-z0-9]{1,40}$/.test(v.id)) throw new Error('Expected a preset bank'); return { id: v.id, name: str(v.name, 120), updated: str(v.updated ?? new Date().toISOString(), 40), presets: v.presets.slice(0, 200).map((p) => ({ name: str(p.name, 120), font: str(p.font, 200), track: str(p.track, 300), looks: Object.fromEntries(Object.entries(p.looks).filter(([r, id]) => ['main', 'crystal', 'accent', 'side', 'motor'].includes(r) && typeof id === 'string').map(([r, id]) => [r, str(id as string, 80)])), ...(p.lookArgs ? { lookArgs: Object.fromEntries(Object.entries(p.lookArgs).filter(([r, a]) => ['main', 'crystal', 'accent', 'side', 'motor'].includes(r) && typeof a === 'string').map(([r, a]) => [r, str(a as string, 2000)])) } : {}) })) }; };
  ipcMain.handle('banks:list', () => banksStore.list());
  ipcMain.handle('banks:save', (_e, b: unknown) => banksStore.save(bank(b)));
  ipcMain.handle('banks:remove', (_e, id: unknown) => banksStore.remove(str(id, 80)));
  ipcMain.handle('looks:list', () => looksStore.list());
  ipcMain.handle('looks:add', (_e, l: unknown) => looksStore.add(look(l)));
  ipcMain.handle('looks:remove', (_e, id: unknown) => looksStore.remove(str(id, 80)));
  ipcMain.handle('looks:update', (_e, id: unknown, l: unknown) => { const v = look(l); if (v.id !== str(id, 80)) throw new Error('Look id mismatch'); return looksStore.add(v); });

  ipcMain.handle('snapshots:list', (_e, id: unknown) => snapshots.list(str(id, 40)));
  ipcMain.handle('snapshots:save', (_e, id: unknown, label: unknown, list: unknown) => snapshots.save(str(id, 40), str(label, 120), presets(list)));
  ipcMain.handle('snapshots:read', (_e, id: unknown, file: unknown) => snapshots.read(str(id, 40), str(file, 200)));

  ipcMain.handle('usb:proffieSerials', () => proffieSerials());

  // SD card via a card reader. Roots must come from locate() so the renderer cannot point us at arbitrary folders.
  let knownRoots = new Set<string>();
  const root = (v: unknown) => { const r = str(v, 500); if (!knownRoots.has(r)) throw new Error('Unknown card'); return r; };
  ipcMain.handle('sd:locate', async () => { const cards = await locateCards(); knownRoots = new Set(cards.map((c) => c.root)); return cards; });
  ipcMain.handle('sd:listFonts', (_e, r: unknown) => listFonts(root(r)));
  ipcMain.handle('sd:eject', (_e, r: unknown) => ejectVolume(root(r)));
  // The font bank: a folder of fonts on this computer, remembered in a small file beside the library.
  const bankFile = join(app.getPath('userData'), 'fontbank.json');
  let bankRoot: string | null = null;
  try { bankRoot = (JSON.parse(readFileSync(bankFile, 'utf8')) as { root?: string }).root ?? null; } catch { /* none chosen yet */ }
  if (process.env.HILTWRIGHT_FONT_BANK) bankRoot = process.env.HILTWRIGHT_FONT_BANK; // dev aid
  // A font's sounds, for playing in the app. The font sits on a known card, or in the font bank the owner chose.
  ipcMain.handle('sd:readFont', async (e, r: unknown, fontName: unknown) => {
    const base = String(r);
    const name = String(fontName);
    if (!/^[^\\/:*?"<>|]+$/.test(name)) throw new Error('Bad font name');
    if (!knownRoots.has(base) && base !== bankRoot) throw new Error('Not a known card or font bank');
    return readFontSounds(join(base, name), (file, done, total) => e.sender.send('sd:readFont:progress', { file, done, total }));
  });
  ipcMain.handle('sd:fontBank', () => bankRoot);
  // Packs: encrypted hilts and fonts. Payloads are decrypted here and handed over in memory, never as files.
  ipcMain.handle('packs:list', () => listPacks());
  ipcMain.handle('packs:dir', () => userPacksDir());
  ipcMain.handle('packs:mesh', (_e, id: unknown) => packMesh(str(id, 200)));
  ipcMain.handle('packs:font', (_e, id: unknown) => packFont(str(id, 200)));
  ipcMain.handle('sd:pickFontBank', async () => {
    const r = await dialog.showOpenDialog({ title: 'Choose a folder of sound fonts', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return bankRoot;
    bankRoot = r.filePaths[0];
    try { writeFileSync(bankFile, JSON.stringify({ root: bankRoot })); } catch { /* remembered for this run only */ }
    return bankRoot;
  });
  ipcMain.handle('sd:bankFonts', async () => (bankRoot ? listFonts(bankRoot) : []));
  ipcMain.handle('sd:listTracks', (_e, r: unknown) => listTracks(root(r)));
  ipcMain.handle('sd:voicePack', (_e, r: unknown) => readVoicePack(root(r)));
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

  // Import from a Xenopixel card. The owner picks the folder; only fonts found by that scan can be imported.
  let xenoFonts = new Map<string, XenoFontInfo>();
  ipcMain.handle('import:pickXeno', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose the Xenopixel SD card (or a copy of it)', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const fonts = await scanXenoCard(res.filePaths[0]);
    xenoFonts = new Map(fonts.map((f) => [f.path, f]));
    return { root: res.filePaths[0], fonts };
  });
  ipcMain.handle('import:xenoFont', (_e, src: unknown, r: unknown, folder: unknown, replace: unknown) => {
    const f = xenoFonts.get(str(src, 1000));
    if (!f) throw new Error('Choose the Xenopixel card first');
    return importXenoFont(f.path, root(r), str(folder, 60), replace === true);
  });

  // ---- Tier 2: toolchain, build, flash ----
  // The toolchain wants a short path on Windows: GCC opens its headers 213 characters below the root and
  // CreateProcess fails past 260. See defaultToolchainRoot.
  const toolchainRoot = process.env.HILTWRIGHT_TOOLCHAIN_DIR || defaultToolchainRoot(userData);
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
  const backupsDir = (saberId: unknown) => join(userData, 'sabers', str(saberId, 40).replace(/[^A-Za-z0-9_-]/g, '_'), 'backups');
  ipcMain.handle('flash:listBackups', (_e, saberId: unknown) => listBackups(backupsDir(saberId)));
  ipcMain.handle('flash:restore', (_e, saberId: unknown, file: unknown) => {
    const name = str(file, 200);
    // Only a plain file name from this saber's own backups folder; never a path.
    if (!/^[A-Za-z0-9._-]+\.bin$/.test(name)) throw new Error('Not a backup file name');
    return restoreBackup(toolchainRoot, join(backupsDir(saberId), name), (l) => emit('flash', l));
  });
  // The installer is kept in the owner's own data folder, not the shared toolchain folder: it runs elevated.
  ipcMain.handle('flash:installDriver', () => installBootloaderDriver(join(userData, 'drivers'), (l) => emit('flash', l)));
  ipcMain.handle('flash:waitForRuntime', async (_e, timeoutMs: unknown) => !!(await waitFor((u) => u.runtimePresent && !u.bootloaderPresent, Math.min(Number(timeoutMs) || 20000, 60000), (l) => emit('flash', l))));

  ipcMain.handle('app:userDataPath', () => userData);
  ipcMain.handle('app:openHelp', async (_e, url: unknown) => {
    const u = new URL(str(url, 500));
    if (u.protocol !== 'https:' || !['pod.hubbe.net', 'fredrik.hubbe.net'].includes(u.hostname)) throw new Error('Only ProffieOS help pages can be opened');
    await shell.openExternal(u.toString());
  });
  ipcMain.handle('app:openPath', async (_e, p: unknown) => {
    const target = str(p, 1000);
    if (!target.startsWith(userData)) throw new Error('Only app data paths can be opened');
    await shell.openPath(target);
  });
}
