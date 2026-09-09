# 01 · ProffieOS recon: what we are actually managing

Date: 2026-09-07. Sources are cited inline. Anything not verified against a primary source is marked **(unverified)**.

## 1. The shape of ProffieOS

ProffieOS is a single Arduino sketch (`ProffieOS.ino`) plus a tree of C++ headers. It is GPL-3.0 (`LICENCE.txt`). There is no "firmware + settings file" split the way CFX or Xenopixel users expect. The user's entire saber definition is a **C++ header** that gets compiled into the firmware image.

Top-level repo directories: `blades, buttons, common, config, display, doc, fontconvert, functions, ir, modes, motion, mtp, pov_tools, pqoi, props, scripts, sound, styles, transitions`.
Source: https://github.com/profezzorn/ProffieOS

`ProffieOS.ino` selects the config with one line, and exactly one must be uncommented:

```c
#define CONFIG_FILE "config/mysaber_config.h"
```

The config header is then `#include`d **seven times**, each time with a different section macro defined. Order from `ProffieOS.ino`:

1. `CONFIG_TOP`
2. `CONFIG_STYLES`
3. `CONFIG_PRESETS`
4. `CONFIG_PROP`
5. `CONFIG_BUTTONS`
6. `PROP_BOTTOM`
7. `CONFIG_BOTTOM`

Source: https://raw.githubusercontent.com/profezzorn/ProffieOS/master/ProffieOS.ino

The version string is a git `$Id$` in the sketch. The `version` serial command prints it at runtime.

## 2. Anatomy of a config file

| Section | What lives there | Compile-time or runtime? |
|---|---|---|
| `CONFIG_TOP` | `#include "proffieboard_v3_config.h"`, `NUM_BLADES`, `NUM_BUTTONS`, `VOLUME`, `CLASH_THRESHOLD_G`, `ENABLE_AUDIO/MOTION/WS2811/SD`, `SAVE_STATE`, `ENABLE_ALL_EDIT_OPTIONS`, `DISABLE_DIAGNOSTIC_COMMANDS`, OLED/BLE/Blade-ID defines, OS8 `MENU_SPEC_TEMPLATE`, `MOUNT_SD_SETTING`, `FONT_PATTERN` | Compile-time |
| `CONFIG_STYLES` | Named style aliases: `using BatteryLevelStyle = InOutHelperX<Gradient<...>,BatteryLevel>;` (OS7+) | Compile-time |
| `CONFIG_PRESETS` | `Preset presets[] = {...}` and `BladeConfig blades[] = {...}` | Compile-time defaults; **overridable at runtime** (see §4) |
| `CONFIG_PROP` | `#include "../props/saber_fett263_buttons.h"` — selects the button/gesture behaviour | Compile-time |
| `CONFIG_BUTTONS` | `Button PowerButton(BUTTON_POWER, powerButtonPin, "pow");` | Compile-time |
| `CONFIG_BOTTOM` | Rarely used | Compile-time |

Sources: https://pod.hubbe.net/config/the-config_presets-section.html , https://pod.hubbe.net/config/the-config_styles-section.html , https://pod.hubbe.net/config/preset-configuration.html

### Preset

A preset is exactly four things: `{"fontdir", "tracks/track.wav", <one StylePtr per blade>, "Name"}`.

```c
Preset presets[] = {
  { "TeensySF", "tracks/venus.wav",
    StylePtr<InOutHelper<EasyBlade<OnSpark<Green>, White>, 300, 800>>(),
    StylePtr<Blinking<Red, Rgb<0,0,0>, 100, 100>>(),
    "green" },
};
```

- Font dir supports fallback chains: `"fontdir;common"` searches `fontdir` first, then `common`.
- Track may be `""`.
- One style per blade; if `NUM_BLADES` is 2 there must be 2 styles per preset.
- Name is technically optional but the OLED and Workbench use it.

### BladeConfig

```c
BladeConfig blades[] = {
  { 0,     WS281XBladePtr<132, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3>>(), CONFIGARRAY(presets) },
  { 33000, SubBlade(0, 15, WS281XBladePtr<...>()), CONFIGARRAY(presets_crystal) },
};
```

The first number is the **Blade ID resistance**; ProffieOS measures the resistor in the blade to pick which `BladeConfig` row (and therefore which preset array and LED count) to use. LED count, pin, colour order, power pins and SubBlade splits are **template parameters, i.e. compile-time**.

## 3. The blade style language

Styles are nested C++ templates. A style is a *type*, instantiated with `StylePtr<...>()`.

```c
StylePtr<Layers<
  AudioFlicker<Blue, DodgerBlue>,
  TransitionEffectL<TrConcat<TrInstant, White, TrFade<300>>, EFFECT_CLASH>,
  LockupTrL<AudioFlicker<White, Blue>, TrInstant, TrFade<200>, SaberBase::LOCKUP_NORMAL>,
  InOutTrL<TrWipe<300>, TrWipeIn<500>>
>>()
```

Key families: `Layers<>`, `InOutHelper<>`/`InOutTrL<>`, `TransitionEffectL<>`, `LockupTrL<>`, `Blinking<>`, `Gradient<>`, `Rgb<r,g,b>`/`Rgb16<>`, `Mix<>`, transitions `TrFade/TrWipe/TrConcat/...`, functions (`BladeAngle`, `SwingSpeed`, `BatteryLevel`, `Int<>`, OS8 `ReadPinF`, `BlasterModeF`, ...). OS8 added `DisplayStyle`, `Pixelate`, `HardStripes`, `TransitionLoopWhile`.

Source: https://crucible.hubbe.net/t/proffieos-8-is-now-live/7698 , https://github.com/profezzorn/ProffieOS/tree/master/styles

### Style arguments (the escape hatch)

`RgbArg<N, DEFAULT>` and `IntArg<N, DEFAULT>` make parts of a style editable at runtime. Argument numbers are a convention shared by Edit Mode, the Workbench and Fett263's library: `BASE_COLOR_ARG = 1` … `RETRACTION_OPTION2_ARG = 38`. A preset supplies argument values as a string after the style:

```c
StylePtr<Layers<RgbArg<BASE_COLOR_ARG, Blue>, ...>>("65535,0,0")
```

Values are Rgb16 (0–65535 per channel). Fredrik's guidance: *"If you don't know what string to put between the parenthesis, you can use edit mode/workbench to configure it the way you want it, then open up presets.ini/tmp and check the strings saved in there."*

Source: https://pod.hubbe.net/config/styles/style_arguments.html

## 4. What can change WITHOUT recompiling (the runtime layer)

This is the most important fact for the product. ProffieOS keeps a runtime preset list on the SD card in `presets.ini` (with `presets.tmp` as a write-ahead backup). It is created by Edit Mode, the Workbench, or serial commands, and it **overrides** the compiled `presets[]` array.

Real example from the docs:

```ini
new_preset
font=TFAFlex
track=tracks/rey_training.wav
style=builtin 0 1
style=builtin 0 2
name=Graflex8
variation=23299
end
```

And with argument overrides, from a real user's file on the forum:

```ini
style=builtin 0 1 65535,0,65535
style=builtin 10 1 65535,0,19275
style=builtin 12 1
```

`builtin P B` means "the style compiled into preset index P, blade slot B". Numbers after it are the argument string (Rgb16 colours, ints). `variation` drives colour-change.

Sources: https://pod.hubbe.net/howto/editing-presets.ini-by-hand.html , https://crucible.hubbe.net/t/presets-ini-question/6209

### The hard boundary

| Runtime-editable (presets.ini / serial / Workbench) | Requires a recompile + reflash |
|---|---|
| Add, delete, duplicate, reorder presets | Any new style *structure* (a template not already compiled in) |
| Change a preset's font, track, name | Number of blades, LED counts, pins, SubBlade layout, Blade ID table |
| Point a preset's blade at any already-compiled style (`builtin P B`) | Prop file (button behaviour), `NUM_BUTTONS`, button pins |
| Change `RgbArg`/`IntArg` values (colours, timings, options) if the style exposes them | Every `#define` in `CONFIG_TOP` (volume ceiling, clash threshold, OLED, BLE, edit mode, etc.) |
| Change `variation` | ProffieOS version itself |
| Add fonts/tracks to the SD card (file copy) | Named styles that aren't already in the binary |

Bottom line: **a fully generic "any style, no compile" experience is impossible on ProffieOS.** The runtime layer is "recombine what's compiled in". Anything bigger is a firmware build.

### Serial command surface (what an app can drive)

Standard (always on unless disabled): `version`, `reset`, `RebootDFU` (reboot as STM32 BOOTLOADER), `get_volume`/`set_volume`, `n`/`p`, `on`/`off`, effect triggers (`clash`, `blast`, `force`, `stab`, `lock`, `drag`, `melt`), `ccmode`, `cd`, `pwd`, `dir`, `play`, `play_track`, `stop_track`, `scanid`, `id`, `pow`/`aux`.
Preset editing: `list_presets`, `set_font`, `set_track`, `set_name`, `set_style`, `rotate`, `get_variation`.
Named styles: `list_named_style`, `describe_named_style` (prints required arguments).
Diagnostics (need `DISABLE_DIAGNOSTIC_COMMANDS` *not* set): `sdtest`, `effects`, `beep`, `monitor <topic>`, `top`, `malloc`, `whatison`.
OS 8.x: `tag|command` — *"ProffieOS will run the command, and then for every output line, it will print the tag"*, explicitly for *"robust app communication"*. `sd` toggles host SD access when `MOUNT_SD_SETTING` is defined.

Sources: https://pod.hubbe.net/tools/serial-monitor-commands.html , https://pod.hubbe.net/tools/serial-monitor-additional-commands.html

The Workbench (Fredrik's WebUSB app) already uses this surface to: view/create/duplicate/delete/reorder presets, pick font and track from dropdowns, edit style arguments and variation, upload fonts, set volume, read battery, trigger effects. *"All changes you make are saved immediately."* It cannot add new style code.
Source: https://pod.hubbe.net/tools/workbench.html , https://fredrik.hubbe.net/lightsaber/webusb.html

## 5. SD card layout

- Font folders at root (`TeensySF/`, `SmthJedi/`...). Sound naming decides mono vs poly handling (`clsh01.wav` vs `clash1.wav`); *"You cannot mix mono and polyphonic sounds for the same effect."* Recommended WAV: 44.1 kHz 16-bit mono PCM.
- `common/` folder used as fallback via `"font;common"`.
- `tracks/` (or per-font) for music.
- `presets.ini` / `presets.tmp` — runtime preset list.
- Per-font `config.ini` (font tuning, SmoothSwing settings) and other `.ini` files (e.g. saved state when `SAVE_STATE`).
- Installers are advised to leave a `ProffieOS source/` folder on the card containing the OS + config used. This is a **de-facto convention** the app can exploit to recover a user's config.

Sources: https://pod.hubbe.net/sound/sound-font-configuration.html , https://crucible.hubbe.net/t/recommendations-for-proffieboard-installers/151 , https://pod.hubbe.net/config/get-from-sd-card.html

## 6. Flash budget

| Board | MCU | Flash | RAM |
|---|---|---|---|
| Proffieboard V1.5 / V2.2 | STM32L433CC | 256 KB | 64 KB |
| Proffieboard V3.9 | STM32L452RE | 512 KB | 160 KB |

Source: https://www.artekit.eu/doc/guides/proffieboard-v3-9/

The compile error `` `.text' will not fit in region `FLASH' `` is a top-3 newbie failure. Every style structure costs flash; V2 configs routinely hit the wall around 10–20 rich presets. Mitigations the docs list: `opt=os`, USB type `Serial` only, drop POV, `DISABLE_DIAGNOSTIC_COMMANDS`, `DISABLE_BASIC_PARSER_STYLES`, `DISABLE_TALKIE`, reuse styles via `RgbArg`, add presets via presets.ini instead of the config.
Source: https://pod.hubbe.net/howto/saving-memory.html

**Product implication:** an app must predict/measure flash usage before the user hits the error, and should push users toward "few rich parameterised styles + many presets.ini presets".

## 7. ProffieOS 8 items relevant to tooling

- `tag|command` app protocol and `RebootDFU` (see §4).
- `MOUNT_SD_SETTING`: SD is *not* auto-mounted to the host; user (or app via `sd` command) enables it. Protects against corruption. The setting resets on reboot.
- Menu system split from props (`MENU_SPEC_TEMPLATE`, `MENU_SPEC_MENU`).
- Colour display support, PQF image format, new OLED images.
- Dual-blade independent control, servo support.
- No bootloader or upload changes.

Source: https://crucible.hubbe.net/t/proffieos-8-is-now-live/7698

## 8. Props (button behaviour)

Selected in `CONFIG_PROP` by including one file from `props/`. Common: `saber.h` (default), `saber_fett263_buttons.h` (most popular; has Edit Mode, gestures, battle mode; needs `ENABLE_ALL_EDIT_OPTIONS` etc.), `saber_sa22c_buttons.h`, `saber_BC_buttons.h`, `saber_shtok_buttons.h`, `blaster.h`, `dual_prop.h`. Each prop has its own set of `#define` feature switches that must be validated together. **(Exact per-prop define list not enumerated in this recon; ProffieConfig's `.pconf` files already encode this and are GPL-3.0, a reusable source of truth.)**

## 9. Licensing summary

| Thing | License | Consequence for us |
|---|---|---|
| ProffieOS | GPL-3.0 | We may compile and distribute binaries if we make the corresponding source (OS + config) available to the recipient. Trivially satisfied by putting the config and OS version on the SD card / in the download. |
| arduino-proffieboard core | (based on Arduino STM32L4 core; **license not checked**) | Verify before bundling. |
| Fett263 Style Library code | GPL (stated on the page), with *"The original copyright for all style code should remain with the provided code"* and *"Installers / vendors be sure to keep a copy of the config.h with copyrights stored on SD card"* | Generated styles can be used; attribution comments must be preserved. The library *web tool* itself is "©2022 Fett263. All rights reserved" — we cannot scrape or embed it. |
| ProffieOS-StyleEditor | GPL-3.0, Vite/JS | Can be forked/embedded in a GPL-compatible app. |
| ProffieConfig | GPL-3.0, C++/CMake | Its `.pconf` prop definitions are reusable knowledge. |
| Sound fonts | Commercial, per-vendor | Never redistribute; only manage files the user already owns. |
