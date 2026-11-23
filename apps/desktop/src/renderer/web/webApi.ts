// The workshop on the website has no main process: this stands in for the preload API (window.hiltwright) with what a
// browser can do, and nothing more. Styles made here last the visit (the tab's session storage): the app is where
// work is kept, and "Save for the app" is how it gets there. The theme is remembered in this browser. Everything else
// the pages might ask for (sabers, cards, flashing, the font library) answers that it needs the app, so a page that
// reaches past what the website offers fails loudly instead of pretending.
//
// Imported first by the web entry: the pages read window.hiltwright as they load.

import type { LookDef } from '@hiltwright/core';
import type { ContributorInfo, HiltwrightApi } from '../../shared/api';
import { themeById } from '../../shared/themes';

export const NEEDS_APP = 'This needs the Hiltwright app.';

const STYLES_KEY = 'hiltwright.web.styles';
const THEME_KEY = 'hiltwright.web.theme';

function read<T>(store: () => Storage, key: string, fallback: T): T {
  try { const raw = store().getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(store: () => Storage, key: string, value: unknown): void {
  try { store().setItem(key, JSON.stringify(value)); } catch { /* private mode, or full: the styles still last until the page closes */ }
}

// Kept in memory too, so a browser that refuses storage still keeps the styles while the page is open.
let styles: LookDef[] = read(() => sessionStorage, STYLES_KEY, [] as LookDef[]).filter((l) => l && typeof l.id === 'string' && typeof l.code === 'string');
const saveStyles = (next: LookDef[]): LookDef[] => { styles = next; write(() => sessionStorage, STYLES_KEY, next); return [...next]; };

const looks: HiltwrightApi['looks'] = {
  list: async () => [...styles],
  add: async (look) => saveStyles([...styles.filter((l) => l.id !== look.id), look]),
  update: async (id, look) => ({ looks: saveStyles(styles.map((l) => (l.id === id ? look : l)).concat(styles.some((l) => l.id === id) ? [] : [look])), sabersUpdated: 0 }),
  remove: async (id) => saveStyles(styles.filter((l) => l.id !== id)),
  importFile: async () => { throw new Error(NEEDS_APP); },
};

const contributors = {
  // No contributors are kept on the website: credits show names, and Hiltwright's own mark.
  list: async (): Promise<ContributorInfo[]> => [],
};

const known = {
  appVersion: 'website',
  platform: 'web',
  theme: {
    initial: read(() => localStorage, THEME_KEY, ''),
    set: async (id: string) => { const t = themeById(id); write(() => localStorage, THEME_KEY, t.id); return t.id; },
  },
  looks,
  contributors,
} as Record<string, unknown>;

/** A namespace the website does not have: every call is refused, and a listener is accepted and never called. */
const missing = (ns: string): unknown => new Proxy({}, {
  get: (_t, prop) => {
    if (typeof prop !== 'string') return undefined;
    if (prop.startsWith('on')) return () => () => undefined;
    return () => Promise.reject(new Error(`${NEEDS_APP} (${ns}.${prop})`));
  },
});

/** Each known namespace, with whatever it lacks refused the same way. */
const withRest = (ns: string, part: Record<string, unknown>): unknown => new Proxy(part, {
  get: (t, prop) => (typeof prop === 'string' && !(prop in t) ? (missing(ns) as Record<string, unknown>)[prop] : t[prop as keyof typeof t]),
});

export const webApi = new Proxy(known, {
  get: (t, prop) => {
    if (typeof prop !== 'string') return undefined;
    const v = t[prop];
    if (v === undefined) return missing(prop);
    return v && typeof v === 'object' ? withRest(prop, v as Record<string, unknown>) : v;
  },
}) as unknown as HiltwrightApi;

window.hiltwright = webApi;
