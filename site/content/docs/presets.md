---
title: Presets
summary: Build the saber's list of presets for the next install (font, track, style and colors), and save sets of them.
section: Install
order: 3
---
Step 3 is Presets. A preset is one setup you switch to with the buttons: a sound font, a music track and a style for each blade. This page edits the list of presets for the next install.

To change a saber that is already installed, with the saber plugged in, use [Live › Presets](live-presets.html). It writes each change to the saber at once.

![The preset list with the move arrows](shots/tour-14.png)

## The preset list

Pick a preset in the list on the left to change it. The arrows move it up or down the list. **Duplicate** copies the current preset (a copy gets "copy" added to the name). **Delete** asks again with **Really delete**, and is off when only one preset is left. With an empty list the button reads **Add**.

## A list for the next install

Changes here are always kept in Hiltwright, as a list for the next install. They are never sent to the saber. A chip above the editor says "Staged for install", or "No changes yet". The page works the same with the saber plugged in, unplugged, or with its card out. It is never read-only for lack of a card.

The list goes onto the saber at the next [Build & Flash](build-and-install.html). The compiled list then replaces the saber's presets. A snapshot of the saber's own presets is kept first, so they can be put back.

With the saber plugged in, a note says which list you are looking at. With a list already started, it says "These presets are your list for the next install" and how many saber presets it replaces. With no changes yet, you see the saber's own presets, and a note says that changes here wait for the next install, and that to change the saber right now you use Live › Presets.

### If the saber has changed since

Say you started a list, then changed the saber with Live › Presets. Installing your list would undo those changes. So when the saber's presets no longer match what your list started from, a warning says so: "(saber) has changed since this list was made: N presets differ, changed on the saber itself. Installing this list replaces those changes." You have two choices:

- **Bring in the saber's presets** replaces your list with the saber's. Your own list is first saved as a preset set, so you can load it again.
- **Keep my list** keeps your list as it is.

Build & Flash repeats the warning before it installs.

## Name, font and track

- **Name** is the preset's name.
- **Sound font** is the font's folder name as it is on the SD card. The list offers the fonts you chose on [Fonts](fonts.html). Type a name, or press **Choose from library** to pick one from your font library, with a quick listen. The line underneath says whether the font is in the library. A font you name here is added to the saber's fonts.
- **Track** is the music file, for example `tracks/name.wav`, or leave it blank for none.
- **Also use common sounds** adds the `common` folder after the font. Presets using Fett263 buttons need it for the voice pack. If a preset names other folders too, they are listed as "Also uses" and kept as they are.

A field is saved when you leave it or press Enter.

![Name, font and track fields](shots/tour-17.png)

## A style for each blade

Each blade gets a style: its color, flicker and effects. Choose it from the list for that blade. The list offers styles made for that kind of blade, in groups: "Hiltwright", "Your styles", and "Only on this saber (removed from your styles)" for styles the saber's plan still carries after you deleted them.

- Any style can be chosen here. A style that is not in the saber's firmware yet is built in at the next Build & Flash. It shows **Queued**, and in the list it is marked "(needs a build)".
- A blade with no choice shows "Saber's default" and uses a starter style for that kind of blade.

Color swatches under a style let you change its colors. A color is saved once the picker has been still for half a second, or when you leave it. **Style's own colours** puts the style's defaults back. **Browse and try styles** opens [Styles](styles.html).

![The style choice for each blade, with a Queued marker](shots/tour-18.png)

## Preset sets

A set is a saved copy of a whole preset list. It keeps names, fonts, tracks and the style for each kind of blade, so it fits another saber. Press **Save this list as a set** to keep one. **Load** puts a set into this list, for the next install. A bin icon deletes a set.

Before a load, Hiltwright shows what it would do:

- "This set does not fit (saber) exactly:" lists each problem, such as a style that is not in your styles any more (that preset gets the saber's default style for the blade), a style for a blade this saber does not have (it is left out), or a preset with no name or font. The button then reads **Load it anyway**.
- "This set cannot be loaded:" appears when the set has no presets.
- If your list would be replaced, it says so: "Loading it replaces the N presets staged here".

A clean set loads at once.

![The Sets panel with saved sets](shots/clean-19.png)

Next: [Card](card.html).
