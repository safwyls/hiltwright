import { contextBridge, ipcRenderer } from 'electron';
import type { HiltwrightApi, JobEvent } from '../shared/api';
import type { UpdateState } from '../shared/updates';

/** The package's version, set at build time (electron.vite.config.ts). */
declare const __APP_VERSION__: string;

// Thin, typed bridge. Each method maps to one ipcMain.handle in src/main/ipc.ts.
const api: HiltwrightApi = {
  appVersion: __APP_VERSION__,
  platform: process.platform,
  theme: {
    // Main passes the saved theme on the command line of this page's process (index.ts createWindow).
    initial: process.argv.find((a) => a.startsWith('--hiltwright-theme='))?.slice('--hiltwright-theme='.length) ?? '',
    set: (id) => ipcRenderer.invoke('theme:set', id),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: (input) => ipcRenderer.invoke('library:upsert', input),
    rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
    update: (id, patch) => ipcRenderer.invoke('library:update', id, patch),
    plan: (name, model) => ipcRenderer.invoke('library:plan', name, model),
    adopt: (plannedId, targetId) => ipcRenderer.invoke('library:adopt', plannedId, targetId),
    exportShare: (name, model) => ipcRenderer.invoke('library:exportShare', name, model),
    importShare: () => ipcRenderer.invoke('library:importShare'),
    noteBootloader: (id, seen) => ipcRenderer.invoke('library:noteBootloader', id, seen),
    linkCard: (id, card) => ipcRenderer.invoke('library:linkCard', id, card),
    unlinkCard: (id, serial) => ipcRenderer.invoke('library:unlinkCard', id, serial),
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
    importFile: () => ipcRenderer.invoke('looks:importFile'),
  },
  snapshots: {
    list: (saberId) => ipcRenderer.invoke('snapshots:list', saberId),
    save: (saberId, label, presets) => ipcRenderer.invoke('snapshots:save', saberId, label, presets),
    read: (saberId, file) => ipcRenderer.invoke('snapshots:read', saberId, file),
  },
  usb: {
    proffieSerials: () => ipcRenderer.invoke('usb:proffieSerials'),
    proffieBoards: () => ipcRenderer.invoke('usb:proffieBoards'),
    wantSerial: (serial) => ipcRenderer.invoke('usb:wantSerial', serial),
    portHolders: () => ipcRenderer.invoke('usb:portHolders'),
  },
  sd: {
    locate: () => ipcRenderer.invoke('sd:locate'),
    look: () => ipcRenderer.invoke('sd:locate', { detailed: true }),
    mounted: () => ipcRenderer.invoke('sd:mounted'),
    listFonts: (root) => ipcRenderer.invoke('sd:listFonts', root),
    eject: (root) => ipcRenderer.invoke('sd:eject', root),
    hasFolder: (root, name) => ipcRenderer.invoke('sd:hasFolder', root, name),
    readFont: (root, fontName) => ipcRenderer.invoke('sd:readFont', root, fontName),
    onReadFontProgress: (cb) => { const h = (_e: unknown, p: { file: string; done: number; total: number }) => cb(p); ipcRenderer.on('sd:readFont:progress', h); return () => ipcRenderer.off('sd:readFont:progress', h); },
    listTracks: (root) => ipcRenderer.invoke('sd:listTracks', root),
    voicePack: (root) => ipcRenderer.invoke('sd:voicePack', root),
    clearPresets: (root, saberId, volumeId) => ipcRenderer.invoke('sd:clearPresets', root, saberId, volumeId),
    configFiles: (root) => ipcRenderer.invoke('sd:configFiles', root),
    pickConfig: () => ipcRenderer.invoke('config:pick'),
    voicePacks: () => ipcRenderer.invoke('voicePack:list'),
    openVoicePackLink: (which) => ipcRenderer.invoke('voicePack:openLink', which),
    pickVoicePack: () => ipcRenderer.invoke('voicePack:pick'),
    installVoicePack: (root, source, volumeId) => ipcRenderer.invoke('voicePack:install', root, source, volumeId),
    onVoicePackDownload: (cb) => { const h = (_e: unknown, p: { name: string; got: number; total: number }) => cb(p); ipcRenderer.on('voicePack:download:progress', h); return () => ipcRenderer.off('voicePack:download:progress', h); },
    pickFont: () => ipcRenderer.invoke('sd:pickFont'),
    copyFont: (src, root, replace, volumeId) => ipcRenderer.invoke('sd:copyFont', src, root, replace, volumeId),
    onCopyProgress: (cb) => { const h = (_e: unknown, p: { name: string; done: number; total: number }) => cb(p); ipcRenderer.on('sd:copy:progress', h); return () => ipcRenderer.off('sd:copy:progress', h); },
  },
  fontLibrary: {
    status: () => ipcRenderer.invoke('fontlib:status'),
    list: () => ipcRenderer.invoke('fontlib:list'),
    detail: (folder) => ipcRenderer.invoke('fontlib:detail', folder),
    setMeta: (folder, patch) => ipcRenderer.invoke('fontlib:setMeta', folder, patch),
    remove: (folder) => ipcRenderer.invoke('fontlib:remove', folder),
    readSound: (folder, path) => ipcRenderer.invoke('fontlib:readSound', folder, path),
    readFont: (folder) => ipcRenderer.invoke('fontlib:readFont', folder),
    copyToCard: (folder, root, replace, volumeId) => ipcRenderer.invoke('fontlib:copyToCard', folder, root, replace, volumeId),
    addZip: () => ipcRenderer.invoke('fontlib:addZip'),
    addFolder: () => ipcRenderer.invoke('fontlib:addFolder'),
    importLegacy: () => ipcRenderer.invoke('fontlib:importLegacy'),
    exportPack: (opts) => ipcRenderer.invoke('fontlib:exportPack', opts),
    importPack: (passphrase) => ipcRenderer.invoke('fontlib:importPack', passphrase),
    dismissLegacy: () => ipcRenderer.invoke('fontlib:dismissLegacy'),
    chooseRoot: () => ipcRenderer.invoke('fontlib:chooseRoot'),
    resetRoot: () => ipcRenderer.invoke('fontlib:resetRoot'),
    open: (folder) => ipcRenderer.invoke('fontlib:open', folder ?? null),
    onProgress: (cb) => { const h = (_e: unknown, line: string) => cb(line); ipcRenderer.on('fontlib:progress', h); return () => ipcRenderer.off('fontlib:progress', h); },
  },
  contributors: {
    list: () => ipcRenderer.invoke('contributors:list'),
    setLogo: (name) => ipcRenderer.invoke('contributors:setLogo', name),
    clearLogo: (name) => ipcRenderer.invoke('contributors:clearLogo', name),
    setUrl: (name, url) => ipcRenderer.invoke('contributors:setUrl', name, url),
    copy: (from, to) => ipcRenderer.invoke('contributors:copy', from, to),
    open: (name) => ipcRenderer.invoke('contributors:open', name),
  },
  hilts: {
    list: () => ipcRenderer.invoke('hilts:list'),
    model: (id) => ipcRenderer.invoke('hilts:model', id),
    add: (input, mode) => ipcRenderer.invoke('hilts:add', input, mode),
    setFit: (id, fit) => ipcRenderer.invoke('hilts:setFit', id, fit),
    setCreator: (id, creator) => ipcRenderer.invoke('hilts:setCreator', id, creator),
    remove: (id) => ipcRenderer.invoke('hilts:remove', id),
    packFits: () => ipcRenderer.invoke('hilts:packFits'),
    setPackFit: (packId, fit) => ipcRenderer.invoke('hilts:setPackFit', packId, fit),
    resetPackFit: (packId) => ipcRenderer.invoke('hilts:resetPackFit', packId),
    room: () => ipcRenderer.invoke('hilts:room'),
    setRoom: (patch) => ipcRenderer.invoke('hilts:setRoom', patch),
    adopt: (legacy) => ipcRenderer.invoke('hilts:adopt', legacy),
    export: () => ipcRenderer.invoke('hilts:export'),
    import: () => ipcRenderer.invoke('hilts:import'),
  },
  packs: {
    list: () => ipcRenderer.invoke('packs:list'),
    dir: () => ipcRenderer.invoke('packs:dir'),
    mesh: (id) => ipcRenderer.invoke('packs:mesh', id),
    font: (id) => ipcRenderer.invoke('packs:font', id),
    copyFontToCard: (id, root, opts) => ipcRenderer.invoke('packs:copyFontToCard', id, root, opts),
  },
  importer: {
    pickXeno: () => ipcRenderer.invoke('import:pickXeno'),
    xenoFont: (src, root, folder, replace, volumeId) => ipcRenderer.invoke('import:xenoFont', src, root, folder, replace, volumeId),
  },
  toolchain: {
    status: () => ipcRenderer.invoke('toolchain:status'),
    install: () => ipcRenderer.invoke('toolchain:install'),
    cancel: () => ipcRenderer.invoke('toolchain:cancel'),
    repair: () => ipcRenderer.invoke('toolchain:repair'),
  },
  build: {
    run: (saberId, model, force) => ipcRenderer.invoke('build:run', saberId, model, force),
    preview: (model) => ipcRenderer.invoke('build:preview', model),
    pickProp: () => ipcRenderer.invoke('props:pick'),
  },
  flash: {
    usb: () => ipcRenderer.invoke('flash:usb'),
    waitForBootloader: (timeoutMs, before) => ipcRenderer.invoke('flash:waitForBootloader', timeoutMs, before ?? null),
    target: (serial) => ipcRenderer.invoke('flash:target', serial),
    leave: (serial) => ipcRenderer.invoke('flash:leave', serial),
    backup: (saberId, label, configName, serial) => ipcRenderer.invoke('flash:backup', saberId, label, configName ?? null, serial ?? null),
    write: (saberId, dfuPath, serial, opts) => ipcRenderer.invoke('flash:write', saberId, dfuPath, serial ?? null, { noBackup: opts?.noBackup === true }),
    installDriver: () => ipcRenderer.invoke('flash:installDriver'),
    listBackups: (saberId) => ipcRenderer.invoke('flash:listBackups', saberId),
    restore: (saberId, file, serial) => ipcRenderer.invoke('flash:restore', saberId, file, serial ?? null),
    waitForRuntime: (timeoutMs, serial) => ipcRenderer.invoke('flash:waitForRuntime', timeoutMs, serial ?? null),
  },
  onJobEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: JobEvent) => cb(ev);
    ipcRenderer.on('job:event', listener);
    return () => { ipcRenderer.removeListener('job:event', listener); };
  },
  support: {
    save: (snapshot) => ipcRenderer.invoke('support:save', snapshot),
  },
  app: {
    storeProblems: () => ipcRenderer.invoke('app:storeProblems'),
    userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
    boardAccess: () => ipcRenderer.invoke('app:boardAccess'),
    openHelp: (url) => ipcRenderer.invoke('app:openHelp', url),
    openPath: (path) => ipcRenderer.invoke('app:openPath', path),
    legal: () => ipcRenderer.invoke('app:legal'),
    openSource: () => ipcRenderer.invoke('app:openSource'),
  },
  tour: {
    setActive: (on) => ipcRenderer.invoke('tour:set', on),
  },
  updates: {
    state: () => ipcRenderer.invoke('updates:state'),
    check: (asked) => ipcRenderer.invoke('updates:check', asked),
    download: () => ipcRenderer.invoke('updates:download'),
    install: (facts) => ipcRenderer.invoke('updates:install', facts),
    onChange: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, s: UpdateState) => cb(s);
      ipcRenderer.on('updates:changed', listener);
      return () => { ipcRenderer.removeListener('updates:changed', listener); };
    },
  },
};

contextBridge.exposeInMainWorld('hiltwright', api);
