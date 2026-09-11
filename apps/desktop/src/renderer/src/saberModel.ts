// The build model for a saber: wiring, prop, and which look goes in each preset slot. Drafted from what the
// board reports, refined by the owner on Build & Install, and stored on the saber record.

import type { LookDef, ModelBlade, Prop, SaberConfigModel } from '@hiltwright/core';
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

export function configNameFor(saber: SaberRecord): string {
  return `hiltwright_${saber.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'saber'}`;
}

/**
 * The model to build now: the saved one where it exists (wiring, prop, looks), always with the presets the board
 * currently has. Slot looks are carried over by preset name, so reordering or renaming on the saber does not lose
 * a chosen look.
 */
export function draftModel(info: BoardInfo, saber: SaberRecord, overrides: { blades?: ModelBlade[]; prop?: Prop } = {}): SaberConfigModel {
  const saved = saber.model;
  const blades = overrides.blades ?? saved?.blades ?? guessBlades(info.pixelBlades.length ? info.pixelBlades : [132]);
  const byName = new Map((saved?.presets ?? []).map((p) => [p.name, p.looks ?? []]));
  return {
    name: saved?.name ?? configNameFor(saber),
    board: saved?.board ?? (/v3/i.test(saber.identity.version ?? '') ? 'V3' : 'V2'),
    buttons: saved?.buttons ?? ((info.version?.buttons === 1 || info.version?.buttons === 3 ? info.version.buttons : 2) as 1 | 2 | 3),
    prop: overrides.prop ?? saved?.prop ?? 'fett263',
    blades,
    presets: info.presets.map((p, i) => {
      const looks = byName.get(p.name) ?? saved?.presets[i]?.looks ?? [];
      return { font: p.font, track: p.track, name: p.name, ...(looks.some(Boolean) ? { looks: blades.map((_b, k) => looks[k] ?? null) } : {}) };
    }),
    looks: saved?.looks ?? [],
    generator: `hiltwright ${window.hiltwright.appVersion}`,
  };
}

/** A copy of the model with `look` compiled into preset `preset` (0-based), blade `blade` (1-based). */
export function withLookInSlot(model: SaberConfigModel, look: LookDef, preset: number, blade: number): SaberConfigModel {
  const looks = look.source === 'starter' || (model.looks ?? []).some((l) => l.id === look.id) ? model.looks ?? [] : [...(model.looks ?? []), look];
  return {
    ...model,
    looks,
    presets: model.presets.map((p, i) => {
      if (i !== preset) return p;
      const row = model.blades.map((_b, k) => p.looks?.[k] ?? null);
      row[blade - 1] = look.id;
      return { ...p, looks: row };
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
