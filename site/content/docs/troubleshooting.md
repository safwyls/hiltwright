---
title: Troubleshooting
summary: Symptoms, causes and fixes for the problems beta testers are most likely to meet, from Windows warnings to a saber that says "font directory not found".
section: Help
order: 2
---
Find the symptom that matches what you see, and each one gives the cause and the fix. If yours isn't here, go to [Reporting a problem](#reporting-a-problem) at the end.

## Windows blocks the installer or the app

**Windows says "Windows protected your PC".** This is SmartScreen, and Windows warns about this Hiltwright beta since the beta isn't signed. Choose **More info**, then **Run anyway**.

**Your browser flags the download.** Edge and Chrome ask whether to keep the file, so choose **Keep** (**Keep** may be under a **...** or arrow menu beside the download).

**Windows marks the file as downloaded.** Right-click the installer, choose **Properties**, tick **Unblock** on the **General** tab, and choose **OK**. If you don't see **Unblock**, the file isn't marked.

**There is no "Run anyway" button, or the app will not open.** Smart App Control is probably **On**. Since the beta isn't signed, Smart App Control blocks both the installer and the installed app, and Windows says "We blocked ... because we could not verify its publisher to confirm it was safe to run."

1. Open **Windows Security**.
2. Choose **App & browser control**.
3. Choose **Smart App Control settings**.
4. If the setting says **On**, you can use another PC, or choose **Off**.

> **Warning:** Turning Smart App Control off lowers the protection of your PC for every app, and on older Windows 11 versions you can't turn Smart App Control back on without resetting Windows, so read Microsoft's page first. Turning Smart App Control off only for the install isn't enough either: with Smart App Control back on, Windows blocks Hiltwright when you open it. Smart App Control has to stay off as long as you use this beta.

**The setting says Evaluation.** Smart App Control is only watching for now, and may switch itself to On or Off later.

**Windows is in S mode.** S mode can only run Microsoft Store apps, so Hiltwright can't run there. Microsoft says you can leave S mode for free, but you can't go back.

**Your antivirus flags a file.** Unsigned files are sometimes flagged by mistake. Please don't turn your antivirus off; note the file name and the warning, and report them to us. You can also submit the file to Microsoft as a false positive, and the full steps are in the [install guide](install.html).

## The saber is not detected

The top bar shows whether a saber is plugged in, and Hiltwright connects by itself when you plug one in with a USB data cable.

- **Nothing happens.** Some cables only charge, so try another cable, ideally one you know carries data.
- **The saber is detected but you cannot flash.** The first install needs a one-time bootloader driver (see the next section).

If nothing works, save diagnostics and report the problem. The USB section of the diagnostics file shows us what the computer can see.

## "Windows needs a driver"

During your first install the Build page stops at "Windows needs a driver".

1. Put the board in bootloader mode if Hiltwright asks: hold BOOT, tap RESET, then release BOOT.
2. Choose **Install the driver**, and Hiltwright downloads a small installer from the ProffieOS author, checks the installer and starts it.
3. Choose **Yes** when Windows asks for approval.
4. Leave the saber plugged in, and the install carries on by itself.

Hiltwright checks the installer a second time when starting it, and holds the file so nothing can change the file in between. If you see "The driver installer changed after it was checked", choose **Install the driver** again and Hiltwright downloads a fresh copy.

If you choose **No**, the driver isn't installed and you can't flash. If you see "Still no driver (Windows reports ...)", run the installer again with the board plugged in, then check again. If you see "The board is no longer in bootloader mode", hold BOOT, tap RESET, release BOOT, then check again.

## The compiler setup fails

The first build needs a one-time download of about 360 MB. A red note on the Compiler step can say there isn't enough disk space or that the folder path is too long, so free some space and choose **Try again** (you need about 2.5 GB free). Setup uses a folder in your own profile when that folder's path is short enough for the compiler, and otherwise uses `C:\ProgramData\Hiltwright`. An existing install in `C:\ProgramData\Hiltwright` keeps working.

If another Windows account owns the compiler folder, or can change the folder, Hiltwright runs nothing from it and an amber note offers **Repair**. Repair makes the folder yours or the administrators', and changeable only by administrators and your account. If another account had put files there, Repair removes them, and **Download and install** sets the compiler up again (Windows may ask for approval).

## A build fails

A failed build shows a red note, such as "Could not build: ...", or the first problem the compiler found, and the **Log** tab has the full output.

- If you recently pasted or built a style, remove that style from the preset and build again. Only a build can say for certain whether the compiler accepts a style, and while the [Style editor](style-editor.html) checks a style before saving, the editor can't catch everything.
- Press **Save diagnostics**, which appears beside the note, and report the failed build.

## The install fails, or the saber does not come back

Leave the saber plugged in until the page says **Installed**. If the install stops, the page says: "If the saber does not show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Install again. A backup can always be put back from the Backups tab."

Every install reads the saber's whole firmware into a backup first, so you can undo an install by opening the **Backups** tab on Build & Flash and pressing **Put back** on a backup. **Put back** writes that firmware to the saber exactly as it was, and the presets and fonts on the SD card aren't touched. See [Build & Flash](build-and-install.html).

If the note says "Writing failed", the board stays in bootloader mode. Leave the board plugged in and press **Put back** on the backup from just before. The board can't be backed up in that state, so the backup goes back without one, and an amber note says so.

If the note says "This board was not read just before, so nothing was written", press **Install** or **Put back** again. Hiltwright writes to a board only within a few minutes of reading that board, and only once per reading.

## Install says another saber is plugged in, or that the saber has changed

An install only goes to the saber you picked in the [Armory](armory.html), so if a different saber is plugged in, Install refuses. Unplug the other saber, or pick that saber instead.

If Build & Flash or Install › Presets says "(saber) has changed since this list was made", the saber's presets were changed after you started your list (for example on Live › Presets), and installing your list would replace those changes. On [Presets](presets.html), choose **Bring in the saber's presets** (your list is kept as a preset set first) or **Keep my list**.

## The card will not share, or will not give back

On Live › Card, **Share the saber's card** makes the card appear as a drive on the computer. The drive can take 10 to 30 seconds to show up, and copying over it is slow, since the saber's USB runs at USB 1.1 speed (about 30 times slower than a card reader). For anything more than a small fix, we recommend taking the card out and using a card reader. While Hiltwright waits for the drive, **Keep waiting** looks again, for up to three minutes. The blade goes off and sound stops until you give the card back.

**Give the card back** is sometimes refused while File Explorer has the card open, so close that window and try again (the second try usually works). If Hiltwright can't tell which drive is the saber's card, Hiltwright asks you to use **Safely Remove** in Windows, then press **Give the card back** again.

A shared card blocks other work on purpose, since the saber saves its settings on the card. Changes on Live › Presets, "Use it in" on the Styles page, and installs all wait until the card is back, so give the card back first.

If the page says the firmware can't share the card over USB, the saber needs Hiltwright firmware. Build and install Hiltwright firmware, or put the card in a reader.

## The saber says "font directory not found"

Each preset names a sound font by its folder name, and if that font isn't on the card, the saber says "font directory not found" on every preset change. This happens after an install when the presets name fonts such as TeensySF or SmthJedi that were never copied onto the card.

You can fix this three ways. On Install › [Card](card.html), the trip copies the fonts you chose that the card lacks. On [Live › Card](fonts-and-sd.html), the **Preset fonts** tab lists the fonts the presets use but the card lacks, with a one-click copy. Or choose another font on the Presets page (if the font isn't in your library, add the font on [Fonts](fonts.html) first).

## The saber says "error in font directory"

The folders are there, but a sound in one of them has more files than ProffieOS expects. When that sound is in `common`, which every preset uses, the saber says this on every preset change. The usual cause is two voice packs mixed together, with an older pack's loose menu sounds (`mnum1.wav`, `mnum2.wav`…) sitting beside a newer pack's `mnum` folder, and ProffieOS counts both sets.

Hiltwright says which sounds are in `common` twice, on Install › [Fonts](fonts.html) and on Live › Card. To fix the error, run the trip on Install › [Card](card.html), or put the voice pack on again on Live › Card. Either way the old loose files are moved aside, and a copy of them is kept on this computer.

## The saber says "voice pack not found"

This happens with the Fett263 prop when the voice pack isn't on the card, is too old, or the preset doesn't use the `common` folder where the pack lives, and the Build & Flash page says which. To put a version 2 pack in `common`, use the voice pack note on [Live › Card](fonts-and-sd.html). If the card has the pack, turn on **Also use common sounds** for the preset on the Presets page. See [Controls](diagnostics.html).

## Fonts show "Missing"

On Live › Card or on Fonts, a font a preset names can show **Missing**, which means the font is missing from the card, from your [Font library](font-library.html) and from every font pack. Add the font to the library, then copy it to the card.

A font with issues in the library shows an amber or red chip, and you can open the font to read each issue. A font with no hum, or with both `clash1.wav` and `clsh01.wav` style names, is red and needs fixing before the font will sound right.

If a card is formatted exFAT or NTFS, a saber can't read it, so Hiltwright warns before copying. The card must be FAT32.

## The preview differs from the blade

The preview runs the same math as the saber, though a few things are left unmodeled.

- A note on a style says "The preview is only approximate for ..." or "The preview cannot show ... yet". Those parts may differ on the saber.
- On the built-in styles, drag and lightning block change with twist and blade angle on the blade, and the preview doesn't show that change.
- Sound in the preview is a stand-in, so a style that follows the hum can flicker a little differently.
- The number of LEDs matters, since a longer or shorter blade changes how a style fills it. In the [Demo room](demo-room.html), set the blade length and strip density in the Scene panel.

## Reporting a problem

1. Press **Save diagnostics** on the Controls page, or on the fault screen or failed build note. The button saves a file on your computer and sends nothing, and in that file your user folder, user name and computer name are replaced (serial numbers show only their last four characters).
2. Open [github.com/safwyls/hiltwright/issues](https://github.com/safwyls/hiltwright/issues).
3. Say what happened and which step you were on.
4. Attach the diagnostics file.

We answer every report: the problem gets fixed, planned for a later release, or closed with a reason.
