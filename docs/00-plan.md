# Hiltwright — Plan of Record

**Date:** 2026-09-07
**Status:** Path A, desktop-only, Electron + TypeScript. Committed.
**Baseline:** `hiltwright_bionic/docs/planning/proffie-configurator-planning.md` (the other agent's plan). This document keeps that plan's structure and decision and merges in the recon in [01](01-proffieos-recon.md), [02](02-toolchain-usb-recon.md), [03](03-ecosystem-and-users.md) plus the review changes listed in §0.

---

## 0. Changes from the baseline

| # | Change | Why |
|---|---|---|
| 1 | `@hiltwright/core` is a **pure TypeScript package** with zero Node, Electron or DOM imports. Main and renderer both import it. | Unit-testable flash and config logic; reviewable by the owner; not a web hedge. |
| 2 | The **board bridge runs in the renderer on Electron's Web Serial and WebUSB**, not `node-serialport` in main. Main keeps only subprocesses and files. | No native-module rebuilds per Electron upgrade; same pattern the Workbench proves; DFU stays a `dfu-util` subprocess. |
| 3 | **Runtime tier ships first** (presets, fonts, colours, arguments via `presets.ini`), build tier second. | Needs no toolchain and no Windows driver; useful to every existing Proffie owner on day one; de-risks the toolchain work. |
| 4 | **Flash-budget meter** added as a first-class feature. | `.text will not fit in region FLASH` is a top newbie failure, worst on 256 KB V2 boards. |
| 5 | **CFX / Xenopixel import** added (config, colours, font naming). | It is the on-ramp for the stated audience. |
| 6 | Factual fixes: no WebKitGTK on Electron/Linux; toolchain is ~300 MB download, ~1 GB unpacked, not multi-GB; ProffieConfig builds for Linux; compile time is **unmeasured**, not "tens of seconds"; canonical Workbench entry is fredrik.hubbe.net/lightsaber/webusb.html. | Accuracy. |

Everything else in the baseline stands.

---

## 1. Problem statement

ProffieOS is the most capable saber OS in the hobby, but its workflow was built for embedded enthusiasts: install Arduino, install the board core, hand-write a C++ header of defines, wiring structs and nested-template blade styles, point `ProffieOS.ino` at it, compile, deal with DFU drivers and compiler errors, upload.

The target user is not that enthusiast. They come from Crystal Focus X, Xenopixel and LGT boards, where configuration is a text file on an SD card, colours are numbers, and nothing is ever compiled. Hiltwright must deliver everything that makes Proffie exceptional while hiding the embedded toolchain entirely.

**Core constraint:** blade styles, blade wiring, the prop file and every `#define` are compile-time. Only preset order, font, track, name, variation and `RgbArg`/`IntArg` values are runtime data (via `presets.ini`). There is no architecture in which a brand-new style reaches the saber without a C++ compile. The only question is where the compiler runs. Decision: on the user's machine.

---

## 2. Technical recon summary

Full detail with citations in docs 01–03. The facts that shape the design:

- **Config anatomy.** One header included seven times with `CONFIG_TOP`, `CONFIG_STYLES`, `CONFIG_PRESETS`, `CONFIG_PROP`, `CONFIG_BUTTONS`, `PROP_BOTTOM`, `CONFIG_BOTTOM`. Preset = `{font, track, one StylePtr per blade, name}`. `BladeConfig` rows hold Blade ID resistance, LED count, pins, colour order, power pins, SubBlade splits.
- **Runtime layer.** `presets.ini` (+ `presets.tmp` backup) overrides the compiled preset array: `style=builtin P B <args>` references compiled styles with argument strings. Serial commands `list_presets`, `set_font`, `set_track`, `set_style`, `set_name`, `list_named_style`, `describe_named_style`; OS 8 `tag|command` framing for apps; `RebootDFU`; `sd` with `MOUNT_SD_SETTING`.
- **Build.** `arduino-cli compile --fqbn proffieboard:stm32l4:ProffieboardV3-L452RE:usb=cdc_msc_webusb,dosfs=sdmmc1,speed=80,opt=os`. Core v4.6 requires xPack `arm-none-eabi-gcc` 14.2.1 (357 MB download, 1.6 GB on disk). Compile time measured in [06-spike-results.md](06-spike-results.md): about 1 minute for a realistic Fett263 config on a fast desktop, expect 1 to 3 minutes on laptops; failures return in under 10 s. The artifact is `ProffieOS.ino.dfu` (raw image plus 16-byte DFU suffix).
- **Flash.** Running board is USB `1209:6668`. A 1200-baud touch (or `RebootDFU`, or BOOT+RESET) reboots it into the STM32 ROM bootloader `0483:df11`. Upload is `dfu-util -d 1209:6668,0483:df11 -a 0 -s 0x08000000:leave -D firmware.bin`. Recovery from a bad flash is BOOT+RESET; no software removes that.
- **Drivers.** Windows 10+: CDC serial and the WebUSB interface need nothing; the bootloader needs WinUSB once (`proffie-dfu-setup.exe`, libwdi, elevated). macOS: nothing. Linux: udev rules.
- **Flash budget.** V1/V2 = 256 KB (STM32L433CC), V3 = 512 KB (STM32L452RE).
- **Licensing.** ProffieOS GPL-3.0; Style Editor GPL-3.0 (forkable for previews); ProffieConfig GPL-3.0 (its `.pconf` prop definitions are reusable); Fett263 style code GPL with attribution, his web tools all-rights-reserved; fonts commercial and never redistributed.

Runtime vs compile:

| Thing | Runtime-editable? | Channel |
|---|---|---|
| Active preset, volume, effects, battery | Yes | serial / WebUSB |
| Preset add/delete/reorder, font, track, name, variation | Yes | `presets.ini` |
| Colours and options exposed as `RgbArg`/`IntArg` | Yes | `presets.ini` argument strings |
| Fonts and tracks on SD | Yes | mass storage / card reader |
| **Blade style structure** | **No** | recompile + reflash |
| Blade count, LED counts, wiring (`BladeConfig`) | No | recompile + reflash |
| Prop file, buttons, every `#define` | No | recompile + reflash |

---

## 3. Paths evaluated

Recorded in [04-paths.md](04-paths.md). Path A (desktop), Path B (web, no backend), Path C (web plus cloud compile). B cannot compile styles; C can, but only by making us run and pay for a build service forever, and neither can fix the Windows bootloader driver. Path A is the only path with full capability and no standing cost.

---

## 4. Decision

**Path A. Installed cross-platform desktop application (Windows, macOS, Linux). Electron + TypeScript. Committed, not hedged.** No servers, accounts, build queues or hosting. No web tier, and no architecture seams kept for one.

Electron rationale: the app's work is subprocess and file orchestration (`arduino-cli`, `dfu-util`, SD copies), not computation, and Node does that well. TypeScript keeps the whole codebase, including the flash pipeline, reviewable by the owner. One bundled Chromium on all three OSes protects the style editor, the most UI-sensitive surface, from platform WebView quirks. `electron-builder`, `electron-updater` and `@electron/notarize` are proven. Accepted cost: ~150–200 MB install, small next to the 1.6 GB toolchain cache. Tauri rejected as a Rust tax with no payoff here; Qt/wxWidgets rejected because the style editor needs fast UI iteration.

Simplifications that fall out: GPLv3 exposure reduces to ordinary tool aggregation with notices, because users compile their own configs and we never distribute compiled firmware. A local firmware cache (config hash → `.bin`) replaces any cloud cache.

Accepted sacrifices: zero-install tryout, phone-based tweaks, instant web distribution. Mitigated by an in-app updater and a curated style library shipped with the installer.

---

## 5. Architecture

### 5.1 Packages

**`@hiltwright/core` (pure TypeScript, no Node/Electron/DOM imports).** The single source of truth for domain logic, imported by both Electron processes and tested in isolation with golden fixtures.

- Config model ⇄ `config.h` codec. Round-trip safe: structured parse of the sections we understand, opaque-text preservation for everything else, so hand-written configs survive import.
- Style AST: parser, pretty-printer, validator per OS version, `RgbArg`/`IntArg` extraction, named-style resolution. Preview renderer forked from the GPL Style Editor lives in the UI package but consumes this AST.
- `presets.ini` codec, including `builtin P B <args>` and argument strings.
- Board protocol: command framing (`tag|command`), response parsing for `version`, `list_presets`, `list_named_style`, `describe_named_style`, `dir`, battery and volume.
- Hardware profiles: board variants, pin maps, LED chip tables, Blade ID conventions.
- Flash-budget estimator: empirical size table per style family and feature define, calibrated against real builds.
- Importers: CFX `config.txt`/`colors.txt`/`font_config.txt`, Xenopixel `SET/config.ini`/`fontconfig.ini`, font naming converter (CFX/GH/Xeno → Proffie).
- Prop definitions as data (seeded from ProffieConfig's GPL `.pconf` files and pod.hubbe.net).

**`@hiltwright/app` (Electron).**

Main process owns state, subprocesses and files:

- Toolchain manager: downloads and verifies pinned `arduino-cli`, Proffieboard core 4.x, xPack GCC 14.2.1 and pinned ProffieOS source trees on first use; per-version cache; integrity checks.
- Build engine: generates `config.h` from the model into a private copy of the pinned OS tree, sets `CONFIG_FILE`, runs `arduino-cli compile` with one build directory per saber, caches `sha256(config, OS version, FQBN)` → `.dfu` (the only cache that matters; the spike showed fresh rebuilds gain nothing from arduino-cli's own cache), and translates compiler errors into plain language using a config line map ("preset 4 has two looks but your saber has one blade"). Model-level validation (blade/style count, prop define conflicts, pin names) runs before any compile, since the compiler does not catch a valid-but-wrong pin name.
- Flash engine: backup first, reboot to bootloader (1200-baud touch via the renderer bridge, or `RebootDFU`), poll for `0483:df11` **and check its PnP driver service is WinUSB**, read the DfuSe memory layout to learn the flash size, run `dfu-util -d 1209:6668,0483:df11 -a 0 -s 0x08000000:leave -D <file>.dfu` as a subprocess (about a minute for 214 KB), wait for the serial port to return, verify with `version` (OS 8 reports config name, prop, buttons and build time), restore or merge `presets.ini`. Proven in the spike. Surfaces BOOT+RESET recovery instructions when the bootloader never appears.
- Driver helper (Windows): first-run "get my board flashable" wizard that runs the elevated WinUSB installer once (reuse `proffie-dfu-setup.exe` if its license allows bundling, otherwise libwdi directly).
- SD manager: detects the board's mass-storage volume or a card reader, validates fonts (mono/poly mixing, sample rate, `common/` folder), copies fonts and tracks, keeps a `ProffieOS source/` folder with the exact config on the card.
- Backup service: full-flash read-back (`dfu-util -U`) and `presets.ini` snapshots before any flash.
- Updater for the app, and a checker for new ProffieOS and core releases.

Renderer owns UI and the board bridge:

- UI: hardware wizard, presets, looks (style gallery and editor with live preview), fonts, diagnostics.
- Board bridge: Electron's built-in Web Serial and WebUSB, granted through `select-serial-port` / `select-usb-device` handlers in main. Speaks the core's protocol framing. Performs the 1200-baud touch on request from the flash engine.
- Strict typed IPC through a preload script; `contextIsolation` on; no `remote` module; renderer never spawns processes or touches the filesystem.

### 5.2 Data

- Local library in `userData`: sabers (model + `BladeConfig` identity), styles, backups, firmware cache.
- Every generated config carries a header comment with a JSON summary and content hash, and the same hash is written to the SD card, so a saber can always be re-identified.

### 5.3 Conventions

- **Golden baseline defines** in every generated config: `usb=cdc_msc_webusb`, `ENABLE_ALL_EDIT_OPTIONS` and the prop's edit-mode defines, `MOUNT_SD_SETTING`, `SAVE_STATE`, and **never** `DISABLE_DIAGNOSTIC_COMMANDS` (the spike showed it removes `list_named_style` and `id`, which the runtime tier uses). Live control and safe SD access are therefore always available.
- **`BladeConfig` is saber identity.** Imported or entered once through the wizard, verified against the hardware profile, shown read-only afterwards, and never silently regenerated. Wrong power pins can damage hardware.
- **Compile as little as possible.** Looks are parameterised styles; picking a look is usually a `presets.ini` edit, not a build. The flash meter is shown whenever a build is required.
- **Never brick, never lose.** No flash without a full backup and a `presets.ini` snapshot.

Diagram: [diagrams/committed-desktop.html](diagrams/committed-desktop.html).

---

## 6. Product tiers and sequencing

- **Tier 1, runtime editing.** Presets, fonts, tracks, order, names, colours and options exposed as arguments, variation, volume, diagnostics, backups. Works on any board already compiled with edit options; no toolchain, no Windows driver.
- **Tier 2, firmware build and install.** New styles, blade layout, prop, defines, OS upgrades. Needs the toolchain and, on Windows, the one-time driver.
- **Tier 3, SD content.** Fonts, tracks, `presets.ini` on the card.

### Roadmap

**Phase 0 — Core.** `@hiltwright/core` with golden tests against every config in the ProffieOS `config/` folder and community samples; style parser validated against the Style Editor's corpus; `presets.ini` round-trips; protocol client tested against recorded board transcripts.

> Status 2026-09-08: started. Driven by one vertical slice: plug in the V2.2, read its presets, change a preset's font, see the saber confirm it. Slice one (config codec + blade model) and slice two (`presets.ini` codec, protocol client and parsers, tested against transcripts recorded from a V2.2 on OS 7.8, see 09) are in `packages/core`. Slice three, the Electron walking skeleton (`apps/desktop`), connects to the same board over Electron's Web Serial with no click and shows version, battery and presets; see 09 for the permission-handler details. Slice four, the Presets page, edits the current preset on the board (name, font, common fallback, track) with a snapshot before each write and a read-back before anything is shown as saved; verified end to end on the V2.2. **The vertical slice is complete.**
>
> Tier 1 alpha, 2026-09-09: saber library in `userData` keyed by USB serial (Windows PnP) with config/install/blade-layout fallback; `presets.ini` snapshots on disk per saber; Presets page with reorder, duplicate, delete and a per-blade picker over compiled looks; `scanid` read into the saber identity; Fonts & SD via a card reader with WAV and naming checks and font copy; electron-builder packaging. Next: the second vertical slice, adopting a saber onto Hiltwright firmware (wizard identity → generated config → backup → build → flash → verify), wrapping the spike scripts as main-process services. See `docs/07-frontend-design.md` §7a for the blade model.

> Second vertical slice, 2026-09-09: adopt a saber onto Hiltwright firmware. `packages/core` gains `generateConfig` (a `SaberConfigModel` of board, buttons, prop, blades with roles and wiring, and the presets carried over, emitted as a config.h with Hiltwright starter looks and a hashed `hiltwright:` header). `apps/desktop` main gains the spike's toolchain, build and flash scripts as services (`toolchain.ts`, `build.ts` with error translation and a build cache keyed on config hash, `flash.ts` over dfu-util and Windows PnP) with a `job:event` progress stream, and the Build & Install page: wiring form (data pin and power pins per blade, guessed from the board and confirmed by the owner), prop choice, config preview, build with flash budget, and the install sequence backup → RebootDFU / 1200-baud touch → bootloader wait → write → wait for the runtime → reconnect. Verified on the V2.2: the generated config with the starter looks compiles to 83% of V2 flash in about 20 s from inside the app (`HILTWRIGHT_BUILD_E2E=1`, compile only). **Flashed for real the same evening**, on the owner's V2.2 (hote2, wiring confirmed from the installer's diagram): RebootDFU from the renderer put the board in its bootloader without the 1200-baud fallback, dfu-util read the 256 KB backup and wrote the 183 KB image (SA22C prop, 70% of flash), the board came back, and the app reconnected and read `config/hiltwright_hote2.h` with all 13 presets and the [140, 2, 1] blade layout intact. First attempt stopped safely at the write step: the "only Hiltwright-built firmware" guard compared paths with different slashes (fixed, and the page now also installs from a board already in bootloader mode). The OS 8 transcript is still wanted.

**Phase 1 — App shell + Tier 1 + Tier 3. Ship.** Electron shell, typed IPC, renderer board bridge. Connect, identify the board, preset manager, colour/argument editing with live preview, variation, volume, effect test buttons, battery. SD manager with font validation and naming conversion. `presets.ini` backup and restore. No toolchain yet.

**Phase 2 — Tier 2. Ship.** Toolchain manager, build engine with error translation, flash-budget meter, flash engine with backup and verification, Windows driver wizard, Linux udev guidance, macOS notarisation. Hardware wizard producing the `BladeConfig` identity.

**Phase 3 — Content and on-ramps.** Style editor and curated library per OS version (GPL, attributed), CFX and Xenopixel import, updater polish, ProffieOS release tracking.

### MVP scope (revised order)

1. Config model: parse and generate `config.h`, round-trip safe.
2. Runtime tier over the renderer board bridge: presets, colours, fonts, backups.
3. Toolchain manager: `arduino-cli` + core + GCC bootstrap with integrity checks.
4. One-click compile and flash with plain-language errors, flash meter, and pre-flash backup.
5. Preset/style library UI, curated per OS version, with live preview.
6. Update checker for ProffieOS versions and the app.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Windows DFU driver is the ecosystem's top support burden | First-run wizard with elevated helper; detect the missing driver by the bootloader never enumerating; clear BOOT+RESET guidance |
| Wrong `BladeConfig` damages hardware | Identity rule in §5.3; wizard validates pins against the board profile; explicit confirmation on any change |
| Flash budget exceeded, worst on V2 | Meter before build; `opt=os`; style reuse via arguments; `DISABLE_DIAGNOSTIC_COMMANDS`, `DISABLE_TALKIE` suggestions |
| ProffieOS and style-language drift (OS7 / OS8 / master) | Pinned OS versions; per-version validator; CI compiles the curated library against each pinned OS |
| Long tail of hand-written configs | Opaque-text preservation in the codec; "import as text, edit what we understand" |
| Signing and notarisation cost | SignPath Foundation for Windows OSS signing; Apple Developer for notarisation; ship unsigned pre-release if needed |
| GPL obligations | Aggregation with notices; users compile their own firmware; source pointers in the SD `ProffieOS source/` folder |
| Community relations | Announce on The Crucible; attribution everywhere; never scrape fett263.com; contribute upstream where useful |

---

## 8. Measurements before Phase 2 design is frozen

1. ~~Cold and warm compile times~~ Measured on a fast desktop (see 06). Still needed on a mid-range and a low-end laptop.
2. Binary sizes for 15 and 30 distinct curated styles on V2 and V3, to calibrate the flash meter. Points so far (see 06): OS base with edit mode ≈ 195–200 KB; four current Fett263 library styles ≈ 216 KB (82% of V2, 43% of V3); ten OS6-era instantiations ≈ 227 KB. Distinct style instantiations drive size and compile time; argument reuse is free.
3. ~~Does the 1200-baud open/close reboot the board into DFU~~ Proven on Windows with .NET SerialPort against a V2.2 (see 06 section 7); still to confirm from Electron's Web Serial, on macOS/Linux, and on a V3.
4. ~~`dfu-util` behaviour and timing~~ Proven on Windows: 256 KB backup in 0.9 s, 214 KB write in 58 s, `:leave` reset and `version` check work. Still to confirm on macOS/Linux.
5. Mass-storage volume detection with `MOUNT_SD_SETTING` and the `sd` command; copy speed versus a card reader.
6. License terms of the `arduino-proffieboard` core for bundling. Driver helper decision made: build our own from libwdi's `wdi-simple` (LGPL v3; releases ship only Zadig, no CLI binary) and launch it elevated from the first-run wizard; the spike confirmed problem code 28 as the detection signal and that binding takes effect immediately with the board in bootloader mode.
7. How broadly ProffieConfig's parser handles hand-written configs, to set our import target.
