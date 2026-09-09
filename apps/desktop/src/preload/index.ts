import { contextBridge, ipcRenderer } from 'electron';
import type { HiltwrightApi } from '../shared/api';

// Thin, typed bridge. Each method maps to one ipcMain.handle in src/main/ipc.ts.
const api: HiltwrightApi = {
  appVersion: '0.1.0',
  platform: process.platform,
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: (input) => ipcRenderer.invoke('library:upsert', input),
    rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
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
  app: {
    userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
    openPath: (path) => ipcRenderer.invoke('app:openPath', path),
  },
};

contextBridge.exposeInMainWorld('hiltwright', api);
