// A saber's setup as a file to give someone else (.hwsaber): what Hiltwright would build for it, so another owner can
// import it as a planned saber and flash their own hilt from it. It carries the plan (board, buttons, prop, blades,
// presets with their styles and colours, the pasted or built styles those use, the fonts and voice pack chosen) and a
// custom prop file's text. It leaves out what belongs to the sender's hilt or computer: serial numbers, cards, the
// firmware record, the sender's "I checked the wiring", and the path of the installer's config file they compared
// against. Sound fonts are named, not carried: they are large, and many may not be passed on.

import type { LookDef } from './looks';
import type { SaberConfigModel } from './config/generate';

export const SABER_SHARE_FORMAT = 'hiltwright-saber';
export const SABER_SHARE_VERSION = 1;
/** The file a saber is shared in. */
export const SABER_SHARE_EXTENSION = 'hwsaber';
/** Far more than any real plan with a custom prop (the biggest stock prop is about 230 KB). */
export const SABER_SHARE_MAX_BYTES = 8 * 1024 * 1024;

export interface SaberShare {
  format: typeof SABER_SHARE_FORMAT;
  version: typeof SABER_SHARE_VERSION;
  /** The saber's name, as its owner called it. */
  name: string;
  /** Hiltwright's version that wrote it. */
  app: string;
  exportedAt: string;
  model: SaberConfigModel;
  /** The custom prop file's text, when the plan builds with one. */
  customPropText?: string;
}

/** The plan as it may leave this computer: nothing tied to the sender's own hilt, card or files. */
export function shareableModel(model: SaberConfigModel): SaberConfigModel {
  const {
    wiringConfirmation: _confirmed, wiringConfirmedAt: _confirmedOld, wiringReference: _reference, boardFrom: _boardFrom,
    presetsFrom: _from, customProp, ...rest
  } = model;
  return {
    ...rest,
    // A custom prop is kept only while it is the prop the plan builds with.
    ...(model.prop === 'custom' && customProp ? { customProp } : {}),
    looks: (model.looks ?? []).filter((l) => l.source !== 'starter'),
  };
}

export function makeSaberShare(name: string, model: SaberConfigModel, app: string, customPropText?: string, now = new Date()): SaberShare {
  const m = shareableModel(model);
  return {
    format: SABER_SHARE_FORMAT, version: SABER_SHARE_VERSION, name, app, exportedAt: now.toISOString(), model: m,
    ...(m.customProp && customPropText !== undefined ? { customPropText } : {}),
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A shared saber read from its file, checked for shape. Throws with a plain reason when it is not one. */
export function readSaberShare(raw: unknown): SaberShare {
  if (!isObj(raw) || raw.format !== SABER_SHARE_FORMAT) throw new Error('This is not a saber shared from Hiltwright.');
  if (typeof raw.version !== 'number' || raw.version > SABER_SHARE_VERSION) throw new Error('This saber was shared from a newer Hiltwright. Update Hiltwright to import it.');
  if (raw.version !== SABER_SHARE_VERSION) throw new Error('This saber file is in a format Hiltwright does not know.');
  const m = raw.model;
  if (!isObj(m) || !isStr(m.name) || !isStr(m.board) || !isStr(m.prop) || !Array.isArray(m.blades) || !Array.isArray(m.presets)) throw new Error('This saber file is damaged: its setup is incomplete.');
  if (!m.presets.every((p) => isObj(p) && isStr(p.font) && isStr(p.name) && isStr(p.track))) throw new Error('This saber file is damaged: a preset is incomplete.');
  if (m.looks !== undefined && (!Array.isArray(m.looks) || !m.looks.every((l) => isObj(l) && isStr(l.id) && isStr(l.code)))) throw new Error('This saber file is damaged: a style is incomplete.');
  if (raw.customPropText !== undefined && !isStr(raw.customPropText)) throw new Error('This saber file is damaged: its prop file is unreadable.');
  return {
    format: SABER_SHARE_FORMAT, version: SABER_SHARE_VERSION,
    name: isStr(raw.name) && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Shared saber',
    app: isStr(raw.app) ? raw.app : 'unknown', exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    model: shareableModel(m as unknown as SaberConfigModel),
    ...(isStr(raw.customPropText) ? { customPropText: raw.customPropText } : {}),
  };
}

/** Every sound font the shared saber uses: the ones chosen for it, and every one a preset names. */
export function shareFonts(model: SaberConfigModel): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (f: string) => { for (const part of f.split(';')) { const name = part.trim(); if (name && name.toLowerCase() !== 'common' && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); } } };
  (model.fonts ?? []).forEach(add);
  model.presets.forEach((p) => add(p.font));
  return out;
}

/** The styles a shared saber brings that are not among `have` (by id): pasted and built ones only. */
export function shareStylesToAdd(model: SaberConfigModel, have: LookDef[]): LookDef[] {
  const ids = new Set(have.map((l) => l.id));
  return (model.looks ?? []).filter((l) => l.source !== 'starter' && !ids.has(l.id));
}

/**
 * The plan an imported saber starts from: its presets are the list for the next flash (as a preset set's would be),
 * its config name is its own among `takenNames`, and the board waits to be confirmed or read from the saber.
 */
export function importedModel(share: SaberShare, takenNames: Iterable<string>, fileName: string, now = new Date()): SaberConfigModel {
  const taken = new Set([...takenNames].map((n) => n.toLowerCase()));
  let name = share.model.name.replace(/[^A-Za-z0-9_]/g, '_') || 'hiltwright_saber';
  if (taken.has(name.toLowerCase())) { let n = 2; while (taken.has(`${name}_${n}`.toLowerCase())) n++; name = `${name}_${n}`; }
  return { ...share.model, name, presetsFrom: { name: fileName, at: now.toISOString() } };
}
