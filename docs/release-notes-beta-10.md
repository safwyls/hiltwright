# Hiltwright 0.2.0-beta.10

## New in this beta

- **A newer engine underneath.** Hiltwright is built on Electron, and this beta moves it from version 37, which no longer gets security fixes, to version 45. Nothing should look different. If something that worked in the last beta does not work in this one, tell us. On a Mac this beta needs macOS 13 or later; Windows 10 and 11 are unchanged.
- **File windows open where you left them.** Adding font packages, font folders, logos and hilts each start in the folder you last used for that, instead of Downloads every time.
- **The demo room opens with sound.** It used to open with no font, so it was silent, and choosing a font while the blade was lit did nothing until you retracted and ignited again. It now opens with the font you last used there, or the first one it finds, and a font you choose while the blade is lit plays straight away.
- **The count of styles waiting for a build fits its place** in the side list. It shows the number; hold the pointer over it for the rest.
- **The macOS test build** is attached again: `Hiltwright-0.2.0-beta.10-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.10-mac-x64.dmg` for Intel Macs. It is still a test build, not a supported one. On a Mac, Hiltwright's tests pass, the first-time toolchain setup works and firmware builds. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build has not been run at all. If you try it, tell us what happens.

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

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.10/docs/install-guide.md

## Licence and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.10

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it is fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
