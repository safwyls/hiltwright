// The workshop on the website has no main process: this stands in for the preload API (window.hiltwright) with what a
// browser can do, and nothing more. Styles made here last the visit (the tab's session storage): the app is where
// work is kept, and "Save for the app" is how it gets there. The theme is remembered in this browser. Everything else
// the pages might ask for (sabers, cards, flashing, the font library) answers that it needs the app, so a page that
// reaches past what the website offers fails loudly instead of pretending.
//
// Imported first by the web entry: the pages read window.hiltwright as they load.

import type { LookDef } from '@hiltwright/core';
import type { ContributorInfo, HiltAddMode, HiltAddResult, HiltInfo, HiltInput, HiltModelData, HiltwrightApi, PackInfo, PackMesh } from '../../shared/api';
import { themeById } from '../../shared/themes';
import { DEFAULT_FIT, type HiltFit, type SceneSettings } from '../../shared/demoSettings';
import { listOpenFonts, openFontFolder, readOpenFont } from './webFonts';

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

// The demo room's fonts: folders the visitor opens, read in the page (webFonts.ts). The app's font packs stay in the
// app; its built-in hilt, Punk Saber, is published with the website (site/workshop.mjs writes it as plain files).
const fontLibrary = {
  list: async () => listOpenFonts(),
  addFolder: async () => openFontFolder(),
  readFont: (folder: string) => readOpenFont(folder),
};
const BUILT_IN_HILTS = ['punk-saber'];
type PublishedHilt = Omit<PackInfo, 'file' | 'sounds'> & { positions: number; normals: number; indices: number; groups: PackMesh['groups'] };
const published = new Map<string, Promise<PublishedHilt | null>>();
const hiltInfo = (id: string) => {
  if (!published.has(id)) published.set(id, fetch(`hilts/${id}.json`).then((r) => (r.ok ? r.json() as Promise<PublishedHilt> : null)).catch(() => null));
  return published.get(id)!;
};
const packs = {
  // A hilt that did not come with this copy of the website is left out, and the room draws its stand-in.
  list: async (): Promise<PackInfo[]> => (await Promise.all(BUILT_IN_HILTS.map(hiltInfo)))
    .filter((h): h is PublishedHilt => !!h)
    .map(({ positions: _p, normals: _n, indices: _i, groups: _g, ...info }) => ({ ...info, file: `hilts/${info.id}.bin`, sounds: 0 })),
  mesh: async (id: string): Promise<PackMesh> => {
    const info = await hiltInfo(id);
    if (!info) throw new Error(`The hilt ${id} is not on this website.`);
    const r = await fetch(`hilts/${id}.bin`);
    if (!r.ok) throw new Error(`The hilt ${id} could not be fetched (${r.status}).`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength !== (info.positions + info.normals + info.indices) * 4) throw new Error(`The hilt ${id} came back damaged.`);
    return {
      positions: new Float32Array(buf, 0, info.positions),
      normals: new Float32Array(buf, info.positions * 4, info.normals),
      indices: new Uint32Array(buf, (info.positions + info.normals) * 4, info.indices),
      groups: info.groups, fit: info.fit, name: info.name, creator: info.creator,
    };
  },
};
const sd = { onReadFontProgress: () => () => undefined };

// Hilt models the visitor loads stay in memory for the visit; the scene settings are remembered in this browser.
const ROOM_KEY = 'hiltwright.web.room';
const hiltModels = new Map<string, { info: HiltInfo; model: HiltModelData }>();
let hiltSeq = 0;
const packFitsHere = new Map<string, HiltFit>();
const hilts = {
  list: async () => [...hiltModels.values()].map((h) => ({ ...h.info })),
  model: async (id: string) => { const h = hiltModels.get(id); if (!h) throw new Error('That hilt is no longer here.'); return h.model; },
  add: async (input: HiltInput, mode: HiltAddMode): Promise<HiltAddResult> => {
    const replace = typeof mode === 'object' ? hiltModels.get(mode.replace) : undefined;
    const same = [...hiltModels.values()].find((h) => h.info.name === input.name);
    if (mode === 'new' && same) return { taken: { id: same.info.id, name: same.info.name } };
    const names = new Set([...hiltModels.values()].map((h) => h.info.name));
    let name = replace?.info.name ?? input.name;
    for (let n = 2; !replace && names.has(name); n++) name = `${input.name} (${n})`;
    const info: HiltInfo = { id: replace?.info.id ?? `web_hilt_${++hiltSeq}`, name, format: input.format, fit: replace?.info.fit ?? { ...DEFAULT_FIT }, ...(input.creator ? { creator: input.creator } : {}) };
    hiltModels.set(info.id, { info, model: { format: input.format, data: input.data, sideFiles: input.sideFiles } });
    return { added: { ...info } };
  },
  setFit: async (id: string, fit: HiltFit) => { const h = hiltModels.get(id); if (h) h.info = { ...h.info, fit }; },
  setCreator: async (id: string, creator: string) => { const h = hiltModels.get(id); if (h) h.info = { ...h.info, ...(creator ? { creator } : {}) }; },
  remove: async (id: string) => { hiltModels.delete(id); },
  // A nudge to Punk Saber's fit lasts the visit too.
  packFits: async () => Object.fromEntries(packFitsHere),
  setPackFit: async (packId: string, fit: HiltFit) => { packFitsHere.set(packId, fit); },
  resetPackFit: async (packId: string) => { packFitsHere.delete(packId); },
  // Nothing from an earlier version to bring over: this origin is marked as already brought over.
  room: async () => ({ ...read(() => localStorage, ROOM_KEY, { scene: null as SceneSettings | null, chosen: null as string | null }), adopted: [location.origin] }),
  setRoom: async (patch: { scene?: SceneSettings; chosen?: string | null }) => {
    const cur = read(() => localStorage, ROOM_KEY, { scene: null as SceneSettings | null, chosen: null as string | null });
    // A hilt chosen here is gone next visit, so only the scene is remembered.
    write(() => localStorage, ROOM_KEY, { scene: patch.scene ?? cur.scene, chosen: null });
  },
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
  fontLibrary,
  packs,
  sd,
  hilts,
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
