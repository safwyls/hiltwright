import { contextBridge, ipcRenderer } from 'electron';
import type { HiltwrightApi, JobEvent } from '../shared/api';

// Thin, typed bridge. Each method maps to one ipcMain.handle in src/main/ipc.ts.
const api: HiltwrightApi = {
  appVersion: '0.1.0',
  platform: process.platform,
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: (input) => ipcRenderer.invoke('library:upsert', input),
    rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
    update: (id, patch) => ipcRenderer.invoke('library:update', id, patch),
    plan: (name, model) => ipcRenderer.invoke('library:plan', name, model),
    adopt: (plannedId, targetId) => ipcRenderer.invoke('library:adopt', plannedId, targetId),
  },
  banks: {
    list: () => ipcRenderer.invoke('banks:list'),
    save: (bank) => ipcRenderer.invoke('banks:save', bank),
    remove: (id) => ipcRenderer.invoke('banks:remove', id),
  },
  looks: {
    list: () => ipcRenderer.invoke('looks:list'),
    add: (look) => ipcRenderer.invoke('looks:add', look),
    remove: (id) => ipcRenderer.invoke('looks:remove', id),
    update: (id, look) => ipcRenderer.invoke('looks:update', id, look),
  },
  snapshots: {
    list: (saberId) => ipcRenderer.invoke('snapshots:list', saberId),
    save: (saberId, label, presets) => ipcRenderer.invoke('snapshots:save', saberId, label, presets),
    read: (saberId, file) => ipcRenderer.invoke('snapshots:read', saberId, file),
  },
  usb: {
    proffieSerials: () => ipcRenderer.invoke('usb:proffieSerials'),
  },
  sd: {
    locate: () => ipcRenderer.invoke('sd:locate'),
    listFonts: (root) => ipcRenderer.invoke('sd:listFonts', root),
    eject: (root) => ipcRenderer.invoke('sd:eject', root),
    readFont: (root, fontName) => ipcRenderer.invoke('sd:readFont', root, fontName),
    onReadFontProgress: (cb) => { const h = (_e: unknown, p: { file: string; done: number; total: number }) => cb(p); ipcRenderer.on('sd:readFont:progress', h); return () => ipcRenderer.off('sd:readFont:progress', h); },
    fontBank: () => ipcRenderer.invoke('sd:fontBank'),
    pickFontBank: () => ipcRenderer.invoke('sd:pickFontBank'),
    bankFonts: () => ipcRenderer.invoke('sd:bankFonts'),
    listTracks: (root) => ipcRenderer.invoke('sd:listTracks', root),
    voicePack: (root) => ipcRenderer.invoke('sd:voicePack', root),
    pickFont: () => ipcRenderer.invoke('sd:pickFont'),
    copyFont: (src, root, replace) => ipcRenderer.invoke('sd:copyFont', src, root, replace),
  },
  packs: {
    list: () => ipcRenderer.invoke('packs:list'),
    dir: () => ipcRenderer.invoke('packs:dir'),
    mesh: (id) => ipcRenderer.invoke('packs:mesh', id),
    font: (id) => ipcRenderer.invoke('packs:font', id),
  },
  importer: {
    pickXeno: () => ipcRenderer.invoke('import:pickXeno'),
    xenoFont: (src, root, folder, replace) => ipcRenderer.invoke('import:xenoFont', src, root, folder, replace),
  },
  toolchain: {
    status: () => ipcRenderer.invoke('toolchain:status'),
    install: () => ipcRenderer.invoke('toolchain:install'),
  },
  build: {
    run: (saberId, model, force) => ipcRenderer.invoke('build:run', saberId, model, force),
    preview: (model) => ipcRenderer.invoke('build:preview', model),
  },
  flash: {
    usb: () => ipcRenderer.invoke('flash:usb'),
    waitForBootloader: (timeoutMs) => ipcRenderer.invoke('flash:waitForBootloader', timeoutMs),
    backup: (saberId, label) => ipcRenderer.invoke('flash:backup', saberId, label),
    write: (dfuPath) => ipcRenderer.invoke('flash:write', dfuPath),
    installDriver: () => ipcRenderer.invoke('flash:installDriver'),
    listBackups: (saberId) => ipcRenderer.invoke('flash:listBackups', saberId),
    restore: (saberId, file) => ipcRenderer.invoke('flash:restore', saberId, file),
    waitForRuntime: (timeoutMs) => ipcRenderer.invoke('flash:waitForRuntime', timeoutMs),
  },
  onJobEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: JobEvent) => cb(ev);
    ipcRenderer.on('job:event', listener);
    return () => { ipcRenderer.removeListener('job:event', listener); };
  },
  app: {
    userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
    openHelp: (url) => ipcRenderer.invoke('app:openHelp', url),
    openPath: (path) => ipcRenderer.invoke('app:openPath', path),
  },
};

contextBridge.exposeInMainWorld('hiltwright', api);
