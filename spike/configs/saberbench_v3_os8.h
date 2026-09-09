/*
SaberBench spike: OS8-native baseline config for Proffieboard V3.
Hardware (same as the stock OS6 example): two buttons, 136 px main blade on LED2/3 + data1,
6 px accent/crystal strip on LED4 + data2.
Styles below were generated with Fett263's ProffieOS7/8 Style Library (public access, OS7.15 v3.44p)
on 2026-09-07 and are reproduced with their copyright headers intact, as the library's GPL notice requires.
Presets 4 and 5 reuse compiled styles with different argument strings, which costs no extra flash.
*/

#ifdef CONFIG_TOP
#include "proffieboard_v3_config.h"
#define NUM_BLADES 2
#define NUM_BUTTONS 2
#define VOLUME 1800
const unsigned int maxLedsPerStrip = 144;
#define CLASH_THRESHOLD_G 4.5
#define ENABLE_AUDIO
#define ENABLE_MOTION
#define ENABLE_WS2811
#define ENABLE_SD
#define SAVE_STATE
#define MOUNT_SD_SETTING
#define COLOR_CHANGE_DIRECT
#define DISABLE_DIAGNOSTIC_COMMANDS
#define DISABLE_BASIC_PARSER_STYLES
#define NO_REPEAT_RANDOM
#define EXTRA_COLOR_BUFFER_SPACE 60
#define FETT263_EDIT_MODE_MENU
#define ENABLE_ALL_EDIT_OPTIONS
#define KEEP_SAVEFILES_WHEN_PROGRAMMING
#define FETT263_SPECIAL_ABILITIES
#define FETT263_THRUST_ON
#define FETT263_SWING_ON
#define FETT263_SWING_ON_SPEED 300
#define FETT263_TWIST_OFF
#define FETT263_TWIST_ON
#define MOTION_TIMEOUT 60 * 15 * 1000
#define IDLE_OFF_TIME 5 * 60 * 1000
#define FETT263_CLASH_STRENGTH_SOUND
#define FETT263_DUAL_MODE_SOUND
#define FETT263_MAX_CLASH 16
#define FETT263_BM_CLASH_DETECT 7
#define FETT263_SAY_BATTERY_PERCENT
#define FETT263_SAY_COLOR_LIST
#define FETT263_SAY_COLOR_LIST_CC
#endif

#ifdef CONFIG_PROP
#include "../props/saber_fett263_buttons.h"
#endif

#ifdef CONFIG_STYLES
/* copyright Fett263 Ahsoka Tano (Primary Blade) OS7 Style
https://www.fett263.com/fett263-proffieOS7-style-library.html#Ahsoka Tano
OS7.15 v3.44p
Single Style
Base Style: Ahsoka Tano

Base Color: BaseColorArg (0)

--Effects Included--
Ignition Effect: Standard Ignition [Color: IgnitionColorArg]
Retraction Effect: Standard Retraction [Color: RetractionColorArg]
Lockup Effect:
0: mainLockMulti0Shape - Begin: Real Clash - Style: Intensity AudioFlicker - End: Full Blade Absorb
 [Color: LockupColorArg]
Lightning Block Effect:
0: mainLBMulti0Shape - Begin: Responsive Impact - Style: Strobing AudioFlicker - End: Full Blade Absorb
 [Color: LBColorArg]
Drag Effect:
0: mainDragMulti0Shape - Begin: Wipe In - Style: Intensity Sparking Drag - End: Wipe Out
 [Color: DragColorArg]
Melt Effect:
0: mainMeltMulti0Shape - Begin: Wipe In - Style: Intensity Melt - End: Wipe Out
 [Color: StabColorArg]
Blast Effect: Blast Wave (Random) [Color: BlastColorArg]
Clash Effect: Real Clash V1 [Color: ClashColorArg]
 */
using AhsokaMain = Layers<AudioFlicker<Stripes<22000,-1400,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,Mix<Int<10000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,Mix<Int<18000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>,TransitionEffectL<TrWaveX<RgbArg<BLAST_COLOR_ARG,Rgb<255,255,255>>,Scale<EffectRandomF<EFFECT_BLAST>,Int<100>,Int<400>>,Int<100>,Scale<EffectPosition<EFFECT_BLAST>,Int<100>,Int<400>>,Scale<EffectPosition<EFFECT_BLAST>,Int<28000>,Int<8000>>>,EFFECT_BLAST>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,TransitionEffectL<TrConcat<TrInstant,AlphaL<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<12000>,Int<60000>>>>,TrFadeX<Scale<ClashImpactF<>,Int<200>,Int<400>>>>,EFFECT_CLASH>,TransitionEffectL<TrWaveX<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Int<100>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>>,EFFECT_CLASH>>,LockupTrL<TransitionEffect<AlphaL<AlphaMixL<Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>,AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,BrownNoiseFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>,300>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>>,AlphaL<AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<20000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<18000>>>>,TrExtend<5000,TrInstant>,TrFade<5000>,EFFECT_LOCKUP_BEGIN>,TrConcat<TrJoin<TrDelay<50>,TrInstant>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,AlphaL<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<20000>,Int<60000>>>>>,TrFade<300>>,TrConcat<TrInstant,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,SaberBase::LOCKUP_NORMAL,Int<1>>,ResponsiveLightningBlockL<Strobe<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,AudioFlicker<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Blue>,50,1>,TrConcat<TrExtend<200,TrInstant>,AlphaL<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Int<10000>,Int<21000>>,Int<10000>>>,TrFade<200>>,TrConcat<TrInstant,RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,Int<1>>,LockupTrL<AlphaL<TransitionEffect<RandomPerLEDFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>>,BrownNoiseFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>,Int<300>>,TrExtend<4000,TrInstant>,TrFade<4000>,EFFECT_DRAG_BEGIN>,SmoothStep<Scale<TwistAngle<>,IntArg<DRAG_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_DRAG,Int<1>>,LockupTrL<AlphaL<Stripes<2000,4000,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,Mix<Sin<Int<50>>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,Mix<Int<4096>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrConcat<TrExtend<4000,TrWipeIn<200>>,AlphaL<HumpFlicker<Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,RotateColorsX<Int<3000>,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,100>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrFade<4000>>,TrWipe<200>,SaberBase::LOCKUP_MELT,Int<1>>,InOutTrL<TrWipeX<BendTimePowInvX<IgnitionTime<300>,Mult<IntArg<IGNITION_OPTION2_ARG,10992>,Int<98304>>>>,TrWipeInX<BendTimePowX<RetractionTime<0>,Mult<IntArg<RETRACTION_OPTION2_ARG,10992>,Int<98304>>>>,Black>>;

/* copyright Fett263 CustomBlade (Primary Blade) OS7 Style
https://www.fett263.com/fett263-proffieOS7-style-library.html#CustomBlade
OS7.15 v3.44p
Single Style
Multi Phase (Special Abilities*) Transition: Power Burst, Time: 500

Default: Hyper Responsive Rotoscope (Original Trilogy) [BaseColorArg]
1: Hyper Responsive Rotoscope (Original Trilogy) [AltColorArg]

Multi Phase Control: use Special Abilities controls to change Phase. Requires Alt Font.

NOTE:This style includes Control Layer.  Only one Control Layer should be used per preset.

*This style REQUIRES Alt Fonts alt000/ to alt001/ to be set up. Uses altchng.wav on change.
See https://pod.hubbe.net/sound/alt_sounds.html for more information.
--Effects Included--
Ignition Effect: Standard Ignition [Color: IgnitionColorArg]
Retraction Effect: Standard Retraction [Color: RetractionColorArg]
Lockup Effect:
0: mainLockMulti0Shape - Begin: Real Clash - Style: Intensity AudioFlicker - End: Full Blade Absorb
 [Color: LockupColorArg]
Lightning Block Effect:
0: mainLBMulti0Shape - Begin: Responsive Impact - Style: Strobing AudioFlicker - End: Full Blade Absorb
1: Force Lightning - Begin: Responsive Impact - Style: Strobing AudioFlicker - End: Full Blade Absorb
 [Color: LBColorArg]
Drag Effect:
0: mainDragMulti0Shape - Begin: Wipe In - Style: Intensity Sparking Drag - End: Wipe Out
 [Color: DragColorArg]
Melt Effect:
0: mainMeltMulti0Shape - Begin: Wipe In - Style: Intensity Melt - End: Wipe Out
 [Color: StabColorArg]
Blast Effect: Blast Wave (Random) [Color: BlastColorArg]
Clash Effect: Real Clash V1 [Color: ClashColorArg]
Special Ability 1: Next Phase

 */
using DualityMain = Layers<Black,ColorSelect<AltF,TrSelect<Ifon<Int<1>,Int<0>>,TrInstant,TrConcat<TrExtend<200,TrWipeX<Int<250>>>,RgbArg<SWING_COLOR_ARG,Rgb<255,255,255>>,TrFadeX<Int<250>>>>,Mix<HoldPeakF<SwingSpeed<250>,Scale<SwingAcceleration<100>,Int<50>,Int<500>>,Scale<SwingAcceleration<>,Int<20000>,Int<10000>>>,RandomFlicker<StripesX<Int<15000>,Scale<HoldPeakF<SwingSpeed<200>,Scale<SwingAcceleration<100>,Int<50>,Int<300>>,Scale<SwingAcceleration<100>,Int<24000>,Int<16000>>>,Int<-3200>,Int<-200>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,Mix<Int<7710>,Black,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,Mix<Int<19276>,Black,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<HoldPeakF<SwingSpeed<250>,Scale<SwingAcceleration<100>,Int<50>,Int<500>>,Scale<SwingAcceleration<>,Int<20000>,Int<10000>>>,RandomFlicker<StripesX<Int<15000>,Scale<HoldPeakF<SwingSpeed<200>,Scale<SwingAcceleration<100>,Int<50>,Int<300>>,Scale<SwingAcceleration<100>,Int<24000>,Int<16000>>>,Int<-3200>,Int<-200>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,Mix<Int<7710>,Black,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,Mix<Int<19276>,Black,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,TransitionEffectL<TrDoEffectAlwaysX<TrInstant,EFFECT_ALT_SOUND,ModF<Sum<AltF,Int<1>>,Int<2>>,Int<-1>>,EFFECT_USER1>,TransitionEffectL<TrWaveX<RgbArg<BLAST_COLOR_ARG,Rgb<255,255,255>>,Scale<EffectRandomF<EFFECT_BLAST>,Int<100>,Int<400>>,Int<100>,Scale<EffectPosition<EFFECT_BLAST>,Int<100>,Int<400>>,Scale<EffectPosition<EFFECT_BLAST>,Int<28000>,Int<8000>>>,EFFECT_BLAST>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,TransitionEffectL<TrConcat<TrInstant,AlphaL<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<12000>,Int<60000>>>>,TrFadeX<Scale<ClashImpactF<>,Int<200>,Int<400>>>>,EFFECT_CLASH>,TransitionEffectL<TrWaveX<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Int<100>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>>,EFFECT_CLASH>>,LockupTrL<TransitionEffect<AlphaL<AlphaMixL<Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>,AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,BrownNoiseFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>,300>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>>,AlphaL<AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<20000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<18000>>>>,TrExtend<5000,TrInstant>,TrFade<5000>,EFFECT_LOCKUP_BEGIN>,TrConcat<TrJoin<TrDelay<50>,TrInstant>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,AlphaL<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<20000>,Int<60000>>>>>,TrFade<300>>,TrConcat<TrInstant,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,SaberBase::LOCKUP_NORMAL,Int<1>>,ColorSelect<AltF,TrInstant,ResponsiveLightningBlockL<Strobe<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,AudioFlicker<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Blue>,50,1>,TrConcat<TrExtend<200,TrInstant>,AlphaL<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Int<10000>,Int<21000>>,Int<10000>>>,TrFade<200>>,TrConcat<TrInstant,RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,Int<1>>,LockupTrL<Stripes<3000,-2000,RandomBlink<30000,Strobe<Rgb<125,125,225>,Strobe<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,AudioFlicker<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Blue>,50,1>,50,1>,Strobe<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,AudioFlicker<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Blue>,50,1>>>,TrWipe<200>,TrWipe<200>,SaberBase::LOCKUP_LIGHTNING_BLOCK,Int<1>>>,LockupTrL<AlphaL<TransitionEffect<RandomPerLEDFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>>,BrownNoiseFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>,Int<300>>,TrExtend<4000,TrInstant>,TrFade<4000>,EFFECT_DRAG_BEGIN>,SmoothStep<Scale<TwistAngle<>,IntArg<DRAG_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_DRAG,Int<1>>,LockupTrL<AlphaL<Stripes<2000,4000,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,Mix<Sin<Int<50>>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,Mix<Int<4096>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrConcat<TrExtend<4000,TrWipeIn<200>>,AlphaL<HumpFlicker<Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,RotateColorsX<Int<3000>,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,100>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrFade<4000>>,TrWipe<200>,SaberBase::LOCKUP_MELT,Int<1>>,InOutTrL<TrWipeX<BendTimePowInvX<IgnitionTime<300>,Mult<IntArg<IGNITION_OPTION2_ARG,10992>,Int<98304>>>>,TrWipeInX<BendTimePowX<RetractionTime<0>,Mult<IntArg<RETRACTION_OPTION2_ARG,10992>,Int<98304>>>>,Black>>;

/* copyright Fett263 CustomBlade (Primary Blade) OS7 Style
https://www.fett263.com/fett263-proffieOS7-style-library.html#CustomBlade
OS7.15 v3.44p
Single Style
Multi Phase (Special Abilities*) Transition: Wipe, Time: 500

Default: Master Sol [BaseColorArg]
1: Osha (Dark Side) [AltColorArg]

Multi Phase Control: use Special Abilities controls to change Phase. Requires Alt Font.

NOTE:This style includes Control Layer.  Only one Control Layer should be used per preset.

*This style REQUIRES Alt Fonts alt000/ to alt001/ to be set up. Uses altchng.wav on change.
See https://pod.hubbe.net/sound/alt_sounds.html for more information.
--Effects Included--
Ignition Effect: Standard Ignition [Color: IgnitionColorArg]
Retraction Effect: Standard Retraction [Color: RetractionColorArg]
Lockup Effect:
0: mainLockMulti0Shape - Begin: Real Clash - Style: Intensity AudioFlicker - End: Full Blade Absorb
 [Color: LockupColorArg]
Lightning Block Effect:
0: mainLBMulti0Shape - Begin: Responsive Impact - Style: Strobing AudioFlicker - End: Full Blade Absorb
 [Color: LBColorArg]
Drag Effect:
0: mainDragMulti0Shape - Begin: Wipe In - Style: Intensity Sparking Drag - End: Wipe Out
 [Color: DragColorArg]
Melt Effect:
0: mainMeltMulti0Shape - Begin: Wipe In - Style: Intensity Melt - End: Wipe Out
 [Color: StabColorArg]
Blast Effect: Blast Wave (Random) [Color: BlastColorArg]
Clash Effect: Real Clash V1 [Color: ClashColorArg]
Special Ability 1: Change Phase (Corruption: Rotoscope - Time: 10000 ms) Uses tr00.wav or  or tr/000/000.wav (blade corruption sound)
Special Ability 2: Next Phase
Special Ability 5: Ignite + Change Phase (Corruption: Rotoscope - Delay: 1000 ms - Time: 10000 ms) Uses tr01.wav or  or tr/001/000.wav (blade corruption sound)

 */
using OshaCorruptionMain = Layers<Black,ColorSelect<AltF,TrSelect<Ifon<Int<1>,Int<0>>,TrInstant,TrWipeX<Int<500>>>,AudioFlicker<Stripes<22000,-1400,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,Mix<Int<10000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,Mix<Int<18000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,AudioFlicker<Stripes<25000,-1500,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,Mix<Int<10640>,Black,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,Mix<Int<18460>,Black,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,TransitionEffectL<TrConcat<TrExtend<12000,TrDoEffectAlwaysX<TrDelay<10>,EFFECT_TRANSITION_SOUND,Int<0>>>,AlphaL<White,Int<0>>,TrDoEffectAlwaysX<TrInstant,EFFECT_ALT_SOUND,ModF<Sum<AltF,Int<1>>,Int<2>>,Int<-1>>>,EFFECT_USER1>,TransitionEffectL<TrDoEffectAlwaysX<TrInstant,EFFECT_ALT_SOUND,ModF<Sum<AltF,Int<1>>,Int<2>>,Int<-1>>,EFFECT_USER2>,TransitionEffectL<TrWaveX<RgbArg<BLAST_COLOR_ARG,Rgb<255,255,255>>,Scale<EffectRandomF<EFFECT_BLAST>,Int<100>,Int<400>>,Int<100>,Scale<EffectPosition<EFFECT_BLAST>,Int<100>,Int<400>>,Scale<EffectPosition<EFFECT_BLAST>,Int<28000>,Int<8000>>>,EFFECT_BLAST>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,TransitionEffectL<TrConcat<TrInstant,AlphaL<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<12000>,Int<60000>>>>,TrFadeX<Scale<ClashImpactF<>,Int<200>,Int<400>>>>,EFFECT_CLASH>,TransitionEffectL<TrWaveX<RgbArg<CLASH_COLOR_ARG,Rgb<255,255,255>>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Int<100>,Scale<ClashImpactF<>,Int<100>,Int<400>>,Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>>,EFFECT_CLASH>>,LockupTrL<TransitionEffect<AlphaL<AlphaMixL<Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>,AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,BrownNoiseFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<12000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>,300>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<22000>>>>,AlphaL<AudioFlicker<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Mix<Int<20000>,Black,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<SwingSpeed<100>,Int<14000>,Int<18000>>>>,TrExtend<5000,TrInstant>,TrFade<5000>,EFFECT_LOCKUP_BEGIN>,TrConcat<TrJoin<TrDelay<50>,TrInstant>,Mix<IsLessThan<ClashImpactF<>,Int<26000>>,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,AlphaL<RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Scale<BladeAngle<0,16000>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-12000>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<10000>>>,Sum<IntArg<LOCKUP_POSITION_ARG,16000>,Int<-10000>>>,Scale<ClashImpactF<>,Int<20000>,Int<60000>>>>>,TrFade<300>>,TrConcat<TrInstant,RgbArg<LOCKUP_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,SaberBase::LOCKUP_NORMAL,Int<1>>,ResponsiveLightningBlockL<Strobe<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,AudioFlicker<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Blue>,50,1>,TrConcat<TrExtend<200,TrInstant>,AlphaL<RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,Bump<Scale<BladeAngle<>,Int<10000>,Int<21000>>,Int<10000>>>,TrFade<200>>,TrConcat<TrInstant,RgbArg<LB_COLOR_ARG,Rgb<255,255,255>>,TrFade<400>>,Int<1>>,LockupTrL<AlphaL<TransitionEffect<RandomPerLEDFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>>,BrownNoiseFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>,Int<300>>,TrExtend<4000,TrInstant>,TrFade<4000>,EFFECT_DRAG_BEGIN>,SmoothStep<Scale<TwistAngle<>,IntArg<DRAG_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_DRAG,Int<1>>,LockupTrL<AlphaL<Stripes<2000,4000,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,Mix<Sin<Int<50>>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,Mix<Int<4096>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrConcat<TrExtend<4000,TrWipeIn<200>>,AlphaL<HumpFlicker<Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,RotateColorsX<Int<3000>,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,100>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,28000>,Int<30000>>,Int<3000>>>,TrFade<4000>>,TrWipe<200>,SaberBase::LOCKUP_MELT,Int<1>>,TransitionEffectL<TrConcat<TrDelay<10>,Black,TrExtendX<Int<1000>,TrWipeX<Int<300>>>,AlphaL<White,Int<0>>,TrExtend<8500,TrInstant>,AlphaL<RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,SmoothStep<Scale<SlowNoise<Int<2000>>,Scale<Percentage<Subtract<TimeSinceEffect<EFFECT_USER5>,Sum<Int<300>,Int<1000>>>,327>,Int<0>,Int<28000>>,Scale<Percentage<Subtract<TimeSinceEffect<EFFECT_USER5>,Sum<Int<300>,Int<1000>,Int<10>>>,327>,Int<2000>,Int<31000>>>,Int<-2000>>>,TrExtend<2500,TrWipe<1000>>,AlphaL<RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,SmoothStep<Scale<SlowNoise<Int<3000>>,Int<27000>,Int<31000>>,Int<-2000>>>,TrInstant,RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,TrExtend<1000,TrInstant>,RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,TrFade<1000>>,EFFECT_USER5>,InOutTrL<TrWipeX<BendTimePowInvX<IgnitionTime<300>,Mult<IntArg<IGNITION_OPTION2_ARG,10992>,Int<98304>>>>,TrWipeInX<BendTimePowX<RetractionTime<0>,Mult<IntArg<RETRACTION_OPTION2_ARG,10992>,Int<98304>>>>,Black>,TransitionEffectL<TrConcat<TrExtend<8500,TrInstant>,AlphaL<RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,SmoothStep<Scale<SlowNoise<Int<2000>>,Scale<Percentage<TimeSinceEffect<EFFECT_USER1>,327>,Int<0>,Int<28000>>,Scale<Percentage<TimeSinceEffect<EFFECT_USER1>,327>,Int<2000>,Int<31000>>>,Int<-2000>>>,TrExtend<2500,TrWipe<1000>>,AlphaL<RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,SmoothStep<Scale<SlowNoise<Int<3000>>,Int<27000>,Int<31000>>,Int<-2000>>>,TrInstant,RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>>,ColorSelect<AltF,TrInstant,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>>>,TrExtend<1000,TrInstant>,RandomFlicker<Stripes<24000,-1400,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,Mix<Int<11565>,Black,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>,Mix<Int<16448>,Black,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>>,ColorSelect<AltF,TrInstant,RgbArg<BASE_COLOR_ARG,Rgb<0,0,255>>,RgbArg<ALT_COLOR_ARG,Rgb<255,0,0>>>>,TrFade<1000>>,EFFECT_USER1>,TransitionEffectL<TrConcat<TrDoEffectAlwaysX<TrInstant,EFFECT_FAST_ON,Int<-1>,Int<-1>>,AlphaL<White,Int<0>>,TrDelayX<Sum<Int<300>,Int<1000>>>,AlphaL<White,Int<0>>,TrExtend<12000,TrDoEffectAlwaysX<TrInstant,EFFECT_TRANSITION_SOUND,Int<1>>>,AlphaL<White,Int<0>>,TrDoEffectAlwaysX<TrInstant,EFFECT_ALT_SOUND,ModF<Sum<AltF,Int<1>>,Int<2>>,Int<-1>>>,EFFECT_USER5>>;

/* copyright Fett263 Ahsoka Tano (Crystal Chamber) OS7 Style
https://www.fett263.com/fett263-proffieOS7-style-library.html#Ahsoka Tano
OS7.15 v3.44p
Single Style
Base Style: Ahsoka Tano

Off Behavior: Off [Color: OffColorArg]

Base Color: BaseColorArg (0)

--Effects Included--
Ignition Effect: Instant [Color: IgnitionColorArg]
Retraction Effect: Instant [Color: RetractionColorArg]
Lockup Effect: NoneLightning Block Effect: NoneDrag Effect:
0: crystalDragMulti0Shape - Begin: Wipe In - Style: Intensity Sparking Drag - End: Wipe Out
 [Color: DragColorArg]
Melt Effect:
0: crystalMeltMulti0Shape - Begin: Wipe In - Style: Intensity Melt - End: Wipe Out
 [Color: StabColorArg]
 */
using AhsokaCrystal = Layers<AudioFlicker<Stripes<22000,-1400,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,Mix<Int<10000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>,Mix<Int<18000>,Black,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>>,RgbArg<BASE_COLOR_ARG,Rgb<100,100,150>>>,LockupTrL<AlphaL<TransitionEffect<RandomPerLEDFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>>,BrownNoiseFlickerL<RgbArg<DRAG_COLOR_ARG,Rgb<255,255,255>>,Int<300>>,TrExtend<4000,TrInstant>,TrFade<4000>,EFFECT_DRAG_BEGIN>,SmoothStep<Scale<TwistAngle<>,IntArg<DRAG_SIZE_ARG,31000>,Int<30000>>,Int<3000>>>,TrWipeIn<200>,TrWipe<200>,SaberBase::LOCKUP_DRAG,Int<1>>,LockupTrL<AlphaL<Stripes<2000,4000,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,Mix<Sin<Int<50>>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,Mix<Int<4096>,Black,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,26000>,Int<30000>>,Int<3000>>>,TrConcat<TrExtend<4000,TrWipeIn<200>>,AlphaL<HumpFlicker<Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>,RotateColorsX<Int<3000>,Mix<TwistAngle<>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>,RotateColorsX<Int<3000>,RgbArg<STAB_COLOR_ARG,Rgb<255,68,0>>>>>,100>,SmoothStep<Scale<TwistAngle<>,IntArg<MELT_SIZE_ARG,26000>,Int<30000>>,Int<3000>>>,TrFade<4000>>,TrWipe<200>,SaberBase::LOCKUP_MELT,Int<1>>,InOutTrL<TrInstant,TrInstant,Black>>;
#endif

#ifdef CONFIG_PRESETS
Preset presets[] = {
  { "Ahsoka;common", "Ahsoka/tracks/AhsokaTheme.wav",
    StylePtr<AhsokaMain>(),
    StylePtr<AhsokaCrystal>(),
    "ahsoka" },
  { "Duality;common", "Duality/tracks/Duality.wav",
    StylePtr<DualityMain>(),
    StylePtr<AhsokaCrystal>(),
    "duality" },
  { "Osha;common", "Osha/tracks/Osha.wav",
    StylePtr<OshaCorruptionMain>(),
    StylePtr<AhsokaCrystal>(),
    "osha" },
  // Same compiled styles, different colours via argument strings: no additional flash.
  { "Ahsoka;common", "Ahsoka/tracks/AhsokaTheme.wav",
    StylePtr<AhsokaMain>("0,65535,0"),
    StylePtr<AhsokaCrystal>("0,65535,0"),
    "ahsoka green" },
  { "Duality;common", "Duality/tracks/Duality.wav",
    StylePtr<DualityMain>("65535,0,65535 0,65535,65535"),
    StylePtr<AhsokaCrystal>("65535,0,65535"),
    "duality magenta" },
};

BladeConfig blades[] = {
  { 0, WS281XBladePtr<136, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3> >(),
    WS281XBladePtr<6, blade2Pin, Color8::GRB, PowerPINS<bladePowerPin4> >()
  , CONFIGARRAY(presets) },
};
#endif

#ifdef CONFIG_BUTTONS
Button PowerButton(BUTTON_POWER, powerButtonPin, "pow");
Button AuxButton(BUTTON_AUX, auxPin, "aux");
#endif
