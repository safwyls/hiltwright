---
title: Styles
summary: Browse the built-in styles, try colors on a live preview, put a style on a preset, or paste one from the Fett263 library.
section: The workshop
order: 1
---
A style is what a blade does: its color, its flicker, how it ignites and retracts, and how it reacts to clashes and swings. The Styles page is where you browse styles, try them out and put them on your saber's presets, and the page sits in the Workshop beside the [Style editor](style-editor.html), the [Font library](font-library.html) and the [Demo room](demo-room.html).

![The Styles page: a grid of style cards, each with a small blade preview](shots/clean-33.png)

## What is on the page

The grid holds every style you can use. Each card shows a small live blade, the style's name, who made it, and the kind of blade it suits (main blade, crystal, accent or motor).

Hiltwright ships **40 styles of its own**. Thirty-two are for main and side blades, such as Steady, Humming, Fire, Energy flow, Swing flare, Aurora and Downhill, and seven are for a crystal chamber or an accent LED, such as Living crystal, Flash on hits, Battery gauge and Heartbeat. One, Motor on while ignited, is for a motor. Any style you paste or build shows up in the same grid.

Above the grid you can narrow the list:

- **Search styles** matches the name or the author.
- **On the saber** shows only styles already in the saber's firmware.
- **main blade, crystal, accent, motor** show styles for that kind of blade.
- **Motion** shows styles that react to tilt, swing or twist.
- **Every creator** shows one maker's styles.

## On the saber, Queued, or Needs a build

Each style carries one of three marks. The marks matter because a saber can only switch between styles that are already inside its firmware.

| Mark | What it means |
| --- | --- |
| **On the saber** | The style is in the saber's firmware now, so you can switch the style on right away. |
| **Queued** | You chose the style for a preset, but the firmware doesn't have it yet. The style goes on with the next Build & Flash. |
| **Needs a build** | The style isn't in the saber's firmware, so a build is needed before the saber can use it. |

A style you edited after the last install isn't "On the saber" any more, since the firmware holds the older version.

When a style is queued, a **Build & flash queued styles** button appears under the preview and takes you to [Build & Flash](build-and-install.html).

## The preview

Pick a card and the panel on the right shows the style on a larger blade. The preview runs the same per-LED math as the saber, so the color, flicker and ignition match closely. The buttons under the preview let you try the style out:

- **Retract** or **Ignite**.
- **Clash**, **Blast**, **Stab** and **Hard clash**.
- **Lockup**, **Drag**, **Melt** and **Lightning**, which stay on until you press them again.
- **Ability 1** and **Ability 2**, for special abilities.
- **Swing**, **Tilt** and **Twist** sliders, or drag the little saber, to move the blade. Click the blade to land a blast where you click.

Nothing here is sent to a saber. The sound is a stand-in, so a style that follows the hum only shows a typical flicker. To hear a style with a real sound font, press **Demo room**.

### Where the preview is approximate

Some styles are pasted or built from ProffieOS parts the preview doesn't fully model, and Hiltwright tells you so in one of these ways:

- "The preview is only approximate for ..." followed by a list. Those parts may look a little different on the saber (examples are clash strength, the sound level, color variation and alternative fonts).
- "The preview cannot show ... yet, so they are left out of it. They are kept as written, but only a build shows whether the saber accepts them." Those parts aren't drawn at all.

On a smaller card, the same warnings appear as a **Preview approximate** or **Preview incomplete** chip.

On the built-in styles, drag and lightning block change with twist and blade angle on the saber, but the preview in this beta doesn't show that change.

If a style's code can't be read at all, the preview is a flat bar in the style's main color. If the computer can't do WebGL (the graphics part of the preview), you get the same flat bar with a short explanation.

## Try colors

Styles with changeable colors show a **Try its colours** panel, with a swatch for each color and a number box for any timing the style reads. Change them and the preview follows, and **Back to defaults** resets them.

These colors are only tried on the preview. They go with the style when you put the style on a preset, and you can fine-tune them later on [Presets](presets.html).

## The style's code

**Show the code** opens the C++ that goes into your saber's configuration for this style. A pasted style starts with its copyright header, as pasted, and for Hiltwright's own styles the code includes the shared effects wrapper they build on. Code that came as one long line is shown one part per line, indented so you can read it (nothing else in the code changes). **Copy the style** copies what's shown. **Hide the code** closes the code view again, and so does picking another style.

## Put it on a preset

At the foot of the panel (which stays in place whatever style you pick), choose a **Preset** and a **Blade**, then press the button. A blade marked "(unusual)" is one the style isn't made for.

What happens depends on the saber:

- **Plugged in, and the firmware already has the style.** The button says **Use it in** the preset, and the style is written to the saber now, in the colors you chose, with no rebuild. The page says "The saber confirmed it" when the saber has read the style back.
- **Not plugged in, or the style is new.** The button says **Add to** the preset, or **Also use it in** the preset if the style is already queued elsewhere. The style is saved in the saber's plan and goes on with the next Build & Flash, and if you picked colors, they're written right after that install. A new style also costs a little firmware space, and the page shows about how much.
- **Presets are staged.** The style goes into the staged list and reaches the saber with the next install.
- **Already in.** The button says **Already in** the preset and is disabled, since that preset already uses this style on that blade, with these colors. Choose another preset or blade, or try other colors.

The button is also disabled when the saber is plugged in but can't take a write. If the saber's SD card is out, the page says the saber has no readable card, since presets are saved on the card. If the card is shared with the computer, give the card back on [Live › Card](fonts-and-sd.html) first. The button is disabled too while the board is busy with something else.

With no saber yet, the page says: "No saber yet: start one in the Armory, and styles can be put into its presets before it is ever plugged in."

## Paste style code

**Paste style code** takes a style written in ProffieOS code. Usually that's from the Fett263 style library, but anything in the same form works.

1. Copy the whole block from the library, comments included.
2. Press **Paste style code** and paste it in.
3. Type a **Name**, and who made the style in **By**. If nobody knows, tick **Author unknown**. The **Save style** button stays disabled until you do one or the other.
4. Press **Save style**.

Hiltwright checks the code as you paste, and stops you with a message if there's no code, if the code doesn't start like a style such as `StylePtr<...>()`, if the angle brackets don't balance, or if the code contains lines like `#include` or `#define` that don't belong in a single style. When the code passes, the page says "Looks like a style" and lists the colors and options you'll be able to change live, along with whether Hiltwright found a header.

Comments are fine anywhere in the code, since the checks skip them (so a `>` inside a comment doesn't count). A comment inside the style is kept. A comment after the last `()` is left out when the style is saved, because the configuration puts a comma straight after the style.

> **Note:** The comment header, with its copyright and author, stays with the style and goes into your saber's configuration. Hiltwright never redistributes the library itself.

A style you paste is credited to the person you name. You can fix the name later with **Edit** beside the credit, and add a logo or link for them. See [Contributors](contributors.html).

## Import styles

**Import styles** takes a `.hwstyle` file: styles saved in the [workshop](../workshop/index.html) on this website, or from another copy of Hiltwright.

1. In the workshop, select your style and press **Save for the app**. **Save all** puts every style you made there in one file.
2. In the app, open Styles and press **Import styles**, then pick the file.

Each style is checked the same way as one you save in the app. A style that fails is left out, and the page says how many were. A style you already have isn't added twice, and a different style that happens to share an id is added beside yours, so neither replaces the other.

The workshop runs the app's own Styles page, style editor and [Demo room](demo-room.html) in the browser, with no saber. Styles made there only last until the browser tab is closed, so it's worth saving the ones you want to keep.

## Your saved styles

Styles you paste or build are kept in your Styles, and you can remove them. Built-in styles can't be removed.

- A built style shows **Edit the layers**, which opens it in the [Style editor](style-editor.html).
- **Remove from library** asks first, and the question names any saber that has the style installed or queued. Those sabers keep their own copy for the next build, so removing a style never breaks a saber.
