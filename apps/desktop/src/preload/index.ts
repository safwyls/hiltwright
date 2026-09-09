import { contextBridge } from 'electron';

// The only bridge for now. Subprocesses, files and the toolchain arrive here later as typed IPC.
const api = {
  appVersion: '0.1.0',
  platform: process.platform,
};

contextBridge.exposeInMainWorld('hiltwright', api);

export type HiltwrightApi = typeof api;
