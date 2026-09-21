// Hiltwright's own looks. Original styles assembled from ProffieOS's building blocks, written so that every
// colour and both blade timings are runtime arguments in the standard edit-mode numbering: pick a look once,
// then recolour it live from the Presets page, no rebuild.
//
// Each look is a C++ type alias (`define`) plus the preset-slot expression that uses it. The argument list and
// the default colours are read out of the C++ by scanStyleArgs, so they cannot drift from the code.

import type { BladeRole } from './config/generate';

export interface LibraryLook {
  id: string;
  name: string;
  roles: BladeRole[];
  /** The alias name used in the preset slot: `StylePtr<HwFire>()`. */
  alias: string;
  /** `using HwFire = ...;` Emitted into CONFIG_STYLES only when the look is used. */
  define: string;
  /** Whether `define` builds on HwFx (the shared effects and ignition/retraction wrapper). */
  usesFx: boolean;
  /** Gallery preview colours: base and, where the look has one, the second colour. */
  preview: string;
  preview2?: string;
  description: string;
  /** Flash cost in KB on a V2 when it is the only extra look in a build. Measured; see test/lookSizes in apps/desktop. */
  kb?: number;
}

/**
 * Effects every main-blade look shares, on top of whatever BASE draws: blast, clash, lockup, lightning block, drag
 * and stab, each localised where ProffieOS knows the position, and a wipe in and out whose durations are arguments.
 */
export const LOOK_FX = `// Shared by Hiltwright's blade looks: effects over a base, every colour and both timings editable live.
template<class BASE> using HwFx = Layers<BASE,
  BlastL<RgbArg<BLAST_COLOR_ARG, Rgb<255,255,255>>>,
  ResponsiveClashL<RgbArg<CLASH_COLOR_ARG, Rgb<255,255,255>>, TrInstant, TrFade<250>>,
  ResponsiveLockupL<RgbArg<LOCKUP_COLOR_ARG, Rgb<255,255,255>>, TrInstant, TrFade<300>>,
  ResponsiveLightningBlockL<RgbArg<LB_COLOR_ARG, Rgb<160,200,255>>>,
  ResponsiveDragL<RgbArg<DRAG_COLOR_ARG, Rgb<255,180,60>>>,
  ResponsiveStabL<RgbArg<STAB_COLOR_ARG, Rgb<255,120,0>>>,
  InOutTrL<TrWipeX<IgnitionTime<300>>, TrWipeInX<RetractionTime<500>>>>;`;

const BASE = 'RgbArg<BASE_COLOR_ARG, Rgb<0,0,255>>';
const ALT = (r: number, g: number, b: number) => `RgbArg<ALT_COLOR_ARG, Rgb<${r},${g},${b}>>`;

export const LIBRARY_LOOKS: readonly LibraryLook[] = [
  {
    id: 'hw_blade', name: 'Steady', roles: ['main', 'side'], alias: 'HwBlade', usesFx: true, preview: '#0000ff',
    define: `using HwBlade = HwFx<${BASE}>;`,
    description: 'A clean, even blade. The cheapest look, and the one to pick when the font should do the talking.',
  },
  {
    id: 'hw_hum', name: 'Humming', roles: ['main', 'side'], alias: 'HwHum', usesFx: true, kb: 0.6, preview: '#0000ff', preview2: '#000080',
    define: `using HwHum = HwFx<AudioFlicker<${BASE}, ${ALT(0, 0, 128)}>>;`,
    description: 'The blade breathes with the sound font: it dips toward the second colour as the hum rises and falls.',
  },
  {
    id: 'hw_pulse', name: 'Pulsing', roles: ['main', 'side'], alias: 'HwPulse', usesFx: true, kb: 0.8, preview: '#0000ff', preview2: '#00ffff',
    define: `using HwPulse = HwFx<Mix<Sin<Int<24>>, ${BASE}, ${ALT(0, 255, 255)}>>;`,
    description: 'A slow, steady swell between two colours, about one breath every two and a half seconds.',
  },
  {
    id: 'hw_unstable', name: 'Unstable', roles: ['main', 'side'], alias: 'HwUnstable', usesFx: true, kb: 0.8, preview: '#ff0000', preview2: '#ff5000',
    define: `using HwUnstable = HwFx<Layers<RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>,
  BrownNoiseFlickerL<${ALT(255, 80, 0)}, Int<300>>,
  RandomPerLEDFlickerL<AlphaL<Black, Int<14000>>>>>;`,
    description: 'A cracked-crystal blade: restless drifts of a hotter colour with dark sparks crawling through it.',
  },
  {
    id: 'hw_fire', name: 'Fire', roles: ['main', 'side'], alias: 'HwFire', usesFx: true, kb: 1.1, preview: '#ff0000', preview2: '#ffff00',
    define: `using HwFire = HwFx<StyleFire<RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>, ${ALT(255, 255, 0)}, 0, 6,
  FireConfig<10,1000,2>, FireConfig<2,1000,5>, FireConfig<0,0,10>, FireConfig<0,0,10>>>;`,
    description: 'Flames climbing the blade, from the base colour at the root to the second colour in the hottest licks. The heaviest look to run.',
  },
  {
    id: 'hw_stripes', name: 'Energy flow', roles: ['main', 'side'], alias: 'HwStripes', usesFx: true, kb: 1.1, preview: '#0000ff', preview2: '#00a0ff',
    define: `using HwStripes = HwFx<StripesX<Int<3500>, Int<-1800>, ${BASE}, Mix<Int<11000>, Black, ${BASE}>, ${ALT(0, 160, 255)}>>;`,
    description: 'Bands of light and shadow streaming from hilt to tip, like energy being pushed up the blade.',
  },
  {
    id: 'hw_swing', name: 'Swing flare', roles: ['main', 'side'], alias: 'HwSwing', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwSwing = HwFx<Layers<${BASE},
  AlphaL<RgbArg<SWING_COLOR_ARG, Rgb<255,255,255>>, Scale<SwingSpeed<500>, Int<0>, Int<28000>>>>>;`,
    description: 'Calm at rest, and brighter the harder you swing: the swing colour washes over the blade with speed.',
  },
  {
    id: 'hw_tip', name: 'Hot tip', roles: ['main', 'side'], alias: 'HwTip', usesFx: true, kb: 0.8, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwTip = HwFx<Gradient<${BASE}, ${BASE}, ${BASE}, ${ALT(255, 255, 255)}>>;`,
    description: 'The base colour for most of the blade, blending into a second colour over the last quarter.',
  },
  {
    id: 'hw_rainbow', name: 'Rainbow', roles: ['main', 'side'], alias: 'HwRainbow', usesFx: true, kb: 0.6, preview: '#ff00ff', preview2: '#00ff80',
    define: 'using HwRainbow = HwFx<Rainbow>;',
    description: 'The whole spectrum rolling along the blade. No base colour to set; the effect colours still apply.',
  },
  {
    id: 'hw_accent', name: 'Follow the blade', roles: ['crystal', 'accent'], alias: 'HwAccent', usesFx: false, preview: '#0000ff',
    define: `using HwAccent = Layers<${BASE},
  InOutTrL<TrFadeX<IgnitionTime<300>>, TrFadeX<RetractionTime<500>>>>;`,
    description: 'Lit in the base colour while the blade is on, fading in and out with it. For crystals and accent LEDs.',
  },
  {
    id: 'hw_crystal', name: 'Living crystal', roles: ['crystal', 'accent'], alias: 'HwCrystal', usesFx: false, kb: 1.5, preview: '#0000ff', preview2: '#000040',
    define: `using HwCrystal = Layers<Mix<Sin<Int<18>>, ${BASE}, Mix<Int<9000>, Black, ${BASE}>>,
  SimpleClashL<RgbArg<CLASH_COLOR_ARG, Rgb<255,255,255>>>,
  InOutTrL<TrFadeX<IgnitionTime<300>>, TrFadeX<RetractionTime<500>>, Pulsing<RgbArg<OFF_COLOR_ARG, Rgb<0,0,40>>, Black, 3500>>>;`,
    description: 'A crystal that never sleeps: a faint slow pulse in the off colour while the saber rests, a brighter throb while ignited, a flash on clash.',
  },
  {
    id: 'hw_spark', name: 'Flash on hits', roles: ['crystal', 'accent'], alias: 'HwSpark', usesFx: false, kb: 0.8, preview: '#ffffff',
    define: `using HwSpark = Layers<Black,
  BlastL<RgbArg<BLAST_COLOR_ARG, Rgb<255,255,255>>>,
  SimpleClashL<RgbArg<CLASH_COLOR_ARG, Rgb<255,255,255>>>,
  InOutTrL<TrInstant, TrInstant>>;`,
    description: 'Dark until something happens: it flashes on clashes and blaster deflections and nothing else.',
  },
  {
    id: 'hw_battery', name: 'Battery gauge', roles: ['accent', 'crystal'], alias: 'HwBattery', usesFx: false, kb: 0.6, preview: '#00ff00', preview2: '#ff0000',
    define: `using HwBattery = Layers<Mix<BatteryLevel, Red, Green>,
  InOutTrL<TrInstant, TrInstant, Mix<BatteryLevel, Rgb<60,0,0>, Rgb<0,60,0>>>>;`,
    description: 'Green when the battery is full, sliding to red as it drains. Dim while the saber rests, bright while ignited.',
  },
  {
    id: 'hw_motor', name: 'Motor on while ignited', roles: ['motor'], alias: 'HwMotor', usesFx: false, preview: '#ffffff',
    define: `using HwMotor = Layers<White,
  InOutTrL<TrInstant, TrInstant>>;`,
    description: 'Runs the motor at full power while the blade is on. No colours.',
  },
];
