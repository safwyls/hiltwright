---
title: Font library
summary: Keep your sound fonts in one place on this computer, check them, hear them, and copy them to a saber's SD card.
section: The workshop
order: 3
---
A sound font is the set of sounds a saber plays: hum, ignition, retraction, swings, clashes and so on. The Font library keeps your fonts in one folder on this computer, so once a font is added here you can name it in a preset, hear it in the [Demo room](demo-room.html), and copy it to a card without hunting for the files again.

![The Font library with a list of fonts and one font open on the right](shots/clean-43.png)

## Adding fonts

There are two buttons at the top right.

- **Add package (.zip)** takes a font package just as you downloaded it. If the package also holds fonts for other boards, those are left out, and Hiltwright lists them as not added, with the reason "the copy in ... is for another board, not Proffie".
- **Add folder** takes one font folder, or a folder that holds several fonts.

The fonts are copied in and your originals are left alone. Each font only appears in the library once all of its files are in, so a copy that stops part way (a stick pulled out, a full disk) doesn't leave half a font behind. When the copy finishes, a green note says "Added ..." and tells you to give each font a name and maker on the right. If some couldn't be added, an amber note says which ones and why.

With no fonts yet, the table says: "No fonts yet. Add a font package as you downloaded it (.zip), or a font folder. They are copied into the library; your originals are left alone."

## The font list

Each row shows the font's name, its maker with a logo, what it supports, its size and its status. Use **Search fonts** to find one, the filter buttons **Polyphonic**, **SmoothSwing** and **Has tracks** to narrow the list, and **All**, **By maker** and **By bundle** to group it. A bundle is a set of fonts a maker released together, and in a group heading, **Set maker for all** gives every font in the bundle the same maker.

### What "supports" means

Hiltwright reads this from the font's files:

- **Polyphonic** fonts use numbered names such as `clsh01.wav`, and their sounds can overlap. **Monophonic** fonts use names such as `clash1.wav` and play one sound at a time. **Mixed** means both forms appear, and the font still works (see the status column below).
- **SmoothSwing** is the smooth, pitch-following swing sound, and Hiltwright shows whether the font has the files for it.
- **Tracks** are music files kept with the font.
- Any special effects the font includes are listed.

### The status column

A font that passes shows a green **Ready**. Otherwise you'll see the number of issues in amber, or in red when the problem is serious, and you can open the font to read each one. The checks are:

- Both forms of an effect are present, for example `clash1.wav` and `clsh01.wav`. These are two names for the same effect, so the font still works, but the saber may only play one of the two sets. This is amber.
- No hum. "Every font needs at least hum.wav or hum01.wav." This is red.
- Files above 44.1 kHz. "The saber needs 44.1 kHz or lower."
- Stereo files. "Fonts should be mono."
- Files that aren't 16-bit, or aren't plain PCM.

## One font up close

Pick a row and the panel on the right opens.

- **Name**, **Maker**, **Bundle** and **Notes** are for you, since the saber only knows the font by its folder name (shown under the title). Changes save when you click away.
- **Maker's logo** lets you add a logo for the maker, and the logo and link then appear wherever that maker is credited. See [Contributors](contributors.html).
- **What it supports** repeats the chips above, with the number of sounds and the size.
- **Sounds** lists each effect with a count. **Play** plays one of that effect's sounds at random, the way the saber would pick one, and you can open an effect to play any sound by name. **Stop** ends the sound.
- **Tracks** lists music files with their lengths. A preset names a track as the font's folder plus the file path, and the panel shows the exact name.

## Using a font

At the foot of the panel:

- **Demo room** opens the font in the Demo room, so you can hear it on a blade.
- **Copy to card** copies the font's folder onto the saber's SD card, and the button shows the card's drive. If the font is already there, the button reads **Replace on card** and asks "Really replace" before replacing anything. If no card is found, the button says **No card**, and with more than one card in, the button says **Choose the card on Live › Card**. See [Live › Card](fonts-and-sd.html) for sharing the saber's card over USB. To choose which fonts a saber carries, use [Install › Fonts](fonts.html).
- **Show files** opens the font's folder.
- **Remove** moves the font's folder to the recycle bin.

> **Warning:** A saber can only read cards formatted FAT32 (or FAT16 or FAT12). If the card is exFAT or NTFS, Hiltwright asks "Copy ... anyway?" and says the saber won't see the font until the card is formatted as FAT32. Hiltwright doesn't format cards in this beta.

## Where the library lives

The bar at the bottom shows the **Library folder**, the number of fonts and their total size.

- **Open** shows the folder in Windows.
- **Change...** moves the library to another folder, for instance a larger drive, and **Default** goes back to the original folder. Fonts left in the old folder stay there. If a font can't be moved, the move stops and says how many fonts moved. The library stays where it was, the font that failed is still whole in the old folder, and nothing half copied is left in the new one, so you can simply try again.

If the library is on a drive that isn't plugged in, a red note says "The font library folder cannot be found" and offers **Look again**, **Choose where it is** and **Use the default folder**. Hiltwright doesn't create anything in place of the missing folder.

If the file holding your names, makers and notes can't be read, an amber note says the file was kept under another name, and that Hiltwright started from a backup copy or with what it could read. **Open the folder** opens the folder that holds the file.

## Fonts that come with Hiltwright

Six free ProffieOS fonts come with the app: TeensySF, SmthJedi, SmthGrey, SmthFuzz, RgueCmdr and TthCrstl. You can choose them on [Fonts](fonts.html), copy them to a card from [Live › Card](fonts-and-sd.html), and play them in the Demo room.
