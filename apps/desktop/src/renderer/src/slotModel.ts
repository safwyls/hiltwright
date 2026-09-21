// Which look goes in which preset slot: pure functions over the build model, kept apart from anything that
// touches the board or the window so they can be tested under node.

import type { LookDef, SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../../shared/api';

/**
 * A copy of the model with `look` compiled into preset `preset` (0-based), blade `blade` (1-based). `args` are the
 * colours and timings chosen with it, kept until they can be written to the saber after the install.
 */
export function withLookInSlot(model: SaberConfigModel, look: LookDef, preset: number, blade: number, args: string | null = null): SaberConfigModel {
  const looks = look.source === 'starter' || (model.looks ?? []).some((l) => l.id === look.id) ? model.looks ?? [] : [...(model.looks ?? []), look];
  return {
    ...model,
    looks,
    presets: model.presets.map((p, i) => {
      if (i !== preset) return p;
      const row = model.blades.map((_b, k) => p.looks?.[k] ?? null);
      row[blade - 1] = look.id;
      const argRow = model.blades.map((_b, k) => p.lookArgs?.[k] ?? null);
      argRow[blade - 1] = args;
      const { lookArgs: _old, ...rest } = p;
      return { ...rest, looks: row, ...(argRow.some(Boolean) ? { lookArgs: argRow } : {}) };
    }),
  };
}

/** Look ids the model will compile that the installed firmware does not have yet. */
export function queuedLookIds(model: SaberConfigModel | undefined, firmware: SaberRecord['firmware']): string[] {
  if (!model) return [];
  const wanted = new Set<string>();
  for (const p of model.presets) for (const id of p.looks ?? []) if (id) wanted.add(id);
  const have = new Set((firmware?.looks ?? []).map((l) => l.id));
  return [...wanted].filter((id) => !have.has(id));
}
