# Later list

Work deferred past Beta 1, one line per item. Copied from the open OpenSpec proposals and the trim table in `docs/beta-1-plan.md`. Each line is tagged Beta 2 or Later.

## board-side-polish

- F4: Let the owner choose which of several connected boards to work with. (Beta 2)
- F19: Mark Fonts & SD done in the Armory rail when the presets' fonts are on the card, and say so when everything is installed. (Beta 2)
- F20: Keep the working saber as the one just unplugged, not switch it after unplugging. (Beta 2)
- F21: Make the demo room use the working saber. (Beta 2)
- F23: Make shortcut tooltips advertise only working shortcuts, and stop shortcuts firing inside text fields. (Beta 2)
- F24: Settle the minimum window size and make the page-level scroll rule hold. (Beta 2)
- F40: Remember an apply-after-retraction setting for each preset, not just the last one. (Beta 2)
- F42: Keep the line break when editing a two-line preset name. (Beta 2)

## board-side-later

- F22: Prune old snapshots and backups, remove a plan's folders with it, and allow removing a real saber. (Later)
- F30: Preserve unknown content, comments and letter case in `presets.ini`, needed only if the app starts writing presets files to cards. (Later)
- F46: Allow editing a preset's variation. (Later)

## firmware-side-polish

- FW17: Make the build cache real, or remove it, since the app always rebuilds today. (Beta 2)
- FW18: Keep each saber's sketch copy clean between builds. (Beta 2)
- FW24: Check the voice pack for every prop that needs one in SD-mount mode, and correct the comments and docs about `MOUNT_SD_SETTING`. (Beta 2)
- FW25: Check what BC supports for special abilities, test the default-prop warning, and detect other prop features that pasted styles need, such as alt fonts. (Beta 2)
- FW34: Bring doc 07 section 7a in line with the wiring editor. (Beta 2)
- FW35: Make "strips on this wire" mean something in the build, or remove it. (Beta 2)
- TI-1: Size the setup panel's download figures from the parts actually missing, not the whole pinned set. (Beta 2)

## firmware-side-later

- FW19: Use the existing config parser to import a hand-written `config.h` as text, editing only what the app understands, or retire it. (Later)
- FW30: Install on macOS and Linux, covering USB state, bootloader detection and no driver step. (Later)
- SF32: Eject a shared card on Linux, as part of the same other-platforms work as FW30. (Later)

## sd-fonts-polish

- SF10: Stop the old-font-folder offer staying when its import added nothing. (Beta 2)
- SF11: Ask first when "Set maker for all" has a blank maker, and report partial failures. (Beta 2)
- SF12: Pick up sounds changed outside the app without a restart. (Beta 2)
- SF15: Show whether a font has `smoothsw.ini`. (Beta 2)
- SF16: Make the size chip count consistently. (Beta 2)
- SF17: Correct the stale docs about logos and editable sources. (Beta 2)
- SF18: Keep a removed contributor logo removed. (Beta 2)
- SF19: Refuse adding the library folder, or a font already in it, instead of duplicating it. (Beta 2)
- SF20: Strip trailing dots from folder names, clean up leftover staging folders, and key details by folder regardless of case. (Beta 2)
- SF29: Do not offer a copy that is bound to fail when a non-font folder of that name is on the card. (Beta 2)
- SF31: Notice a card being inserted, let the owner choose among several cards, and report a failing drive query. (Beta 2)
- SF33: Show `presets.tmp` honestly, report the voice pack version only from its file, and list lockup once. (Beta 2)

## styles-polish

- ST11: Recognise the same code pasted twice. (Beta 2)
- ST12: Correct the stale statements in the plan and comments, and test the shown flash costs against the measurement. (Beta 2)
- ST24: Make the Presets preview use the blade's real LED count and follow the picker while dragging. (Beta 2)
- ST25: Offer every special ability the saber's prop has. (Beta 2)
- ST26: Correct the stale "cannot be simulated" texts and the fallback bar's hint. (Beta 2)
- ST27: Re-measure preview performance, record the catalogue's ProffieOS version and check it against the pinned one, and settle the documented-entry count. (Beta 2)
- ST28: Make the preview treat an unknown prop as not Fett263, stop cutting long blades, make the glow independent of LED count, keep the preview dev hook development-only, and give an edited pasted style a fresh simulator. (Beta 2)
- ST35: Keep the code as written when printing it back. (Beta 2)
- ST36: Update the plan's "not yet" lists and record the editor work of 94b47fc. (Beta 2)
- ST37: Make "Copy the style" copy something the paste box accepts. (Beta 2)
- ST38: Allow saving a copy, and going back from tree to Simple where possible. (Beta 2)
- ST39: Keep layer selection stable across a paste, stop a second ignition or retraction layer being added, and keep undo history while the editor stays open in the session. (Beta 2)

## showroom-polish

- SR7: Stop the "Point the blade" sliders changing the saved control mode. (Beta 2)
- SR8: Stop double-clicking to retract from firing blaster bolts. (Beta 2)
- SR14: Support `.gltf` with its separate files, and Draco or meshopt compression, or explain their absence. (Beta 2)
- SR15: Correct the staff tooltip, the hilt-size comment and the plan's wording. (Beta 2)
- SR16: Make twist turn freely, make clicking the staff blade land a blast, and scope the Scene reset to what it says. (Beta 2)
- SR20: Keep pack item names and font configs out of the readable header where they are not needed. (Beta 2)
- SR23: Offer "copy to card" for pack fonts that allow it, or drop the flag. (Beta 2)
- SR25: Find a preset's font only among packs that allow playback. (Beta 2)
- SR27: Cap memory for pack fonts as for other fonts. (Beta 2)
- SR28: Show the owner where to put packs. (Beta 2)
- SR29: Read only pack headers to list packs, and notice changed packs. (Beta 2)
- SR30: Stop a pack with the same identity replacing the built-in hilt. (Beta 2)
- SR31: Fix the packing tool's help, write safely, and validate `--finish` and `--fit`. (Beta 2)
- SR37: Show one spelling of a contributor's name everywhere. (Beta 2)
- SR38: Validate names and links before trimming them. (Beta 2)
- SR40: Check logo files' contents as well as their extension. (Beta 2)

## font-construction

- font-construction (guided build): Let the owner start a new font, empty or copied from an existing one, and add or replace sounds by effect, with a live checklist. (Later)
- font-construction (file checks): Check WAV format and sample rate, file and folder naming, numbering, and that `config.ini` and `smoothsw.ini` are present and readable. (Later)
- font-construction (coverage checks): Show which effects a font supports, and warn when a style in the presets raises an effect the font has no sound for. (Later)

## Trimmed from Beta 1 changes

### preview-honesty

- ST21: Model each simplification (variation, alt fonts, colour change, time-bending, hard stripes, fire delay, very deep styles, the sound-length stand-in), or report it as approximate, with a per-item report. (Beta 2)
- ST22: Make the 2D preview use the working saber's prop, and play preon and post-off. (Beta 2)

### editor-output-safety

- ST32: Give each colour in a built style its own live setting, or tell the owner which colours share one on the saber. (Beta 2)

### layout-fit

- Other pages: Check Armory, Wiring, Presets, Build & Install, Styles, Style editor, Contributors, Demo room and Diagnostics at both sizes, and fix the same problems where they show. (Beta 2)

### sets-safety

- F35: Let sets be renamed, and stop saving duplicates. (Beta 2)
- F39: Match styles to presets by name when saving a set from a saber, as the rest of the app does. (Beta 2)

### diagnostics-feedback

- F9: Make a failing slider write say so, and never leave its pending marker behind. (Beta 2)
- F11: Make the effect buttons show that the effect ran, or why it did not. (Beta 2)
- F12: On firmware that cannot list a folder (OS 7.8), make the voice pack check say why it could not check, and correct doc 09's contradiction about the voice pack version needed. (Beta 2)

### demo-room-fixes

- SR9: Offer special abilities only as the chosen prop has them, by key as well as by button, with the blade off only where the prop allows it, and all eight for BC. (Beta 2)
- SR6: Stop a Scene setting change, while the staff blade is on, from replaying its ignition or dropping its held effect. Reproduce it first, since it was found by reading the code. (Beta 2)

### card-format

- card-format (formatter, safety): Format a card from Fonts & SD only for removable drives that Windows lists as such, after warnings, a typed drive-letter confirmation and an optional backup of fonts, tracks and `presets.ini`. (Beta 2)
- card-format (result): Write FAT32 with the cluster size ProffieOS recommends and a saber label, at any card size up to 2 TB, using a FAT32 formatter of Hiltwright's own or a bundled one for cards over 32 GB. (Beta 2)
- card-format (shared card): Format a saber's own card, shared over USB, only after the owner confirms which saber it belongs to, then give the card back to the saber. (Beta 2)

### pack-integrity

- SR17: Say plainly to creators, in the packing tool's output and a short doc, what the format does and does not protect against, and decide the key question. (Beta 2)
- SR18: Stop the page handing out a pack's full contents, and disable developer tools in packaged builds. (Beta 2)
- SR19: Protect credits and permissions against editing, by signing them or binding them into the encryption. (Beta 2)
- SR21: Validate pack headers and bound unpacking, so a bad or crafted pack cannot exhaust memory or break a page. (Beta 2)
- SR26: Include pre-on, post-off, fast-on and power-off sounds in the font packer. (Beta 2)
- SR32: Record in the docs which hilts Shadowfoil Props has agreed to, credit them consistently, and bring GLB packing over from its branch or record why not. (Beta 2)

### style-attribution

- ST15: Make renaming an author reach copies already in saber plans. (Beta 2)
- ST18: Check whether preset sets can carry pasted library code off the machine, and keep the "never redistributes" promise true. (Beta 2)

### style-to-saber-fixes

- ST7: Let the owner mark a pasted style for the kinds of blade it suits. (Beta 2)

### hardware-verification-v2

- BST-5: Check a snapshot file on a board: copied onto the card as `presets.ini`, ProffieOS must load it (saber-library 1.9). The owner decides when to write the card. (Beta 2)
- F10: Check that the Diagnostics settings survive a restart, and correct the page's claim if they do not. (Beta 2)
- Board scenarios on hardware: saber-library 1.3, 1.16, 1.19; board-connection 3.17; diagnostics 4.3; preset-editing 6.1, 6.4, 6.5, 6.7, 6.9, 6.10, 6.12, 6.13, 6.15, 6.19. (Beta 2)
- Board scenarios checked by hand: saber-library 1.11 to 1.14 and 1.17; app-shell 2.1 to 2.10; board-connection 3.4, 3.5, 3.6, 3.9; diagnostics 4.2, 4.4, 4.5; preset-editing 6.2, 6.3, 6.8, 6.11, 6.17, 6.18. (Beta 2)
- Roadmap list: install a pasted style, SD eject, style editor output on a blade, a sample of styles against the simulator, and fonts heard. (Beta 2)
- Scenarios from the four later baselines, as they are archived. (Beta 2)
- Firmware scenarios checked by hand: hardware-wiring 1.1, 1.2, 1.5, 1.7, 1.11, 1.12; toolchain 2.5; firmware-build 4.1, 4.2, 4.3, 4.5, 4.6, 4.8; firmware-install 5.1. (Beta 2)
- Firmware scenarios on hote2: a fresh install started from the bootloader (5.7), and a saber that is slow to return (5.11). (Beta 2)
- SD card scenarios with a real card: sd-card 2.1, 2.2, 2.8, 2.9, 2.10, 2.12 (after restoring a vendor backup), 2.13, 2.14. (Beta 2)
- Font library scenarios checked by hand: font-library 1.1, 1.3 (move to another drive), 1.5, 1.12, 1.14, 1.16 (the real recycle bin), 1.17. (Beta 2)
- Listening pass: library playback (1.15) and the Presets font picker. (Beta 2)
- SF9: Remove a font to the recycle bin from a library on a USB drive. (Beta 2)
- Side-by-side blade pass on hote2 (styles 2.2): a sample of built-in styles, two pasted library styles and two editor-built styles against the preview, including "Use it in" (1.13) and a built style's colour change without a rebuild (4.4). (Beta 2)
- Style scenarios checked by hand: style-library 1.5 to 1.11, 1.14, 1.15; style-simulator 2.10, 2.12; blade-preview 3.2 to 3.4; style-editor 4.1, 4.2, 4.3, 4.6, 4.7, 4.11, 4.12, 4.13, 4.15, 4.16. (Beta 2)
- Demo room listening pass: loading a library font (1.11), SmoothSwing (1.12), pre-on and post-off (1.13), effects including melt, a pack font playing (2.4), and a font without SmoothSwing. (Beta 2)
- Demo room scenarios checked by hand: demo-room 1.1, 1.2, 1.5 to 1.10, 1.14; hwpack 2.6 (built-in hilt on a fresh install), 2.7; contributors 3.4, 3.6, 3.7; loading a real `.glb` hilt. (Beta 2)

### v3-verification

- Board scenarios on the V3: board-connection 3.1, 3.2, 3.7, 3.10, 3.13, 3.15, 3.17, 3.18; saber-library 1.3, 1.8, 1.16, 1.19; diagnostics 4.1, 4.3, 4.6; preset-editing 6.1, 6.4, 6.5, 6.7, 6.9, 6.10, 6.12, 6.13, 6.15, 6.19. (Beta 2)
- Scenarios from the later baselines, as they are archived. (Beta 2)
- usb-power-connect 5.3 on a V3 with a card and presets: ten preset selections, each after 30 s idle, with and without a battery; record any stalls (`[board] paused:` lines), and check that connecting does not speak the voltage. (Beta 2)
- Firmware scenarios on the V3: version after install (4.4), backup (5.4), reboot (5.6), driver (5.8), install (5.10) and restore (5.14); a V3 build with its flash budget (3.3, FW13); an install started from the V3 bootloader (5.7). (Beta 2)
- SD card scenarios on the V3: sharing the card over USB (2.11) and giving it back (2.13). (Beta 2)
- Side-by-side blade sample on the V3 (styles 2.2), since its LEDs and power path differ. (Beta 2)
- library-integrity 6.3, with hote2 and the V3 plugged in together: after a reflash, hote2 reconnects to its own record by USB serial, and restoring a backup brings it back to the same record. (Beta 2)

## Also planned for Beta 2

- SignPath signing: sign the Windows installer with SignPath. (Beta 2)
- Blade ID: verify it on hardware and show it again in the app. (Beta 2)

## Found on 2026-11-14

- Built-in previews: drag and lightning block on the 32 HwFx styles do not follow twist and blade angle as the compiled styles do; `hw_heartbeat` drifts in timing. Listed in `packages/core/test/builtinParity.test.ts`. (Beta 2)
- Style catalogue: some number slots are typed wrongly, and `BatteryLevelStyle`, `FanShade` and `VUMeterStyle1` are missing, so the save check flags them. (Beta 2)
- Font engine: accent swings inside SmoothSwing, SmoothSwing V1, and monophonic lockups replacing the hum are not played as the firmware plays them. (Beta 2)
- Layout: the Presets middle column has its own scroll bar at 700 px high, and the Styles filter chips take three rows at 1180 px wide. (Beta 2)
- Signing: with Smart App Control on, Windows blocks the unsigned installer and the installed app, with no way to allow them (owner's PC, 2026-11-18). A build from the development app worked with Smart App Control on, so the downloaded compiler is not blocked and signing Hiltwright itself would be the whole fix. The owner shipped Beta 1 unsigned with instructions and is undecided on signing because of cost; SignPath Foundation signs open-source projects for free and was the roadmap's plan. (Beta 2, undecided)

## Found on 2026-11-20

- Font packages: extras are left out whole. A package's `_Extras` (spare hums, alternate ignitions, music, quotes) could be offered: music as tracks, the rest as swaps for a font's own sounds. Tracks kept inside another board's copy (`CFX/tracks`) are also not brought over to the Proffie copy. (Later)
- Font packages: a font found in a board folder is named after the folder above it, so three film versions of one release come in as `TFA`, `TLJ`, `TROS` with nothing of the release's name except the bundle. (Later)
- Font packages: the search stops four folders down, so anything deeper is neither added nor mentioned. (Later)
- Font library export (`.hwfonts`): on import, offer to replace a font already there. (Later)
- Font library: with several fonts selected, set the maker or bundle for all of them, and replace fonts already on the card in one go. (Later)
- Font library: the rows cannot be reached with the keyboard alone (no focus, no arrow keys); only Ctrl+A and Escape work without a mouse. (Later)
