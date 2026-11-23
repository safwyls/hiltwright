---
title: Demo room
summary: Try any style with any sound font on a saber in a dark room, before anything goes near a real saber.
section: The workshop
order: 4
---
The Demo room is a dark room with a saber in it. You pick a style and a sound font, then ignite the saber, swing it, clash it and hold lockups. The Demo room is the place to decide whether a style and a font belong together, without installing anything.

![The Demo room: a lit saber in a dark room, with the saber panel on the left and the controls along the bottom](shots/clean-45.png)

## Choosing a style and a font

The panel on the left has four tabs: **Blade**, **Sound**, **Saber** and **Help**.

**Blade** holds the style. Pick one from **Hiltwright** (the built-in styles) or from **Your styles** (the ones you built or pasted). A short description sits under the name, along with any preview warning. The **Colours** swatches change the style's colors for this session only: "Tried here only; the saber's own colours are set on Presets."

**Sound** holds the font. **Fonts from** lists where fonts can come from:

- **Font library**, with the number of fonts in it. See [Font library](font-library.html).
- **Hiltwright fonts**, the free fonts that come with the app, when they are set to allow playback.

Fonts on an SD card aren't a source here. Reading a whole card froze the room for a long time when we tried it, so the room uses the library instead. If you have no fonts yet, the tab says "No fonts to hand. Add a font folder to the Font library to hear it here." The **Add a font folder** link starts the add.

Pick a font and Hiltwright reads and decodes its sounds. Once the font is ready, the room shows whether the font has SmoothSwing, plain swing sounds, or no swing sounds, and a **Volume** slider sits below. If a very large font is trimmed, a note says how many files were left out to stay under the memory cap.

### From your saber

When you have a saber in the Armory with presets, the **Blade** tab shows a section headed **From** and the saber's name, with a preset picker and **Load**. **Load** sets the style, its colors and the font from that preset just as they are on the saber, and on a staff hilt the second blade loads too.

If the room can't load the style, a note says why, for example "Hiltwright cannot tell which style ... runs on blade ...", or that the style can't be shown in the room yet. The blade keeps what it showed before. If the preset's font isn't in the library, the note says so: "The font ... is not in the Font library. Add it there to hear it here."

## Controls

Press **?** or the **Controls** button for the full list. The keys are ignored while you're typing in a box.

| Action | Mouse | Key |
| --- | --- | --- |
| Ignite or retract | Double-click the room | Space |
| Move the saber | Drag. In **Hold the hilt** mode the blade follows your hand. In **Tilt and swing** mode, drag left and right to swing level with the floor, and up and down to tilt. | |
| Twist the hilt | Scroll | |
| Blaster bolt | Click the blade where you want it | B |
| Clash | | C |
| Hard clash | | Shift+C |
| Stab | | S |
| Force | | F |
| Lockup (hold) | | L |
| Drag (hold) | | D |
| Melt (hold) | | M |
| Lightning block (hold) | | N |
| Special abilities | | 1, 2, 3, 4 |
| Look around | Right-drag | |
| Pan the view | Middle-drag | |
| Zoom | Ctrl+scroll, or a trackpad pinch | + and - |
| Reset the pose and the view | | R |
| Show the controls | | ? |

The same actions are on buttons along the foot of the panel: **Ignite** or **Retract**, **Hit** (Clash, Hard, Blast, Stab, Force) and **Hold** (Lockup, Drag, Melt, Lightning). A held lockup stays on until you press it again. The hit and hold buttons only work while the blade is lit, and if the blade turns off, any hold is released.

**Force** plays the font's force sound, and a style that reacts to Force shows it on the blade. Many fonts have no force sound, and then the panel says so and Force is silent, just as it would be on the saber.

**Special ability** buttons appear only when the chosen prop file has abilities. A saber that is pre-igniting shows **Cancel preon**.

In the top right corner, small numbers show what the saber's sensors would read: swing, tilt, turn and twist.

## Motion

You move the saber by dragging. The blade has weight, so it trails a quick move, whips through and settles. Scrolling twists the hilt the way a wrist would, and styles that follow tilt, swing or twist respond to what you do.

To pose the blade exactly, open the **Saber** tab and use **Point the blade**. The **Tilt**, **Turn** and **Twist** sliders set the angles, which can be helpful when you want to see what a style does in one direction. **Reset** puts the blade back. Using these sliders switches the mouse to Tilt and swing mode.

## The Saber tab

- **Prop file** chooses how the saber behaves. **Prop file** also says whether a style can turn the saber off and on itself, what special abilities there are, and whether the prop plays a style's own sounds. If your saber has a prop, that prop is marked "(this saber)".
- **Mouse control** is **Hold the hilt** or **Tilt and swing**.

## Scene

The **Scene** panel in the bottom right shapes the room, and **Reset** puts everything back.

- **Light**: **Glow**, **Glow spread**, **Blade heat**, **Blade light**, **Room light** (all the way down, only the blade lights the scene) and **Haze**. There is also a **Floor grid** switch.
- **Blade**: **Length** in inches, **Strip** (LEDs per meter of strip, which sets how many LEDs the style runs on), **Diameter**, **Blade shown when off**, and **Second blade (staff)** for a staff hilt.
- **Model**: **Hilt model** chooses the built-in hilt, one of yours, or one from a pack. You can load a `.glb`, `.obj` or `.stl` file of your own, and then **Fit and placement** controls let you set the hilt's length, turn, sideways shift, how deep the blade sits, and its lean. If the blade leaves the other end, switch **Blade at the other end**. **Copy fit** copies the numbers as text. Your hilts and the scene settings are kept between visits, and a hilt can carry its maker's credit.

## In the browser

The Demo room also runs in the [workshop](../workshop/index.html#demo) on this website, with nothing to install. The browser room differs from the app's room in a few ways:

- **Fonts are folders you open.** On the **Sound** tab, choose **Open a font folder** and pick one font's folder, or a folder of fonts. The sounds are read in the browser and sent nowhere, and they're forgotten when the tab closes.
- **No saber.** There is no **From** section, and the prop file starts as Fett263's.
- **The drawn hilt.** The app's built-in hilt and free fonts stay in the app. A hilt model you load stays for the visit only, and there is no **Export hilts** or **Import hilts**.
- **Your styles** are the ones built or pasted in the workshop during this visit. Save them for the app on the Styles page.

The scene settings are remembered in the browser.

## How faithful is it

The blade runs the same per-LED math as the saber, so colors, timing and effects are close. The sound follows ProffieOS's own rules for sound fonts: the hum loops from ignition to retraction, ignition and retraction sounds chain as on the saber, clash, blast, stab and force layer on top, and lockups play their begin, loop and end sounds. Swings use the SmoothSwing method, or for fonts without SmoothSwing, a whole swing sound each time the blade passes a swing speed. A font with drag sounds but no melt sounds plays drag for melt.

The Demo room is a good guide to the saber, though speakers, volume and the real hum will still differ. Parts of a style the preview models roughly are flagged under the style's description.
