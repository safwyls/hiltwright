---
title: Quick start
summary: The whole path for a first saber, from plugging in to an installed board, in a few steps.
section: Getting started
order: 3
---
This page walks a first saber from start to finish, and each step links to the page that covers it in full. Hiltwright (a beta, for Windows and macOS) works with Proffieboard V2.2 and V3 boards running ProffieOS 8.x.

## What you need

- A Proffieboard V2.2 or V3, in your hilt or on the bench.
- A USB data cable. Some cables only charge, so if Hiltwright doesn't find anything, try another cable.
- The saber's SD card and a card reader for your computer. Fonts go on the card, and we recommend a card reader since it's about 30 times faster than the saber's own USB. Without a reader the saber can share its card over USB, but it's slow.
- Your installer's wiring notes. You'll check every data pin and power pin against them, and it's worth taking your time here: a wrong power pin can damage hardware.
- Hiltwright installed. If Windows blocks it, read the [install guide](install.html) first, especially the Smart App Control section.

Plan for about 2.5 GB of free disk space. The first build also needs a one-time download of about 360 MB.

## Two ways to start

**With the saber plugged in.** Plug the saber in with the data cable. Hiltwright connects by itself, reads the saber, remembers it and picks it, and the top bar shows "Connected" and the battery.

**With a plan.** If your saber hasn't arrived yet, press "New saber" in the Armory, give it a name and set it up ahead of time: wiring, fonts, presets and styles. When the real saber gets plugged in later, Hiltwright asks whether it's the one you planned. You can do everything except the install without a saber in your hands.

## The steps

1. **Start in the Armory.** Plug a saber in, or press "New saber", then pick the saber in the list on the left. On the right, press "Change its setup" to go through the Install steps below, or "Adjust it live" for a saber that's already installed. See [Armory](armory.html).
2. **Choose the board.** On Wiring, pick Proffieboard V2 or V3 (the label on the board says V2.2 or V3.x), the number of buttons, and the prop file. The prop file decides what each button press does. See [Wiring](wiring.html).
3. **Describe the blades.** Set how many blades there are, then open each one and say which pins it's wired to. A blade is anything the saber lights or runs: the main blade, a crystal chamber, an accent LED, a motor.
4. **Check the wiring against the installer's notes, then turn on "I checked the wiring".** Nothing gets installed until you do.
5. **Choose the fonts.** On Fonts, pick the sound fonts the saber will carry from your font library. You can add a font there with "Add .zip" or "Add folder", and six free fonts come with Hiltwright. You don't need the saber or the card for this step. See [Fonts](fonts.html).
6. **Set up the presets.** A preset is one setup you switch to with the buttons: a sound font, a music track and a style for each blade. On Install › Presets you build the list for the next install. See [Presets](presets.html) and [Styles](styles.html).
7. **Download the compiler.** On Build & Flash, press "Download and install". The compiler is the tool that turns your setup into firmware, and you only need to download it once. See [Build & Flash](build-and-install.html).
8. **Build.** Press "Build firmware". The build takes about a minute.
9. **Prepare the card.** Take the SD card out of the saber and put it in a card reader. Press "Look again", then "Prepare the card", and Hiltwright copies over the fonts the card is missing and clears the old presets. Then put the card back in the saber.
10. **Install.** Press "Install on" your saber's name, then "Yes, write the firmware". Hiltwright backs up the saber's firmware first. The first time, Windows will ask for a driver. Leave the saber plugged in until Hiltwright says "Installed"; Hiltwright then reconnects by itself and checks what the saber reports.

> **Tip:** The Armory shows how far each saber has got. A tick means a step is done, and "Continue" takes you to the next one.

## After the first install

For small changes, use the Live pages with the saber plugged in. On Live › Presets, a change to a preset is written to the saber right away, with no build and no install. Live › Controls sets the volume and brightness and lets you try effects, and Live › Card fixes a font or the voice pack on the card. See [Live › Presets](live-presets.html).

You'll need to build and install again when you change the wiring, or choose a style that isn't in the saber's firmware yet (those are marked "Queued"). See [Presets](presets.html).

Every install keeps a backup, so you can always put the old firmware back. See [Build & Flash](build-and-install.html).

## If something goes wrong

Press "Save diagnostics" on the Controls page, or beside a failed build or install. "Save diagnostics" writes one file on your computer and sends nothing. Attach that file when you report a problem and we'll take a look. See [Controls](diagnostics.html) and [Troubleshooting](troubleshooting.html).

## Take the in-app tour

Hiltwright has a five-minute tour of every page, run on an example saber so nothing reaches a real one. Press "Take the tour" at the bottom left of the window, or "Show me this page" on any page.
