import { describe, expect, it } from 'vitest';
import { compareWiring, differenceText, wiringFromConfig, type ModelBlade } from '../src';

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
