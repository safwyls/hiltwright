# Hiltwright 0.2.0-beta.17

## New in this beta

### The workshop on the website

- **Try Hiltwright's styles and build your own in a browser**, with nothing installed: [hiltwright.com/workshop](https://www.hiltwright.com/workshop/). It runs the app's own Styles page, style editor and Demo room. There's no saber there, so anything that touches one stays in the app.
- **In the browser Demo room**, open a font folder (one font, or a folder of fonts) to hear it. The sounds are read in the browser and sent nowhere. The room opens with Punk Saber, the app's built-in hilt.
- **Styles made on the website come into the app as a file.** Press **Save for the app** there, or **Save all**, and you get a `.hwstyle` file.

### Styles

- **Import styles** on the Styles page takes a `.hwstyle` file from the website or from another copy of Hiltwright. Each style is checked the way a style you save in the app is checked, and one that fails is left out and counted. A style you already have isn't added twice. A different style that happens to share an id is added beside yours, so neither replaces the other.

### Demo room

- **The saber panel keeps its tabs in a short window.** On smaller displays the tab row was squeezed and the Saber tab's content rode up over it. Now the tabs and the Ignite, Hit and Hold buttons keep their place, and only the tab's content scrolls between them.

## New in 0.2.0-beta.16, for anyone who skipped it

Share a saber's setup as a `.hwsaber` file from the Armory, and import one. With two sabers plugged in, picking one in the Armory connects to that one, and each shows its COM port. Live › Presets writes a colour when you let go of the picker, not during a drag. Force is on a button and the F key in the Demo room. Every finding from two full code reviews is fixed: installs only flash the saber you picked, card writes only go to the card that was read, interrupted copies leave nothing half-done, and the packaged app is harder to tamper with. The release notes for 0.2.0-beta.16 have the full list.

## New in 0.2.0-beta.15, for anyone who skipped it

Install › Presets has **Add** and **Duplicate**, with a bin button to delete. The Sound font and Track fields open pickers. The Styles page shows a style's code with **Copy the style**. "Can be switched off" is now **Power down when retracted**. Headings and labels are no longer selected by a stray drag.

**The macOS test build** is attached: `Hiltwright-0.2.0-beta.17-mac-arm64.dmg` for Macs with Apple silicon, and `Hiltwright-0.2.0-beta.17-mac-x64.dmg` for Intel Macs. It's still an unsupported test build. Not yet confirmed on a Mac: installing firmware, the SD card, and how the window looks. The Intel build hasn't been run at all. If you try it, tell us what happens.

An installed copy from 0.2.0-beta.3 on updates to this beta by itself. If that doesn't work for you, install this beta by hand and tell us.


## What Hiltwright is

Hiltwright is a desktop app that gives lightsaber owners coming from Crystal Focus X, Xenopixel and LGT boards everything ProffieOS can do. You don't need Arduino, C++, drivers or the style language.

## Who this beta is for

This is a closed beta for experts: installers and style builders who own a Proffieboard V2.2 or V3. It's for Windows. A macOS test build is attached for anyone willing to try one.

## What the beta promises

> "Plan your saber, choose styles and fonts, build custom styles, demo any premade or created style and font in the demo room, then build and install it, with live preset editing, all without touching Arduino or any code."

## What is hidden in this beta

Blade ID and the Xenopixel import are hidden behind one switch. The code stays in the app.

## What is not in this beta yet

- Card formatting. A card formatter isn't in this beta.
- Code signing.
- A supported macOS build, and Linux.

## The macOS test build

The macOS build isn't signed with an Apple certificate, so macOS asks before it opens the app:

1. Open the disk image and drag Hiltwright to Applications.
2. Open Hiltwright once. macOS refuses, because the app isn't from an identified developer.
3. Open System Settings, Privacy & Security, scroll down, and press **Open Anyway**.

If macOS says the app is damaged, the app is intact. macOS shows that message for the mark it puts on downloads. In Terminal, `xattr -dr com.apple.quarantine /Applications/Hiltwright.app` removes it.

The six free sound fonts aren't in the macOS build, and the macOS build doesn't update itself: download a newer disk image by hand. Hiltwright backs up the saber's firmware before every install, on a Mac as on Windows.

## Free sound fonts

The six free ProffieOS fonts are included and can be copied to a card from Install › Card or Live › Card.

## Install

If you're on 0.2.0-beta.3 or later, open About, press Check now, then Download, then Restart to update.

If you're coming from 0.2.0-beta.1 or 0.2.0-beta.2, download this installer and run it. The installer goes over the old version and keeps your sabers, styles, fonts and backups. After that, Hiltwright updates itself.

The installer is unsigned, so Windows will warn you before it runs. If Smart App Control is on, Windows blocks both the installer and the app, and Smart App Control has to stay off while you use this beta: check that first (install guide, section 3). The install guide covers each Windows barrier to unsigned software.

Install guide: https://github.com/safwyls/hiltwright/blob/v0.2.0-beta.17/docs/install-guide.md

## License and source

Hiltwright is licensed under GPL-3.0-or-later. The source for this build is at https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.17

## Report a problem

Open an issue at https://github.com/safwyls/hiltwright/issues. Each report is answered: it's fixed, planned for a later release, or closed with a reason.

When you report a problem, press "Save diagnostics" in the app and attach the file it saves.
