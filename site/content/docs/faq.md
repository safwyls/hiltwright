---
title: FAQ
summary: Short answers to the questions beta testers ask most, from which boards work to what Hiltwright sends over the internet.
section: Help
order: 3
---
## Which boards and systems does it support?

The Proffieboard V2.2 and V3, running ProffieOS 8.x. Hiltwright runs on Windows 10 or 11, 64-bit (Windows in S mode is not supported), and on macOS 13 or later, on Apple silicon and Intel Macs.

## Is it free? Is it open source?

Yes to both. Hiltwright is licensed under GPL-3.0-or-later. You may use, change and share it under those terms. The source of each build is on GitHub, and the [About page](settings.html#about) links to the source of the exact build you run.

## Do I need Arduino or to write code?

No. Hiltwright writes the settings file for you, builds the firmware and installs it over USB. You never need to read C++. The Config tab on Build & Flash shows what it wrote, if you are curious.

The first build needs a one-time download of about 360 MB of compiler tools. After that, a build takes about a minute.

## Will it overwrite my saber? Can I undo it?

An install replaces the firmware on the board. Before it does, Hiltwright reads the saber's whole firmware into a backup file. To undo an install, use **Put back** on the Backups tab. **Put back** writes the old firmware back exactly as it was.

The presets and fonts on the SD card are not touched by an install or a put back. When a new list of presets replaces the saber's, Hiltwright keeps a copy of the saber's own presets first, so they can be put back. See [Build & Flash](build-and-install.html).

## Does it send my data anywhere?

Hiltwright reaches the internet for three things. The first-run setup downloads the compiler tools and the ProffieOS source from GitHub and from the ProffieOS author's package index. The first install downloads a small bootloader driver from the ProffieOS author, and Windows asks you once to approve it.

And versions from 0.2.0-beta.3 on look for a newer Hiltwright: a little after they start, and every few hours, they ask GitHub for Hiltwright's list of releases. The check sends nothing about your sabers or you; GitHub sees your internet address, as with any web page. A new version is downloaded only when you press **Download**, and installed only when you press **Restart to update**. Turn **Check for updates when Hiltwright starts** off on the [About page](settings.html#about) to stop the checks; **Check now** still works.

**Save diagnostics** writes a file on your computer and sends nothing. You attach it to a report yourself. Style code, fonts, hilt models and backups are never put in it, your user name and computer name are replaced, and serial numbers show only their last four characters.

## Does it work on Mac or Linux?

Hiltwright works on a Mac, from 0.2.0-beta.7: each release carries a disk image for Apple silicon and one for Intel. macOS is the newer of the two systems. On a Mac Hiltwright sets up its toolchain and builds firmware; installing to a saber has not been confirmed there yet, the six free sound fonts are not included, and the Mac app does not update itself. The Mac app is not signed, so macOS asks before it opens it; the release notes say how. There is no Linux build.

## Windows warns me about the installer. Is that normal?

Yes. The beta is not signed, so Windows shows warnings such as "Windows protected your PC". Choose **More info**, then **Run anyway**. If Smart App Control is **On**, Windows blocks the installer and the app with no way to allow just one app. Smart App Control has to be off as long as you use the beta. See [Install](install.html) and [Troubleshooting](troubleshooting.html).

## Where do sound fonts come from?

You bring them. Fonts you buy or download go into the [Font library](font-library.html) as a `.zip` package or a folder. Six free ProffieOS fonts come with Hiltwright: TeensySF, SmthJedi, SmthGrey, SmthFuzz, RgueCmdr and TthCrstl. Choose the fonts a saber carries on [Install › Fonts](fonts.html). They are copied to the card on Build & Flash, or one at a time on [Live › Card](fonts-and-sd.html).

Hiltwright does not build fonts from raw sounds.

## Can I use Fett263 styles?

Yes. On the [Styles](styles.html) page, press **Paste style code** and paste the whole block from the Fett263 style library, comments included. Say who made it, and the credit stays with the style. Hiltwright never redistributes the library itself. You can also paste a style into the Full style editor to edit it.

The preview may be only approximate for some parts of a pasted style. A note tells you which.

## Can I build my own styles?

Yes. The [Style editor](style-editor.html) has a Simple mode with plain blocks and a Full mode that shows every ProffieOS layer. A live blade shows each change. The [Demo room](demo-room.html) lets you swing the style with a sound font before you install anything.

## Do I need a saber to start?

No. **New saber** in the Armory sets one up ahead: wiring, presets and styles, ready to install. When you plug the real saber in, Hiltwright asks whether it is the one you planned. The tour in the app uses an example saber, so you can see every page.

## What is the difference between Install and Live?

**Install** sets a saber up. You choose its wiring, fonts and presets, build firmware, get the card ready and install. Nothing reaches the saber until the install. **Live** adjusts a saber that is plugged in and already installed. A change on Live › Presets is written to the saber at once, with no build. See [Live › Presets](live-presets.html).

## Why use a card reader?

The saber's own USB is slow: it runs at USB 1.1 speed. In a test, one font took about 4 seconds in a card reader and about 120 seconds over the saber's USB, about 30 times slower. Install › [Card](card.html) asks you to take the card out and put it in a reader for the copy. Sharing the card over the saber's USB still works, on [Live › Card](fonts-and-sd.html), and suits a small fix.

## What is not in this beta?

Card formatting, code signing and Linux are not in this beta. A couple of features are switched off for now and are not covered in these pages. Known gaps are tracked in the project's later list on GitHub.

## How do I report a problem or give feedback?

Press **Save diagnostics** on the [Controls](diagnostics.html) page, then open an issue at [github.com/safwyls/hiltwright/issues](https://github.com/safwyls/hiltwright/issues). Say what happened, which step you were on, and attach the file. Each report is answered: it is fixed, planned for a later release, or closed with a reason.
