---
title: Presets
summary: Build the saber's list of presets for the next install (font, track, style and colors), and save sets of them.
section: Install
order: 3
---
Step 3 is Presets. A preset is one setup you switch to with the buttons: a sound font, a music track and a style for each blade, and this page edits the list of presets for the next install.

To change a saber that's already installed, with the saber plugged in, use [Live › Presets](live-presets.html) instead, which writes each change to the saber right away.

![The preset list with the move arrows](shots/tour-16.png)

## The preset list

Pick a preset in the list on the left to change it, and use the arrows to move it up or down the list. **Add** puts a new preset after the current one, on a font you chose on [Fonts](fonts.html) that no preset uses yet, named after that font, with the `common` folder. When every chosen font is in use, **Add** takes the first one. **Duplicate** copies the current preset (the copy gets "copy" added to its name). The bin button at the end of that row deletes the current preset, and asks again with **Really delete** or **Cancel** first. You can delete every preset to start over, though Build & Flash asks for at least one before it builds. With an empty list the button reads **Add**.

## A list for the next install

Changes here are always kept in Hiltwright as a list for the next install, and they're never sent to the saber. A chip above the editor says "Staged for install", or "No changes yet". The page works the same whether the saber is plugged in, unplugged, or has its card out, and the page is never read-only for lack of a card.

The list goes onto the saber at the next [Build & Flash](build-and-install.html), where the compiled list replaces the saber's presets. Hiltwright keeps a snapshot of the saber's own presets first, so you can put them back.

With the saber plugged in, a note says which list you're looking at. Once you've started a list, the note says "These presets are your list for the next install" and how many saber presets the list replaces. With no changes yet, you'll see the saber's own presets, and the note says that changes here wait for the next install, and that to change the saber right now you use Live › Presets.

### If the saber has changed since

Say you started a list, then changed the saber with Live › Presets. Installing your list would undo those changes, so when the saber's presets no longer match what your list started from, a warning says so: "(saber) has changed since this list was made: N presets differ, changed on the saber itself. Installing this list replaces those changes." You have two choices:

- **Bring in the saber's presets** replaces your list with the saber's. Your own list is saved as a preset set first, so you can load it again.
- **Keep my list** keeps your list as it is.

Build & Flash repeats the warning before it installs.

## Name, font and track

- **Name** is the preset's name.
- **Sound font** is the font's folder name as it is on the SD card. Click the field to open **Choose a sound font**, which lists the fonts chosen on [Fonts](fonts.html) first, then the rest of your font library (each with a quick listen), then folders that aren't in the library (on the card, or chosen but not in it). To use a folder that's in none of these, type its name in the search box and press **Use** beside it. A font picked from the rest of the library becomes one of the chosen. The line underneath says whether the font is in the library. A font you name here is added to the saber's fonts.
- **Track** is the music file, for example `tracks/name.wav`. Click the field to open **Choose a music track**: **No track**, then the tracks in the preset's font, the tracks on the saber's card as last read, and the tracks in your other library fonts. Library tracks have a quick listen. To use a path that's in none of these, type it in full, ending in `.wav`, and press **Use** beside it. A library font's tracks go onto the card along with the font.
- **Also use common sounds** adds the `common` folder after the font, and presets using Fett263 buttons need that folder for the voice pack. If a preset names other folders too, they're listed as "Also uses" and kept as they are.

A field is saved when you leave it or press Enter.

![Name, font and track fields](shots/tour-18.png)

## A style for each blade

Each blade gets a style (its color, flicker and effects), which you choose from the list for that blade. The list offers styles made for that kind of blade, in groups: "Hiltwright", "Your styles", and "Only on this saber (removed from your styles)" for styles the saber's plan still carries after you deleted them.

- Any style can be chosen here. A style that isn't in the saber's firmware yet gets built in at the next Build & Flash. That style shows **Queued**, and the list marks it "(needs a build)".
- A blade with no choice shows "Saber's default" and uses a starter style for that kind of blade.

Color swatches under a style let you change its colors. A color is saved when you let go of the picker or close it, not while you drag. **Style's own colours** puts the style's defaults back, and **Browse and try styles** opens [Styles](styles.html).

![The style choice for each blade, with a Queued marker](shots/tour-19.png)

## Preset sets

A set is a saved copy of a whole preset list. A set keeps the names, fonts, tracks and the style for each kind of blade, so a set fits another saber too. Press **Save this list as a set** to keep one. **Load** puts a set into this list, for the next install, and a bin icon deletes a set.

Before a load, Hiltwright shows what the load would do:

- "This set does not fit (saber) exactly:" lists each problem, such as a style that isn't in your styles any more (that preset gets the saber's default style for the blade), a style for a blade this saber doesn't have (that style is left out), or a preset with no name or font. The button then reads **Load it anyway**.
- "This set cannot be loaded:" appears when the set has no presets.
- If your list would be replaced, Hiltwright says so: "Loading it replaces the N presets staged here".

A clean set loads right away.

![The Sets panel with saved sets](shots/clean-20.png)

Next: [Card](card.html).
