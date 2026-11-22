---
title: Troubleshooting
summary: Symptoms, causes and fixes for the problems beta testers are most likely to meet, from Windows warnings to a saber that says "font directory not found".
section: Help
order: 2
---
Find the symptom that matches what you see. Each one gives the cause and the fix. If yours is not here, go to [Reporting a problem](#reporting-a-problem) at the end.

## Windows blocks the installer or the app

**Windows says "Windows protected your PC".** This is SmartScreen. This Hiltwright beta is not signed, so Windows warns about it. Choose **More info**, then **Run anyway**.

**Your browser flags the download.** Edge and Chrome ask whether to keep the file. Choose **Keep**. It may be under a **...** or arrow menu beside the download.

**Windows marks the file as downloaded.** Right-click the installer, choose **Properties**, tick **Unblock** on the **General** tab, and choose **OK**. If you do not see **Unblock**, the file is not marked.

**There is no "Run anyway" button, or the app will not open.** Smart App Control is probably **On**. When it is on, Windows blocks both the installer and the installed app, because the beta is not signed. Windows says "We blocked ... because we could not verify its publisher to confirm it was safe to run."

1. Open **Windows Security**.
2. Choose **App & browser control**.
3. Choose **Smart App Control settings**.
4. If it says **On**, you can use another PC, or choose **Off**.

> **Warning:** Turning Smart App Control off lowers the protection of your PC for every app. On older Windows 11 versions you cannot turn it back on without resetting Windows. Read Microsoft's page first. It is not enough to turn it off only for the install: with it back on, Windows blocks Hiltwright when you open it. It has to stay off as long as you use this beta.

**It says Evaluation.** Smart App Control is only watching for now. It may switch itself to On or Off later.

**Windows is in S mode.** S mode can only run Microsoft Store apps, so Hiltwright cannot run. Microsoft says you can leave S mode for free, but you cannot go back.

**Your antivirus flags a file.** Unsigned files are sometimes flagged by mistake. Do not turn your antivirus off. Note the file name and the warning and report it. You can also submit the file to Microsoft as a false positive. The full steps are in the [install guide](install.html).

## The saber is not detected

The top bar shows whether a saber is plugged in. Hiltwright connects by itself when you plug one in with a USB data cable.

- **Nothing happens.** Some cables only charge. Try another cable, ideally one you know carries data.
- **The saber is detected but you cannot flash.** The first install needs a one-time bootloader driver. See the next section.

If nothing works, save diagnostics and report it. The USB section of the file shows what the computer can see.

## "Windows needs a driver"

During your first install the Build page stops at "Windows needs a driver".

1. Put the board in bootloader mode if Hiltwright asks: hold BOOT, tap RESET, then release BOOT.
2. Choose **Install the driver**. Hiltwright downloads a small installer from the ProffieOS author, checks it and starts it.
3. Choose **Yes** when Windows asks for approval.
4. Leave the saber plugged in. The install carries on by itself.

If you choose **No**, the driver is not installed and you cannot flash. If you see "Still no driver (Windows reports ...)", run the installer again with the board plugged in, then check again. If you see "The board is no longer in bootloader mode", hold BOOT, tap RESET, release BOOT, then check again.

## The compiler setup fails

The first build needs a one-time download of about 360 MB. A red note on the Compiler step can say there is not enough disk space or that the folder path is too long. Free some space and choose **Try again**. You need about 2.5 GB free. Setup uses a folder in your own profile when its path is short enough for the compiler, otherwise `C:\ProgramData\Hiltwright`. An existing install in `C:\ProgramData\Hiltwright` keeps working.

If another Windows account owns the compiler folder, or can change it, Hiltwright runs nothing from it and an amber note offers **Repair**. Repair makes the folder yours or the administrators', and changeable only by administrators and your account. If another account had put files there, Repair removes them, and **Download and install** sets the compiler up again. Windows may ask for approval.

## A build fails

A failed build shows a red note, such as "Could not build: ...", or the first problem the compiler found. The **Log** tab has the full output.

- If you recently pasted or built a style, remove it from the preset and build again. Only a build can say for certain whether the compiler accepts a style. The [Style editor](style-editor.html) checks a style before it saves, but it cannot catch everything.
- Press **Save diagnostics**, which appears beside the note, and report it.

## The install fails, or the saber does not come back

Leave the saber plugged in until the page says **Installed**. If the install stops, the page says: "If the saber does not show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Install again. A backup can always be put back from the Backups tab."

Every install reads the saber's whole firmware into a backup first. To undo an install, open the **Backups** tab on Build & Flash and press **Put back** on a backup. It writes that firmware to the saber exactly as it was. The presets and fonts on the SD card are not touched. See [Build & Flash](build-and-install.html).

If the note says "Writing failed", the board stays in bootloader mode. Leave it plugged in and press **Put back** on the backup from just before. The board cannot be backed up in that state, so the backup goes back without one, and an amber note says so.

## Install says another saber is plugged in, or that the saber has changed

An install only goes to the saber you picked in the [Armory](armory.html). If a different saber is plugged in, Install refuses. Unplug it, or pick that saber.

If Build & Flash or Install › Presets says "(saber) has changed since this list was made", the saber's presets were changed after you started your list, for example on Live › Presets. Installing your list would replace those changes. On [Presets](presets.html), choose **Bring in the saber's presets** (your list is kept as a preset set first) or **Keep my list**.

## The card will not share, or will not give back

On Live › Card, **Share the saber's card** makes the card appear as a drive on the computer. It can take 10 to 30 seconds for the drive to show up, and copying over it is slow: the saber's USB runs at USB 1.1 speed, about 30 times slower than a card reader. For more than a small fix, take the card out and use a card reader. While it waits, **Keep waiting** looks again, for up to three minutes. The blade goes off and sound stops until you give the card back.

**Give the card back** is sometimes refused while File Explorer has the card open. Close that window and try again. The second try usually works. If Hiltwright cannot tell which drive is the saber's card, it asks you to use **Safely Remove** in Windows, then press **Give the card back** again.

A shared card blocks other work on purpose. Changes on Live › Presets, "Use it in" on the Styles page, and installs all wait until the card is back, because the saber saves its settings on the card. Give the card back first.

If the page says the firmware cannot share its card over USB, it needs Hiltwright firmware. Build and install it, or put the card in a reader.

## The saber says "font directory not found"

Each preset names a sound font by its folder name. If the font is not on the card, the saber says "font directory not found" on every preset change. This happens after an install when the presets name fonts such as TeensySF or SmthJedi that were never copied onto the card.

Fix it in one of three ways. On Install › [Card](card.html), the trip copies the fonts you chose that the card lacks. On [Live › Card](fonts-and-sd.html), the **Preset fonts** tab lists the fonts the presets use but the card lacks, with a one-click copy. Or choose another font on the Presets page. If the font is not in your library, add it on [Fonts](fonts.html) first.

## The saber says "error in font directory"

The folders are there, but a sound in one of them has more files than ProffieOS expects. It says this on every preset change when the sound is in `common`, which every preset uses. The usual cause is two voice packs mixed together: an older pack's loose menu sounds (`mnum1.wav`, `mnum2.wav`…) beside a newer pack's `mnum` folder. ProffieOS counts both sets.

Hiltwright says which sounds are in `common` twice, on Install › [Fonts](fonts.html) and on Live › Card. To fix it, run the trip on Install › [Card](card.html), or put the voice pack on again on Live › Card. Either way the old loose files are moved aside, and a copy of them is kept on this computer.

## The saber says "voice pack not found"

This happens with the Fett263 prop when the voice pack is not on the card, is too old, or the preset does not use the `common` folder where it lives. The Build & Flash page says which. To put a version 2 pack in `common`, use the voice pack note on [Live › Card](fonts-and-sd.html). If the card has it, turn on **Also use common sounds** for the preset on the Presets page. See [Controls](diagnostics.html).

## Fonts show "Missing"

On Live › Card or on Fonts, a font a preset names can show **Missing**. It means the font is missing from the card, from your [Font library](font-library.html) and from every font pack. Add it to the library, then copy it to the card.

A font with issues in the library shows an amber or red chip. Open the font to read each issue. A font with no hum, or with both `clash1.wav` and `clsh01.wav` style names, is red and needs fixing before it will sound right.

If a card is formatted exFAT or NTFS, a saber cannot read it. Hiltwright warns before copying. The card must be FAT32.

## The preview differs from the blade

The preview runs the same math as the saber. A few things are left unmodeled.

- A note on a style says "The preview is only approximate for ..." or "The preview cannot show ... yet". Those parts may differ on the saber.
- On the built-in styles, drag and lightning block change with twist and blade angle on the blade. The preview does not show that change.
- Sound in the preview is a stand-in, so a style that follows the hum can flicker a little differently.
- The number of LEDs matters. A longer or shorter blade changes how a style fills it. In the [Demo room](demo-room.html), set the blade length and strip density in the Scene panel.

## Reporting a problem

1. Press **Save diagnostics** on the Controls page, or on the fault screen or failed build note. It saves a file on your computer and sends nothing. Your user folder, user name and computer name are replaced, and serial numbers show only their last four characters.
2. Open [github.com/safwyls/hiltwright/issues](https://github.com/safwyls/hiltwright/issues).
3. Say what happened and which step you were on.
4. Attach the diagnostics file.

Each report is answered: it is fixed, planned for a later release, or closed with a reason.
