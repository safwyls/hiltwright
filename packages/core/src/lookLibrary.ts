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
  /** Whether `define` builds on HwFx or HwFxTr (the shared effects wrapper, with the usual or its own ignition). */
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
template<class BASE, class OUT_TR, class IN_TR> using HwFxTr = Layers<BASE,
  BlastL<RgbArg<BLAST_COLOR_ARG, Rgb<255,255,255>>>,
  ResponsiveClashL<RgbArg<CLASH_COLOR_ARG, Rgb<255,255,255>>, TrInstant, TrFade<250>>,
  ResponsiveLockupL<RgbArg<LOCKUP_COLOR_ARG, Rgb<255,255,255>>, TrInstant, TrFade<300>>,
  ResponsiveLightningBlockL<RgbArg<LB_COLOR_ARG, Rgb<160,200,255>>>,
  ResponsiveDragL<RgbArg<DRAG_COLOR_ARG, Rgb<255,180,60>>>,
  ResponsiveStabL<RgbArg<STAB_COLOR_ARG, Rgb<255,120,0>>>,
  InOutTrL<OUT_TR, IN_TR>>;
// The usual way in and out: a wipe from the hilt, and back down from the tip.
template<class BASE> using HwFx = HwFxTr<BASE, TrWipeX<IgnitionTime<300>>, TrWipeInX<RetractionTime<500>>>;`;

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
    id: 'hw_film', name: 'Film flicker', roles: ['main', 'side'], alias: 'HwFilm', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#0000a0',
    define: `using HwFilm = HwFx<RandomFlicker<${BASE}, Mix<Int<21000>, Black, ${BASE}>>>;`,
    description: 'The whole blade shivers between full and two-thirds brightness many times a second, like a hand-painted blade on old film.',
  },
  {
    id: 'hw_surge', name: 'Power surge', roles: ['main', 'side'], alias: 'HwSurge', usesFx: true, kb: 1.4, preview: '#0000ff', preview2: '#8cc8ff',
    define: `using HwSurge = HwFx<StripesX<Int<9000>, Int<-3000>, ${BASE}, ${BASE}, ${BASE}, ${BASE}, ${BASE}, ${ALT(140, 200, 255)}>>;`,
    description: 'A steady blade with pulses of a brighter colour racing from the hilt to the tip, one after another.',
  },
  {
    id: 'hw_stardust', name: 'Stardust', roles: ['main', 'side'], alias: 'HwStardust', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwStardust = HwFx<Layers<${BASE}, SparkleL<${ALT(255, 255, 255)}, 300, 1024>>>;`,
    description: 'Pinpoints of the second colour flare up at random along the blade and melt away into their neighbours.',
  },
  {
    id: 'hw_lava', name: 'Lava lamp', roles: ['main', 'side'], alias: 'HwLava', usesFx: true, kb: 1.3, preview: '#ff1e00', preview2: '#ffa000',
    define: `using HwLava = HwFx<Layers<RgbArg<BASE_COLOR_ARG, Rgb<255,30,0>>,
  AlphaL<${ALT(255, 160, 0)}, Bump<Scale<Sin<Int<5>>, Int<3000>, Int<29000>>, Int<18000>>>,
  AlphaL<${ALT(255, 160, 0)}, Bump<Scale<Sin<Int<8>>, Int<30000>, Int<6000>>, Int<12000>>>,
  AlphaL<${ALT(255, 160, 0)}, Bump<Scale<Sin<Int<3>>, Int<10000>, Int<24000>>, Int<9000>>>>>;`,
    description: 'Three soft blobs of the second colour drift up and down the blade at their own pace, passing through each other.',
  },
  {
    id: 'hw_emitter', name: 'Emitter flare', roles: ['main', 'side'], alias: 'HwEmitter', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwEmitter = HwFx<Layers<${BASE},
  AlphaL<RgbArg<EMITTER_COLOR_ARG, Rgb<255,255,255>>, SmoothStep<Scale<NoisySoundLevel, Int<1200>, Int<5200>>, Int<-5000>>>>>;`,
    description: 'A hot glow where the blade leaves the hilt, in its own colour, that swells and shrinks with the sound.',
  },
  {
    id: 'hw_aurora', name: 'Aurora', roles: ['main', 'side'], alias: 'HwAurora', usesFx: true, kb: 0.9, preview: '#00ff5a', preview2: '#8c00ff',
    define: `using HwAurora = HwFx<Mix<SmoothStep<Scale<Sin<Int<7>>, Int<-6000>, Int<38000>>, Int<26000>>,
  RgbArg<BASE_COLOR_ARG, Rgb<0,255,90>>, ${ALT(140, 0, 255)}>>;`,
    description: 'Two colours sharing the blade across a wide, soft border that drifts from one end to the other and back, so each colour takes the whole blade in turn.',
  },
  {
    id: 'hw_current', name: 'Current', roles: ['main', 'side'], alias: 'HwCurrent', usesFx: true, kb: 1.2, preview: '#0050ff', preview2: '#00ffff',
    define: `using HwCurrent = HwFx<StripesX<Int<9000>, Scale<SwingSpeed<450>, Int<-500>, Int<-5000>>,
  RgbArg<BASE_COLOR_ARG, Rgb<0,80,255>>, Mix<Int<14000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<0,80,255>>>, ${ALT(0, 255, 255)}>>;`,
    description: 'Wide bands drifting lazily up the blade at rest that rush toward the tip the harder you swing.',
  },
  {
    id: 'hw_dark', name: 'Dark blade', roles: ['main', 'side'], alias: 'HwDark', usesFx: true, kb: 1.4, preview: '#ffffff', preview2: '#606060',
    define: `using HwDark = HwFx<Layers<StripesX<Int<2600>, Int<-3400>,
    RgbArg<BASE_COLOR_ARG, Rgb<255,255,255>>, Mix<Int<9000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,255,255>>>,
    RgbArg<BASE_COLOR_ARG, Rgb<255,255,255>>, Mix<Int<18000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,255,255>>>>,
  RandomPerLEDFlickerL<AlphaL<Black, Int<9000>>>>>;`,
    description: 'A pale blade shot through with fast, uneven shadows and a fine grain, for an ancient black-cored look.',
  },
  {
    id: 'hw_embers', name: 'Embers', roles: ['main', 'side'], alias: 'HwEmbers', usesFx: true, kb: 0.7, preview: '#ff1400', preview2: '#ff8c00',
    define: `using HwEmbers = HwFx<HumpFlicker<${ALT(255, 140, 0)}, RgbArg<BASE_COLOR_ARG, Rgb<255,20,0>>, 45>>;`,
    description: 'A glowing coal of a blade: a hot patch of the second colour jumps to a new place many times a second, so the whole length seems to smoulder.',
  },
  {
    id: 'hw_horizon', name: 'Horizon', roles: ['main', 'side'], alias: 'HwHorizon', usesFx: true, kb: 0.6, preview: '#0000ff', preview2: '#ff0000',
    define: `using HwHorizon = HwFx<Mix<BladeAngle<>, ${BASE}, ${ALT(255, 0, 0)}>>;`,
    description: 'The colour follows where the blade points: the base colour toward the ground, the second colour toward the sky, and every blend between.',
  },
  {
    id: 'hw_core', name: 'Core pulse', roles: ['main', 'side'], alias: 'HwCore', usesFx: true, kb: 0.9, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwCore = HwFx<Layers<${BASE},
  AlphaL<${ALT(255, 255, 255)}, Bump<Int<16384>, Scale<Sin<Int<20>>, Int<3000>, Int<26000>>>>>>;`,
    description: 'A glow in the middle of the blade that swells out toward both ends and draws back in, every three seconds.',
  },
  {
    id: 'hw_tracer', name: 'Tracers', roles: ['main', 'side'], alias: 'HwTracer', usesFx: true, kb: 1.1, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwTracer = HwFx<Layers<${BASE},
  AlphaL<${ALT(255, 255, 255)}, Bump<Saw<Int<38>>, Int<5000>>>,
  AlphaL<${ALT(255, 255, 255)}, Bump<Saw<Int<23>>, Int<8000>>>,
  AlphaL<${ALT(255, 255, 255)}, Bump<Saw<Int<61>>, Int<3500>>>>>;`,
    description: 'Three streaks of the second colour chasing up the blade at different speeds, overtaking each other on the way.',
  },
  {
    id: 'hw_split', name: 'Split', roles: ['main', 'side'], alias: 'HwSplit', usesFx: true, kb: 0.8, preview: '#0000ff', preview2: '#ff0000',
    define: `using HwSplit = HwFx<Mix<SmoothStep<Scale<SwingSpeed<400>, Int<16384>, Int<27000>>, Int<5000>>, ${BASE}, ${ALT(255, 0, 0)}>>;`,
    description: 'Two colours meeting at a soft seam in the middle. Swing, and the lower colour pushes the seam toward the tip.',
  },
  {
    id: 'hw_barber', name: 'Barber pole', roles: ['main', 'side'], alias: 'HwBarber', usesFx: true, kb: 1.0, preview: '#ff0000', preview2: '#ffffff',
    define: `using HwBarber = HwFx<StripesX<Int<5000>, Int<-700>, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>, ${ALT(255, 255, 255)}>>;`,
    description: 'Short bands of two colours creeping steadily up the blade, like a barber pole or a candy cane.',
  },
  {
    id: 'hw_static', name: 'Static', roles: ['main', 'side'], alias: 'HwStatic', usesFx: true, kb: 0.6, preview: '#0000ff', preview2: '#000050',
    define: `using HwStatic = HwFx<Layers<${BASE},
  RandomPerLEDFlickerL<AlphaL<Black, Int<26000>>>,
  BrownNoiseFlickerL<AlphaL<Black, Int<16000>>, Int<400>>>>;`,
    description: 'A blade made of television snow: every LED flickers on its own, with darker patches drifting through the noise.',
  },
  {
    id: 'hw_resonance', name: 'Resonance', roles: ['main', 'side'], alias: 'HwResonance', usesFx: true, kb: 0.8, preview: '#0000ff', preview2: '#000050',
    define: `using HwResonance = HwFx<Layers<Mix<Int<3500>, Black, ${BASE}>,
  AlphaL<${BASE}, Bump<Int<16384>, Scale<NoisySoundLevel, Int<6000>, Int<60000>>>>>>;`,
    description: 'A dim blade with a bright body in the middle that stretches toward both ends with the loudness of the saber.',
  },
  {
    id: 'hw_comet', name: 'Tip comet', roles: ['main', 'side'], alias: 'HwComet', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwComet = HwFx<Layers<${BASE},
  AlphaL<RgbArg<SWING_COLOR_ARG, Rgb<255,255,255>>, SmoothStep<Scale<SwingSpeed<500>, Int<36000>, Int<12000>>, Int<9000>>>>>;`,
    description: 'Calm at rest. In a swing the tip lights in the swing colour and the glow runs down the blade the faster you go.',
  },
  {
    id: 'hw_weave', name: 'Interference', roles: ['main', 'side'], alias: 'HwWeave', usesFx: true, kb: 1.3, preview: '#0000ff', preview2: '#00ffff',
    define: `using HwWeave = HwFx<Layers<StripesX<Int<7000>, Int<-1500>, ${BASE}, Mix<Int<8000>, Black, ${BASE}>>,
  AlphaL<StripesX<Int<9000>, Int<1900>, ${ALT(0, 255, 255)}, ${BASE}>, Int<14000>>>>;`,
    description: 'Two sets of bands running in opposite directions through each other, so bright knots form, slide and dissolve.',
  },
  {
    id: 'hw_sparktip', name: 'Spark ignition', roles: ['main', 'side'], alias: 'HwSparkTip', usesFx: true, kb: 1.5, preview: '#0000ff', preview2: '#ffffff',
    define: `using HwSparkTip = HwFxTr<${BASE},
  TrWipeSparkTipX<RgbArg<IGNITION_COLOR_ARG, Rgb<255,255,255>>, IgnitionTime<300>>,
  TrWipeInSparkTipX<RgbArg<RETRACTION_COLOR_ARG, Rgb<255,255,255>>, RetractionTime<500>>>;`,
    description: 'A steady blade that ignites behind a bright spark racing to the tip, and retracts behind one racing home. Each spark has its own colour.',
  },
  {
    id: 'hw_unfold', name: 'Unfold', roles: ['main', 'side'], alias: 'HwUnfold', usesFx: true, kb: 1.3, preview: '#0000ff',
    define: `using HwUnfold = HwFxTr<${BASE}, TrCenterWipeX<IgnitionTime<300>>, TrCenterWipeInX<RetractionTime<500>>>;`,
    description: 'A steady blade that opens from the middle toward both ends, and closes from both ends back to the middle.',
  },
  {
    id: 'hw_liquid', name: 'Liquid', roles: ['main', 'side'], alias: 'HwLiquid', usesFx: true, kb: 1.0, preview: '#0000ff', preview2: '#00ffc8',
    define: `using HwLiquid = HwFx<Mix<BladeAngle<9000, 23768>,
  Mix<SmoothStep<Int<18000>, Int<5000>>, ${BASE}, ${ALT(0, 255, 200)}>,
  Mix<SmoothStep<Int<14700>, Int<-5000>>, ${BASE}, ${ALT(0, 255, 200)}>>>;`,
    description: 'The blade is half full of the second colour, and it runs to whichever end is lower: into the tip when you point down, back to the hilt when you raise it, spread thin when level.',
  },
  {
    id: 'hw_gravity', name: 'Downhill', roles: ['main', 'side'], alias: 'HwGravity', usesFx: true, kb: 1.0, preview: '#0000ff', preview2: '#00a0ff',
    define: `using HwGravity = HwFx<StripesX<Int<6000>, Scale<BladeAngle<>, Int<-1200>, Int<1200>>,
  ${BASE}, Mix<Int<11000>, Black, ${BASE}>, ${ALT(0, 160, 255)}>>;`,
    description: 'Bands that always run downhill: toward the tip when the blade points down, toward the hilt when it points up, faster the steeper it is, and still when level.',
  },
  {
    id: 'hw_twist', name: 'Twist dial', roles: ['main', 'side'], alias: 'HwTwist', usesFx: true, kb: 0.7, preview: '#0000ff', preview2: '#ff00c8',
    define: `using HwTwist = HwFx<Mix<TwistAngle<>, ${BASE}, ${ALT(255, 0, 200)}>>;`,
    description: 'Roll your wrist to dial between two colours: the base colour with the hilt flat, the second colour a quarter turn either way.',
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
    id: 'hw_heartbeat', name: 'Heartbeat', roles: ['crystal', 'accent'], alias: 'HwHeartbeat', usesFx: false, kb: 2.0, preview: '#ff0000', preview2: '#200000',
    define: `using HwHeartbeat = Layers<Mix<Int<4000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>,
  TransitionLoopL<TrConcat<TrFade<70>, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>, TrFade<170>, Mix<Int<4000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>,
    TrFade<70>, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>, TrFade<300>, Mix<Int<4000>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>, TrDelay<650>>>,
  InOutTrL<TrFadeX<IgnitionTime<300>>, TrFadeX<RetractionTime<500>>, Pulsing<Mix<Int<2500>, Black, RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>, Black, 4000>>>;`,
    description: 'Two quick beats and a rest, about fifty a minute, over a faint glow. At rest it slows to a dim, sleepy pulse.',
  },
  {
    id: 'hw_scanner', name: 'Scanner', roles: ['accent', 'side'], alias: 'HwScanner', usesFx: false, kb: 0.7, preview: '#ff0000',
    define: `using HwScanner = Layers<Black,
  AlphaL<RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>, Bump<Sin<Int<32>>, Int<11000>>>,
  InOutTrL<TrInstant, TrInstant>>;`,
    description: 'A single soft eye sweeping from end to end and back while the saber is on. Made for accent strips.',
  },
  {
    id: 'hw_meter', name: 'Sound meter', roles: ['accent', 'side'], alias: 'HwMeter', usesFx: false, kb: 0.7, preview: '#00ff00', preview2: '#ff0000',
    define: `using HwMeter = Layers<Black,
  AlphaL<Gradient<RgbArg<BASE_COLOR_ARG, Rgb<0,255,0>>, RgbArg<BASE_COLOR_ARG, Rgb<0,255,0>>, ${ALT(255, 0, 0)}>,
    SmoothStep<Scale<NoisySoundLevel, Int<1000>, Int<36000>>, Int<-3000>>>,
  InOutTrL<TrInstant, TrInstant>>;`,
    description: 'A level meter for an accent strip: it fills from one end with the loudness of the saber, turning to the second colour at the top.',
  },
  {
    id: 'hw_motor', name: 'Motor on while ignited', roles: ['motor'], alias: 'HwMotor', usesFx: false, preview: '#ffffff',
    define: `using HwMotor = Layers<White,
  InOutTrL<TrInstant, TrInstant>>;`,
    description: 'Runs the motor at full power while the blade is on. No colours.',
  },
];
