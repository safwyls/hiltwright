import { describe, expect, it } from 'vitest';
import { bladePowerPins, compareWiring, differenceText, generateConfig, validateModel, wiringFromConfig, wiringProblems, type ConfigWiring, type ModelBlade, type SaberConfigModel } from '../src';

// The shape of an installer's config as found on a saber's card (Shadowfoil's SF_nihilus.h): their own prop and style
// macros, which this reader need not understand to read the wiring.
const SHADOWFOIL = `#ifdef CONFIG_TOP
#include "proffieboard_v2_config.h"
#define NUM_BLADES 1
#define NUM_BUTTONS 1
#define VOLUME 2000
const unsigned int maxLedsPerStrip = 144;
#define ENABLE_WS2811
//#define SHARED_POWER_PINS
#endif

#ifdef CONFIG_PROP
#include "../props/saber_SF24_buttons.h"
#endif

#include "shadowfoil_presets.h"

#ifdef CONFIG_PRESETS
Preset presets[] = {
    { "Loth_Hero;common", "tracks/Loth_Hero.wav", MainBlade_Sequels(Green) },
    { "Dark;common", "tracks/Dark.wav", MainBlade_Sequels(Silver) }
};
BladeConfig blades[] = {
    {
        0,
        WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>(),
        CONFIGARRAY(presets)
    },
};
#endif

#ifdef CONFIG_BUTTONS
Button PowerButton(BUTTON_POWER, powerButtonPin, "pow");
#endif
`;

// ProffieOS's own default config: the older WS2811BladePtr form with its pins left to their defaults, and an LED star.
const STOCK = `#ifdef CONFIG_TOP
#include "proffieboard_config.h"
#define NUM_BLADES 2
#define NUM_BUTTONS 2
#endif
#ifdef CONFIG_PRESETS
Preset presets[] = { { "TeensySF", "tracks/venus.wav", StyleNormalPtr<CYAN, WHITE, 300, 800>(), StyleNormalPtr<CYAN, WHITE, 300, 800>(), "cyan"} };
BladeConfig blades[] = {
 { 0, WS2811BladePtr<97, WS2811_800kHz>(),
     SimpleBladePtr<CreeXPE2WhiteTemplate<550>, CreeXPE2BlueTemplate<240>, CreeXPE2BlueTemplate<240>, NoLED, bladePowerPin4, bladePowerPin5, bladePowerPin6, -1>(),
     CONFIGARRAY(presets) },
  };
#endif
`;

const strip = (dataPin: string, powerPins: string[], pixels = 144, order = 'GRB'): ModelBlade => ({ id: 'main', role: 'main', type: 'pixel', pixels, order, extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin, powerPins } });

describe('wiring from a config file', () => {
  it("reads an installer's config: board, buttons, and the blade's pins, whatever its prop and styles", () => {
    const w = wiringFromConfig(SHADOWFOIL)!;
    expect(w).toMatchObject({ board: 'V2', buttons: 1, numBlades: 1, rows: 1, unreadable: [], prop: { include: '../props/saber_SF24_buttons.h', stock: null } });
    expect(w.blades).toHaveLength(1);
    expect(w.blades[0]).toMatchObject({ type: 'pixel', pixels: 144, order: 'GRB', wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } });
  });

  it('fills in the pins ProffieOS defaults: bladePin and power pins 1 to 3, the colour order from the flags', () => {
    const w = wiringFromConfig(STOCK)!;
    expect(w.board).toBeNull();
    expect(w.blades[0]).toMatchObject({ pixels: 97, order: 'RGB', wiring: { dataPin: 'bladePin', powerPins: ['bladePowerPin1', 'bladePowerPin2', 'bladePowerPin3'] } });
    expect(w.blades[1]).toMatchObject({ type: 'simple', wiring: { kind: 'power', pins: ['bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'] } });
    const flags = wiringFromConfig(STOCK.replace('WS2811_800kHz>', 'WS2811_ACTUALLY_800kHz | WS2811_GRB, blade2Pin>'))!;
    expect(flags.blades[0]).toMatchObject({ order: 'GRB', wiring: { dataPin: 'blade2Pin', powerPins: ['bladePowerPin1', 'bladePowerPin2', 'bladePowerPin3'] } });
  });

  it('says which blades it could not read, rather than guessing their pins; no BladeConfig at all is no wiring', () => {
    const w = wiringFromConfig(SHADOWFOIL.replace('WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>()', 'MyMagicBlade<144>()'))!;
    expect(w.unreadable).toEqual([{ blade: 1, text: 'MyMagicBlade<144>()' }]);
    expect(wiringFromConfig('#ifdef CONFIG_TOP\n#define NUM_BLADES 1\n#endif\n')).toBeNull();
  });

  it('compares with the wiring set here: pins and blade counts are dangerous, pixels and order are not', () => {
    const cfg = wiringFromConfig(SHADOWFOIL)!;
    expect(compareWiring({ board: 'V2', buttons: 1, blades: [strip('bladePin', ['bladePowerPin3', 'bladePowerPin2'])] }, cfg)).toEqual([]);
    const diffs = compareWiring({ board: 'V3', buttons: 2, blades: [strip('blade2Pin', ['bladePowerPin2'], 132, 'RGB')] }, cfg);
    expect(diffs.map((d) => [d.what, d.danger])).toEqual([['board', true], ['buttons', false], ['data pin', true], ['power pins', true], ['pixels', false], ['colour order', false]]);
    expect(differenceText(diffs[2])).toBe('Blade 1 data pin: blade2Pin here, bladePin in the config');
    expect(compareWiring({ board: 'V2', buttons: 1, blades: [strip('bladePin', ['bladePowerPin2', 'bladePowerPin3']), strip('blade2Pin', ['bladePowerPin4'])] }, cfg).map((d) => d.what)).toEqual(['number of blades']);
  });
});

/** An installer's config with these blades in its one BladeConfig row (and NUM_BLADES to match). */
const withBlades = (blades: string[], top = '') => `#ifdef CONFIG_TOP
#include "proffieboard_v3_config.h"
#define NUM_BLADES ${blades.length}
#define NUM_BUTTONS 2
${top}const unsigned int maxLedsPerStrip = 144;
#endif
#ifdef CONFIG_PRESETS
Preset presets[] = { { "TeensySF", "tracks/venus.wav", ${blades.map(() => 'StylePtr<Blue>()').join(', ')}, "one"} };
BladeConfig blades[] = {
 { 0, ${blades.join(',\n   ')},
   CONFIGARRAY(presets) },
};
#endif
`;

/** Import a config's wiring as the Wiring page does, generate a config from it, and read that config's wiring back. */
function roundTrip(text: string): { model: SaberConfigModel; generated: string; back: ConfigWiring } {
  const w = wiringFromConfig(text)!;
  const model: SaberConfigModel = {
    name: 'hiltwright_trip', board: 'V3', boardFrom: 'owner', buttons: 2, prop: 'fett263',
    blades: w.blades.map((b, i) => ({ ...b, role: i === 0 ? 'main' : 'accent' })),
    presets: [{ font: 'TeensySF', track: 'tracks/venus.wav', name: 'one' }],
  };
  expect(validateModel(model)).toEqual([]);
  const generated = generateConfig(model).text;
  return { model, generated, back: wiringFromConfig(generated)! };
}

describe("an installer's config, imported and built again", () => {
  it('#15 keeps each simple LED on the pin in its own slot when a slot between them is empty', () => {
    const sparse = 'SimpleBladePtr<CreeXPE2WhiteTemplate<550>, NoLED, CreeXPE2BlueTemplate<240>, NoLED, bladePowerPin4, -1, bladePowerPin6, -1>()';
    const text = withBlades(['WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>()', sparse]);
    const w = wiringFromConfig(text)!;
    expect(w.blades[1].wiring).toEqual({ kind: 'power', pins: ['bladePowerPin4', '-1', 'bladePowerPin6'] });
    const { model, generated, back } = roundTrip(text);
    expect(generated).toContain(sparse);
    expect(compareWiring(model, w)).toEqual([]);
    expect(back.blades[1].wiring).toEqual(w.blades[1].wiring);
    // The same pins in other slots light other LEDs: that is a difference, even though the set of pins is the same.
    const shifted = { ...model, blades: model.blades.map((b, i) => (i === 1 ? { ...b, wiring: { kind: 'power' as const, pins: ['bladePowerPin4', 'bladePowerPin6'] } } : b)) };
    expect(compareWiring(shifted, w).map(differenceText)).toEqual(['Blade 2 power pins: bladePowerPin4, bladePowerPin6 here, bladePowerPin4, no pin, bladePowerPin6 in the config']);
    // The placeholder is no pin: the wiring rules neither count it nor call it a pin the board lacks.
    expect(wiringProblems(model.blades, 'V3')).toEqual([]);
    expect(bladePowerPins(model.blades[1])).toEqual(['bladePowerPin4', 'bladePowerPin6']);
  });

  it("#16 keeps a DimBlade's brightness limit, on a strip, a chained part of one and an LED", () => {
    const text = withBlades([
      'DimBlade(20.0, WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>())',
      'SubBlade(0, 9, WS281XBladePtr<20, blade2Pin, Color8::GRB, PowerPINS<bladePowerPin4>>())',
      'DimBlade(50, SubBlade(10, 19, NULL))',
      'DimBlade(12.5f, SimpleBladePtr<CreeXPE2WhiteTemplate<550>, NoLED, NoLED, NoLED, bladePowerPin5, -1, -1, -1>())',
    ]);
    const w = wiringFromConfig(text)!;
    expect(w.unreadable).toEqual([]);
    expect(w.blades.map((b) => b.dim)).toEqual([20, undefined, 50, 12.5]);
    const { model, generated, back } = roundTrip(text);
    expect(generated).toContain('DimBlade(20, WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3> >())');
    expect(generated).toContain('DimBlade(50, SubBlade(10, 19, NULL))');
    expect(back.blades.map((b) => b.dim)).toEqual([20, undefined, 50, 12.5]);
    expect(compareWiring(model, w)).toEqual([]);
    // Without the limit the blade would run at full brightness: the comparison says so.
    const bright = { ...model, blades: model.blades.map((b, i) => (i === 0 ? { ...b, dim: undefined } : b)) };
    expect(compareWiring(bright, w).map(differenceText)).toEqual(['Blade 1 brightness limit: none here, 20% in the config']);
  });

  it('#16 a DimBlade whose limit is not a plain percentage is not readable, rather than imported at full brightness', () => {
    const w = wiringFromConfig(withBlades(['DimBlade(MY_DIM, WS281XBladePtr<144, bladePin, Color8::GRB, PowerPINS<bladePowerPin2>>())']))!;
    expect(w.unreadable.map((u) => u.blade)).toEqual([1]);
  });
});
