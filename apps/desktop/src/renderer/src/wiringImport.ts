// Turning a config file's wiring (core configWiring.ts) into the Wiring page's blades, and describing it in words.
// Kept apart from React so it can be tested under node.

import type { BladeRole, ConfigWiring, ModelBlade, SaberConfigModel } from '@hiltwright/core';

/**
 * The config's blades as the Wiring page keeps them. Roles are not in a config: with the same number of blades the
 * current roles are kept, else the first blade is the main one and the rest are accents (the owner can change them).
 */
export function importedBlades(cfg: Pick<ConfigWiring, 'blades'>, current: ModelBlade[]): ModelBlade[] {
  const keep = current.length === cfg.blades.length;
  return cfg.blades.map((b, i) => ({ ...b, role: keep ? current[i].role : (i === 0 ? 'main' : 'accent') as BladeRole }));
}

/** What the model remembers of the config, for Build & Flash to check against later. */
export function referenceFrom(name: string, from: 'card' | 'file', cfg: ConfigWiring): NonNullable<SaberConfigModel['wiringReference']> {
  return { file: name, from, at: new Date().toISOString(), board: cfg.board, buttons: cfg.buttons, blades: cfg.blades, unreadable: cfg.unreadable };
}

/** One blade in words: "144-pixel strip on bladePin, power bladePowerPin2 + bladePowerPin3 (GRB)". */
export function bladeWords(b: ConfigWiring['blades'][number]): string {
  if (b.type === 'simple') return `LED on ${b.wiring.kind === 'power' && b.wiring.pins.length ? b.wiring.pins.join(' + ') : 'no pins'}`;
  if (b.wiring.kind === 'chain') return `${b.pixels} pixels further along the strip before it`;
  if (b.wiring.kind === 'own') return `${b.pixels}-pixel strip on ${b.wiring.dataPin}, power ${b.wiring.powerPins.join(' + ') || 'none'}${b.order ? ` (${b.order})` : ''}`;
  return `${b.pixels} pixels`;
}
