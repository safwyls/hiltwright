// Styles as a file to take into the app (.hwstyle): what the workshop on the website saves, and what the app's Styles
// page imports. It carries pasted and built styles whole (their code, header, colours and, for a built one, its
// layers); Hiltwright's own styles are in every copy of the app, so they are left out. The app checks each style as
// it checks one it saves itself, so a file can bring no more than a style typed into the app could.

import type { LookDef } from './looks';

export const STYLE_SHARE_FORMAT = 'hiltwright-styles';
export const STYLE_SHARE_VERSION = 1;
/** The file styles are shared in. */
export const STYLE_SHARE_EXTENSION = 'hwstyle';
/** Far more than a file of real styles needs (a long built style is about 40 KB). */
export const STYLE_SHARE_MAX_BYTES = 4 * 1024 * 1024;

export interface StyleShare {
  format: typeof STYLE_SHARE_FORMAT;
  version: typeof STYLE_SHARE_VERSION;
  /** What wrote it: the app's version, or "website". */
  from: string;
  exportedAt: string;
  styles: LookDef[];
}

export function makeStyleShare(styles: LookDef[], from: string, now = new Date()): StyleShare {
  return { format: STYLE_SHARE_FORMAT, version: STYLE_SHARE_VERSION, from, exportedAt: now.toISOString(), styles: styles.filter((l) => l.source !== 'starter') };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A styles file read back, checked for shape only: `styles` is what the file lists, each still to be checked as a
 * style (the app's cleanLook). Throws with a plain reason when it is not a styles file.
 */
export function readStyleShare(raw: unknown): { from: string; styles: unknown[] } {
  if (!isObj(raw) || raw.format !== STYLE_SHARE_FORMAT) throw new Error('This is not a styles file from Hiltwright.');
  if (typeof raw.version !== 'number' || raw.version > STYLE_SHARE_VERSION) throw new Error('These styles were saved by a newer Hiltwright. Update Hiltwright to import them.');
  if (!Array.isArray(raw.styles)) throw new Error('This styles file holds no styles.');
  return { from: typeof raw.from === 'string' ? raw.from.slice(0, 60) : 'unknown', styles: raw.styles };
}

/**
 * Where each imported style goes among the ones the owner has. The same style again (same id and code) is skipped. A
 * different style under an id already taken gets a fresh id, so neither replaces the other. `fresh` makes that id.
 */
export function placeImportedStyles(incoming: LookDef[], have: LookDef[], fresh: (l: LookDef, n: number) => string): { add: LookDef[]; same: number } {
  const byId = new Map(have.map((l) => [l.id, l]));
  const add: LookDef[] = [];
  let same = 0;
  for (const l of incoming) {
    const there = byId.get(l.id);
    if (there && there.code === l.code && (there.define ?? '') === (l.define ?? '')) { same++; continue; }
    let look = l;
    if (there) {
      let n = 2;
      while (byId.has(fresh(l, n))) n++;
      look = { ...l, id: fresh(l, n) };
    }
    byId.set(look.id, look);
    add.push(look);
  }
  return { add, same };
}
