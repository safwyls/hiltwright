# 03 · Ecosystem and users: who exists, what they expect, what hurts

Date: 2026-09-07.

## 1. Existing tools (competitive landscape)

| Tool | What it is | Stack / platform | License | Gap it leaves |
|---|---|---|---|---|
| **Arduino IDE + Proffieboard plugin** | The official path. Edit `config.h`, click upload. | Desktop, all OSes | — | The whole problem: C++, Tools-menu settings, driver setup, cryptic errors. Recommended IDE pinned to 2.3.4 because newer versions have issues. |
| **Official config generators** (v4/v5/v6 pages) | Pick wiring options, get a CONFIG_TOP/PRESETS/BUTTONS skeleton. | Static web | — | One-shot; no presets/styles editing; no upload. |
| **Fett263 Config Helper** (OS6/7/8) | Form-driven full `config.h` generator incl. presets, prop defines, controls list. Saves up to 6 configs in localStorage. | Static web | "©2022 Fett263. All rights reserved" (tool); output is the user's | No compile, no upload, no style preview, no SD. Still hands the user a .h to paste into Arduino. |
| **Fett263 Style Library** (OS7/8) | Builder for rich parameterised styles (base style, colours, phases, accents, overlays); outputs style code + argument strings. Patreon early-access tier. | Static web | Style code GPL with attribution requirement; site all-rights-reserved | Not embeddable; users copy/paste. |
| **ProffieOS Style Editor** | Fredrik's live style previewer/editor (Vite JS). Buttons: Submit, Copy, Expand, Layerize, Argify, Rotate. | Web, GPL-3.0 on GitHub | GPL-3.0 | Standalone; no config or upload. Forkable. |
| **ProffieOS Workbench** | WebUSB/BLE app: presets, fonts, tracks, args, variation, volume, effects; saves to presets.ini live. | Web (Chromium) | Hosted by Fredrik; source location **(unverified)** | Cannot add style code; UI is functional, not consumer-grade; no compile. |
| **webdfu (profezzorn fork)** | Browser DFU read/write of whole flash. Used for backups. | Web (Chromium) | BSD-style **(unverified)** | Bin only, no config awareness. |
| **ProffieConfig** (Ryan Ogurek / ryryog25) | *"All-In-One Proffieboard Management Utility"*: config generation, compile, upload, serial monitor, driver install, sanity checks, *"without the Arduino IDE"*. Launcher + app; C++/CMake (previously qmake/Qt). macOS, Windows 10+, Linux x86. `.pconf` files describe each prop's options. | Desktop C++ | GPL-3.0 | Closest competitor. Still config-centric (settings and defines), no style builder/preview, no SD/font management, single-developer, enthusiast-grade UI. Proves the "bundle arduino-cli + toolchain + driver installer" desktop model works. |
| **Crystal FX Desktop / CFX mobile apps / R.I.C.E.** (Plecter, for CFX) | *"Real-time editing of all CFX parameters"*, *"Apply ANY bladestyle in one click"*, *"Automated updates of firmware"*. | Desktop + iOS/Android | Proprietary | This is the **bar our target users are used to**. |

Sources: https://github.com/ryancog/ProffieConfig , https://www.fett263.com/fett263-os7-config-helper.html , https://www.fett263.com/fett263-proffieOS7-style-library.html , https://github.com/profezzorn/ProffieOS-StyleEditor , https://pod.hubbe.net/tools/workbench.html , https://crystalfocus.net/ , https://pod.hubbe.net/config/generator.html

Community sentiment from the *"So... GUI Proffie Configurator?"* thread: Fredrik: *"all the information someone would need to write such a tool is available"* and pushed for a community-built tool; Fett263 pointed at his Config Helper; the thread is where ProffieConfig was announced. Fredrik is receptive but will not build it himself. Source: https://crucible.hubbe.net/t/so-gui-proffie-configurator/4064

## 2. The users we are bridging from

### Crystal Focus X (Plecter Labs)

- Config lives in **text files on the SD card**: `config.txt` (root; blade profiles, up to 16 numbered 0–15), `colors.txt` (colour profiles), and a per-font `font_config.txt` (*"contains only the parameters that are specific to that font"*).
- Parameters are `key=value` lines (`qon=0`, `start_blade=`, `start_color=`, `ledstrip=` ...).
- "GraFx packages" are downloadable bundles: drop the font folder in, paste a blade profile into `config.txt`, paste a colour profile into `colors.txt`.
- Plecter ships desktop and mobile apps that edit parameters live and update firmware automatically.

Mental model: **firmware is fixed; I edit numbers in files; a font comes with a matching profile I paste in.**
Sources: https://crystalfocus.net/how-to-install-grafx-packages , https://crystalfocus.net/parameters/Blade

### Xenopixel / LGT-style boards

- `SET/config.ini` on the SD sets default colour, effect, style and ignition/retraction times per font.
- `fontconfig.ini` lines look like `font number=(R,G,B),A,B,C,D,E,F,G,H`.
- Users are told to back up the SD, edit the file, reinsert.

Mental model: **one line per font, numbers pick colours and effects.**
Sources: https://aussabers.com.au/instructions/xenopixel-instructions/ , https://sybersabers.com/en/pages/xenopixelsetting

### What they will expect from us

1. Pick a saber ("my hilt has 1 blade, 2 buttons, a crystal chamber").
2. Browse fonts, drop in new ones, hear a preview.
3. Pick a blade look per font from a gallery, tweak colours with a picker, see it animate.
4. Press one button that makes the saber do it. No mention of compilers, drivers, or "Tools → USB Type".
5. Never lose the saber to a bad update.

## 3. Recurring newbie friction on Proffie (from docs + forum)

1. **Driver / "Where's my port?"** — Windows bootloader driver (Zadig / proffie-dfu-setup), wrong or charge-only cable.
2. **"It doesn't compile and I don't know why"** — typos in a 500-line C++ header, mismatched blade count vs styles per preset, missing defines for a prop, pasted style from the wrong OS version.
3. **`.text will not fit in region FLASH`** — especially V2 boards.
4. **Arduino Tools menu** — wrong board (V2 vs V3), wrong DOSFS, wrong USB type (Workbench then doesn't work).
5. **Losing presets.ini** on reprogram / not understanding the .tmp file.
6. **Font problems** — mono vs poly naming mix, wrong sample rate, missing `common` folder.
7. **OS version drift** — configs and Fett263 styles are OS-version specific (OS6 vs OS7 vs OS8 defines).

Sources: https://pod.hubbe.net/ (Troubleshooting section list), https://pod.hubbe.net/howto/saving-memory.html , https://crucible.hubbe.net/t/presets-ini-question/6209

## 4. Fonts and assets

- Font vendors (Kyberphonic, Greyscale, BK Saber Sounds, Saberfont, etc.) sell per-user; fonts are **not redistributable**. The app manages files the user already has; it never hosts fonts.
- Naming conventions differ per board; NoSloppy's SoundFontNamingConverter (GitHub + browser version) already converts CFX/GH/Xeno/Verso ↔ Proffie names. Same-effect mono/poly mixing is forbidden.
- Proffie requires ≤44.1 kHz 16-bit PCM WAV; the app can validate and warn.

Sources: https://github.com/NoSloppy/SoundFontNamingConverter , https://pod.hubbe.net/sound/sound-font-configuration.html
