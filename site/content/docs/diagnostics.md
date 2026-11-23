---
title: Controls
summary: Change a saber's volume and brightness, try effects, send ProffieOS commands, and save a file to attach to a problem report.
section: Live
order: 2
---
Live › Controls is a workbench for a plugged-in saber. It has settings you can change live, buttons that set off effects, a console that talks to the board, and the **Save diagnostics** button you use when something goes wrong. It works with any ProffieOS firmware, and each control is offered only if the firmware answers it. This page was called Diagnostics before.

## Saber settings

With a saber plugged in, the **Saber settings** panel reads three values from the board and lets you change them. Each is read back after a change, so the number you see is the one the saber holds.

- **Volume** runs from 0 to 3000. The compiled default is usually 1800, and above 2000 can distort small speakers.
- **Blade brightness** dims every blade, shown as a percentage. Lower saves battery and runs cooler.
- **Clash sensitivity** is the hit needed to register a clash, in g. Lower is more sensitive. Too low and swings trigger clashes.

A control that the firmware rejects stays hidden. If none work, the panel says "This firmware does not answer the settings commands. Hiltwright firmware does." Without a saber it says "Connect a saber to change its settings."

The saber saves these settings itself once its speaker goes quiet, so they survive a restart.

### Try an effect

**Ignite**, **Retract**, **Clash**, **Blast**, **Force** and **Stab** send the same triggers the buttons and motion sensors send. Clash, Blast, Force and Stab work only while the blade is lit. Keep the blade clear of anything breakable before igniting.

> **Note:** The saber keeps its settings, and plays its effects, from its SD card. While the card is shared with the computer, the sliders and effects are off and an amber note tells you to give the card back on [Live › Card](fonts-and-sd.html) first.

## The console

The console shows what the board prints. Lines the board sends on its own show in amber. Type a command in the box ("Type a command") and press **Send**. The box is off until a saber is connected.

Across the top are quick buttons. Every one only reads from the saber: **version**, **battery**, **get_volume**, **get_preset**, **show_current_preset**, **list_fonts**, **list_tracks** and **scanid**.

### Commands that ask first

Some typed commands can do harm, so Hiltwright holds them and asks. It looks at the first word of each command, including every command in a line chained with a semicolon.

- Words that restart the board, such as `reboot`, `reset`, `restart`, `dfu`, `bootloader` or `poweroff`, give this warning: "... restarts the saber. The connection will drop, and any change that was not saved is lost."
- Words that remove, overwrite or reformat files on the card, such as `del`, `rm`, `format`, `mv`, `rename`, `cp`, `copy` or `write`, give this one: "... can delete or overwrite files on the saber's SD card, and there is no undo."

You then see an amber question, "Send ... anyway?", with **Send it** and **Do not send**. Everything else is sent straight away. The list leans toward asking, so a harmless command may sometimes be held too.

## The voice pack check

Some props, such as the Fett263 button controls, speak their menus from a voice pack kept in the `common` folder on the saber's card. Hiltwright checks for it by asking the saber over the same serial link as the console. It reads `common/voicepack.ini` and lists the folder. You do not need a card reader.

The result shows on the **Build & Flash** page. It says one of:

- "Voice pack version ... found on the card. Fett263 button controls will speak their menus."
- "No voice pack found in the common folder." with what to put there.
- That the card has an older version than the firmware needs.
- That a preset does not use the `common` folder, so the saber will say "voice pack not found" on it. Turn on **Also use common sounds** for that preset on the Presets page.
- "Hiltwright could not check the voice pack on this card", with the reason. That does not mean it is missing.

The check is skipped while the card is shared with the computer.

## Save diagnostics

If something goes wrong, press **Save diagnostics**. The same button appears on the fault screen and beside a failed build or install on Build & Flash.

Save diagnostics writes one plain text file on this computer, then opens the folder with the file selected. The page tells you: "Saved ... The folder holding the file is open; you can read the file before sending it." **Hiltwright sends the file nowhere.** You attach it to your report yourself.

The file is named `hiltwright-diagnostics-` followed by the date and time. Hiltwright keeps the latest ten. It is kept small, and the oldest log lines are cut first if it grows.

### What is in it

- **About**: the Hiltwright version, whether it is a packaged build, the Windows version, and the Electron and Chromium versions.
- **Toolchain**: whether the compiler setup is installed and what it found.
- **USB**: what USB boards the computer can see, and the bootloader driver state.
- **Connection**: whether the saber is connected, any error, and the port.
- **Saber**: the saber record you are working on.
- **Last build in this run**: whether it passed, how long it took, how much flash it used, and any warnings or problems.
- **Log**: the log of this run, and the end of the previous run's log.

### What is left out

Your style code, the generated configuration, fonts, hilt models and backups are never included. Personal details are replaced before the file is written. Your user folder becomes `%USERPROFILE%`, also where it is written as a `file:///` address or in its short form (like `C:\Users\SAMSMI~1`). Your Windows user name becomes `<user>`, and your computer's name becomes `<computer>`. Serial numbers of boards and SD cards show only their last four characters, like `****5232`, so two boards can still be told apart. The app's own log files on your computer are written the same way.

Open the file and read it before you attach it. To report a problem, go to [github.com/safwyls/hiltwright/issues](https://github.com/safwyls/hiltwright/issues), say what happened and which step you were on, and attach the file. See also [Troubleshooting](troubleshooting.html).

Next: [Card](fonts-and-sd.html).
