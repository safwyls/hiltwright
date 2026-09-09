// IPC surface. Every handler validates its arguments; the renderer is sandboxed and untrusted by design.

import { app, ipcMain, shell } from 'electron';
import type { PresetRecord } from '@hiltwright/core';
import { Library, libraryPath } from './library';
import { Snapshots } from './snapshots';
import { proffieSerials } from './usb';
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

  ipcMain.handle('snapshots:list', (_e, id: unknown) => snapshots.list(str(id, 40)));
  ipcMain.handle('snapshots:save', (_e, id: unknown, label: unknown, list: unknown) => snapshots.save(str(id, 40), str(label, 120), presets(list)));
  ipcMain.handle('snapshots:read', (_e, id: unknown, file: unknown) => snapshots.read(str(id, 40), str(file, 200)));

  ipcMain.handle('usb:proffieSerials', () => proffieSerials());

  ipcMain.handle('app:userDataPath', () => userData);
  ipcMain.handle('app:openPath', async (_e, p: unknown) => {
    const target = str(p, 1000);
    if (!target.startsWith(userData)) throw new Error('Only app data paths can be opened');
    await shell.openPath(target);
  });
}
