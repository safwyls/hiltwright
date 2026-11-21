// The fonts a saber will carry (Install › Fonts, docs/install-live-plan.md): the ones chosen for it, and every font
// its presets name. Folder names are compared without regard to case, as on a FAT card.

import type { SaberConfigModel } from '@hiltwright/core';
import { splitFont } from './presetFields';

type FontModel = Pick<SaberConfigModel, 'presets' | 'fonts'>;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Every folder a preset's font names: its main folder and any extra ones, never `common`. */
export function presetFolders(font: string): string[] {
  const f = splitFont(font);
  return [f.folder, ...f.extra].filter((x) => x && x !== 'common');
}

/** The fonts the saber will carry, in the order chosen, then any a preset names that were not chosen yet. */
export function chosenFonts(model: FontModel | null | undefined): string[] {
  if (!model) return [];
  const out: string[] = [];
  const add = (x: string) => { const t = x.trim(); if (t && t !== 'common' && !out.some((o) => same(o, t))) out.push(t); };
  for (const x of model.fonts ?? []) add(x);
  for (const p of model.presets) for (const x of presetFolders(p.font)) add(x);
  return out;
}

/** The presets (by place, from 0) that name this font. */
export function presetsUsing(model: FontModel, folder: string): number[] {
  return model.presets.flatMap((p, i) => (presetFolders(p.font).some((x) => same(x, folder)) ? [i] : []));
}

/** The model with this font chosen too (at the end), and every font its presets name written down. */
export function withFontChosen<M extends FontModel>(model: M, folder: string): M {
  return { ...model, fonts: chosenFonts({ ...model, fonts: [...(model.fonts ?? []), folder] }) };
}

/** The model without this font, or null while a preset still names it: change that preset's font first. */
export function withFontDropped<M extends FontModel>(model: M, folder: string): M | null {
  if (presetsUsing(model, folder).length) return null;
  return { ...model, fonts: chosenFonts(model).filter((x) => !same(x, folder)) };
}

/** The model with every font its presets name on its list, so the list and the presets never disagree. */
export function withPresetFonts<M extends FontModel>(model: M): M {
  return { ...model, fonts: chosenFonts(model) };
}
