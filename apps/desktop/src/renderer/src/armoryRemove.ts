// Removing a saber from the Armory: when it may be done, and what the confirmation says about it.
//
// What removal does (main/library.ts remove): the saber's record goes from library.json, and with it the plan held in
// that record (wiring, presets, staged presets, firmware manifest). Nothing else is touched: firmware backups
// (<data>/sabers/<id>/backups) and preset history (<data>/sabers/<id>/snapshots) stay on disk, and fonts, styles and
// preset sets are shared and never belong to one saber. A saber plugged in again is matched by USB serial against the
// library; with no record left it is remembered as a new saber (new id), so those folders are not listed for it.

import type { SaberRecord } from '../../shared/api';
import { EXAMPLE_ID } from './tourSaber';

/** Why this saber cannot be removed now, or null when it can. The tour's example saber is never offered at all. */
export function removeBlock(s: SaberRecord, pluggedId: string | null): string | null {
  if (s.id === EXAMPLE_ID) return 'The example saber is part of the tour.';
  if (pluggedId !== null && s.id === pluggedId) return 'Unplug it first. A plugged-in saber would be remembered again at once.';
  return null;
}

/** Where a saber's backups and history stay on disk, under Hiltwright's data folder. */
export function keptFolders(dataFolder: string, id: string): { backups: string; history: string } {
  const sep = dataFolder.includes('\\') ? '\\' : '/';
  const base = [dataFolder.replace(/[\\/]+$/, ''), 'sabers', id].join(sep);
  return { backups: `${base}${sep}backups`, history: `${base}${sep}snapshots` };
}

export interface RemoveWords {
  title: string;
  button: string;
  removed: string[];
  kept: string[];
  after: string;
}

/** The words of the confirmation. A plan never plugged in has no backups or history to mention. */
export function removeWords(s: SaberRecord, dataFolder: string | null): RemoveWords {
  const kept: string[] = [];
  if (!s.planned) {
    const f = dataFolder ? keptFolders(dataFolder, s.id) : null;
    kept.push(f ? `${s.name}’s firmware backups stay as files in ${f.backups}. They are your way back.` : `${s.name}’s firmware backups stay as files in Hiltwright's data folder. They are your way back.`);
    kept.push(f ? `${s.name}’s preset history stays as files in ${f.history}.` : `${s.name}’s preset history stays as files in Hiltwright's data folder.`);
  }
  kept.push('Your fonts, styles and preset sets are not touched.');
  kept.push(s.planned ? 'Nothing on any saber changes.' : 'The saber itself is not touched.');
  return {
    title: `Remove ${s.name}?`,
    button: `Remove ${s.name}`,
    removed: [s.planned ? 'The plan: its wiring, presets and staged presets.' : `${s.name}’s entry in the Armory, with its wiring, presets and staged presets.`],
    kept,
    after: s.planned
      ? 'This cannot be undone.'
      : `If you plug ${s.name} in again, Hiltwright remembers it again as a new saber. That new saber will not have the old wiring or presets, and the old backups and history will not be listed for it.`,
  };
}
