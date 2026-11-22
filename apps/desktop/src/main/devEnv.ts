// Development switches (`HILTWRIGHT_*` environment variables) steer the app in development only. A packaged build
// removes them all before anything reads them. That works because every switch is read where it is used, never
// when a module loads: keep it that way when adding one.

export const DEV_PREFIX = 'HILTWRIGHT_';

/**
 * electron-vite's address for the development page server. A packaged build ignores it and removes it: with it set,
 * the window would load whatever page it names, with the app's full preload bridge (issue #30).
 */
export const RENDERER_URL = 'ELECTRON_RENDERER_URL';

/** Remove every development switch from `env` when the app is packaged. Returns the names removed. */
export function scrubDevEnv(env: Record<string, string | undefined>, packaged: boolean): string[] {
  if (!packaged) return [];
  const removed = Object.keys(env).filter((k) => k.startsWith(DEV_PREFIX) || k === RENDERER_URL);
  for (const k of removed) delete env[k];
  return removed;
}

/**
 * The development page server's address to load instead of the bundled page: only in a development run, and only a
 * page served from this computer (electron-vite's dev server is http://localhost:<port>). Null: load the bundled page.
 */
export function devRendererUrl(env: Record<string, string | undefined>, packaged: boolean): string | null {
  const raw = env[RENDERER_URL];
  if (packaged || !raw) return null;
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? raw : null;
  } catch { return null; }
}
