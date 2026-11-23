# Hiltwright 0.2.0-beta.16

## New in this beta

### Sabers

- **Share a saber's setup.** Each saber in the Armory has **Share**, which saves its wiring, fonts, presets and styles as a `.hwsaber` file. Someone else can import the file in their Armory and flash a hilt with the same setup. Styles in an imported file are checked before Hiltwright puts them in a configuration.
- **Two sabers plugged in at once.** Picking a plugged-in saber in the Armory connects to that saber. Before, Hiltwright always reached the saber plugged in last. The Armory and the top bar show each saber's COM port, and a spinner shows at once while Hiltwright switches.
- **The "set it up" offer** in the Armory now appears only for a plugged-in saber Hiltwright knows nothing about, not for one already in your list.

### Live

- **Colours on Live › Presets are written when you let go of the picker**, or close it. Dragging the colour no longer sends a write at every pause, which could send more changes than the saber's USB link keeps up with.
- **Connecting a saber with its card out** no longer replaces the presets Hiltwright last read from it. Without a card the saber reports only its firmware's own list.

### Install

- **The card step and the old presets file.** When the only card work left is removing the old presets file, the card counts as ready, and the flash removes the file. No trip to a card reader is needed.
- **Blades chained on one strip** are laid out in order in the firmware, including a chained blade that follows another chained strip.
- **The installer's config file:** board settings such as orientation and volume are carried into builds, and Hiltwright names any it leaves out. Pins in SimpleBladePtr slots and DimBlade brightness limits are read correctly.
- **A ProffieOS update** in Hiltwright now refreshes each saber's copy of ProffieOS at its next build.

### Demo room

- **Force**, on a button and the F key, plays the font's force sound and shows a style's Force effect. A font with no force sound says so.

### Safety and reliability

These come from two full code reviews of the app. Every finding is fixed.

- **Install only flashes the saber you picked**, even if another board enters bootloader mode during the reboot. Hiltwright writes to a board only within a few minutes of reading it, and only once per reading.
- **A failed flash that leaves the board unreadable** can still be undone: **Put back** writes the backup without reading the board first, and says so.
- **Card writes go only to the card that was read.** A different card at the same drive letter is not written to. Getting a card ready keeps a copy of the card's own presets before the old presets file is removed.
- **Font copies and imports** that fail part way leave no partial font behind. Two copies to one card at once can no longer leave a font half-copied but reported as copied.
- **Only one copy of Hiltwright runs** on one data folder, so two copies cannot overwrite each other's data. Saved data is flushed to disk, a file that is only busy is no longer treated as damaged, and a store recovered from its backup stays recovered.
- **An interrupted voice pack install** is undone exactly.
- **Preset history** lists quickly, keeps no duplicates, and thins old everyday snapshots to one a day. A snapshot file cut short is marked incomplete and cannot be restored.
- **Pasted styles** with comments inside or after the code are accepted.
- **Diagnostics** hide more of your home folder's paths, and show only the last four characters of serial numbers.
- **The packaged app** is harder to tamper with: the compiler folder must belong to you or the administrators, zip files are size-checked as they are read, and the app's own code can only load from its install.

### Words

- **Notes and help pages name what they mean** instead of starting with "It" or "Its", where that was unclear.

## New in 0.2.0-beta.15, for anyone who skipped it

Install › Presets has **Add** and **Duplicate**, with a bin button to delete. The Sound font and Track fields open pickers. The Styles page shows a style's code with **Copy the style**. "Can be switched off" is now **Power down when retracted**. Headings and labels are no longer selected by a stray drag.

## New in 0.2.0-beta.14, for anyone who skipped it

Two fixes to the Card step. Install › Card no longer says a card is "ready for the flash" when the saber did not answer. The six free fonts are now copied to the card from the fonts that come with Hiltwright.

## New in 0.2.0-beta.13, for anyone who skipped it

The sidebar is laid out around what you are doing with a saber: the **Armory** lists your sabers, **Install** is the five steps that set a saber up and flash it (Wiring, Fonts, Presets, Card, Build & Flash), and **Live** changes a saber that is already flashed and plugged in, with nothing built. Install › Card gets the card ready in one trip to a card reader. Voice packs from Brian Conner (NoSloppy) are included for the Fett263 controls. The release notes for 0.2.0-beta.13 have the full list.

**The macOS test build** is attached: `Hiltwright-0.2.0-beta.16-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.16-mac-x64.dmg` for Intel Macs. It is still an unsupported test build. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build has not been run at all. If you try it, tell us what happens.

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

The macOS build is not signed with an Apple certificate, so macOS asks before it opens the app:

1. Open the disk image and drag Hiltwright to Applications.
2. Open Hiltwright once. macOS refuses, because the app is not from an identified developer.
3. Open System Settings, Privacy & Security, scroll down, and press **Open Anyway**.

If macOS says the app is damaged, the app is intact. macOS shows that message for the mark it puts on downloads. In Terminal, `xattr -dr com.apple.quarantine /Applications/Hiltwright.app` removes it.

The six free sound fonts are not in the macOS build, and the macOS build does not update itself: download a newer disk image by hand. Hiltwright backs up the saber's firmware before every install, on a Mac as on Windows.

## Free sound fonts

The six free ProffieOS fonts are included and can be copied to a card from Install › Card or Live › Card.

## Install

If you are on 0.2.0-beta.3 or later, open About, press Check now, then Download, then Restart to update.

If you are coming from 0.2.0-beta.1 or 0.2.0-beta.2, download this installer and run it. The installer goes over the old version and keeps your sabers, styles, fonts and backups. After that, Hiltwright updates itself.

The installer is unsigned, so Windows will warn you before it runs. If Smart App Control is on, Windows blocks both the installer and the app, and Smart App Control has to stay off while you use this beta: check that first (install guide, section 3). The install guide covers each Windows barrier to unsigned software.

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.16/docs/install-guide.md

## License and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.16

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it is fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
