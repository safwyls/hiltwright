---
title: Presets
summary: Change a plugged-in saber's presets on the saber itself, with each change written at once, and undo from History.
section: Live
order: 1
---
Live › Presets edits the presets on the saber that's plugged in, right now, with nothing built or installed. Live › Presets works with any ProffieOS firmware, not only firmware that Hiltwright built.

To change the list for the next install instead, use [Install › Presets](presets.html).

## Live on the saber

A chip above the editor says "Live on the saber", and each change is written to the saber right away. The chip shows "Writing" and what's being written, then "Saved" once the saber reads the change back. The preset the saber has selected is the one you're editing. If a write fails, the chip says what failed and the page shows what the saber reports.

This page always shows the saber's own list, never a draft.

## When it is read-only

Every control is off, with a note, when:

- the saber isn't plugged in. The page shows the saber's presets as last read with the card in (a connect with the card out doesn't replace them, since the saber then reports only its firmware's own list), and says "Plug (saber) in to change it";
- the saber can't read its card. Presets are saved on the SD card, so the note says "has no readable SD card". Put the card back and reconnect;
- the card is shared with your computer. The chip says "Card shared", so give the card back on [Live › Card](fonts-and-sd.html) first.

## What you can change

The editor is the same as on Install › Presets: the preset list with its arrows, **Duplicate** and the bin button to delete, then name, font, track and a style for each blade. There's no **Add** here: ProffieOS can copy a preset on the saber but has no command for a fresh one, so duplicate a preset and change the copy. The saber always keeps at least one preset, so the bin is off for the last one. A color is written when you let go of the picker or close it, and nothing is written while you drag, so the saber gets one change instead of a stream of them. The fields work as described on [Presets](presets.html).

Here you can only choose styles that are already in the saber's firmware. A style that isn't in the firmware has to be built in, so choose that style in Install › Presets, and the style goes on with the next install.

A font should be on the card, and the line under the font says whether it is. To put a font on the card without a new install, see [Live › Card](fonts-and-sd.html).

## Try it

The **Try it** tab has controls for trying the saber out: ignite, retract and the effects, the same ones as on [Live › Controls](diagnostics.html). Without a saber plugged in, the tab says to plug the saber in.

## History

The **History** tab lists snapshots. Hiltwright keeps a snapshot of the saber's presets when the saber connects and before every change written to it. The newest entry says **Undo**, and older ones say **Restore**.

A snapshot that would be the same as the newest one isn't kept again. Nothing is kept on connect when the saber can't read its card, since the saber then shows the presets built into its firmware, not its own. Each saber keeps its newest 200 of these everyday snapshots, and older ones are thinned to one a day. Snapshots taken before a restore, an install, or the card being prepared are always kept.

Pressing **Undo** or **Restore** shows what a restore would change before anything is sent. You may be offered:

- **Restore this preset**, which changes only the one preset that differs.
- **Restore the whole list**, with a numbered list of each change.

If the saber already matches the snapshot, Hiltwright says "Nothing to restore." If Hiltwright can't tell which preset is which, it offers only the whole list. Press **Cancel** to change nothing. A restore sends the earlier values back and waits for the saber to confirm them.

A snapshot file that was cut short (by a crash while it was being saved, for example) is marked **incomplete**, and its button is off. The file holds only part of the list, so restoring it would delete the presets it lost.

Snapshots are kept on this computer, for Hiltwright, and the saber wouldn't load a snapshot file copied onto the card.

> **Tip:** A change made here can make your Install list out of date. Install › Presets then says how many presets differ, and lets you bring the saber's presets in or keep your list.

Next: [Controls](diagnostics.html).
