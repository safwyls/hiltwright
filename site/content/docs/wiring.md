---
title: Wiring
summary: Tell Hiltwright which board, buttons, prop file and blades your saber has, and confirm the pins before anything is installed.
section: Install
order: 1
---
Step 1 is Wiring, where you describe the hardware once: the board, the buttons, the prop file and every blade, with the pins each one uses. Old firmware can't tell Hiltwright the wiring, so you enter the wiring here and then check it against what your installer wrote down.

Changes save by themselves a moment after you make them.

![The Wiring page with the blade cards, pin table and confirm switch](shots/clean-11.png)

## Board, buttons and prop

Start here with every saber.

- **Board.** Choose "Proffieboard V2" or "Proffieboard V3" (the label on the board says V2.2 or V3.x). Until you choose, a warning says "Which Proffieboard is this?" and nothing is built.
- **Buttons.** Choose 1, 2 or 3.
- **Prop file (how the buttons behave).** The prop file is the part of ProffieOS that decides what each button press does, such as ignite, change preset or edit mode. Four come with ProffieOS, and you can load your own:

| Label | Notes |
| --- | --- |
| Fett263 · edit mode, gestures | The default for a saber planned in the Armory. Needs a voice pack on the card, see [Live › Card](fonts-and-sd.html). |
| SA22C | |
| BC | |
| ProffieOS default | |
| Custom prop file… | A prop file (`.h`) from your computer: a newer or changed version of one of the four, or another prop altogether. |

### The installer's config file

The saber's firmware doesn't say which pins its blades use, since the pins are compiled into the firmware. The installer's config file does, and installers often leave that file on the card. With the saber's card in a card reader, Wiring looks for a config file at the top of the card or in a `config` folder, and shows what the config describes: the board, the buttons, and each blade's pixels, data pin and power pins. **Compare with a config file…** reads one from your computer instead.

If the wiring here matches the config, Wiring says so. If the wiring differs, each difference is listed, and a different pin or number of blades is shown in red since a wrong pin can damage the board. **Use its wiring** fills in the blades, the buttons and the board from the config (a board read from the saber itself stays). **Check builds against it** keeps the config as the reference, so Build & Flash warns before installing whenever the wiring here differs from the config. Hiltwright reads the common blade forms (`WS281XBladePtr`, `WS2811BladePtr`, `SubBlade`, `SimpleBladePtr`), and a blade written another way is named as not readable so you can check that one by hand. A config with several blade configurations (Blade ID) is read from its first.

A `SimpleBladePtr` pairs each LED with the pin in the same place, so Hiltwright keeps every pin in its place, even when the installer left a place between two LEDs empty (`-1`). Such a blade shows only the pins it really uses.

An installer can limit a blade's brightness with `DimBlade`, often to spare the battery or keep the LEDs cool, and Hiltwright keeps that limit: the blade card says "Brightness limited to 20%", and builds keep the limit too. A different limit, or none, is listed as a difference, and a `DimBlade` whose limit isn't a plain percentage is named as not readable.

#### The config's board settings

A config also has settings of its own (its `#define` lines). Hiltwright writes its own settings for every build, but a few of the installer's settings describe how the hilt is built, and builds take those over along with the config's wiring:

| Setting | What it is |
| --- | --- |
| `ORIENTATION`, `ORIENTATION_ROTATION`, `INVERT_ORIENTATION` | How the board is mounted. Without this setting, gestures, twist, stab and blade angle use the wrong axes. |
| `BLADE_DETECT_PIN` | A switch that tells when a blade is plugged in. |
| `ENABLE_SSD1306`, `INCLUDE_SSD1306`, `OLED_FLIP_180`, `OLED_MIRRORED` | A small OLED display. |
| `ENABLE_SERIAL` | A Bluetooth or serial module. |
| `VOLUME`, `BOOT_VOLUME`, `CLASH_THRESHOLD_G` | The installer's volume and clash sensitivity, in place of Hiltwright's 1800 and 3.5. |

Wiring lists which of the config's settings builds take over and which they leave out. **Use its wiring** takes the settings with the wiring, and when the wiring already matches, **Use its board settings** takes only the settings, and the wiring confirmation stays. The settings taken are listed on Wiring, and **Leave them out** drops them again. Build & Flash names every setting of the installer's config that a build still leaves out.

### A custom prop file

Choose **Custom prop file…** and pick the file. Hiltwright checks that the file is a ProffieOS prop file (it has a `#define PROP_TYPE`) and keeps its own copy. The build puts the copy next to the props that come with ProffieOS, so the file can include them, and gives the copy a name of its own so none of them is replaced. **Choose another file…** swaps the file, and choosing a stock prop and then Custom again goes back to the same file.

Hiltwright reads which prop the file is from its `PROP_TYPE`. A version of one of the four, such as a newer Fett263 prop, gets that prop's options and checks (for Fett263, the edit mode and the voice pack check). Any other prop gets none, so the options that prop needs go in the file itself and the compiler checks the rest.

Hiltwright builds with the copy it kept. After you edit your file, choose the file again so the next build uses the new version.

If a saber is plugged in and the board isn't known, you can press **Check the board**. The saber restarts into bootloader mode for a few seconds, its flash size is read, and the saber comes straight back, with nothing written. If the board was read from the saber at its last install, that choice is fixed and the other one is grayed out.

![Board, buttons and prop file at the top of Wiring](shots/tour-10.png)

## Blades

A blade is anything the saber lights or runs on its own: the main blade, a crystal chamber, an accent LED, a motor. Set how many there are with the minus and plus buttons (1 to 8). Adding a blade gives the new blade the next role (main, then crystal, then accent) on the first free pins, and lowering the count removes blades from the end.

Each blade shows as a row with a tick, or a warning if the blade has a problem. Open one to edit it.

**What is it.** Five roles are offered:

| Role | Hint shown |
| --- | --- |
| Main blade | The blade in the emitter |
| Crystal chamber | Pixels or an LED around the crystal |
| Accent | A lit switch, ring or window |
| Side blade | A quillon or second emitter |
| Motor | Spins a crystal chamber component |

**Built from.** For every role except Motor, choose "Pixel strip", "Single LED" or "Star LED". A star LED is a tri-color LED on three power pins (red, green and blue, in that order), and a single LED uses one power pin.

For a pixel strip you also set:

- **Pixels**, the count.
- **Colour order**, one of GRB, RGB, GRBW, RGBW, BGR or BRG. If colors come out wrong, check your strip's datasheet.
- **Strips on this wire.** Strips soldered to the same data wire show the same thing and can't be controlled separately, so they count as one blade.

**Wiring.** A pixel strip is either "Own data line" (its own wire and power pins) or "Continues another blade's wire" (the same strip, after another blade, sharing its power), and a chained blade can also "Run the other way (reversed)". Blades on one strip take the strip's pixels in blade order: the first blade, then each blade that continues it, so the strip is as long as all of them together. If you make a strip that another blade continues into a continuation itself, that other blade moves onto the same strip after it. A blade that continues a strip must come before any other shared strip starts, since ProffieOS adds each continuation to the shared strip started most recently in blade order, not to the one you picked. So with Blade 1 and Blade 2 each shared, a blade continuing Blade 1 has to come before Blade 2, and the page says which blade to move if it doesn't. Single LEDs, star LEDs and motors only need power pins.

> **Note:** One blade must be the main blade. If none is, the pin table says "One blade must be the main blade."

![The blade rows and one open blade card](shots/tour-11.png)

## The pin table

The panel on the right lists every data pin and power pin on your board, who uses each pin, and any clash.

- A green "No conflicts" chip means the wiring is valid.
- An amber "Shared power" chip means two blades use the same power pin. That's allowed, since ProffieOS has a setting for shared power and Hiltwright adds that setting for you at build time.
- A red chip such as "1 problem" lists what is wrong, in words like "Blade 2 needs a pixel count." or "(pin) has 2 separate strips on it. Chain them, or use different data pins."

Hiltwright won't build while a problem is listed. The pins on a Proffieboard V3 include extra "Free" pins, and a small indicator LED can use one as PWM instead of a power pin. These low-current pins can't drive a pixel strip, a star LED or a motor.

![The pin table with its status chip](shots/tour-12.png)

## Check it, then confirm

Check every data pin and power pin against what the installer wrote down, then turn on **I checked the wiring**.

We added this switch because a wrong power pin can damage hardware, and nothing is installed until the switch is on. Until then the **Fonts** button under "Next" is grayed out, and the Build & Flash page shows "Confirm the wiring to unlock the install."

The confirmation belongs to the layout you checked. If you change the board or any blade, the confirmation turns off again, and if you change them back, the confirmation comes back. A saber that was set up before this check existed asks you once: "Hiltwright now records which wiring you checked. Check it once more to go on."

If the saber reports pixel blades when you plug it in, Hiltwright shows them as a starting point only, so check each blade yourself.

![The confirm switch and the Next step button](shots/tour-13.png)

## What needs a rebuild

Wiring is compiled into the saber's firmware, so after you change the wiring, Build & Flash says "The setup changed after this build. Build again to install it." Build again, then install. See [Build & Flash](build-and-install.html).

## If the wiring was changed elsewhere

If the wiring changes while this page is open (for example when you adopt a plan in the Armory), the page shows the new version. If you had an unsaved change, the page says "This saber's wiring was changed elsewhere; your last change was not applied."

Next: [Fonts](fonts.html).
