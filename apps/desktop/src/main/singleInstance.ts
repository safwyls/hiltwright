// One running copy per data folder (issue #10). Each copy holds every store in memory and writes whole files, so a
// second copy (an easy double-click on a slow start) silently wiped the first one's changes, and the two fought over
// the board's port. Electron's lock is per userData folder, so a development run on its own folder still starts.
// Kept free of Electron so it can be tested with a stand-in app.

export interface InstanceWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
}

/**
 * Take the lock. The first copy gets true and, when another copy is started, brings its own window forward instead.
 * A later copy gets false and is asked to quit; it must start nothing else (no log, no stores, no window).
 */
export function holdSingleInstance(app: InstanceApp, mainWindow: () => InstanceWindow | undefined): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    const win = mainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  return true;
}
