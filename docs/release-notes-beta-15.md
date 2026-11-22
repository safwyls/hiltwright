# Hiltwright 0.2.0-beta.15

## New in this beta

### Presets

- **Install › Presets has Add and Duplicate.** **Add** puts a new preset after the current one. It uses a font chosen on Install › Fonts that no preset uses yet, names the preset after it, and adds the `common` folder. **Duplicate** copies the current preset. Live › Presets keeps only **Duplicate**: ProffieOS can copy a preset on the saber, but has no command for a new one.
- **Delete is a bin button** at the end of that row, and asks again with **Really delete** or **Cancel**. On Install you can delete every preset to start over; Build & Flash asks for at least one before it builds. The saber itself always keeps at least one, so on Live the bin is off for the last.
- **Choosing a font opens from the Sound font field.** The picker lists the fonts chosen on Install › Fonts first, then the rest of your font library, each with a quick listen, then folders that are not in the library. A font picked from the rest of the library joins the chosen ones.
- **Choosing a music track has a picker too.** Click the Track field: **No track**, the tracks in the preset's font, the tracks on the card as last read, and the tracks in your other library fonts, with a listen for library tracks. A path that is in none of them can still be typed.

### Styles and the style editor

- **Show the code.** The Styles page shows the C++ a style puts into your saber's configuration, with **Copy the style**. A pasted style keeps its copyright header at the top. A style pasted as one long line, as the Fett263 library gives them, is shown one part per line so it can be read. Only line breaks and spaces are added.
- **The Preset and Blade controls on the Styles page stay in one place**, whatever style you pick.
- **The "only approximate" note** in the style editor is now under the preview it describes.
- **"Can be switched off" is now "Power down when retracted"**, on the Ignition and retraction layer, with a line saying what it does. When the blade has retracted and its "When off" colour is black, the saber cuts power to the blade's LEDs until the next ignition, which saves battery.
- **Hiltwright's mark on its own styles follows the theme**, like the one in the sidebar.

### Everywhere

- **Headings, labels and footnotes are no longer selected by a stray drag.** What is worth copying can still be selected: what you type, code and logs, paths, folder names, colours, versions, and notes and errors.

## New in 0.2.0-beta.14, for anyone who skipped it

Two fixes to the Card step. Install › Card no longer says a card is "ready for the flash" when the saber did not answer. The six free fonts are now copied to the card from the fonts that come with Hiltwright.

## New in 0.2.0-beta.13, for anyone who skipped it

The sidebar is laid out around what you are doing with a saber.

- **Armory, Install and Live.** The Armory lists your sabers. Pick one, then either **Adjust it live** (it is plugged in) or **Change its setup**. **Install** is the five steps that set a saber up and flash it: 1 Wiring, 2 Fonts, 3 Presets, 4 Card, 5 Build & Flash. **Live** is for a saber that is already flashed and plugged in: its presets, its controls and its card, changed at once with nothing built. Live works with any ProffieOS firmware. **Tools** is now **Settings** (the theme) and **About**.
- **A bar along the bottom** shows the saber you are working on, the full ProffieOS version line, the app's version and the tour button.
- **Install › Fonts** chooses the fonts a saber carries, from your font library, before its presets. It also chooses the voice the Fett263 controls speak in, and says whether the card's voice pack works.
- **Install › Card gets the card ready in one trip to a card reader.** The saber's USB runs at USB 1.1 speed: one font took about 4 seconds in a reader and about 120 seconds over the saber's USB. **Prepare the card** copies the chosen fonts the card lacks, puts the voice pack on, and removes the old presets file when a new list is waiting, so the saber starts with your list after the flash. A card put in a reader is found by itself. Sharing the card over the saber's USB still works, more slowly.
- **Build & Install is now Build & Flash.** A Card line says whether the card is ready.
- **Install's presets are always the list for the next flash.** Live's presets are the saber's own, changed on the saber at once. If the saber changed since your list was made, Install says so and offers to bring its presets in.
- **Voice packs.** With the Fett263 controls, Hiltwright puts a version 2 voice pack in the card's `common` folder. Brian Conner (NoSloppy) has allowed 82 of his voice packs to be included: English A comes with the app, and the rest download when you pick one. Whatever a pack replaces is kept on this computer.
- **"Error in font directory" on every font change** came from an older voice pack's loose menu-number files left beside a newer pack's `mnum` folder. ProffieOS counted both. Putting a pack on now clears the old files, and a card that already has both is pointed out, with a way to fix it.
- **A saber knows its card in a card reader**, by its serial number or by the presets on it. Fonts and the voice pack are checked there, even with the saber unplugged. What was read from a card is kept between pages, so it is not read again.
- **Wiring reads the installer's config file** from the card or from a file you choose. It can fill the wiring in from it, and it checks every pin against it: Build & Flash shows a different pin in red, because a wrong pin can damage the board.
- **A custom prop file.** Besides the four props that come with ProffieOS, Wiring can build with a prop file of your own.
- **Font check.** `hum1.wav` (numbered without leading zeros) now counts as a hum. Two names for one effect is now a warning, not an error.
- **Loading indicators** in every theme: power cells for waits and progress, and a turning kyber crystal.

**The macOS test build** is attached: `Hiltwright-0.2.0-beta.15-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.15-mac-x64.dmg` for Intel Macs. It is still an unsupported test build. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build has not been run at all. If you try it, tell us what happens.

An installed copy from 0.2.0-beta.3 on updates to this beta by itself. If that does not work for you, install this beta by hand and tell us.


## What Hiltwright is

Hiltwright is a desktop app that gives lightsaber owners coming from Crystal Focus X, Xenopixel and LGT boards everything ProffieOS can do. You do not need Arduino, C++, drivers or the style language.

## Who this beta is for

This is a closed beta for experts: installers and style builders who own a Proffieboard V2.2 or V3. It is for Windows. A macOS test build is attached for anyone willing to try one.

## What the beta promises

> "Plan your saber, choose styles and fonts, build custom styles, demo any premade or created style and font in the demo room, then build and install it, with live preset editing, all without touching Arduino or any code."

## What is hidden in this beta

Blade ID and the Xenopixel import are hidden behind one switch. The code stays in the app.

## What is not in this beta yet

- Card formatting. A card formatter is not in this beta.
- Code signing.
- A supported macOS build, and Linux.

## The macOS test build

It is not signed with an Apple certificate, so macOS asks before it opens it:

1. Open the disk image and drag Hiltwright to Applications.
2. Open Hiltwright once. macOS refuses, because it is not from an identified developer.
3. Open System Settings, Privacy & Security, scroll down, and press **Open Anyway**.

If macOS says the app is damaged, the app is intact. macOS shows that message for the mark it puts on downloads. In Terminal, `xattr -dr com.apple.quarantine /Applications/Hiltwright.app` removes it.

The six free sound fonts are not in the macOS build, and it does not update itself: download a newer disk image by hand. Hiltwright backs up the saber's firmware before every install, on a Mac as on Windows.

## Free sound fonts

The six free ProffieOS fonts are included and can be copied to a card from Install › Card or Live › Card.

## Install

If you are on 0.2.0-beta.3 or later, open About, press Check now, then Download, then Restart to update.

If you are coming from 0.2.0-beta.1 or 0.2.0-beta.2, download this installer and run it. It installs over the old one and keeps your sabers, styles, fonts and backups. After that, Hiltwright updates itself.

The installer is unsigned, so Windows will warn you before it runs. If Smart App Control is on, Windows blocks both the installer and the app, and it has to stay off while you use this beta: check that first (install guide, section 3). The install guide covers each Windows barrier to unsigned software.

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.15/docs/install-guide.md

## License and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.15

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it is fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
