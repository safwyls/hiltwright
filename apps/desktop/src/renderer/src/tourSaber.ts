// The example saber the guided tour shows: a two-button saber with one main blade and an accent LED, six presets on
// the six free ProffieOS fonts, a firmware Hiltwright installed, and two styles queued for its next build. It lives
// only here. It is never saved to the saber library and never becomes the saber being worked on: the tour hands it
// to the pages through a stand-in for the board session (tourBoard.ts) and takes it away again when it ends.

import { STARTER_LOOKS, withWiringConfirmation, type FirmwareManifest, type ModelBlade, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import type { SaberRecord } from '../../shared/api';
import type { BoardInfo } from './board';

export const EXAMPLE_ID = 'tour-example-saber';
export const EXAMPLE_NAME = 'Example saber';

const BLADES: ModelBlade[] = [
  { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
  { id: 'b2', role: 'accent', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin5'] } },
];

/** Each preset: its name and font, the style installed on each blade, and the style chosen for the next build. */
const PRESETS: { name: string; font: string; installed: [string, string]; chosen: [string, string] }[] = [
  { name: 'Jedi', font: 'SmthJedi', installed: ['hw_blade', 'hw_accent'], chosen: ['hw_aurora', 'hw_accent'] },
  { name: 'Grey', font: 'SmthGrey', installed: ['hw_hum', 'hw_accent'], chosen: ['hw_hum', 'hw_accent'] },
  { name: 'Fuzz', font: 'SmthFuzz', installed: ['hw_unstable', 'hw_spark'], chosen: ['hw_unstable', 'hw_spark'] },
  { name: 'Rogue', font: 'RgueCmdr', installed: ['hw_fire', 'hw_accent'], chosen: ['hw_lava', 'hw_accent'] },
  { name: 'Teensy', font: 'TeensySF', installed: ['hw_pulse', 'hw_battery'], chosen: ['hw_pulse', 'hw_battery'] },
  { name: 'Crystal', font: 'TthCrstl', installed: ['hw_film', 'hw_accent'], chosen: ['hw_film', 'hw_accent'] },
];

const AT = '2026-11-01T18:00:00.000Z';

function installedLooks(): FirmwareManifest['looks'] {
  const ids = [...new Set(PRESETS.flatMap((p) => p.installed))];
  return ids.map((id) => {
    const l = STARTER_LOOKS.find((x) => x.id === id);
    if (!l) throw new Error(`The example saber names a style Hiltwright does not have: ${id}`);
    return { id: l.id, name: l.name, args: l.args, ...(l.defaults ? { defaults: l.defaults } : {}) };
  });
}

const FIRMWARE: FirmwareManifest = {
  hash: 'tour-example', os: 'v8.10', at: AT,
  looks: installedLooks(),
  presets: PRESETS.map((p) => ({ name: p.name, looks: [...p.installed] })),
  wiring: { board: 'V2', blades: BLADES },
};

/** What the saber reports: each preset points at the styles its firmware carries, `builtin <preset> <blade>`. */
const BOARD_PRESETS: PresetRecord[] = PRESETS.map((p, i) => ({ name: p.name, font: `${p.font};common`, track: i === 0 ? 'tracks/mars.wav' : '', styles: [`builtin ${i} 1`, `builtin ${i} 2`], variation: 0 }));

const MODEL: SaberConfigModel = withWiringConfirmation({
  name: 'hiltwright_example_saber', board: 'V2', boardFrom: 'firmware', buttons: 2, prop: 'fett263', blades: BLADES,
  presets: PRESETS.map((p, i) => ({ name: p.name, font: `${p.font};common`, track: BOARD_PRESETS[i].track, looks: [...p.chosen] })),
  looks: [], generator: 'hiltwright tour',
}, true, AT);

export const EXAMPLE_SABER: SaberRecord = {
  id: EXAMPLE_ID, name: EXAMPLE_NAME, firstSeen: AT, lastSeen: AT,
  identity: { usbSerial: null, configName: 'config/hiltwright_example_saber.h', version: 'v8.10 hiltwright', prop: 'fett263', buttons: 2, installed: 'Nov 1 2026 18:00:00', pixelBlades: [132], bladeConfig: 0 },
  presets: BOARD_PRESETS,
  fonts: ['common', ...PRESETS.map((p) => p.font)],
  tracks: ['mars.wav'],
  model: MODEL,
  firmware: FIRMWARE,
};

/** The example saber as a board reading: plugged in, on its first preset, battery and volume as a real one reports. */
export const EXAMPLE_INFO: BoardInfo = {
  version: { version: 'v8.10 hiltwright', config: 'config/hiltwright_example_saber.h', prop: 'fett263', buttons: 2, installed: 'Nov 1 2026 18:00:00', major: 8 },
  battery: 3.92, volume: 1800, currentPreset: 0,
  presets: BOARD_PRESETS, fonts: EXAMPLE_SABER.fonts, tracks: EXAMPLE_SABER.tracks,
  pixelBlades: [132], bladeConfig: 0, rejected: [], timings: {}, sdMissing: false,
};

/**
 * What the example saber answers when a page asks it something, so its pages read as a real one does: its settings
 * (Diagnostics) and its voice pack (Build & Flash). Only questions; anything that would change a saber is refused.
 */
export const EXAMPLE_ANSWERS: Record<string, string[]> = {
  get_volume: ['1800'],
  get_blade_dimming: ['16384'],
  get_clash_threshold: ['3.5'],
  get_on: ['0'],
  'cat common/voicepack.ini': ['voice_pack_version=2'],
  'dir common': ['mnum', 'boot.wav 88244', 'font.wav 66194', 'Done listing files.'],
};

/** Style ids the example saber has queued for its next build (chosen, not yet in its firmware). */
export const EXAMPLE_QUEUED = [...new Set(PRESETS.flatMap((p) => p.chosen.filter((id, k) => id !== p.installed[k])))];
