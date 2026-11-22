import { describe, expect, it } from 'vitest';
import { wiringFromConfig, type ModelBlade } from '@hiltwright/core';
import { bladeWords, boardDefinesDiffer, importedBlades, importedBoardDefines, referenceFrom } from '../src/renderer/src/wiringImport';

const CONFIG = `#ifdef CONFIG_TOP
#include "proffieboard_v2_config.h"
#define NUM_BLADES 2
#define NUM_BUTTONS 2
#endif
#ifdef CONFIG_PRESETS
Preset presets[] = { { "A;common", "", StylePtr<Red>(), StylePtr<Blue>(), "a" } };
BladeConfig blades[] = {
  { 0, WS281XBladePtr<132, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>(),
       SimpleBladePtr<CreeXPE2RedTemplate<1000>, NoLED, NoLED, NoLED, bladePowerPin5, -1, -1, -1>(),
       CONFIGARRAY(presets) },
};
#endif
`;

const blade = (role: ModelBlade['role']): ModelBlade => ({ id: role, role, type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } });

describe('importing wiring from a config', () => {
  const w = wiringFromConfig(CONFIG)!;

  it('takes the pins from the config, and keeps the roles set here when the blade count is the same', () => {
    const same = importedBlades(w, [blade('main'), blade('crystal')]);
    expect(same.map((b) => b.role)).toEqual(['main', 'crystal']);
    expect(same[0].wiring).toEqual({ kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] });
    expect(same[1].wiring).toEqual({ kind: 'power', pins: ['bladePowerPin5'] });
    expect(importedBlades(w, [blade('main')]).map((b) => b.role)).toEqual(['main', 'accent']);
  });

  it('remembers what the config said, and puts each blade in words', () => {
    expect(referenceFrom('SF_nihilus.h', 'card', w)).toMatchObject({ file: 'SF_nihilus.h', from: 'card', board: 'V2', buttons: 2, unreadable: [] });
    expect(bladeWords(w.blades[0])).toBe('132-pixel strip on bladePin, power bladePowerPin2 + bladePowerPin3 (GRB)');
    expect(bladeWords(w.blades[1])).toBe('LED on bladePowerPin5');
  });

  it("#14 takes the config's board settings, remembers all its defines, and a config without settings leaves none", () => {
    const set = wiringFromConfig(CONFIG.replace('#define NUM_BUTTONS 2\n', '#define NUM_BUTTONS 2\n#define ORIENTATION ORIENTATION_USB_TOWARDS_BLADE\n#define FETT263_TWIST_ON\n'))!;
    expect(importedBoardDefines(set)).toEqual({ boardDefines: ['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE'] });
    expect(referenceFrom('a.h', 'file', set).defines).toEqual(['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE', 'FETT263_TWIST_ON']);
    expect(boardDefinesDiffer({}, set)).toBe(true);
    expect(boardDefinesDiffer({ boardDefines: ['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE'] }, set)).toBe(false);
    expect(importedBoardDefines(w)).toEqual({ boardDefines: undefined });
    expect(boardDefinesDiffer({}, w)).toBe(false);
  });

  it('#16 puts a brightness limit in words', () => {
    expect(bladeWords({ ...w.blades[0], dim: 20 })).toBe('132-pixel strip on bladePin, power bladePowerPin2 + bladePowerPin3 (GRB), limited to 20% brightness');
  });
});
