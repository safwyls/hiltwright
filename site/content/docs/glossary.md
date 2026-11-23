---
title: Glossary
summary: Plain-word meanings for the terms you will meet in Hiltwright and in the ProffieOS world.
section: Help
order: 4
---
Terms are in alphabetical order. If you're coming from Crystal Focus X, Xenopixel or LGT boards, some of these will be new, and a few are the same idea under another name.

## Accent
A small extra LED or LED strip on the saber, apart from the main blade. An accent can follow the blade, flash on hits or show the battery. Hiltwright treats an accent as a kind of blade you can give a style to.

## Backup
A copy of the saber's whole firmware, saved to your computer before each install. **Put back** on the Backups tab writes one onto the saber exactly as it was. See [Build & Flash](build-and-install.html).

## Blade
In Hiltwright, anything the saber lights or runs on its own: the main blade, a side blade, a crystal chamber, an accent LED or a motor. You set how many there are on the [Wiring](wiring.html) page.

## Blast
An effect for a blaster bolt hitting the blade. A small ring of light spreads from where the bolt lands.

## Card reader
A small device that plugs into your computer and holds the SD card, so the computer can read the card without the saber. We recommend one, since a card reader is about 30 times faster than copying over the saber's own USB. See [Card](card.html).

## Clash
An effect for the blade hitting something hard. A clash flashes where the blade is hit, and the saber plays a clash sound.

## Common folder
A folder named `common` on the SD card. The common folder holds sounds shared by every preset, such as the voice pack. A preset must use the common folder for those sounds to play.

## Crystal chamber
The space inside a hilt, usually with a clear window, where a crystal sits. A Proffieboard can light it with its own LED and style.

## Data pin
The board pin that carries the color signal to a blade's LEDs. Check each data pin against what the installer wrote down before you install.

## DFU
Short for device firmware upgrade. DFU is the bootloader mode a Proffieboard enters to accept new firmware. Hiltwright puts the board in DFU for you, and if the board doesn't go into DFU, hold BOOT, tap RESET, then release BOOT.

## Drag
An effect for the blade tip scraping along the ground. The effect is held while you drag, and the tip glows.

## Firmware
The program that runs on the board. ProffieOS, with your wiring, presets and styles built in, is the firmware. Hiltwright builds the firmware and installs it.

## Flash
To write firmware onto the board. Hiltwright calls this step an install. The word is also used as a noun: a board has a fixed amount of flash memory, and every style takes a little of it.

## Font
See Sound font.

## Install
Two meanings. In the sidebar, Install is the five steps that set a saber up: Wiring, Fonts, Presets, Card, and Build & Flash. As an action, an install is writing newly built firmware to the saber over USB. Hiltwright takes a backup first, writes the firmware, then waits for the saber to start again. Also see Flash and Live.

## Lightning block
An effect for blocking Force lightning. Crackles run along the blade while the block is held.

## Live
Changing a saber that's plugged in and already installed, with each change written to the saber right away, so Live needs no build and no install. The Live pages are Presets, Controls and Card. See [Live › Presets](live-presets.html). The other way is Install.

## Lockup
An effect held while two blades are pressed together. The blade glows where they meet, and a lockup sound loops until you let go.

## Melt
An effect held while the blade is pushed into a surface, as if melting through it. A font with a drag sound but no melt sound plays the drag sound.

## Pixel blade
A blade made of LEDs that can each show their own color, so styles can do more than light the whole blade one color. Proffieboards drive pixel blades. Each LED strip has a data pin and gets its power from a power pin.

## Polyphonic
A sound font whose sounds can overlap, with numbered names such as `clsh01.wav`. The other kind, monophonic, plays one sound at a time with names such as `clash1.wav`. A font should not mix the two for the same effect.

## Power pin
The board pin that supplies power to a blade's LEDs. Two blades can share one power pin. A wrong power pin can damage hardware, so Hiltwright asks you to confirm the wiring before it installs.

## Preon
A sound, and sometimes a light effect, that plays before the blade ignites.

## Preset
One setup you switch to with the buttons: a sound font, a music track, and a style for each blade. See [Presets](presets.html).

## Proffieboard
The saber controller board Hiltwright sets up. Hiltwright supports the Proffieboard V2.2 and V3.

## ProffieOS
The open-source software that runs on a Proffieboard. ProffieOS decides how the saber lights, sounds and reacts. Hiltwright supports ProffieOS 8.x.

## Prop file
The part of ProffieOS that decides what each button press does, such as ignite, change preset or enter edit mode. You choose the prop file on the Wiring page, along with the number of buttons.

## Queued
A style chosen for a preset that the firmware does not hold yet. The style goes on with the next Build & Flash. See [Styles](styles.html).

## SD card
The memory card in the saber. The SD card holds the sound fonts, tracks and the `presets.ini` file. FAT32 is the format to use, since a saber can't read a card formatted exFAT or NTFS.

## SmoothSwing
A swing sound that follows how you move the blade, with pitch and volume rising and falling smoothly. A font needs the right files for SmoothSwing. The [Font library](font-library.html) shows whether a font has them.

## Sound font
A folder of sound files a saber plays: hum, ignition, retraction, swings, clashes and more. Some fonts also hold music tracks. The saber knows a font by its folder name. See [Font library](font-library.html).

## Staged
Presets that are waiting in Hiltwright for the next install instead of being written to the saber. Everything you change on Install › Presets is staged. Staged presets replace the saber's presets at the next install, after a copy of the saber's own presets is kept.

## Stab
An effect for thrusting the blade forward. The tip lights and the glow slides back.

## Style
What a blade does: its color, flicker, ignition and retraction, and how it reacts to clashes, swings and other effects. See [Styles](styles.html) and the [Style editor](style-editor.html).

## Track
A music file kept with a sound font, which a preset can play. A preset names a track as the font's folder plus the file path.

## Voice pack
A set of spoken menu sounds, kept in the `common` folder on the card. The Fett263 button controls speak their menus from the pack. Without a voice pack, the saber says "voice pack not found" on a preset change.
