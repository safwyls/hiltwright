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
  },
  looks: {
    list: () => ipcRenderer.invoke('looks:list'),
    add: (look) => ipcRenderer.invoke('looks:add', look),
    remove: (id) => ipcRenderer.invoke('looks:remove', id),
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
    listTracks: (root) => ipcRenderer.invoke('sd:listTracks', root),
    pickFont: () => ipcRenderer.invoke('sd:pickFont'),
    copyFont: (src, root, replace) => ipcRenderer.invoke('sd:copyFont', src, root, replace),
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
    waitForRuntime: (timeoutMs) => ipcRenderer.invoke('flash:waitForRuntime', timeoutMs),
  },
  onJobEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: JobEvent) => cb(ev);
    ipcRenderer.on('job:event', listener);
    return () => { ipcRenderer.removeListener('job:event', listener); };
  },
  app: {
    userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
    openPath: (path) => ipcRenderer.invoke('app:openPath', path),
  },
};

contextBridge.exposeInMainWorld('hiltwright', api);
