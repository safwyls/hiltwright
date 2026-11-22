// The build model for a saber: wiring, prop, and which look goes in each preset slot. Drafted from what the
// board reports, refined by the owner on Build & Flash, and stored on the saber record.

import { boardHint, type BladeVariant, type BoardModel, type LookDef, type ModelBlade, type Prop, type SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../../shared/api';
import type { BoardInfo } from './board';

export const DATA_PINS = ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'];
export const POWER_PINS = ['bladePowerPin1', 'bladePowerPin2', 'bladePowerPin3', 'bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'];

/** First guess at wiring from what the board reported. Every pin here is a guess the owner must confirm. */
export function guessBlades(pixelBlades: number[]): ModelBlade[] {
  return pixelBlades.map((px, i) => ({
    id: `b${i + 1}`,
    role: i === 0 ? 'main' : px <= 8 ? (i === 1 ? 'crystal' : 'accent') : 'side',
    type: 'pixel', pixels: px, order: 'GRB', extra: [], leds: [], parallel: 1,
    wiring: { kind: 'own', dataPin: DATA_PINS[Math.min(i, 3)], powerPins: i === 0 ? ['bladePowerPin2', 'bladePowerPin3'] : [POWER_PINS[Math.min(3 + i, 5)]] },
  }));
}

/** What is known about a saber from its library record alone, shaped like a live board reading. */
const notMountError = (name: string) => !/^Failed to mount SD card/i.test(name.trim());

export function infoFromRecord(rec: SaberRecord): BoardInfo {
  return {
    version: { version: rec.identity.version ?? '', config: rec.identity.configName, prop: rec.identity.prop, buttons: rec.identity.buttons, installed: rec.identity.installed, major: null },
    // Records kept before list_fonts was read properly can list the saber's card error as a font (parseList).
    battery: null, volume: null, currentPreset: null, presets: rec.presets, fonts: rec.fonts.filter(notMountError), tracks: rec.tracks.filter(notMountError),
    pixelBlades: rec.identity.pixelBlades, bladeConfig: rec.identity.bladeConfig, rejected: [], timings: {}, sdMissing: false,
  };
}

/**
 * What the firmware says about itself, in full, for the bar along the bottom of the window:
 * "ProffieOS v7.14 · fett263 · 2 buttons · 9 presets · hiltwright_kylo · installed Nov 20 2026".
 * The config name is left out when it is just the saber's name, and the install date without its time of day, so the
 * line fits. Null when nothing is known yet (a planned saber, or one never read).
 */
export function firmwareLine(info: BoardInfo | null, saberName?: string): string | null {
  const v = info?.version;
  if (!info || !v?.version) return null;
  const config = v.config?.replace(/^config\//, '').replace(/\.h$/, '') || null;
  const installed = v.installed?.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*$/, '').trim() || null;
  return [
    `ProffieOS ${v.version}`,
    v.prop,
    v.buttons != null ? `${v.buttons} button${v.buttons === 1 ? '' : 's'}` : null,
    `${info.presets.length} preset${info.presets.length === 1 ? '' : 's'}`,
    config && config.toLowerCase() !== saberName?.trim().toLowerCase() ? config : null,
    installed ? `installed ${installed}` : null,
  ].filter(Boolean).join(' · ');
}

export function configNameFor(saber: SaberRecord): string {
  return `hiltwright_${saber.name.toLowerCase().replace(/^hiltwright[_ ]+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'saber'}`;
}

/**
 * Which board the saber has, and how that is known (install-target-safety D2). The running firmware never says, so:
 * the flash size its bootloader showed at an install; else the firmware Hiltwright installed, when the saved wiring
 * names the same board; else the owner's own choice. Otherwise nobody knows, and the board is only a placeholder.
 */
export function knownBoard(saber: SaberRecord): { board: BoardModel; from: NonNullable<SaberConfigModel['boardFrom']> } | null {
  const saved = saber.model;
  if (saber.bootloader) return { board: saber.bootloader.board, from: 'bootloader' };
  const built = saber.firmware?.wiring?.board;
  if (built && (!saved || saved.board === built)) return { board: built, from: 'firmware' };
  if (saved?.boardFrom === 'owner') return { board: saved.board, from: 'owner' };
  return null;
}

/** The saved wiring names a different board from the one the saber's bootloader showed: the page says it was corrected. */
export function boardCorrection(saber: SaberRecord): { saved: BoardModel; actual: BoardModel } | null {
  const saved = saber.model?.board;
  const actual = saber.bootloader?.board;
  return saved && actual && saved !== actual ? { saved, actual } : null;
}

/** A board the saber's config name mentions, offered while the board is not known; never chosen by itself. */
export function boardSuggestion(saber: SaberRecord): BoardModel | null {
  return knownBoard(saber) ? null : boardHint(saber.identity.configName);
}

/**
 * For each of the saber's presets, the saved preset it continues, or null (preset-editor-fixes D2, BST-2). Presets
 * match by name; presets that share a name, or have none, match in their order. A name not seen before matches
 * nothing: it never takes the styles of whatever preset used to sit at its position.
 */
export function matchPresets<T extends { name: string }>(saved: T[], current: { name: string }[]): (T | null)[] {
  const byName = new Map<string, T[]>();
  for (const p of saved) byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  const used = new Map<string, number>();
  return current.map((p) => {
    const k = used.get(p.name) ?? 0;
    used.set(p.name, k + 1);
    return byName.get(p.name)?.[k] ?? null;
  });
}

/** A copy of the model with preset `index` renamed: a rename made in the app keeps the preset's chosen styles. */
export function withPresetRenamed(model: SaberConfigModel, index: number, name: string): SaberConfigModel {
  return { ...model, presets: model.presets.map((p, i) => (i === index ? { ...p, name } : p)) };
}

/**
 * The model to build now: the saved one where it exists (wiring, prop, looks), always with the presets the board
 * currently has. Slot looks are carried over by preset name, so reordering or renaming on the saber does not lose
 * a chosen look.
 */
export function draftModel(info: BoardInfo, saber: SaberRecord, overrides: { blades?: ModelBlade[]; prop?: Prop; variants?: BladeVariant[] } = {}): SaberConfigModel {
  const saved = saber.model;
  const known = knownBoard(saber);
  const blades = overrides.blades ?? saved?.blades ?? guessBlades(info.pixelBlades.length ? info.pixelBlades : [132]);
  const matched = matchPresets(saved?.presets ?? [], info.presets);
  return {
    name: saved?.name ?? configNameFor(saber),
    // Not known: V2 only keeps the pin lists showing; without `boardFrom` nothing is built until the owner chooses.
    board: known?.board ?? saved?.board ?? 'V2',
    ...(known ? { boardFrom: known.from } : {}),
    buttons: saved?.buttons ?? ((info.version?.buttons === 1 || info.version?.buttons === 3 ? info.version.buttons : 2) as 1 | 2 | 3),
    prop: overrides.prop ?? saved?.prop ?? 'fett263',
    // A custom prop file chosen before is kept, also while a stock prop is chosen, so choosing Custom again reuses it.
    ...(saved?.customProp ? { customProp: saved.customProp } : {}),
    // The installer's config the wiring is checked against (Wiring, Build & Flash).
    ...(saved?.wiringReference ? { wiringReference: saved.wiringReference } : {}),
    // Board settings taken from that config (issue #14): its orientation, display, volume and the like.
    ...(saved?.boardDefines?.length ? { boardDefines: saved.boardDefines } : {}),
    blades,
    // Presets loaded from a bank stay as loaded until they have been installed; otherwise the saber's own are the truth.
    presets: saved?.presetsFrom ? saved.presets.map((p) => ({ ...p, ...(p.looks ? { looks: blades.map((_b, k) => p.looks?.[k] ?? null) } : {}), ...(p.lookArgs ? { lookArgs: blades.map((_b, k) => p.lookArgs?.[k] ?? null) } : {}) })) : info.presets.map((p, i) => {
      const looks = matched[i]?.looks ?? [];
      const lookArgs = matched[i]?.lookArgs ?? [];
      return { font: p.font, track: p.track, name: p.name, ...(looks.some(Boolean) ? { looks: blades.map((_b, k) => looks[k] ?? null) } : {}), ...(lookArgs.some(Boolean) ? { lookArgs: blades.map((_b, k) => lookArgs[k] ?? null) } : {}) };
    }),
    looks: saved?.looks ?? [],
    // The fonts chosen on Install › Fonts.
    ...(saved?.fonts ? { fonts: saved.fonts } : {}),
    ...(saved?.voicePack ? { voicePack: saved.voicePack } : {}),
    ...(saved?.presetsFrom ? { presetsFrom: saved.presetsFrom } : {}),
    // The owner's wiring confirmation travels with the model; it only counts while the layout matches (see wiringConfirmed).
    ...(saved?.wiringConfirmation ? { wiringConfirmation: saved.wiringConfirmation } : {}),
    ...((overrides.variants ?? saved?.bladeId?.variants ?? []).length ? { bladeId: { variants: overrides.variants ?? saved!.bladeId!.variants } } : {}),
    generator: `hiltwright ${window.hiltwright.appVersion}`,
  };
}

/** The saber's presets as a list for the next install starts: what `presetDrift` later compares with. */
export function presetBase(info: BoardInfo | null): { name: string; font: string }[] | undefined {
  return info ? info.presets.map((p) => ({ name: p.name, font: p.font })) : undefined;
}

/**
 * How many of the saber's presets have changed since the list for the next install was started from them (changed
 * live, say), counted by place: a different name or font, or one added or removed. Null when there is no such list,
 * it does not know what it started from, or nothing changed.
 */
export function presetDrift(model: SaberConfigModel | null | undefined, info: BoardInfo | null): number | null {
  const base = model?.presetsFrom?.base;
  if (!base || !info) return null;
  const now = info.presets;
  let n = Math.abs(now.length - base.length);
  for (let i = 0; i < Math.min(now.length, base.length); i++) if (now[i].name.trim() !== base[i].name.trim() || now[i].font.trim() !== base[i].font.trim()) n++;
  return n || null;
}

/**
 * The saber's installed firmware carries the staged presets: the same names, in the same order. Then they can be put
 * on the saber without another install ("Use the staged presets", safe-staged-install D3).
 */
export function firmwareHasStaged(model: SaberConfigModel | null | undefined, firmware: SaberRecord['firmware']): boolean {
  if (!model?.presetsFrom || !firmware) return false;
  return firmware.presets.length === model.presets.length && firmware.presets.every((p, i) => p.name === model.presets[i].name);
}

export { queuedLookIds, withLookInSlot } from './slotModel';
