---
title: Armory
summary: Where you pick a saber, then adjust it live or change its setup, plan a new one, and see how far each has got.
section: Getting started
order: 4
---
The Armory is the first page. Hiltwright remembers every saber it has seen, whether or not it is plugged in. You pick one here, then choose what to do with it: adjust it live, or change its setup.

## Your sabers

Every saber Hiltwright has seen is listed on the left, plugged in or not. Each row shows its name and a line such as the saber's config name, its number of presets and when it was last seen. Click a saber to pick it.

A saber you plug in is picked on its own. You can pick another saber while one is plugged in, for example to change its setup. The connected saber stays connected, so Live keeps working on it. An install only ever goes to the saber that is connected, and it is refused while that is not the saber you picked.

With two sabers plugged in, Hiltwright talks to one at a time. Its row says "Connected", and the other's says "Plugged in". On Windows each chip also names the saber's COM port, for example "Connected · COM8". Pick the other saber to connect to it instead: Hiltwright closes the first one's port and opens only the picked saber's. A switch waits while an install, a copy to the card or a change to the saber is still running. If that happens, pick the saber again once it has finished. The header shows the COM port of the saber that is connected.

The picked saber's name is at the top of the right side, with a chip: "Plugged in", "Set up ahead" or "Not plugged in". Under it is everything the saber's firmware reports about itself: the ProffieOS version, prop, buttons, presets, config name and install date. For a saber that is not plugged in, that line starts "Last read:". Press **Read again** to read a plugged-in saber once more.

The bar along the bottom of the window shows the same after "Working on", with one of three notes: "plugged in", "planned, not seen yet" or "not plugged in". The bar also holds "Take the tour" at the left, the full ProffieOS line, the update chip and Hiltwright's version.

To rename the saber that is plugged in, press **Rename**, type the new name and press **Save**.

## Adjust it live, or change its setup

Under the saber's name are two panels. The bright one is the one you can use now.

**Adjust it live.** Change its presets, volume and colours on the saber itself. Each change takes effect at once, and nothing is built or flashed. It works with any ProffieOS firmware. The panel shows what is on the saber now: the preset playing, the number of presets, the battery and where the card is. Press **Adjust it live** to open [Live › Presets](live-presets.html).

If the picked saber is not plugged in, the panel is dimmed, and its button is off and says "Plug it in to adjust". If it is plugged in while another saber is connected, the button says "Connect to (saber) on (port)" and switches to it. If another saber is connected, a link offers to pick that one. A saber you set up ahead has no firmware, so there is nothing to adjust live.

**Change its setup.** The wiring, fonts and presets for the next install. Nothing on the saber changes until you install, with its card in a card reader for the copy. The panel lists the four Install steps, with a tick on each one that is done (see Progress steps below). Press a step to go to it, or **Continue with** the next one.

## Plan a saber ahead

If you have no saber in your hands yet, press **New saber**, type a name in "Name the saber" and press **Start**. If you leave the name blank, Hiltwright calls it "Saber 1", "Saber 2" and so on. You can then set up its wiring, presets and styles, ready to install. Planned sabers show "set up ahead" and "not seen yet".

The new plan is picked at once and you land on Wiring. This works even while another saber is plugged in. That saber stays connected, for Live.

To drop a plan you no longer want, press the bin icon beside it. This is offered for planned sabers that are not the one you have picked.

## Match a plugged-in saber to a plan

When you plug in a saber that Hiltwright has not set up, and you have plans, the Armory asks "Is this a saber you set up ahead?" with a button for each plan, such as `It is "My plan"`. A saber you have already set up or installed in Hiltwright is not asked about: it is its own saber.

Press one and Hiltwright shows what will happen before it does anything. Adopting a plan moves its wiring, prop, presets and styles onto the saber. The next install replaces the styles compiled into the saber's current firmware, and the presets on its card become the plan's. If the saber already had wiring and presets in Hiltwright, they are replaced by the plan's.

Press **Adopt** to go ahead, or **Not now** to leave it.

> **Note:** Adopting changes nothing on the saber itself. Everything reaches the saber at the next Build & Flash.

## Share a saber's setup

Set a saber up once and give the setup to someone else, so they can flash their own hilt from it.

**Share**, on each saber's line in Your sabers, saves the setup as a `.hwsaber` file, wherever you choose. The file holds:

- the board, buttons, prop and blades;
- the presets, each with its font, track, name, styles and colors;
- the pasted or built styles those presets use;
- the fonts chosen on Install › Fonts, and the voice pack;
- a custom prop file, if the saber builds with one.

It leaves out what belongs to your hilt and your computer: the saber's serial number, its SD cards, its firmware record, your "I checked the wiring", and where your installer's config file is. **Sound fonts are named, not carried.** They are large, and many cannot be passed on, so whoever imports the file needs the fonts themselves. After you share, the Armory lists the fonts it names.

**Import**, beside **New saber**, brings a `.hwsaber` file in as a saber set up ahead. If you already have a saber by that name, it gets "(2)" after it. Then:

- Its presets are the list for its next flash.
- Styles you do not have yet are added to your [Styles](styles.html).
- The Armory lists any fonts it uses that are not in your font library or among the fonts that come with Hiltwright.
- Its board and wiring are not taken on trust. Choose the board and check every pin on [Wiring](wiring.html) against your own hilt before you flash: a wrong pin can damage the board.
- A custom prop file that came with it is kept and used. A prop file is code that goes into the firmware, so flash it only if you trust where it came from.

When your saber is plugged in, match it to the imported plan as above.

## The connection panel

At the top of the page, one panel says what is connected:

| Heading | Meaning |
| --- | --- |
| "Nothing plugged in" | No saber is connected. Plug one in over a data cable and press **Connect**. |
| "Opening the port…" | Hiltwright is opening the saber's USB connection. |
| "Reading the saber…" | It is reading the saber's presets and firmware details. |
| "(name) is plugged in" | Connected. The line below shows the ProffieOS version, the prop, the number of buttons and when it was installed. |
| "Something went wrong" | Read the message under it. Press **Connect** to try again. |

When a saber is connected, **Read again** reads it once more.

Two notes can appear under the heading:

- **No battery detected.** The saber is running on USB power alone. It may pause for a moment when it plays sound or reads its card. If it does, Hiltwright reconnects on its own.
- **This firmware does not know** a listed command. Hiltwright adapts to what the board supports.

If one of your saved lists could not be read at start, a note says so and tells you where the damaged copy was kept. Press **Open folder** to see it, or **Dismiss**.

## The top bar

The same connection state is always in the top bar, on every page.

- A chip shows "Connected" with the port name, "Opening port…", "Reading the saber…", "Error", "No saber found" or "Not connected".
- A battery chip shows the reading. Under 2 V it means no battery is connected, and the saber is running on USB power.
- **Connect** and **Disconnect** are beside them.

> **Tip:** Plug a saber in with a USB data cable and Hiltwright connects by itself. If nothing happens, try another cable.

![The top bar with the connection chip, battery and Connect button](shots/tour-05.png)

## Progress steps

The "Change its setup" panel lists the four Install steps and how far this saber has got. A tick means the step is done, and the bright one is next. Press a step to go to it, or press **Continue with** the next step's name to go there.

The ticks mean:

1. Wiring: you have confirmed the wiring.
2. Fonts: you have chosen at least one font for the saber.
3. Presets: the saber has presets in Hiltwright.
4. Card: the card had every chosen font when the saber last listed them.
5. Build & Flash: the saber's firmware has been built and flashed from the current setup, with no styles left queued and no staged presets waiting.

With no saber picked, the page says "Start here". Styles are chosen on the Presets step. Make and try new ones in the Workshop (see [Styles](styles.html)).

## Removing a saber

Every saber in **Your sabers** has a bin button at the end of its row. Press it to take that saber out of the Armory. A saber that is plugged in cannot be removed: its button is dimmed, and its tip says "Unplug it first. A plugged-in saber would be remembered again at once."

Hiltwright asks first. The question is "Remove" and the saber's name, with what goes and what stays:

- **Removed:** "(saber)'s entry in the Armory, with its wiring, presets and staged presets."
- **Kept:** "(saber)'s firmware backups stay as files in" the saber's folder inside Hiltwright's data folder. The question shows the full path. "They are your way back."
- **Kept:** "(saber)'s preset history stays as files in" a second folder beside the first.
- **Kept:** "Your fonts, styles and preset sets are not touched." The saber itself is not touched either.

The question ends: "If you plug the saber in again, Hiltwright remembers it again as a new saber. That new saber will not have the old wiring or presets, and the old backups and history will not be listed for it."

Press **Cancel** or Escape to leave everything as it was. Cancel is the button that has focus. Press **Remove** and the saber's name (for example "Remove Kylo") to go ahead. If it was the saber you had picked, Hiltwright moves to the most recently seen saber that is left, or to "Start here" when there is none.

A saber you set up ahead, which was never plugged in, is removed the same way. Its question has no backups or history to mention.

Next: [Wiring](wiring.html).
