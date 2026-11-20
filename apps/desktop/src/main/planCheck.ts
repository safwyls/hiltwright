// What stops a saber being planned ahead of its hilt (the Armory's "New saber").

import { BOARD_NOT_CHOSEN, validateModel, type SaberConfigModel } from '@hiltwright/core';

/**
 * The problems that stop a new plan from being saved. A plan starts with no board chosen and no presets: both are
 * filled in later, on the Wiring and Presets pages, so neither counts here. Everything else validateModel checks
 * does (the config name, the blades, the wiring rules).
 */
export function planProblems(model: SaberConfigModel): string[] {
  return validateModel(model).filter((e) => e !== BOARD_NOT_CHOSEN && !/preset/i.test(e));
}
