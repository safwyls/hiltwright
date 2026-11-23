---
title: Build & Flash
summary: Turn the saber's setup into firmware, flash it over USB with a backup first, and put an old backup back if you need to.
section: Install
order: 5
---
Step 5 is Build & Flash, where the saber's wiring, presets and styles become firmware and that firmware is flashed onto the saber. The SD card is made ready one step earlier, on [Card](card.html). You never have to read C++, since Hiltwright writes the settings file for you.

## The steps

The panel on the right has four numbered steps and a Card line. Each turns green when it's done, and the bright one is next.

1. **Set up.** Shows the number of blades and presets, and "(staged)" or "new styles" when they apply. Chips jump to Wiring, Fonts, Presets and Styles.
2. **Compiler.** A one-time download.
3. **Build.** Makes the firmware.
4. **Flash.** Backs up the saber, then writes the firmware. A status chip shows the stage, such as "Building firmware…", "Writing firmware…" or "Installed".

Between Build and Flash, the **Card** line says whether the saber's card is ready: what the card still needs copied (fonts, the voice pack), "ready", or "not read yet". When the only thing left is removing the old presets file, the card counts as ready, since the flash removes that file with the card left in the saber or in a card reader. **Get the card ready** goes to [Card](card.html). Hiltwright notices a card put in a reader by itself, and **Look again** checks once more.

Everything up to the flash works with the saber unplugged, once Hiltwright has seen the saber. With no saber chosen, the page says "Connect a saber to begin", and you can still download the compiler.

## The compiler

The first build needs the compiler, the program that turns the settings into firmware. Press **Download and install**. The compiler is about 360 MB to download and takes about 1.9 GB on disk, and setup puts the compiler in Hiltwright's own folder and touches nothing else. The panel shows the free space. On a fast connection the download takes about a minute, and after that nothing more is downloaded.

- If there isn't enough space, or the folder path is too long, a red note says so and the button is off. Free some space and press **Try again**.
- If another Windows account on this computer owns the compiler folder or could change the folder, Hiltwright runs nothing from it, and an amber note offers **Repair**. Repair limits the folder to administrators and your account. If the other account had put files there, Repair removes them and the compiler is downloaded again. Windows may ask for approval.

When the compiler is ready, the step says "ProffieOS (version) ready".

## Build

**Build firmware** needs the compiler and no problems in the wiring. The build takes about a minute and builds in any queued styles, and the Log tab opens by itself to show the output. Each saber builds in its own copy of ProffieOS, so when a Hiltwright update brings a new ProffieOS, the next build makes that copy again first and the log says "ProffieOS has changed".

You can build before the wiring is confirmed, but you can't install. Until the wiring is confirmed, the page says "Confirm the wiring on the Wiring page before installing." See [Wiring](wiring.html).

When the build works, the step shows how long the build took, or "unchanged, reused" if nothing changed. A meter shows how full the board's flash is, for example "43% of flash" with "(used) of (size) KB", and the meter turns amber above 70% and red above 90%.

If the build fails, the problem is listed in red. Press **Save diagnostics** to write a file you can send us.

If you change the setup after a build, the step says "out of date" with "The setup changed after this build. Build again to install it." Build again (changing the setup back makes the build current again).

![The Build step with the flash meter](shots/tour-25.png)

## Before you install

Read the notes under the steps, which can include:

- **Wiring that differs from the installer's config.** When the wiring is checked against a config file (see [Wiring](wiring.html)), or the saber's card in a reader holds one, each difference is listed. A different pin or number of blades is shown in red, and you should check that on Wiring before installing, since a wrong pin can damage the board.
- **Settings the build leaves out.** The same config's own settings (its `#define` lines) that this build does not have are listed one by one, with what the build has instead when it has its own: for example "VOLUME 1000 (the build has VOLUME 1800)". The board settings Hiltwright can carry over are taken on Wiring, and the others, such as prop options, are Hiltwright's to choose. Check that the saber doesn't need them.
- **Where the card was checked.** Fonts and the voice pack are checked on the saber's own card wherever that card is. With the card in a card reader on this computer, Hiltwright reads the card there and says so, even with the saber unplugged. With the card in the saber, Hiltwright asks the saber. With the card out of the saber and not in a reader, Hiltwright says the card is out and warns about neither until the card is back. **Look again** checks once more. If the checks were made in a reader, put the card back in the saber before you use it.
- **Missing fonts.** For example "2 presets name fonts that are not on the card (…). The saber will say "font directory not found" for them." The trip on [Card](card.html) copies the chosen fonts the card lacks, or you can choose another font on [Presets](presets.html). This warning only shows when the card's fonts are known.
- **Voice pack.** With the Fett263 prop, Hiltwright reports whether the voice pack is on the card, the pack's version, and whether presets use the `common` folder. Without the voice pack the saber speaks a voice pack error on every preset change, though everything else works.
- **Staged presets.** Staged presets replace the saber's presets once the new firmware is on and checked, and a snapshot is kept first. If the saber's firmware already has the staged presets, press **Use the staged presets** to put them on with one restart and no install. With the saber's card in a card reader, the trip on [Card](card.html) removes the card's old presets file there, so put the card back in the saber before you use it. Unless that trip removed the file for this list, the saber removes the file itself and restarts once more. The presets count as installed only when the saber then reports the same names, fonts and tracks. With the card out and not in a reader, the presets stay staged until the card is back.
- **The saber changed since your list was made.** The same warning as on [Presets](presets.html) is repeated here, with the number of presets that differ. Installing replaces those changes, so go to Presets to bring the saber's presets in, or keep your list.
- **A different saber is plugged in.** Install refuses while a saber other than the one you picked in the Armory is plugged in, so unplug that saber or pick it.
- **Shared card.** Give the saber's card back on [Card](card.html) or [Live › Card](fonts-and-sd.html) first, since an install restarts the saber and your computer must not be holding the card.

## Flash, with a backup first

With the card back in the saber and the saber plugged in, press **Flash (saber)**, then **Yes, write the firmware** (the second click is a check). The wiring must be confirmed, and if the wiring isn't confirmed yet, the page offers the same "I checked every data pin and power pin against the installer's wiring" switch here.

Flash then does these things:

1. Reboots the saber into bootloader mode. This can take up to 45 seconds.
2. Reads the saber's whole firmware into a backup file. If the board was blank, Flash says "there was nothing to back up" and goes on. If what the board holds can't be a backup (after a write that didn't finish, say), Flash asks first: **Install without a backup** goes on and keeps what was read for a diagnosis, and **Cancel** writes nothing.
3. Writes the new firmware.
4. Waits for the saber to restart, reconnects and checks what the saber reports.

One bar shows all four stages, and the whole flash takes about two minutes. **Leave the saber plugged in until it says Installed.** A good end reads "Installed and checked: the saber reports…". If the saber reports something else, the note tells you to put the backup back.

> **Warning:** If the saber cannot restart into bootloader mode, hold BOOT, tap RESET, release BOOT, then press Flash again.

![The Flash step and its backup note](shots/tour-26.png)

## The driver prompt

The first time, Windows has no driver for the bootloader, so the step says "Windows needs a driver" and "Nothing has been changed on the saber." Press **Install the driver**, and Hiltwright downloads the 3 MB installer published by the ProffieOS author, checks the installer and starts it. Windows asks for administrator approval once. Leave the saber plugged in and the install carries on by itself.

If that doesn't work, press **Check again**, or **Cancel**. To set up the driver by hand, open the ProffieOS setup page, run `proffie-dfu-setup.exe`, then press **Check again**. See the [install guide](install.html).

## When a step fails

The status chip says "Stopped" and a red note says why. **Save diagnostics** writes one file on your computer and sends nothing, and you can attach that file to your report. See [Controls](diagnostics.html).

If the saber doesn't show up after a reboot, use the BOOT and RESET steps above, and a backup can always be put back from the Backups tab. If the note says the firmware was written but the saber hasn't reappeared, unplug and replug the saber, then press **Connect**.

## Backups and "Put back"

Every install first reads the saber's whole firmware to a file, and the **Backups** tab lists those files with the date and size. A backup that isn't good says "not a usable image". A read taken after a write that didn't finish is labeled "partial-read" and is never offered to put back, since that read may be half old firmware and half new.

Press **Put back**, then **Yes, put it back**. **Put back** writes that backup onto the saber exactly as it was, to undo an install, and backs up what is on the board first. If that read fails, or the board holds no usable firmware after a failed write, the backup is put back all the same and an amber note says so. The button is off until the saber is connected or a board is in bootloader mode.

Presets and fonts on the SD card aren't touched.

![The Backups tab with Put back](shots/clean-27.png)

## The Config tab

The **Config** tab shows the settings file Hiltwright writes, and appears once the wiring is described. You never have to read the file, but the tab is there if you're curious.

Back to the [quick start](quick-start.html).
