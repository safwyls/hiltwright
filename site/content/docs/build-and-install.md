---
title: Build & Flash
summary: Turn the saber's setup into firmware, flash it over USB with a backup first, and put an old backup back if you need to.
section: Install
order: 5
---
Step 5 is Build & Flash. It turns the saber's wiring, presets and styles into firmware, then flashes it onto the saber. The SD card is got ready the step before, on [Card](card.html). You never read C++. Hiltwright writes the settings file for you.

## The steps

The panel on the right has four numbered steps and a Card line. Each turns green when it is done, and the bright one is next.

1. **Set up.** Shows the number of blades and presets, and "(staged)" or "new styles" when they apply. Chips jump to Wiring, Fonts, Presets and Styles.
2. **Compiler.** A one-time download.
3. **Build.** Makes the firmware.
4. **Flash.** Backs up the saber, then writes the firmware. A status chip shows the stage, such as "Building firmware…", "Writing firmware…" or "Installed".

Between Build and Flash, the **Card** line says whether the saber's card is ready: what it still needs (fonts, the voice pack, its presets file), "ready", or "not read yet". **Get the card ready** goes to [Card](card.html). A card put in a reader is noticed by itself; **Look again** checks once more.

Everything up to the flash works with the saber unplugged, once it has been seen. With no saber chosen, the page says "Connect a saber to begin", and the compiler can still be downloaded.

## The compiler

The first build needs the compiler, the program that turns the settings into firmware. Press **Download and install**. It is about 360 MB to download and about 1.9 GB on disk, into Hiltwright's own folder, and touches nothing else. The panel shows the free space. On a fast connection this takes about a minute. After that, nothing more is downloaded.

- If there is not enough space, or the folder path is too long, a red note says so and the button is off. Free some space and press **Try again**.
- If other Windows users on this computer could change the compiler folder, an amber note offers **Repair**, which limits it to administrators and your account. Windows may ask for approval.

When ready, the step says "ProffieOS (version) ready".

## Build

**Build firmware** needs the compiler, a confirmed wiring and no problems in the wiring. It takes about a minute. Queued styles are built in. The Log tab opens by itself and shows the output. Each saber builds in its own copy of ProffieOS. When a Hiltwright update brings a new ProffieOS, the next build makes that copy again first, and the log says "ProffieOS has changed".

If the wiring is not confirmed, the page says "Confirm the wiring on the Wiring page before building." See [Wiring](wiring.html).

When it works, the step shows how long it took, or "unchanged, reused" if nothing changed. A meter shows how full the board's flash is, for example "43% of flash" with "(used) of (size) KB". It turns amber above 70% and red above 90%.

If the build fails, the problem is listed in red. Press **Save diagnostics** to write a file you can send.

If you change the setup after a build, the step says "out of date" with "The setup changed after this build. Build again to install it." Build again. Changing it back makes the build current again.

![The Build step with the flash meter](shots/tour-25.png)

## Before you install

Read the notes under the steps. They can include:

- **Wiring that differs from the installer's config.** When the wiring is checked against a config file (see [Wiring](wiring.html)), or the saber's card in a reader holds one, each difference is listed. A different pin or number of blades is shown in red: check it on Wiring before installing, because a wrong pin can damage the board.
- **Where the card was checked.** Fonts and the voice pack are checked on the saber's own card wherever it is. With the card in a card reader on this computer, Hiltwright reads it there and says so, even with the saber unplugged. With the card in the saber, it asks the saber. With the card out of the saber and not in a reader, it says the card is out and warns about neither until the card is back. **Look again** checks once more. If the checks were made in a reader, put the card back in the saber before you use it.
- **Missing fonts.** For example "2 presets name fonts that are not on the card (…). The saber will say "font directory not found" for them." The trip on [Card](card.html) copies the chosen fonts the card lacks. Or choose another font on [Presets](presets.html). This warning shows only when the card's fonts are known.
- **Voice pack.** With the Fett263 prop, Hiltwright reports whether the voice pack is on the card, its version, and whether presets use the `common` folder. Without it, the saber speaks a voice pack error on every preset change. Everything else works.
- **Staged presets.** They replace the saber's presets once the new firmware is on and checked, and a snapshot is kept first. If the firmware already has them, press **Use the staged presets** to put them on with one restart and no install. With the saber's card in a card reader, the trip on [Card](card.html) removes its old presets file there; put the card back in the saber before you use it. Unless that trip removed the file for this list, the saber removes it itself and restarts once more. The presets count as installed only when the saber then reports the same names, fonts and tracks. With the card out and not in a reader, the presets stay staged until it is back.
- **The saber changed since your list was made.** The same warning as on [Presets](presets.html) is repeated here, with the number of presets that differ. Installing replaces those changes. Go to Presets to bring the saber's presets in, or keep your list.
- **A different saber is plugged in.** Install refuses while a saber other than the one you picked in the Armory is plugged in. Unplug it, or pick that saber.
- **Shared card.** Give the saber's card back on [Card](card.html) or [Live › Card](fonts-and-sd.html) first. An install restarts the saber, and your computer must not be holding the card.

## Flash, with a backup first

With the card back in the saber and the saber plugged in, press **Flash (saber)**, then **Yes, write the firmware**. The second click is a check. The wiring must be confirmed. If it is not, the page offers the same "I checked every data pin and power pin against the installer's wiring" switch here.

Flash then does these things:

1. Reboots the saber into bootloader mode. This can take up to 45 seconds.
2. Reads the saber's whole firmware into a backup file. If the board was blank, it says "there was nothing to back up" and goes on. If what the board holds cannot be a backup (after a write that did not finish, say), Flash asks first. **Install without a backup** goes on and keeps what was read for a diagnosis. **Cancel** writes nothing.
3. Writes the new firmware.
4. Waits for the saber to restart, reconnects and checks what it reports.

One bar shows all of it. It takes about two minutes. **Leave the saber plugged in until it says Installed.** A good end reads "Installed and checked: the saber reports…". If it reports something else, the note tells you to put the backup back.

> **Warning:** If the saber cannot restart into bootloader mode, hold BOOT, tap RESET, release BOOT, then press Flash again.

![The Flash step and its backup note](shots/tour-26.png)

## The driver prompt

The first time, Windows has no driver for the bootloader. The step says "Windows needs a driver" and "Nothing has been changed on the saber." Press **Install the driver**. Hiltwright downloads the 3 MB installer published by the ProffieOS author, checks it and starts it. Windows asks for administrator approval once. Leave the saber plugged in and the install carries on by itself.

If that does not work, press **Check again**, or **Cancel**. By hand: open the ProffieOS setup page, run `proffie-dfu-setup.exe`, then press **Check again**. See the [install guide](install.html).

## When a step fails

The status chip says "Stopped" and a red note says why. **Save diagnostics** writes one file on your computer and sends nothing. Attach it to your report. See [Controls](diagnostics.html).

If the saber does not show up after a reboot, use the BOOT and RESET steps above. A backup can always be put back from the Backups tab. If the note says the firmware was written but the saber has not reappeared, unplug and replug it, then press **Connect**.

## Backups and "Put back"

Every install first reads the saber's whole firmware to a file. The **Backups** tab lists them with the date and size. Each says "not a usable image" if it is not good. A read taken after a write that did not finish is labelled "partial-read" and is never offered to put back: it may be half old firmware and half new.

Press **Put back**, then **Yes, put it back**. It writes that backup onto the saber exactly as it was, to undo an install. It also backs up what is on the board first. If that read fails, or the board holds no usable firmware after a failed write, the backup is put back all the same and an amber note says so. The button is off until the saber is connected or a board is in bootloader mode.

Presets and fonts on the SD card are not touched.

![The Backups tab with Put back](shots/clean-27.png)

## The Config tab

The **Config** tab shows the settings file Hiltwright writes, and appears once the wiring is described. You never have to read it; it is there if you are curious.

Back to the [quick start](quick-start.html).
