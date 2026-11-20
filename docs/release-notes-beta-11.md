# Hiltwright 0.2.0-beta.11

## New in this beta

- **Font packages made for several boards.** Font makers often put one font for every soundboard in one package. Hiltwright now looks inside each folder to tell which board it is for, and adds only the Proffie copies. Copies for Crystal Focus, Xenopixel, Verso and Asteria are left out, and so are folders of extras that are not whole fonts. The message afterwards says each thing once. A package made only for another board is still added, as before.
- **Select several fonts in the Font library.** Ctrl+click adds or removes a font, Shift+click selects from the last one you clicked, Ctrl+A selects every font shown, and Escape goes back to one. With several selected you can copy them to the card or remove them together, and you get one line per font saying what happened. Removed fonts go to the recycle bin.
- **Export fonts to one file.** Export one font, the fonts you selected, a bundle, or the whole library as a single compressed, encrypted file with the names, makers and notes you gave them. On another computer, press **Add export file** in the Font library to bring them in. A font that is already there is left as it is.
- **A passphrase for an export, if you want one.** With a passphrase, the file opens only for someone who knows it. Hiltwright does not keep the passphrase, so a file whose passphrase is lost cannot be opened. Without one, any copy of Hiltwright can open the file.
- **The demo room's hum starts when the room opens.** In the last beta the font's name played but the hum stayed silent until you retracted and ignited again.
- **The macOS test build** is attached: `Hiltwright-0.2.0-beta.11-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.11-mac-x64.dmg` for Intel Macs. It is still a test build, not a supported one. On a Mac, Hiltwright's tests pass, the first-time toolchain setup works and firmware builds. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build has not been run at all. If you try it, tell us what happens.

Not in an export: makers' logos and links. The maker's name travels with each font; its logo does not.

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
- Building fonts from sounds.

## The macOS test build

It is not signed with an Apple certificate, so macOS asks before it opens it:

1. Open the disk image and drag Hiltwright to Applications.
2. Open Hiltwright once. macOS refuses, because it is not from an identified developer.
3. Open System Settings, Privacy & Security, scroll down, and press **Open Anyway**.

If macOS says the app is damaged, that is the mark it puts on downloads, not real damage. In Terminal, `xattr -dr com.apple.quarantine /Applications/Hiltwright.app` removes it.

The six free sound fonts are not in the macOS build, and it does not update itself: download a newer disk image by hand. Hiltwright backs up the saber's firmware before every install, on a Mac as on Windows.

## Free sound fonts

The six free ProffieOS fonts are included and can be copied to a card from Fonts & SD.

## Install

On 0.2.0-beta.3 or later? Open About, press Check now, then Download, then Restart to update.

Coming from 0.2.0-beta.1 or 0.2.0-beta.2? Download this installer and run it. It installs over the old one and keeps your sabers, styles, fonts and backups. After that, Hiltwright updates itself.

The installer is unsigned, so Windows will warn you before it runs. If Smart App Control is on, Windows blocks both the installer and the app, and it has to stay off while you use this beta: check that first (install guide, section 3). The install guide covers each Windows barrier to unsigned software.

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.11/docs/install-guide.md

## Licence and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.11

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it is fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
