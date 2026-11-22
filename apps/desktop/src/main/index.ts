// Main process. Owns the window and grants the renderer Web Serial access to the Proffieboard.
// The renderer never touches Node: contextIsolation on, sandbox on, a tiny preload API.

import { app, BrowserWindow, dialog, session } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { release, version as osVersion } from 'node:os';
import { registerIpc } from './ipc';
import { devRendererUrl, scrubDevEnv } from './devEnv';
import { activeWant, isProffie, serialAllowed } from './serialGate';
import { lookUpWanted } from './usb';
import { startLog } from './log';
import { captionOverlay, readTheme } from './appearance';
import { holdSingleInstance } from './singleInstance';

// A packaged build ignores every HILTWRIGHT_* development switch, and ELECTRON_RENDERER_URL: they are removed before
// anything reads one.
scrubDevEnv(process.env, app.isPackaged);

// Dev aid: HILTWRIGHT_USER_DATA=<folder> runs the app on a scratch data folder (sabers, styles, fonts, page storage),
// so a test can never touch the owner's own.
if (process.env.HILTWRIGHT_USER_DATA) app.setPath('userData', process.env.HILTWRIGHT_USER_DATA);

// One copy per data folder, taken once the folder is known and before anything reads or writes it (issue #10). A
// second copy brings the first one's window forward and quits without starting a log, a store or a window.
const firstCopy = holdSingleInstance(app, () => BrowserWindow.getAllWindows()[0]);

if (firstCopy) {
  // Every run writes a log in <userData>/logs (main's console, and the page's through console-message below).
  startLog(app.getPath('userData'));
  console.log(`[main] Hiltwright ${app.getVersion()} ${app.isPackaged ? 'packaged' : 'development'} build, Electron ${process.versions.electron}, ${osVersion()} ${release()}`);
  process.on('unhandledRejection', (reason) => console.error('[main] unhandled rejection', reason));
}

// Dev aid: HILTWRIGHT_NO_BOARD=1 keeps this run away from every board: no serial device is granted or selected and
// nothing connects on its own. For test runs that must never reach a real saber.
const noBoard = !!process.env.HILTWRIGHT_NO_BOARD;

function grantSerial(): void {
  const ses = session.defaultSession;
  // Pick the Proffieboard when the renderer calls navigator.serial.requestPort().
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const proffie = noBoard ? undefined : portList.find((p) => isProffie(p.vendorId, p.productId));
    console.log('[main] select-serial-port', portList.map((p) => `${p.portName ?? p.displayName ?? '?'} ${p.vendorId}:${p.productId}`).join(', '), '→', proffie?.portId ?? '(none)');
    callback(proffie?.portId ?? '');
  });
  // Let navigator.serial.getPorts() return the board without a prompt, so connecting needs no click.
  // With a handler installed, Electron consults it for getPorts() and again at open time, so it must recognise the
  // board (serialAllowed accepts the shapes a device arrives in, and refuses everything in a no-board run).
  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType !== 'serial') return false;
    const ok = serialAllowed(details.device, noBoard);
    // A board held back while one saber is wanted: look its interfaces up, so the page's next try can reach it.
    if (!ok && !noBoard && activeWant()) void lookUpWanted();
    console.log('[main] device permission', JSON.stringify(details.device), '→', ok);
    return ok;
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
}

function createWindow(): void {
  // The chosen theme (appearance.ts), read before the window exists so it opens in the right colours.
  // Dev aid: HILTWRIGHT_THEME=<id> shows a theme without saving it.
  const theme = readTheme(app.getPath('userData'), process.env.HILTWRIGHT_THEME);
  const win = new BrowserWindow({
    width: Number(process.env.HILTWRIGHT_W) || 1480,
    height: Number(process.env.HILTWRIGHT_H) || 980,
    show: !process.env.HILTWRIGHT_OFFSCREEN,
    minWidth: 1180,
    minHeight: 700,
    backgroundColor: theme.window.back,
    title: 'Hiltwright',
    // The window and taskbar icon (the installed app also carries it in its .exe, from build/icon.ico).
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png'),
    autoHideMenuBar: true,
    // The app's header row is the title bar: draggable, with the caption buttons overlaid in the header's colours.
    titleBarStyle: 'hidden',
    titleBarOverlay: captionOverlay(theme),
    // macOS draws its three window buttons at the top left, over the page: they sit in the brand row, which leaves
    // room for them there (styles.css, data-platform="darwin").
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 22 } } : {}),
    webPreferences: {
      // The page reads this before it draws anything (preload: theme.initial), so there is no flash of another theme.
      additionalArguments: [`--hiltwright-theme=${theme.id}`],
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Dev aid: HILTWRIGHT_OFFSCREEN=1 renders without a display, so HILTWRIGHT_SHOT works with the screen asleep.
      offscreen: !!process.env.HILTWRIGHT_OFFSCREEN,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Dev aid: HILTWRIGHT_ZOOM=0.69 lays the page out wider than the window, for a screenshot of the full-size layout
  // on a display too small to hold the window (a remote session, or a screen asleep at 1024x768).
  const zoom = Number(process.env.HILTWRIGHT_ZOOM);
  if (zoom > 0) win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(zoom));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // The Style editor holds the window open while it has unsaved work (a beforeunload that asks to stay). Ask the owner.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'Unsaved style', buttons: ['Stay', 'Close without saving'], defaultId: 0, cancelId: 0, noLink: true,
      message: 'Your style has changes that are not saved.',
      detail: 'Stay to save them in the Style editor, or close and lose them.',
    });
    if (choice === 1) e.preventDefault(); // go ahead and close
  });
  // Mirror renderer console output to the terminal so the walking skeleton can be checked headlessly.
  // Electron 37 passes the level as a word on the event; older signatures passed a number (2 warning, 3 error) first.
  win.webContents.on('console-message', (event: unknown, ...rest: unknown[]) => {
    const details = (event as { message?: string; level?: string | number }) ?? {};
    const message = typeof rest[1] === 'string' ? rest[1] : details.message ?? String(rest[0] ?? '');
    const level = typeof rest[0] === 'number' ? rest[0] : details.level;
    if (level === 'warning' || level === 2) console.warn('[renderer:warn]', message);
    else if (level === 'error' || level === 3) console.error('[renderer:error]', message);
    else console.log('[renderer]', message);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error(`[main] the page's process ended: ${d.reason} (exit code ${d.exitCode})`));
  // Chromium requires a user gesture for navigator.serial.requestPort(). The renderer cannot fake one, but main can
  // run a script *as* a gesture, which is what makes "plug it in and it just connects" possible.
  win.webContents.on('did-finish-load', () => {
    if (noBoard) console.log('[main] auto-connect skipped: HILTWRIGHT_NO_BOARD');
    else {
      // The page sets its hook once React has mounted, which can be later than this event (a development page
      // loads slowly): ask again for a few seconds rather than give up on the first "no hook".
      const ask = (triesLeft: number): void => {
        if (win.isDestroyed()) return;
        void win.webContents.executeJavaScript('window.hiltwrightAutoConnect ? window.hiltwrightAutoConnect() : "no hook"', true)
          .then((r) => {
            if (r === 'no hook' && triesLeft > 0) { setTimeout(() => ask(triesLeft - 1), 400); return; }
            console.log('[main] auto-connect', r);
          })
          .catch((err) => console.log('[main] auto-connect failed', String(err)));
      };
      setTimeout(() => ask(20), 400);
    }
    // Dev aid: HILTWRIGHT_E2E=1 runs the renderer's end-to-end preset edit against the connected board.
    if (process.env.HILTWRIGHT_E2E) setTimeout(() => {
      void win.webContents.executeJavaScript(`window.hiltwrightE2E ? window.hiltwrightE2E(${JSON.stringify(process.env.HILTWRIGHT_E2E)}) : "no hook"`, true)
        .then((r) => console.log('[main] e2e', r))
        .catch((err) => console.log('[main] e2e failed', String(err)));
    }, 7000);
    // Dev aid: HILTWRIGHT_BUILD_E2E=1 opens Build & Flash and compiles for the connected board (never flashes).
    if (process.env.HILTWRIGHT_BUILD_E2E) setTimeout(() => {
      void win.webContents.executeJavaScript('window.hiltwrightGoto && window.hiltwrightGoto("build")', true)
        .then(() => new Promise((r) => setTimeout(r, 2500)))
        .then(() => win.webContents.executeJavaScript('window.hiltwrightBuildE2E ? window.hiltwrightBuildE2E() : "no hook"', true))
        .then((r) => console.log('[main] build e2e:', r), (err) => console.log('[main] build e2e failed:', String(err)));
    }, 9000);
    // Dev aid: HILTWRIGHT_DUMP=<file.txt> writes the page's visible text (works with the display asleep, when
    // capturePage returns nothing). HILTWRIGHT_DUMP_JS runs first, to click something open.
    const dump = process.env.HILTWRIGHT_DUMP;
    if (dump) setTimeout(() => {
      void win.webContents.executeJavaScript(`window.hiltwrightGoto && window.hiltwrightGoto(${JSON.stringify(process.env.HILTWRIGHT_PAGE ?? 'armory')})`, true)
        .then(() => new Promise((r) => setTimeout(r, 1500)))
        .then(() => (process.env.HILTWRIGHT_DUMP_JS ? win.webContents.executeJavaScript(process.env.HILTWRIGHT_DUMP_JS, true) : null))
        .then(() => new Promise((r) => setTimeout(r, 1200)))
        .then(() => win.webContents.executeJavaScript('document.body.innerText', true))
        .then((text) => writeFile(dump, String(text)))
        .then(() => console.log('[main] dumped', dump), (err) => console.log('[main] dump failed', String(err)));
    }, 6000);
    // Dev aid: HILTWRIGHT_SHOT=<file.png> captures the window a few seconds after load; HILTWRIGHT_SHOT_JS runs first.
    const shot = process.env.HILTWRIGHT_SHOT;
    // HILTWRIGHT_SHOTS=<json [{file, js}]> takes several in one run: each script runs (its promise awaited), then the
    // window is captured. Used for the guided tour's steps, one after another.
    const series = process.env.HILTWRIGHT_SHOTS;
    if (series) setTimeout(() => {
      void (async () => {
        await win.webContents.executeJavaScript(`window.hiltwrightGoto && window.hiltwrightGoto(${JSON.stringify(process.env.HILTWRIGHT_PAGE ?? 'armory')})`, true);
        await new Promise((r) => setTimeout(r, 800));
        for (const s of JSON.parse(series) as { file: string; js: string }[]) {
          try { await win.webContents.executeJavaScript(s.js, true); } catch (err) { console.log('[main] screenshot script failed', String(err)); }
          await new Promise((r) => setTimeout(r, 450));
          const shot = await win.webContents.capturePage();
          await writeFile(s.file, /\.jpe?g$/i.test(s.file) ? shot.toJPEG(86) : shot.toPNG());
          console.log('[main] screenshot', s.file);
        }
        console.log('[main] screenshots done');
      })();
    }, 6000);
    if (shot) setTimeout(() => { void win.webContents.executeJavaScript(`window.hiltwrightGoto && window.hiltwrightGoto(${JSON.stringify(process.env.HILTWRIGHT_PAGE ?? 'armory')})`, true).then(() => new Promise((r) => setTimeout(r, 800))).then(() => (process.env.HILTWRIGHT_SHOT_JS ? win.webContents.executeJavaScript(process.env.HILTWRIGHT_SHOT_JS, true).then(() => new Promise((r) => setTimeout(r, 600))) : null)).then(() => win.webContents.capturePage()).then((img) => writeFile(shot, img.toPNG())).then(() => console.log('[main] screenshot', shot)); }, process.env.HILTWRIGHT_BUILD_E2E ? 75000 : process.env.HILTWRIGHT_E2E ? 30000 : 6000);
  });
  // The development page server only in a development run; a packaged build always loads its own page (issue #30).
  const devUrl = devRendererUrl(process.env, app.isPackaged);
  if (devUrl) void win.loadURL(devUrl);
  else {
    if (process.env.ELECTRON_RENDERER_URL) console.warn('[main] ELECTRON_RENDERER_URL is not a page on this computer; loading the bundled page');
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.on('child-process-gone', (_e, d) => console.error(`[main] a helper process ended: ${d.type} ${d.reason} (exit code ${d.exitCode})`));

app.whenReady().then(() => {
  if (!firstCopy) return;
  registerIpc();
  grantSerial();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
