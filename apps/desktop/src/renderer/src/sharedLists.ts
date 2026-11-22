// Lists several pages show, kept app-wide: the font library, the font packs that ship with Hiltwright, and the voice
// packs. Each is loaded once however many pages, hooks or parts of a page ask at the same moment, and a page opening
// shows the last list at once while it is checked again.
//
// Only one page is open at a time and each checks again when it opens, so a list is never stale for long; a page that
// changes one (adding fonts, putting a voice pack on) calls `refresh` so the others see it straight away.

import { useEffect, useState } from 'react';
import type { HiltwrightApi, LibraryFont, PackInfo, VoicePackChoice } from '../../shared/api';

// Through globalThis: this module is also checked without the page's types (its tests run under Node).
const api = () => (globalThis as unknown as { hiltwright: HiltwrightApi }).hiltwright;

/** A list loaded within this long is not asked for again: the loads of one page opening, not a cache across visits. */
const FRESH_MS = 2000;

export interface SharedList<T> {
  /** The last list loaded, or null before the first. */
  value(): T | null;
  /** The list: the one being loaded now, or loaded a moment ago, else a new load. */
  load(): Promise<T>;
  /** Load it again now (after a change), and tell every page showing it. */
  refresh(): Promise<T>;
  subscribe(fn: (v: T) => void): () => void;
}

export function sharedList<T>(fetch: () => Promise<T>): SharedList<T> {
  let value: T | null = null;
  let at = 0;
  let pending: Promise<T> | null = null;
  // Each load is numbered, and only the newest may set the list and tell the pages (#33). An older, slower load that
  // finishes after a refresh would otherwise put back the list from before the change (a font just added vanishing).
  // A superseded load, however it ends, resolves to whatever the newest one gives.
  let generation = 0;
  let newest: Promise<T> | null = null;
  const listeners = new Set<(v: T) => void>();
  const start = () => {
    const mine = ++generation;
    const p: Promise<T> = fetch().then(
      (v) => { if (mine !== generation) return newest!; value = v; at = Date.now(); for (const fn of listeners) fn(v); return v; },
      (err: unknown) => { if (mine !== generation) return newest!; throw err; },
    ).finally(() => { if (pending === p) pending = null; });
    pending = p;
    newest = p;
    return p;
  };
  return {
    value: () => value,
    load: () => pending ?? (value !== null && Date.now() - at < FRESH_MS ? Promise.resolve(value) : start()),
    refresh: () => start(),
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

export const fontLibraryList = sharedList<LibraryFont[]>(() => api().fontLibrary.list());
export const packList = sharedList<PackInfo[]>(() => api().packs.list());
export type VoicePackList = { packs: VoicePackChoice[]; support: string | null; source: string | null; credit: string | null };
export const voicePackList = sharedList<VoicePackList>(() => api().sd.voicePacks());

/**
 * A shared list on a page: the last one at once (or `empty` before any), checked again when the page opens, and kept
 * current while the page is open. `read` says whether this page has seen it loaded (or failed) yet.
 */
export function useSharedList<T>(list: SharedList<T>, empty: T): { value: T; read: boolean; failed: string | null } {
  const [value, setValue] = useState<T>(() => list.value() ?? empty);
  const [read, setRead] = useState(() => list.value() !== null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const off = list.subscribe((v) => { if (live) { setValue(v); setRead(true); setFailed(null); } });
    // The list as it stands when the load ends, not the load's own answer: a newer refresh may have landed since (#33).
    void list.load().then((v) => { if (live) { setValue(list.value() ?? v); setRead(true); } }, (err: unknown) => { if (live) { setRead(true); setFailed(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')); } });
    return () => { live = false; off(); };
  }, [list]);
  return { value, read, failed };
}
