// The Armory's "New saber": a plan is saved before its board is chosen and before it has presets. From 2026-09-27
// (when "the board must be chosen" became a check) until 0.2.0-beta.8, every new plan was refused for that, and
// Start did nothing. Found by a tester on macOS; it failed on every system.

import { describe, expect, it } from 'vitest';
import { BOARD_NOT_CHOSEN, validateModel, type SaberConfigModel } from '@hiltwright/core';
import { planProblems } from '../src/main/planCheck';

/**
 * The model the Armory sends for a new saber (App.tsx `plan`): one 132-pixel main blade as saberModel.ts
 * `guessBlades([132])` makes it, written out here because that file belongs to the page.
 */
const starter = (name = 'hiltwright_saber_3'): SaberConfigModel => ({
  name, board: 'V2', buttons: 2, prop: 'fett263', presets: [], looks: [], generator: 'hiltwright test',
  blades: [{ id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } }],
});

describe('planning a new saber', () => {
  it('the starter model has no board chosen and no presets, which a build would refuse', () => {
    const all = validateModel(starter());
    expect(all).toContain(BOARD_NOT_CHOSEN);
    expect(all.some((e) => /preset/i.test(e))).toBe(true);
  });

  it('neither stops the plan from being saved', () => {
    expect(planProblems(starter())).toEqual([]);
  });

  it('a real fault still stops it', () => {
    expect(planProblems(starter('3 bad name'))).toEqual(['Config name must be letters, digits and underscores.']);
    expect(planProblems({ ...starter(), blades: [] })).toContain('At least one blade is needed.');
  });
});
