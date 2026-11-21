# Hiltwright 0.2.0-beta.12

## New in this beta

- **An export carries the makers' logos and links.** When you export fonts to one file, the logo and link you keep for each of their makers go with them. On the other computer, **Add export file** adds the ones that are missing there. A logo or link you already have for a maker is never replaced.
- **Files from 0.2.0-beta.11 still work**, and 0.2.0-beta.11 can open files made by this beta: it brings in the fonts and leaves the logos and links.
- **The macOS test build** is attached: `Hiltwright-0.2.0-beta.12-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.12-mac-x64.dmg` for Intel Macs. It is still an unsupported test build. On a Mac, Hiltwright's tests pass, the first-time toolchain setup works and firmware builds. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build has not been run at all. If you try it, tell us what happens.

New in 0.2.0-beta.11, for anyone who skipped it: font packages made for several boards add only the Proffie copies; several fonts can be selected and copied to the card, removed or exported together; and one font, a selection, a bundle or the whole library can be exported to a single encrypted file, with a passphrase if you want one.

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

The six free ProffieOS fonts are included and can be copied to a card from Fonts & SD.

## Install

If you are on 0.2.0-beta.3 or later, open About, press Check now, then Download, then Restart to update.

If you are coming from 0.2.0-beta.1 or 0.2.0-beta.2, download this installer and run it. It installs over the old one and keeps your sabers, styles, fonts and backups. After that, Hiltwright updates itself.

The installer is unsigned, so Windows will warn you before it runs. If Smart App Control is on, Windows blocks both the installer and the app, and it has to stay off while you use this beta: check that first (install guide, section 3). The install guide covers each Windows barrier to unsigned software.

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.12/docs/install-guide.md

## License and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.12

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it is fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
