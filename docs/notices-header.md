# Third-party notices

Hiltwright is licensed under GPL-3.0-or-later; the full text is on the About page and in the LICENSE file. This file lists what Hiltwright uses that is not covered by that licence: components it is ported from or compiled from, tools it downloads on first run rather than bundling, a built-in hilt, and the npm packages that ship inside the packaged app. The package list at the end is generated from the app's dependencies.

## Hand-written notices

### ProffieOS

- Author: profezzorn (Fredrik; the repository links fredrik.hubbe.net).
- Licence: GPL-3.0.
- Source: https://github.com/profezzorn/ProffieOS
- Use in Hiltwright: the blade simulator is ported from ProffieOS's GPL headers. The firmware that Hiltwright compiles is built from ProffieOS pinned at tag `v8.10`, downloaded from https://github.com/profezzorn/ProffieOS/archive/refs/tags/v8.10.zip on first run.
- Source of Hiltwright itself: each release is built from the tag of the same name in the public repository, https://github.com/safwyls/hiltwright. The About page links to the exact tag. The firmware Hiltwright builds for a saber comes from the ProffieOS release above and the configuration the app shows on the Build & Install page.

## Tools downloaded at first run (not bundled)

Hiltwright does not ship these. The first-run toolchain install and the driver step fetch them on the owner's click.

### arduino-cli 1.3.1

- Source: https://github.com/arduino/arduino-cli/releases/download/v1.3.1/ (Windows zip, macOS or Linux tar.gz asset chosen by platform).
- Author: Arduino (the `arduino` organisation on GitHub). Source: https://github.com/arduino/arduino-cli.
- Licence: GPL-3.0 (its README says "Arduino CLI is licensed under the GPL-3.0 license", and offers a separate commercial licence; read at https://github.com/arduino/arduino-cli). Hiltwright runs it as a separate program and does not link it.

### Proffieboard Arduino core (`proffieboard:stm32l4`)

- Source: board index https://profezzorn.github.io/arduino-proffieboard/package_proffieboard_index.json; core repository https://github.com/profezzorn/arduino-proffieboard.
- Version: not pinned by Hiltwright. arduino-cli installs whatever version the index serves at install time (4.6 when this was written).
- Basis: a fork of the Arduino STM32L4 core.
- Licence: its repository (https://github.com/profezzorn/arduino-proffieboard) and the project it is based on (https://github.com/GrumpyOldPizza/arduino-STM32L4) state no single licence; the source files carry their own notices. Hiltwright does not distribute it: arduino-cli downloads it from its publisher onto your computer.

### xPack arm-none-eabi-gcc 14.2.1-1.1

- Installed as a dependency of the Proffieboard core.
- Source: https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack (a binary distribution of GNU Arm Embedded GCC, by Liviu Ionescu).
- Licence: the xPack packaging is MIT; the compiler and tools inside are GNU software under their own licences (GPL and others), whose texts are in the package's own folder after it is downloaded. Hiltwright does not distribute it.

### dfu-util

- Comes with the Proffieboard core's tools folder; Hiltwright locates it there.
- Source: https://sourceforge.net/p/dfu-util/dfu-util/ (git repository; project page https://dfu-util.sourceforge.net/).
- Licence: GPL version 2 (https://dfu-util.sourceforge.net/). Hiltwright does not distribute it: it arrives with the Proffieboard core, and Hiltwright runs it as a separate program.

### Windows bootloader driver installer (`proffie-dfu-setup.exe`)

- Author: ProffieOS's author. It is a small libwdi-based installer.
- Source: https://fredrik.hubbe.net/lightsaber/proffie-dfu-setup.exe. Hiltwright checks the download against a published size (3034643 bytes) and SHA-256 (4773c8693cf62777cd8da4c95441690e7ae7c4171e8c1d533b1f6225f3bdc29e), refuses any other file, and launches it elevated.
- Licence: not stated by its publisher. Hiltwright does not distribute it: it is downloaded from the address above when you ask for the driver, and run as it is.

## Sound fonts

Each font pack records its creator and licence, and the app shows them. Commercial sound fonts are never redistributed.

Beta 1 ships the six free sound fonts from the ProffieOS default SD card, each as a Hiltwright pack. All six are licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. Each font's own licence file is inside its pack, and it is copied to the card with the font.

- TeensySF: by KRSABERS.COM. CC BY-SA 4.0.
- TthCrstl (Tythonian Crystal): by Dayad Jocen. CC BY-SA 4.0.
- SmthJedi: no author is named in its files. CC BY-SA 4.0.
- SmthGrey: no author is named in its files. CC BY-SA 4.0.
- SmthFuzz: no author is named in its files. CC BY-SA 4.0.
- RgueCmdr: no author is named in its files. CC BY-SA 4.0.

## Voice packs

The spoken menu prompts for the Fett263 controls are Brian Conner's (NoSloppy) voice packs, offered with his permission (given to the Hiltwright author on 2026-11-21) and credited to him wherever they are offered. They come from his Crucible thread, https://crucible.hubbe.net/t/additional-voicepacks/4227. His support page is https://www.buymeacoffee.com/BrianConner.

- English A ships inside the app. Like the other plain-voice defaults (English A to G, Chinese, French, Italian, Japanese, Russian and Spanish), it is "Edit Mode Menu Prompts Copyright (c) 2021 Brian Conner", made with text-to-speech, under Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. Its licence file is copied to the card with it.
- The character packs are downloaded only when the owner picks one, from the Hiltwright voicepacks release. Each keeps its own readme and picture. They are shared as fan works: the characters and voices they portray belong to their owners.

## Theme backdrops

The eight pictures behind the main view (Station, Hoth, Ronin, The Ninth Jedi, Coruscant at night, Crait, Naboo, Kashyyyk) were made with an AI image generator by safwyls, the author of Hiltwright, for this app. They are fan art: Hiltwright is not affiliated with or endorsed by Lucasfilm or Disney, and Star Wars names and designs belong to their owners.

## Built-in PunkSaber hilt

- Made by safwyls, the author of Hiltwright.
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. You may reuse the model with credit to safwyls.
