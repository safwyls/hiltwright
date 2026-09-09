// Main process. Owns the window and grants the renderer Web Serial access to the Proffieboard.
// The renderer never touches Node: contextIsolation on, sandbox on, a tiny preload API.

import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const PROFFIE_VID = 0x1209;
const PROFFIE_PID = 0x6668;

/** Electron reports ids as decimal strings on select-serial-port ("4617") and as numbers to the device handler. */
function idMatches(value: unknown, expected: number): boolean {
  if (typeof value === 'number') return value === expected;
  if (typeof value !== 'string' || !value) return false;
  return parseInt(value, 10) === expected || parseInt(value, 16) === expected;
}

function isProffie(vendorId: unknown, productId: unknown): boolean {
  return idMatches(vendorId, PROFFIE_VID) && idMatches(productId, PROFFIE_PID);
}

function grantSerial(): void {
  const ses = session.defaultSession;
  // Pick the Proffieboard when the renderer calls navigator.serial.requestPort().
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const proffie = portList.find((p) => isProffie(p.vendorId, p.productId));
    console.log('[main] select-serial-port', portList.map((p) => `${p.portName ?? p.displayName ?? '?'} ${p.vendorId}:${p.productId}`).join(', '), '→', proffie?.portId ?? '(none)');
    callback(proffie?.portId ?? '');
  });
  // Let navigator.serial.getPorts() return the board without a prompt, so connecting needs no click.
  // With a handler installed, Electron consults it for getPorts() and again at open time, so it must recognise the
  // board. On Windows a serial device arrives as { device_instance_id: "USB\\VID_1209&PID_6668&MI_00\\...", name },
  // with no vendorId/productId fields; other platforms report ids. Accept either shape.
  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType !== 'serial') return false;
    const d = details.device as { vendorId?: unknown; productId?: unknown; device_instance_id?: string };
    const byId = isProffie(d.vendorId, d.productId);
    const byInstance = /VID_1209&PID_6668/i.test(d.device_instance_id ?? '');
    const ok = byId || byInstance;
    console.log('[main] device permission', JSON.stringify(details.device), '→', ok);
    return ok;
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 700,
    backgroundColor: '#0a0e13',
    title: 'Hiltwright',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Mirror renderer console output to the terminal so the walking skeleton can be checked headlessly.
  win.webContents.on('console-message', (event: unknown, ...rest: unknown[]) => {
    const details = (event as { message?: string; level?: string | number }) ?? {};
    const message = typeof rest[1] === 'string' ? rest[1] : details.message ?? String(rest[0] ?? '');
    console.log('[renderer]', message);
  });
  // Chromium requires a user gesture for navigator.serial.requestPort(). The renderer cannot fake one, but main can
  // run a script *as* a gesture, which is what makes "plug it in and it just connects" possible.
  win.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      void win.webContents.executeJavaScript('window.hiltwrightAutoConnect ? window.hiltwrightAutoConnect() : "no hook"', true)
        .then((r) => console.log('[main] auto-connect', r))
        .catch((err) => console.log('[main] auto-connect failed', String(err)));
    }, 400);
    // Dev aid: HILTWRIGHT_E2E=1 runs the renderer's end-to-end preset edit against the connected board.
    if (process.env.HILTWRIGHT_E2E) setTimeout(() => {
      void win.webContents.executeJavaScript('window.hiltwrightE2E ? window.hiltwrightE2E() : "no hook"', true)
        .then((r) => console.log('[main] e2e', r))
        .catch((err) => console.log('[main] e2e failed', String(err)));
    }, 7000);
    // Dev aid: HILTWRIGHT_SHOT=<file.png> captures the window a few seconds after load.
    const shot = process.env.HILTWRIGHT_SHOT;
    if (shot) setTimeout(() => { void win.webContents.executeJavaScript(`window.hiltwrightGoto && window.hiltwrightGoto(${JSON.stringify(process.env.HILTWRIGHT_PAGE ?? 'armory')})`, true).then(() => new Promise((r) => setTimeout(r, 800))).then(() => win.webContents.capturePage()).then((img) => writeFile(shot, img.toPNG())).then(() => console.log('[main] screenshot', shot)); }, process.env.HILTWRIGHT_E2E ? 30000 : 6000);
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  grantSerial();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
