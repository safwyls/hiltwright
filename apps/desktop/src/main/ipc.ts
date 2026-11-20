// IPC surface. Every handler validates its arguments; the renderer is sandboxed and untrusted by design.

import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { arch, release, version as osVersion } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { BOARD_NOT_CHOSEN, generateConfig, isBank, isStyleDoc, isTreeDoc, validateModel, wiringFingerprint, type PresetBank, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import { Library, libraryPath } from './library';
import { LooksStore, cleanLook, looksPath } from './looksStore';
import { BanksStore, banksPath } from './banksStore';
import type { LookDef } from '@hiltwright/core';
import { Snapshots } from './snapshots';
import { lookUpWanted, proffieSerials } from './usb';
import { activeWant, wantSerial } from './serialGate';
import { checkFontDir, copyFont, listFonts, listTracks, lookForCards, readVoicePack, ejectVolume, readFontSounds, hasFolder } from './sd';
import { cancelSetup, ensureToolchainRoot, installToolchain, lockFolder, plannedToolchainRoot, setupOnce, toolchainStatus, userBuildRoot } from './toolchain';
import { copyFontToCard, listPacks, packFont, packMesh, userPacksDir } from './packs';
import { FontLibrary, type ImportResult } from './fontLibrary';
import { ContributorStore, cleanUrl } from './contributors';
import { HiltStore } from './hilts';
import type { HiltInput, LegacyHilts } from '../shared/api';
import { buildFirmware } from './build';
import { cleanFirmware, hexMap } from './firmwareRecord';
import { insideFolder } from './paths';
import { legalDir, readLegal } from './legal';
import { sourceUrl } from '../shared/about';
import { installBootloaderDriver } from './driver';
import { importXenoFont, scanXenoCard, type XenoFontInfo } from './importer';
import { writeAllowed, type KeptBuild } from './writeGuard';
import { backAfter, backupFlash, describeBootloader, driverUsable, flashTarget, leaveBootloader, listBackups, newBootloaders, restoreBackup, usbState, waitFor, writeFirmware, type UsbState } from './flash';
import { logged } from './ipcLog';
import { tourGuarded, tourState } from './tourGuard';
import { JsonStore, storeProblems } from './jsonStore';
import { runLog, runLogs } from './log';
import { cleanSnapshot, composeBundle, writeBundle, type LastBuild } from './supportBundle';
import { Updates, WorkCounter, pickAutoUpdater } from './updates';
import { captionOverlay, saveTheme } from './appearance';
import { WORK_CHANNELS, type BusyFacts, type UpdateState, type WorkKind } from '../shared/updates';
import type { FontLibraryStatus, JobEvent } from '../shared/api';
import type { FirmwareManifest } from '@hiltwright/core';
import type { SaberIdentity, SaberPatch } from '../shared/api';

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

// Every handler goes through logged(): a request that fails is written to the run log before the page sees it. And
// through tourGuarded(): while the guided tour runs, only requests that read are let through (tourGuard.ts). A long job
// (shared/updates.ts WORK_CHANNELS) is counted while it runs, so Restart to update can wait for it.
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
const work = new WorkCounter();
function handle(channel: string, fn: IpcHandler, quietDuringTour?: IpcHandler): void {
  fn = work.wrap(WORK_CHANNELS[channel], fn);
  ipcMain.handle(channel, logged(channel, tourGuarded(channel, fn, quietDuringTour)));
}

/** The page's half of what is running, checked again here before a restart to update. */
function busyFacts(v: unknown): BusyFacts {
  const o = (v ?? {}) as { work?: unknown; cardShared?: unknown };
  const kinds: WorkKind[] = ['build', 'install', 'restore', 'copy', 'share', 'setup', 'driver'];
  return { work: Array.isArray(o.work) ? o.work.filter((k): k is WorkKind => kinds.includes(k as WorkKind)) : [], cardShared: o.cardShared === true };
}

export function registerIpc(): void {
  const userData = app.getPath('userData');
  const library = new Library(libraryPath(userData));
  const snapshots = new Snapshots(userData);

  handle('library:list', () => library.list());
  handle('library:upsert', (_e, input: unknown) => {
    const o = (input ?? {}) as Record<string, unknown>;
    const ex = (o.expect ?? null) as { id?: unknown; configName?: unknown } | null;
    return library.upsert({
      identity: identity(o.identity), presets: presets(o.presets ?? []),
      fonts: Array.isArray(o.fonts) ? o.fonts.map((f) => str(f, 200)) : [],
      tracks: Array.isArray(o.tracks) ? o.tracks.map((t) => str(t, 500)) : [],
      ...(typeof o.name === 'string' ? { name: str(o.name) } : {}),
    }, ex && typeof ex === 'object' ? { id: str(ex.id, 40), configName: str(ex.configName, 200) } : null);
  });
  handle('library:rename', (_e, id: unknown, name: unknown) => library.rename(str(id, 40), str(name, 80)));
  handle('library:plan', (_e, name: unknown, model: unknown) => { const errors = validateModel(model as SaberConfigModel).filter((e) => e !== BOARD_NOT_CHOSEN && !/preset/i.test(e)); if (errors.length) throw new Error(errors[0]); return library.plan(str(name, 80), model as SaberConfigModel); });
  handle('library:adopt', (_e, plannedId: unknown, targetId: unknown) => library.adopt(str(plannedId, 40), str(targetId, 40)));
  handle('library:noteBootloader', (_e, id: unknown, seen: unknown) => {
    const o = (seen ?? {}) as { serial?: unknown; flashBytes?: unknown };
    return library.noteBootloader(str(id, 40), { serial: typeof o.serial === 'string' ? o.serial : null, flashBytes: Number(o.flashBytes) });
  });
  handle('library:remove', (_e, id: unknown) => library.remove(str(id, 40)));
  handle('library:update', (_e, id: unknown, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const out: SaberPatch = {};
    if ('model' in p) out.model = p.model === null ? null : model(p.model);
    if ('firmware' in p) {
      if (p.firmware === null) out.firmware = null;
      else out.firmware = cleanFirmware(p.firmware);
    }
    if ('presets' in p) out.presets = presets(p.presets);
    return library.update(str(id, 40), out);
  });

  const looksStore = new LooksStore(looksPath(userData));
  // One shape check for a style, the same one the store applies when it reads its file back.
  const look = (v: unknown): LookDef => { const l = cleanLook(v); if (!l) throw new Error('Expected a style'); return l; };
  // Preset banks: checked for shape, then kept as given (names and font paths are the owner's own text).
  const banksStore = new BanksStore(banksPath(userData));
  const bank = (v: unknown): PresetBank => { if (!isBank(v) || !/^bank_[a-z0-9]{1,40}$/.test(v.id)) throw new Error('Expected a preset bank'); return { id: v.id, name: str(v.name, 120), updated: str(v.updated ?? new Date().toISOString(), 40), presets: v.presets.slice(0, 200).map((p) => ({ name: str(p.name, 120), font: str(p.font, 200), track: str(p.track, 300), looks: Object.fromEntries(Object.entries(p.looks).filter(([r, id]) => ['main', 'crystal', 'accent', 'side', 'motor'].includes(r) && typeof id === 'string').map(([r, id]) => [r, str(id as string, 80)])), ...(p.lookArgs ? { lookArgs: Object.fromEntries(Object.entries(p.lookArgs).filter(([r, a]) => ['main', 'crystal', 'accent', 'side', 'motor'].includes(r) && typeof a === 'string').map(([r, a]) => [r, str(a as string, 2000)])) } : {}) })) }; };
  handle('banks:list', () => banksStore.list());
  handle('banks:save', (_e, b: unknown) => banksStore.save(bank(b)));
  handle('banks:remove', (_e, id: unknown) => banksStore.remove(str(id, 80)));
  handle('looks:list', () => looksStore.list());
  handle('looks:add', (_e, l: unknown) => looksStore.add(look(l)));
  handle('looks:remove', (_e, id: unknown) => looksStore.remove(str(id, 80)));
  // Saving a style again also refreshes every saber plan's copy of it, so their next build compiles this version.
  handle('looks:update', async (_e, id: unknown, l: unknown) => {
    const v = look(l);
    if (v.id !== str(id, 80)) throw new Error('Style id mismatch');
    const looks = await looksStore.add(v);
    const sabersUpdated = await library.replaceLook(v);
    if (sabersUpdated) console.log(`[styles] ${v.id} saved; ${sabersUpdated} saber plan(s) now have this version`);
    return { looks, sabersUpdated };
  });

  handle('snapshots:list', (_e, id: unknown) => snapshots.list(str(id, 40)));
  handle('snapshots:save', (_e, id: unknown, label: unknown, list: unknown) => snapshots.save(str(id, 40), str(label, 120), presets(list)));
  handle('snapshots:read', (_e, id: unknown, file: unknown) => snapshots.read(str(id, 40), str(file, 200)));

  handle('usb:proffieSerials', () => proffieSerials());
  // Reach only this board next (the saber an install is bringing back); null lets every Proffieboard through again.
  handle('usb:wantSerial', async (_e, serial: unknown) => {
    const s = typeof serial === 'string' && /^[A-Za-z0-9]{1,40}$/.test(serial) ? serial : null;
    wantSerial(s);
    if (s) await lookUpWanted();
    const found = s ? activeWant()?.ids.size ?? 0 : 0;
    console.log(`[usb] want ${s ?? 'any board'}${s ? `: ${found} interface(s) found` : ''}`);
    return found;
  });

  // SD card via a card reader. Roots must come from locate() so the renderer cannot point us at arbitrary folders.
  let knownRoots = new Set<string>();
  const root = (v: unknown) => { const r = str(v, 500); if (!knownRoots.has(r)) throw new Error('Unknown card'); return r; };
  // `{ detailed: true }` returns the whole look (DriveLook), saying when Windows did not answer; without it, the cards
  // as before, an empty list included when it did not. A look Windows did not answer leaves the known cards as they were.
  handle('sd:locate', async (_e, opts: unknown) => {
    const look = await lookForCards();
    if (look.answered) knownRoots = new Set(look.cards.map((c) => c.root));
    const detailed = !!opts && typeof opts === 'object' && (opts as { detailed?: unknown }).detailed === true;
    return detailed ? look : look.answered ? look.cards : [];
  });
  handle('sd:listFonts', (_e, r: unknown) => listFonts(root(r)));
  handle('sd:eject', (_e, r: unknown) => ejectVolume(root(r)));
  handle('sd:hasFolder', (_e, r: unknown, name: unknown) => hasFolder(root(r), str(name, 200)));
  // The font library: fonts the owner added, in a folder of their choosing (default userData/fonts). Where it is lives
  // in fontlibrary.json, kept by the safe store; every font library request waits until that has been read.
  interface LibSettings { root?: string; legacyDismissed?: boolean }
  const cleanLibSettings = (raw: unknown): { value: LibSettings; dropped: number } | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    return { value: { ...(typeof o.root === 'string' ? { root: o.root } : {}), ...(o.legacyDismissed === true ? { legacyDismissed: true } : {}) }, dropped: 0 };
  };
  const libSettingsStore = new JsonStore<LibSettings>(join(userData, 'fontlibrary.json'), { name: 'font library location', place: 'data', empty: () => ({}), clean: cleanLibSettings });
  let libSettings: LibSettings = {};
  const defaultLibRoot = join(userData, 'fonts');
  const fontLib = new FontLibrary(defaultLibRoot, (p) => shell.trashItem(p), defaultLibRoot);
  const libReady = (async () => {
    libSettings = { ...(await libSettingsStore.read()) };
    fontLib.setRoot(process.env.HILTWRIGHT_FONT_LIBRARY || libSettings.root || defaultLibRoot);
  })();
  const saveLibSettings = (patch: Partial<LibSettings>) => libSettingsStore.update((s) => {
    for (const [k, v] of Object.entries(patch) as [keyof LibSettings, LibSettings[keyof LibSettings]][]) { if (v === undefined) delete s[k]; else (s as Record<string, unknown>)[k] = v; }
    libSettings = { ...s };
  });
  const fontHandle = (channel: string, fn: Parameters<typeof ipcMain.handle>[1]) => handle(channel, async (...args) => { await libReady; return fn(...args); });
  // Before the library there was the "font bank", a folder the owner pointed at. Offered once as something to import.
  let legacyBank: string | null = null;
  try { legacyBank = (JSON.parse(readFileSync(join(userData, 'fontbank.json'), 'utf8')) as { root?: string }).root ?? null; } catch { /* never chosen */ }
  const libStatus = async (): Promise<FontLibraryStatus> => ({ root: fontLib.root, isDefault: resolve(fontLib.root) === resolve(defaultLibRoot), missing: await fontLib.missing(), legacyBank: libSettings.legacyDismissed || !legacyBank || !existsSync(legacyBank) ? null : legacyBank });
  const folder = (v: unknown) => str(v, 120);
  const libEmit = (line: string) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('fontlib:progress', line); };
  fontHandle('fontlib:status', () => libStatus());
  fontHandle('fontlib:list', () => fontLib.list());
  fontHandle('fontlib:detail', (_e, f: unknown) => fontLib.detail(folder(f)));
  fontHandle('fontlib:setMeta', (_e, f: unknown, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const out: { name?: string; maker?: string; notes?: string; bundle?: string } = {};
    if (typeof p.name === 'string') out.name = str(p.name, 120).trim() || folder(f);
    if (typeof p.maker === 'string') out.maker = str(p.maker, 120).trim();
    if (typeof p.notes === 'string') out.notes = str(p.notes, 4000);
    if (typeof p.bundle === 'string') out.bundle = str(p.bundle, 120).trim();
    return fontLib.setMeta(folder(f), out);
  });
  // Contributors: font makers and look authors, with a logo and a link each. Logos the font library kept for its
  // makers before this list existed are brought over once, at start.
  const contributors = new ContributorStore(userData);
  const hilts = new HiltStore(userData);
  const contributorsReady = (async () => {
    try { await libReady; for (const l of await fontLib.legacyLogos()) if (!(await contributors.has(l.name)) && existsSync(l.file)) await contributors.setLogo(l.name, l.file); } catch (err) { console.log(`[contributors] bringing over font makers' logos: ${String(err)}`); }
  })();
  handle('contributors:list', async () => { await contributorsReady; return contributors.list(); });
  // A logo comes only from a file the owner picked in the dialog.
  handle('contributors:setLogo', async (_e, who: unknown) => {
    const name = str(who, 120);
    const r = await dialog.showOpenDialog({ title: `Choose a logo for ${name}`, properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    await contributorsReady;
    return contributors.setLogo(name, r.filePaths[0]);
  });
  // Every change waits for the start-up handover of the font library's old logos, as listing does.
  handle('contributors:clearLogo', async (_e, who: unknown) => { await contributorsReady; return contributors.clearLogo(str(who, 120)); });
  handle('contributors:setUrl', async (_e, who: unknown, url: unknown) => { await contributorsReady; return contributors.setUrl(str(who, 120), str(url, 500)); });
  // A renamed author can be given the old name's logo and link (a copy; the old name keeps its own).
  handle('contributors:copy', async (_e, from: unknown, to: unknown) => { await contributorsReady; return contributors.copyTo(str(from, 120), str(to, 120)); });
  // Opens only the link saved for that person, and only if it is still a web address, in the system browser.
  handle('contributors:open', async (_e, who: unknown) => {
    await contributorsReady;
    const stored = await contributors.urlOf(str(who, 120));
    let url: string | null = null;
    try { url = stored ? cleanUrl(stored) : null; } catch { url = null; }
    if (url && /^https?:\/\//i.test(url)) await shell.openExternal(url);
    else if (stored) console.warn(`[contributors] not opening a stored link that is not a web address: ${stored}`);
  });
  fontHandle('fontlib:remove', (_e, f: unknown) => fontLib.remove(folder(f)));
  fontHandle('fontlib:readSound', (_e, f: unknown, rel: unknown) => fontLib.readSound(folder(f), str(rel, 400)));
  fontHandle('fontlib:readFont', (e, f: unknown) => fontLib.readFont(folder(f), (file, done, total) => e.sender.send('sd:readFont:progress', { file, done, total })));
  fontHandle('fontlib:copyToCard', (e, f: unknown, r: unknown, replace: unknown) => { const name = basename(folder(f)); return fontLib.copyToCard(folder(f), root(r), { replace: replace === true, onProgress: (done, total) => e.sender.send('sd:copy:progress', { name, done, total }) }); });
  fontHandle('fontlib:open', async (_e, f: unknown) => { await shell.openPath(f == null ? fontLib.root : join(fontLib.root, basename(folder(f)))); });
  // Adding: the owner picks .zip packages or folders; only paths the dialog returned are ever read.
  const importPicked = async (paths: string[]): Promise<ImportResult> => {
    const all: ImportResult = { added: [], skipped: [] };
    for (const p of paths) {
      try { const r = await fontLib.importFrom(p, libEmit); all.added.push(...r.added); all.skipped.push(...r.skipped); } catch (err) { all.skipped.push({ name: basename(p), why: String(err).replace(/^Error: /, '') }); }
    }
    return all;
  };
  fontHandle('fontlib:addZip', async () => {
    const r = await dialog.showOpenDialog({ title: 'Add sound font packages', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Font packages', extensions: ['zip'] }] });
    return r.canceled ? null : importPicked(r.filePaths);
  });
  fontHandle('fontlib:addFolder', async () => {
    const r = await dialog.showOpenDialog({ title: 'Add a font folder (or a folder of fonts)', properties: ['openDirectory', 'multiSelections'] });
    return r.canceled ? null : importPicked(r.filePaths);
  });
  fontHandle('fontlib:importLegacy', async () => { if (!legacyBank) return null; const r = await importPicked([legacyBank]); await saveLibSettings({ legacyDismissed: true }); return r; });
  fontHandle('fontlib:dismissLegacy', async () => { await saveLibSettings({ legacyDismissed: true }); return libStatus(); });
  // Choosing a folder: refused into itself or its surroundings, clashes listed before anything moves, nothing renamed.
  // With the library folder missing there is nothing to move: the chosen folder is simply where it is now.
  fontHandle('fontlib:chooseRoot', async () => {
    const r = await dialog.showOpenDialog({ title: 'Where should the font library live?', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0] || resolve(r.filePaths[0]) === resolve(fontLib.root)) return libStatus();
    const next = r.filePaths[0];
    const missing = await fontLib.missing();
    const have = missing ? 0 : (await fontLib.list()).length;
    let move = false;
    let keepBack: string[] = [];
    if (have) {
      const plan = await fontLib.planMove(next);
      if (plan.refused) throw new Error(plan.refused);
      const ask = await dialog.showMessageBox({ type: 'question', title: 'Font library', message: `Move your ${have} font${have === 1 ? '' : 's'} to ${next}?`, detail: 'Or leave them where they are and use whatever fonts the new folder already holds.', buttons: ['Move them', 'Use the new folder as it is', 'Cancel'], defaultId: 0, cancelId: 2 });
      if (ask.response === 2) return libStatus();
      move = ask.response === 0;
      if (move && plan.clashes.length) {
        const shown = plan.clashes.slice(0, 12).join(', ') + (plan.clashes.length > 12 ? ` and ${plan.clashes.length - 12} more` : '');
        const clash = await dialog.showMessageBox({
          type: 'warning', title: 'Font library', noLink: true,
          message: `${plan.clashes.length} of your fonts have the same folder name as a font already in ${next}.`,
          detail: `${shown}.\n\nPresets find fonts by their folder name, so nothing is renamed. You can keep the ones already there and move the rest (yours stay untouched in ${fontLib.root}), or cancel.`,
          buttons: ['Keep the ones already there and move the rest', 'Cancel'], defaultId: 1, cancelId: 1,
        });
        if (clash.response !== 0) return libStatus();
        keepBack = plan.clashes;
      }
    }
    await fontLib.moveTo(next, move, libEmit, { keepBack });
    await saveLibSettings({ root: resolve(next) === resolve(defaultLibRoot) ? undefined : next });
    return libStatus();
  });
  fontHandle('fontlib:resetRoot', async () => {
    if (resolve(fontLib.root) === resolve(defaultLibRoot)) return libStatus();
    await fontLib.moveTo(defaultLibRoot, false);
    await saveLibSettings({ root: undefined });
    return libStatus();
  });
  // A font's sounds, for playing in the app, from a known card.
  handle('sd:readFont', async (e, r: unknown, fontName: unknown) => {
    const name = String(fontName);
    if (!/^[^\\/:*?"<>|]+$/.test(name)) throw new Error('Bad font name');
    return readFontSounds(join(root(r), name), (file, done, total) => e.sender.send('sd:readFont:progress', { file, done, total }));
  });
  // The demo room's hilts, pack fit adjustments and scene settings, in the data folder so every build shares them.
  handle('hilts:list', () => hilts.list());
  handle('hilts:model', (_e, id: unknown) => hilts.model(str(id, 20)));
  handle('hilts:add', (_e, input: unknown, mode: unknown) => hilts.add(input as HiltInput, mode === 'keepBoth' ? 'keepBoth' : mode && typeof mode === 'object' ? { replace: str((mode as { replace?: unknown }).replace, 20) } : 'new'));
  handle('hilts:setFit', (_e, id: unknown, fit: unknown) => hilts.setFit(str(id, 20), fit));
  handle('hilts:setCreator', (_e, id: unknown, creator: unknown) => hilts.setCreator(str(id, 20), creator));
  handle('hilts:remove', (_e, id: unknown) => hilts.remove(str(id, 20)));
  handle('hilts:packFits', () => hilts.packFits());
  handle('hilts:setPackFit', (_e, packId: unknown, fit: unknown) => hilts.setPackFit(str(packId, 200), fit));
  handle('hilts:resetPackFit', (_e, packId: unknown) => hilts.resetPackFit(str(packId, 200)));
  handle('hilts:room', () => hilts.room());
  // The demo room remembers its scene by itself as it opens; during the tour that is answered without writing anything.
  handle('hilts:setRoom', (_e, patch: unknown) => hilts.setRoom((patch && typeof patch === 'object' ? patch : {}) as { scene?: unknown; chosen?: unknown }), () => hilts.room());
  // Bringing old hilts over also runs by itself as the demo room opens: during the tour it waits, adding nothing.
  handle('hilts:adopt', (_e, legacy: unknown) => hilts.adopt(legacy as LegacyHilts), () => ({ added: 0, fits: 0, skipped: 0 }));
  handle('hilts:export', async () => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Dev aid: HILTWRIGHT_DIALOG_FILE answers this dialog (and Import's), so an offscreen run can export and import.
    const r = process.env.HILTWRIGHT_DIALOG_FILE ? { canceled: false, filePath: process.env.HILTWRIGHT_DIALOG_FILE } : await dialog.showSaveDialog({ title: 'Export hilts', defaultPath: join(app.getPath('documents'), `Hiltwright hilts ${day}.zip`), filters: [{ name: 'Zip file', extensions: ['zip'] }] });
    if (r.canceled || !r.filePath) return null;
    return { file: r.filePath, ...(await hilts.exportTo(r.filePath)) };
  });
  handle('hilts:import', async () => {
    const r = process.env.HILTWRIGHT_DIALOG_FILE ? { canceled: false, filePaths: [process.env.HILTWRIGHT_DIALOG_FILE] } : await dialog.showOpenDialog({ title: 'Import hilts', properties: ['openFile'], filters: [{ name: 'Hiltwright hilt export', extensions: ['zip'] }] });
    return r.canceled || !r.filePaths[0] ? null : hilts.importFrom(r.filePaths[0]);
  });
  // Packs: encrypted hilts and fonts. Payloads are decrypted here and handed over in memory, never as files.
  handle('packs:list', () => listPacks());
  handle('packs:dir', () => userPacksDir());
  handle('packs:mesh', (_e, id: unknown) => packMesh(str(id, 200)));
  handle('packs:font', (_e, id: unknown) => packFont(str(id, 200)));
  handle('packs:copyFontToCard', async (e, packId: unknown, r: unknown, opts: unknown) => {
    const id = str(packId, 200);
    const cardRoot = root(r);
    const name = (await listPacks()).find((p) => p.id === id)?.name ?? id;
    // Progress goes to the page as each file lands, as for sd:copyFont.
    return copyFontToCard(id, cardRoot, { replace: (opts as { replace?: unknown } | null)?.replace === true, onProgress: (done, total) => e.sender.send('sd:copy:progress', { name, done, total }) });
  });
  handle('sd:listTracks', (_e, r: unknown) => listTracks(root(r)));
  handle('sd:voicePack', (_e, r: unknown) => readVoicePack(root(r)));
  let pickedFonts = new Set<string>();
  handle('sd:pickFont', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose a sound font folder', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const entry = await checkFontDir(res.filePaths[0]);
    pickedFonts.add(entry.path);
    return entry;
  });
  handle('sd:copyFont', (e, src: unknown, r: unknown, replace: unknown) => {
    const s = str(src, 1000);
    if (!pickedFonts.has(s)) throw new Error('Pick the font folder first');
    // Progress goes to the page as each file lands (card-safety D5).
    const name = basename(s);
    return copyFont(s, root(r), { replace: replace === true, onProgress: (done, total) => e.sender.send('sd:copy:progress', { name, done, total }) });
  });

  // Import from a Xenopixel card. The owner picks the folder; only fonts found by that scan can be imported.
  let xenoFonts = new Map<string, XenoFontInfo>();
  handle('import:pickXeno', async () => {
    const res = await dialog.showOpenDialog({ title: 'Choose the Xenopixel SD card (or a copy of it)', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const fonts = await scanXenoCard(res.filePaths[0]);
    xenoFonts = new Map(fonts.map((f) => [f.path, f]));
    return { root: res.filePaths[0], fonts };
  });
  handle('import:xenoFont', (_e, src: unknown, r: unknown, folder: unknown, replace: unknown) => {
    const f = xenoFonts.get(str(src, 1000));
    if (!f) throw new Error('Choose the Xenopixel card first');
    return importXenoFont(f.path, root(r), str(folder, 60), replace === true);
  });

  // ---- Tier 2: toolchain, build, flash ----
  // The toolchain wants a short path on Windows: GCC opens its headers 213 characters below the root and
  // CreateProcess fails past 260. The folder is chosen now but created only when the owner starts the setup.
  let toolchainRoot = process.env.HILTWRIGHT_TOOLCHAIN_DIR || plannedToolchainRoot(userData);
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
  handle('toolchain:status', () => toolchainStatus(toolchainRoot));
  // One setup at a time: pressing Install again joins the running one. Cancel stops it between or during steps.
  handle('toolchain:install', () => setupOnce(async (signal) => {
    const onLine = (l: string) => emit('toolchain', l);
    if (!process.env.HILTWRIGHT_TOOLCHAIN_DIR) toolchainRoot = await ensureToolchainRoot(toolchainRoot, userData, onLine);
    return installToolchain(toolchainRoot, onLine, undefined, signal);
  }));
  handle('toolchain:cancel', () => cancelSetup());
  // Lock a toolchain folder other users can change; asks Windows for approval when the folder belongs to administrators.
  handle('toolchain:repair', async () => {
    const r = await lockFolder(toolchainRoot, true);
    emit('toolchain', r.ok ? `locked ${toolchainRoot}` : `could not lock ${toolchainRoot}: ${r.text}`);
    return { ...r, status: await toolchainStatus(toolchainRoot) };
  });
  handle('build:preview', (_e, m: unknown) => {
    const mm = model(m);
    const errors = validateModel(mm);
    const g = generateConfig(mm);
    return { text: g.text, hash: g.hash, warnings: g.warnings, errors };
  });
  // The last build of this run, for the diagnostics file (the page forgets it when it changes page).
  let lastBuild: LastBuild | null = null;
  // Each saber's last successful build this run: the only firmware `flash:write` accepts for it (FW10).
  const lastBuildBySaber = new Map<string, KeptBuild>();
  handle('build:run', async (_e, saberId: unknown, m: unknown, force: unknown) => {
    const id = str(saberId, 40);
    const at = new Date().toISOString();
    try {
      const mm = model(m);
      const r = await buildFirmware({ toolchainRoot, saberId: id, model: mm, force: force === true, onLine: (l) => emit('build', l) });
      if (r.ok && r.dfuPath) lastBuildBySaber.set(id, { dfuPath: r.dfuPath, layout: wiringFingerprint(mm.board, mm.blades) });
      lastBuild = { at, saberId: id, ok: r.ok, cached: r.cached, ms: r.ms, textBytes: r.textBytes, flashBytes: r.flashBytes, flashPct: r.flashPct, warnings: r.warnings, problems: r.problems };
      console.log(`[build] result ok=${r.ok} cached=${r.cached} ms=${r.ms} flash=${r.flashPct ?? '?'}% warnings=${r.warnings.length} problems=${r.problems.length}${r.problems[0] ? `: ${r.problems[0]}` : ''}`);
      return r;
    } catch (err) {
      lastBuild = { at, saberId: id, ok: false, cached: false, ms: Date.now() - Date.parse(at), textBytes: null, flashBytes: 0, flashPct: null, warnings: [], problems: [err instanceof Error ? err.message : String(err)] };
      throw err;
    }
  });
  // Install steps report failure in their result rather than by throwing, so each result is logged here.
  const result = (step: string) => <T>(r: T): T => { console.log(`[flash] ${step} result: ${JSON.stringify(r)}`); return r; };
  handle('flash:usb', () => usbState());
  // A USB serial from the page: short plain text, or null for "the only board".
  const serialArg = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9]{1,40}$/.test(v) ? v : null);
  const serialsArg = (v: unknown): (string | null)[] | null => (Array.isArray(v) ? v.slice(0, 16).map(serialArg) : null);
  handle('flash:waitForBootloader', async (_e, timeoutMs: unknown, before: unknown) => result('waitForBootloader')(await (async () => {
    // With `before` (the bootloaders present before a reboot), only a bootloader that was not there counts.
    const was = serialsArg(before);
    const fresh = (u: UsbState) => (was ? newBootloaders(u, was) : u.bootloaders);
    const s = await waitFor((u) => fresh(u).length > 0, Math.min(Number(timeoutMs) || 15000, 60000), (l) => emit('flash', l));
    if (!s) return { ok: false, text: 'The board did not switch to bootloader mode. Hold BOOT, tap RESET, release BOOT, then try again.', serials: [] };
    // Give Windows a moment to bind the driver before judging it.
    const bound = (await waitFor((u) => fresh(u).length > 0 && fresh(u).every((b) => driverUsable(b.driver)), 5000)) ?? s;
    const found = fresh(bound);
    return { ...describeBootloader({ ...bound, bootloaderDriver: found[0]?.driver ?? null, bootloaderProblem: found[0]?.problem ?? null }), serials: found.map((b) => b.serial) };
  })()));
  handle('flash:target', (_e, serial: unknown) => flashTarget(toolchainRoot, serialArg(serial)).then(result('target')));
  handle('flash:leave', (_e, serial: unknown) => leaveBootloader(toolchainRoot, serialArg(serial), (l) => emit('flash', l)).then(result('leave')));
  handle('flash:backup', (_e, saberId: unknown, label: unknown, configName: unknown, serial: unknown) => backupFlash(toolchainRoot, join(userData, 'sabers', str(saberId, 40), 'backups'), str(label, 60), (l) => emit('flash', l), typeof configName === 'string' ? str(configName, 200) : null, serialArg(serial)).then(result('backup')));
  handle('flash:write', async (_e, saberId: unknown, dfuPath: unknown, serial: unknown) => {
    const id = str(saberId, 40);
    const p = str(dfuPath, 1000);
    // Paths arrive with whatever slashes the builder used; compare them resolved and case-folded (Windows).
    const norm = (x: string) => resolve(x).replace(/[\\/]+/g, '/').toLowerCase();
    if (!norm(p).startsWith(norm(userBuildRoot()) + '/')) throw new Error('Only firmware built by Hiltwright can be written');
    // Main's own gate, whatever the page asks for: this saber's last build, from wiring the owner confirmed (FW10).
    const saved = (await library.list()).find((s) => s.id === id)?.model;
    const allowed = writeAllowed(lastBuildBySaber.get(id), saved, p);
    if (!allowed.ok) return result('write')({ ok: false, ms: 0, detail: allowed.text, refused: true });
    return writeFirmware(toolchainRoot, p, (l) => emit('flash', l), serialArg(serial)).then(result('write'));
  });
  const backupsDir = (saberId: unknown) => join(userData, 'sabers', str(saberId, 40).replace(/[^A-Za-z0-9_-]/g, '_'), 'backups');
  handle('flash:listBackups', (_e, saberId: unknown) => listBackups(backupsDir(saberId)));
  handle('flash:restore', async (_e, saberId: unknown, file: unknown, serial: unknown) => {
    const name = str(file, 200);
    // Only a plain file name from this saber's own backups folder; never a path.
    if (!/^[A-Za-z0-9._-]+\.bin$/.test(name)) throw new Error('Not a backup file name');
    // The board's own flash size, looked up here, decides whether the backup fits: whatever the page believes.
    const target = await flashTarget(toolchainRoot, serialArg(serial));
    if (!target.found) return result('restore')({ ok: false, ms: 0, detail: 'The saber is not in bootloader mode, or more than one board is. Nothing was written.' });
    return restoreBackup(toolchainRoot, join(backupsDir(saberId), name), (l) => emit('flash', l), serialArg(serial), target.flashBytes).then(result('restore'));
  });
  // The installer is kept in the owner's own data folder, not the shared toolchain folder: it runs elevated.
  handle('flash:installDriver', () => installBootloaderDriver(join(userData, 'drivers'), (l) => emit('flash', l)).then(result('installDriver')));
  // With a serial, wait for that saber: running again, and its bootloader gone. Another board may stay in its bootloader.
  handle('flash:waitForRuntime', async (_e, timeoutMs: unknown, serial: unknown) => {
    const s = serialArg(serial);
    const noSerialBefore = (await usbState()).runtimeNoSerial;
    return result('waitForRuntime')(!!(await waitFor((u: UsbState) => backAfter(u, s, noSerialBefore), Math.min(Number(timeoutMs) || 20000, 60000), (l) => emit('flash', l))));
  });

  // Save diagnostics: compose the file from what main knows and the page's snapshot, write it, show it. Never sent.
  handle('support:save', async (_e, snapshot: unknown) => {
    const connection = cleanSnapshot(snapshot);
    const fail = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) });
    const [toolchain, usb, sabers] = await Promise.all([toolchainStatus(toolchainRoot).catch(fail), usbState().catch(fail), Promise.resolve(library.list()).catch(() => [])]);
    const saber = connection.saberId ? sabers.find((x) => x.id === connection.saberId) ?? null : null;
    console.log(`[support] saving diagnostics (status ${connection.status}, saber ${saber?.name ?? 'none'})`);
    const logDir = join(userData, 'logs');
    const current = runLog() ? basename(runLog()!.file) : null;
    const previous = runLogs(logDir).filter((n) => n !== current).at(-1) ?? null;
    const read = (name: string | null) => { if (!name) return null; try { return { name, text: readFileSync(join(logDir, name), 'utf8') }; } catch { return null; } };
    const now = new Date();
    const text = composeBundle({
      now, connection, saber, lastBuild, toolchain, usb, currentLog: read(current), previousLog: read(previous),
      about: { app: app.getVersion(), packaged: app.isPackaged, os: `${osVersion()} ${release()}`, arch: arch(), electron: process.versions.electron, chrome: process.versions.chrome },
    });
    const file = writeBundle(join(userData, 'support'), text, now);
    shell.showItemInFolder(file);
    console.log(`[support] saved ${basename(file)}`);
    return { file: basename(file) };
  });

  // Stores set aside at start (jsonStore.ts). Reading them first makes sure the library and sets have been loaded.
  handle('app:storeProblems', async () => { await Promise.all([library.list(), banksStore.list(), looksStore.list(), contributorsReady.then(() => contributors.list()), hilts.list(), libReady.then(() => fontLib.list())]); return storeProblems(); });
  handle('app:userDataPath', () => userData);
  // The guided tour starts and ends here. The page also says "off" as it loads, so a reload never leaves it on.
  handle('tour:set', (_e, on: unknown) => { tourState.active = on === true; console.log(`[tour] ${tourState.active ? 'started: requests that change anything are refused' : 'ended'}`); return tourState.active; });
  // False in a development run started with HILTWRIGHT_NO_BOARD (packaged builds never have it).
  handle('app:boardAccess', () => !process.env.HILTWRIGHT_NO_BOARD);
  handle('app:openHelp', async (_e, url: unknown) => {
    const u = new URL(str(url, 500));
    if (u.protocol !== 'https:' || !['pod.hubbe.net', 'fredrik.hubbe.net'].includes(u.hostname)) throw new Error('Only ProffieOS help pages can be opened');
    await shell.openExternal(u.toString());
  });
  // The About screen: the licence and notices that ship with the app, and the tagged source of this build. The link is
  // built here from the app's own version, never taken from the page, so this opens one fixed address and nothing else.
  handle('app:legal', () => readLegal(legalDir(app.isPackaged, process.resourcesPath, app.getAppPath())));
  handle('app:openSource', async () => {
    const url = sourceUrl(app.getVersion());
    if (!url) throw new Error(`No source link for version ${app.getVersion()}`);
    await shell.openExternal(url);
  });
  handle('app:openPath', async (_e, p: unknown) => {
    const target = str(p, 1000);
    if (!insideFolder(userData, target)) throw new Error('Only app data paths can be opened');
    await shell.openPath(target);
  });

  // In-app updates (updates.ts). Nothing is checked in a development run; HILTWRIGHT_UPDATE_STATE pretends a state
  // there, for screenshots. During the tour a check is answered with the state as it is, and nothing else runs.
  const sendUpdate = (s: UpdateState) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('updates:changed', s); };
  const updates = new Updates({
    // Releases carry Windows files only, so only the installed Windows app checks: a Mac copy would find a release
    // with nothing in it for a Mac and report a failure.
    packaged: app.isPackaged && process.platform === 'win32', version: app.getVersion(),
    load: async () => pickAutoUpdater(await import('electron-updater')),
    emit: sendUpdate, workInMain: () => work.now(), log: (l) => console.log(l), now: () => new Date(),
    pretend: !app.isPackaged ? process.env.HILTWRIGHT_UPDATE_STATE : undefined,
  });
  // Themes (appearance.ts). Picking one saves it and recolours the parts of the window the page cannot reach.
  handle('theme:set', async (_e, id: unknown) => {
    const theme = await saveTheme(userData, id);
    for (const w of BrowserWindow.getAllWindows()) {
      w.setBackgroundColor(theme.window.back);
      w.setTitleBarOverlay(captionOverlay(theme));
    }
    return theme.id;
  });

  handle('updates:state', () => updates.state());
  handle('updates:check', (_e, asked: unknown) => updates.check(asked === true), () => updates.state());
  handle('updates:download', () => updates.download());
  handle('updates:install', (_e, facts: unknown) => updates.install(busyFacts(facts)));
}
