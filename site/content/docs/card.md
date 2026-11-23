---
title: Card
summary: Get the saber's SD card ready for its next flash in one trip to a card reader, and do anything else on the card.
section: Install
order: 4
---
Step 4 is Card, which gets the saber's SD card ready for the next flash: the fonts the card should carry, its voice pack, and the presets file when a new preset list is waiting. This page works on the saber picked in the [Armory](armory.html), plugged in or not.

The same page is under Live as [Live › Card](fonts-and-sd.html), for a quick fix on a saber that's already flashed. Everything that page does, this one does too (the fonts on the card with their checks, **Preset fonts**, **Add a font**, the tracks, changing the voice, and sharing the card over USB), and this page adds the trip below.

## The card, in one trip

![Install › Card: what the card needs before the flash, above the fonts on the card](shots/clean-22.png)

Do this with the card out of the saber, in a card reader. We recommend a card reader, since it's about 30 times faster than the saber's own USB: in one of our tests, one font took about 4 seconds in a reader and about 120 seconds over the saber's USB.

1. Take the SD card out of the saber and put it in a card reader on this computer. Hiltwright notices the card by itself within a few seconds, and if not, press **Look again**.
2. The note at the top says what the card needs before the flash, and how long that will take. The note can list:
   - the fonts you chose on [Fonts](fonts.html) that the card does not have yet;
   - with the Fett263 controls, the voice pack, when the card has no working one (none, too old, or mixed with an older pack's files) or when you chose a different voice on [Fonts](fonts.html);
   - removing the card's presets file, when a new list of presets is waiting. A snapshot of the saber's own presets is kept first.
3. Press **Prepare the card**, and Hiltwright does all of it in one go and remembers the card as this saber's.
4. Put the card back in the saber, plug the saber in, and go on to [Build & Flash](build-and-install.html).

When nothing is left to do, the note says the card is ready for the flash.

Removing the presets file is what lets the new list take effect, since without that step the saber would keep using the presets on its card. When removing the file is the only thing the card needs, nothing has to be done first: the card counts as ready, and Build & Flash removes the file during the flash (over USB with the card in the saber, or directly with the card in a card reader). With the card in a reader you can also press **Remove it now**. When you remove the file here, the saber starts with your list after the flash, with no second restart.

The snapshot kept first is the list the saber itself would load. The saber saves its presets to two files in turn, `presets.ini` and `presets.tmp`, and Hiltwright picks the newer good save just as the saber does. Both files are also kept on this computer as they were. If Hiltwright can't tell which list the saber would load, Hiltwright makes no snapshot but still keeps both files.

If a font you chose isn't in your font library, the note says so and links to Fonts. That font can't be copied.

Whatever the voice pack replaces is kept on this computer, and the note says where.

Hiltwright writes only to the card it read. If you swap the card in the reader for another one (another saber's, say) before the work is done, Hiltwright stops and says "The card in E: is not the one Hiltwright read. Look again." Nothing is copied to the other card, and that card's presets file stays. Hiltwright also notices the swap by itself within a few seconds and reads the new card.

> **Note:** No card reader? With the saber plugged in, press **Share the saber's card**, and the trip then works on the shared card the same way, just much slower. Give the card back before you flash.

Next: [Build & Flash](build-and-install.html).
