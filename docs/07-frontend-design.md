# 07 · Frontend design: the React renderer

**Date:** 2026-09-07
**Status:** design proposal for the Electron renderer described in [00-plan.md §5.1](00-plan.md). Visuals live on the Hiltwright Console design canvas (artifact) and are generated from [`design/`](../design/) (`node design/build.mjs` rebuilds the artboards from `design/screens/*.mjs` and `design/lib/shell.mjs`).

---

## 1. What the frontend has to do

The renderer is the whole product as the user sees it. It owns the UI and the board bridge (Web Serial / WebUSB). Main owns subprocesses and files. The plan's three tiers map to three moods in the UI:

| Tier | Screens | Feel | Colour cue |
|---|---|---|---|
| 1 · Runtime | Presets, Diagnostics | Instant, reversible, always safe | Hologram blue ("live") |
| 2 · Build & install | Looks (when a look needs a build), Build & Install, hardware wizard | Deliberate, honest about time, backed up first | Amber ("writes firmware") |
| 3 · SD content | Fonts & SD | File management with validation | Neutral, green when verified |

Design constraints taken from the recon:

- CFX and Xenopixel owners expect "pick a font, pick a look, press one button". No compiler, FQBN, DFU or `#define` vocabulary in primary copy. Technical detail sits behind "Show output".
- Compile is about 1 minute and a DFU write another minute. The install flow is a six-step timeline with honest timing, never a spinner.
- Flash budget is the top V2 failure. The meter is visible before anything is added, with the projected percentage.
- `BladeConfig` is identity. Wiring is entered once, shown read-only, and any edit asks for confirmation.
- Never brick, never lose. Every write-path screen shows when the last backup was taken.

## 2. Visual direction

"Used-future console": dark cool surfaces, hologram-blue interaction, amber for anything that writes firmware. The user's blade colours are the only other saturated thing on screen, so blade previews read as the hero of every page. The feel comes from six moves rather than franchise assets (no logos, insignia, in-universe alphabets or character names anywhere):

1. Used-future surfaces: cool charcoal panels, seams, a 2% scanline wash.
2. HUD corner brackets on every panel; amber or red brackets for caution and failure.
3. Chamfered buttons (two opposite corners cut); chips and fields stay square.
4. Segmented telemetry: meters and progress as segments plus mono digits.
5. One hologram accent with a soft bloom marks what is live.
6. Wide tracked "sector" eyebrows above each heading; headings stay plain English.

Tokens (dark only for v1):

| Token | Value | Use | Contrast on panel |
|---|---|---|---|
| `--bg0` | `#0a0e13` | window | |
| `--bg1` | `#101720` | panels | |
| `--bg3` | `#1c2833` | secondary button fill | |
| `--line` / `--line2` | `#24313f` / `#3b4c5e` | seams, borders | |
| `--text` | `#e6edf3` | primary text | 15.2 : 1 |
| `--dim` | `#a3b3c2` | body copy, hints | 8.4 : 1 |
| `--mute` | `#7a8b9b` | labels, timestamps | 5.1 : 1 |
| `--holo` | `#5fd3ff` | interactive, live, focus | 10.5 : 1 |
| `--amber` | `#ffb547` | writes firmware, caution | 10.2 : 1 |
| `--red` | `#ff5c5c` | blocked, error | 6.0 : 1 |
| `--green` | `#5ee39a` | verified, backed up | 11.1 : 1 |

Type: Michroma for eyebrows and headings (short labels only, always tracked), Exo 2 for body, JetBrains Mono for anything that is data (numbers, pins, file names, commands). Fonts are bundled with the app, not fetched.

## 3. Stack

- **React 19 + TypeScript**, built with `electron-vite`. Renderer is sandboxed, `contextIsolation` on, talks to main only through the typed preload API.
- **Routing:** `react-router` with a memory history (no URL bar in Electron).
- **State:** `zustand` stores per concern (§5). No global reducer. Server-like async (toolchain status, build jobs) uses subscriptions to main events, not polling.
- **Domain logic:** imported from `@hiltwright/core` (config model, style AST, `presets.ini` codec, protocol framing, flash estimator, importers). The renderer never re-implements any of it.
- **Accessible primitives:** Radix UI (Dialog, Select, Popover, Tabs, Toggle, Slider, Tooltip) unstyled, skinned with the tokens. `dnd-kit` for preset reordering with keyboard sensors.
- **Styling:** plain CSS with custom properties and CSS Modules. No utility framework; the chamfer, HUD brackets and blade bloom are a handful of shared classes.
- **Icons:** in-house stroke SVG set on a 24-grid (see `design/lib/shell.mjs`), extended from Lucide (MIT) where a glyph is missing.
- **Testing:** Vitest + Testing Library for components; Playwright against the Electron build for the install flow with a mocked board bridge.

## 4. App shell and routes

```
AppShell
├── SideNav        Armory · Presets · Looks · Fonts & SD · Build & Install · Diagnostics · Settings
├── TopBar         active saber selector · connection chip · battery · Back up
├── <Outlet/>      the route's page
└── StatusBar      board · firmware identity (from `version`) · presets.ini sync · last backup
```

| Route | Page | Tier | Needs board? |
|---|---|---|---|
| `/armory` | Saber library, connected banner, CFX/Xeno import, recent backups | | no |
| `/saber/new/:step` | Hardware wizard (board, blades, buttons, check, Windows driver) | 2 | optional |
| `/saber/:id/presets` | Live preset editing | 1 | yes |
| `/saber/:id/looks` | Style gallery, look detail, paste style code | 1/2 | no |
| `/saber/:id/fonts` | SD manager, validation, naming converter | 3 | card or reader |
| `/saber/:id/build` | Flash budget, pre-flight, install timeline, history | 2 | yes for install |
| `/saber/:id/diagnostics` | Serial console, effects, battery, `sdtest`, driver state | 1 | yes |
| `/settings` | Toolchain, OS versions, backups folder, updates | | no |
| `/first-run` | Toolchain download consent (357 MB), Windows driver explainer | | no |

Route guards, not modals: a Tier 1 page with no board connected renders its own "plug in the saber" empty state with the last-known data greyed, so nothing jumps.

## 5. State model

```
sessionStore     connected port, board variant, firmware identity, battery, volume, SD mounted?
libraryStore     sabers[] (id, name, BladeConfig identity, presets, looks, backups, firmware cache key)
presetStore      draft presets for the active saber; snapshot stack; sync status ("saved to saber 2 s ago")
buildStore       job state machine: idle → preflight → backup → build → bootloader → write → verify → restore → done | failed(step, translatedError)
sdStore          card location (via saber | reader | none), fonts[], validation findings, copy jobs
toolchainStore   installed versions, download progress, driver state (Windows)
```

Rules:

- Preset edits are optimistic. The store snapshots `presets.ini` before the first change in a batch, writes through the board bridge, and marks the row "saved" only when the board confirms. A failed write rolls back and explains.
- `buildStore` is the only writer of firmware. Its state machine is driven by main's events (`build:progress`, `flash:step`) and exposes elapsed time per step so the timeline is honest.
- The board bridge is a renderer service (`services/board.ts`) wrapping Web Serial with the core's untagged, idle-terminated client (OS 8.10 has no tag framing; see 09). Pages use `useBoard()` and never touch the port.

## 6. Preload contract (sketch)

```ts
window.hiltwright = {
  library:   { list, get, save, remove, importCfx(dir), importXeno(dir), readSdSource(dir) },
  toolchain: { status(), install(onProgress), versions() },
  build:     { preflight(saberId), start(saberId), cancel(jobId), onEvent(cb), estimateFlash(model) },
  flash:     { backup(saberId), restore(saberId, backupId), driverState(), installDriver() },
  sd:        { locate(), listFonts(root), validate(fontDir), copy(src, dst, opts), convertNames(dir, from) },
  backups:   { list(saberId), snapshotPresets(saberId) },
  app:       { version(), checkUpdates(), openPath(p), selectDirectory() },
  serial:    { requestPort() }   // main's select-serial-port handler grants the renderer bridge
};
```

Every call is promise-based, every long job emits typed events, and every error carries a `userMessage` already translated by main's error map plus a `detail` for "Show output".

## 7. Component inventory

Shared (see the Design system sheet on the canvas):

- `Panel` with `tone: default | amber | red`; header slot; HUD brackets built in.
- `Button` with `variant: primary | secondary | warn | danger | ghost`, `size: md | sm`. Focus ring lives on the outer element because clip-path would clip an outline on the inner one.
- `Chip` with `tone: live | ok | warn | err | idle` and a required icon or dot.
- `Field`, `Select`, `Slider`, `Toggle`, `ColorArgRow` (swatch + label + argument number + hex).
- `BladePreview` (hilt + bloom bar per blade, colours from the argument values; animates ignite/clash/retract; static under reduced motion).
- `FlashMeter` (32 segments; blue to 70%, amber to 90%, red beyond; zone spelled out in the label).
- `InstallTimeline` (six steps with elapsed time, `aria-live="polite"`).
- `Note` with `tone: info | ok | amber | red` and an optional action.
- `SortableList` (dnd-kit, `Alt+↑/↓` keyboard reorder, screen-reader announcements).
- `Table`, `Stepper`, `Dropzone`, `LogView` (mono, virtualised).

Page-specific: `SaberCard`, `ConnectedBanner`, `PresetEditor`, `LookCard`, `LookDetail`, `FontRow`, `NamingConverter`, `BladeBlock` (wizard), `PreflightList`, `BuildHistory`.

## 7a. Blade model

ProffieOS treats every separately driven output as a "blade": a `BladeBase` in the `BladeConfig` row that receives one style per preset. `NUM_BLADES` is the length of that list, and `builtin P B` addresses preset P, blade B. The UI keeps the word **blade** for the same reason, and layers two user-facing attributes on top:

| Attribute | Values | Drives |
|---|---|---|
| **Role** | main blade, crystal chamber, accent, side blade, motor | preview glyph, default look, curated look picker |
| **Type** | pixel strip (`WS281XBladePtr`), star LED and single LED (`SimpleBladePtr` with LED templates and resistor values), motor (`SimpleBladePtr` on a PWM power pin) | the parameter fields and wiring questions |

Motors in this hobby almost always spin a crystal-chamber component; haptic use is possible but rare. A motor is therefore a role of its own, with looks like "Spin while ignited" and "Spin on clash" rather than colours.

**Wiring is two sentences, not numbers.** A pixel blade is either on its *own data line* (pick the data pin and power pins) or *continues Blade N's wire* (a `SubBlade` of the same strip). In the second case the app computes the pixel range from the counts of the blades ahead of it on that wire, and the blade inherits the parent's power pins. Reverse, stride and zigzag sub-blades live under an Advanced disclosure. LEDs and motors ask for one power pin each.

**Wizard flow (step 2).** Pick the blade count with a stepper, then fill one card per blade in order. Cards collapse to a one-line summary once complete, so a four-blade saber reads as four lines plus the card being edited. A live saber diagram and a pin table (data lines, LED 1–6 power pins, what drives what, conflicts) sit beside the cards and act as the budget. Everything is read-only after setup, per the identity rule.

**Presets.** One "Look per blade" row per blade, in blade order, with a picker curated by role. Main blades get the full library. Crystals and accents get Off, Follow main blade, Solid, Pulse, Flicker, Battery level, Pulse on clash. Motors get Off, Spin while ignited, Spin on clash. "Follow main blade" is a shared accent style whose colour argument mirrors the main look's base colour, so it costs no flash. Linked colours show the link in the Colours grid and can be unlinked.

**Preview.** Each role renders in its own idiom: bloom bar for strips (side blades as short bars), a faceted crystal SVG for a crystal chamber (with a spin ring when a motor is present), a lens dot for LEDs, a spin ring for a motor. The hilt drawing carries a chamber window that shows the crystal colour on Armory cards.

**Wiring facts the model must respect** (verified against the ProffieOS source and the V3 board page, 2026-09-08):

- *Shared power pins are legal.* `blades/power_pin.h` reference-counts power pins when `SHARED_POWER_PINS` is defined, so two independent blades may list the same LED pin. The wizard treats this as a note, not a conflict, and the build adds the define.
- *Strips in parallel are one blade.* Two strips soldered to the same data wire mirror each other and cannot be controlled separately. The blade card has a "strips on this wire" count with an explanation; it never creates a second `BladeConfig` entry. Two 20 px quillons on one wire are one 20 px blade.
- *V3.9 Free pins.* `blade5Pin`, `blade6Pin`, `blade7Pin` (Free 1–3) can be extra pixel data outputs, buttons, PWM or servos. A small indicator LED can be driven from one of them through its own resistor, so on a V3.9 the single-LED "driven from" list includes them, marked low-current; star LEDs and motors stay on the FET pins LED 1–6. Data 2, Data 4, RX and TX can also PWM LEDs but share a timer with the pixel driver, so they are unusable for that once any pixels are present; the app does not offer them.

**Flash and validation consequences.** The flash estimator counts distinct style instantiations across all blades, not presets times blades. Validation checks that every preset has a look for every blade, data pins are unique, sub-blade ranges fit the strip, and low-current PWM pins are not asked to drive motors or star LEDs, per board variant. Shared power pins are allowed and flagged.

**Shelved.** Servos and colour displays are not in scope; neither has community traction yet. The monochrome OLED is a display, not a blade: it is configured in the Board step and its images live with each font on the SD card.

## 8. Screen behaviour notes

**Armory.** Cards show identity (board, blades, presets, firmware from `version`), a mini flash meter and last backup. "Read from the saber", "Read from the SD card" and "Describe the hardware" are the three ways in. The CFX / Xenopixel on-ramp is a first-class panel here.

**Presets.** Three columns: list, editor, live preview. Every control writes `presets.ini`. The look picker offers only compiled-in looks ("builtin P B") and links to Looks for anything else. Colour rows expose the argument number so what the user sees maps to what the saber stores. Effect test buttons and volume drive the board directly. Mirror-on-saber toggle turns live preview into `set_style`/argument writes as you drag.

**Looks.** Gallery of compiled and library looks with per-look flash cost and "Compiled in / Needs build" state. *(Built 2026-09-10 without the per-look flash cost: a look must live in a preset slot to be compiled, so "Add to saber" picks the preset and blade; the flash meter on Build & Install shows the total.)* The detail drawer projects the new flash percentage before "Add to saber" and explains what the build will do. "Paste style code" keeps the Fett263 copyright header, as the library's GPL terms require.

**Build & Install.** Order of information: flash budget, pre-flight, then the timeline. The primary button is disabled while a job runs; Cancel is always available before the write step. History shows the previous attempt with the translated error and a "Open preset" fix action. The BOOT + RESET recovery note appears whenever the bootloader fails to enumerate, with the last backup named.

**Fonts & SD.** Mount state and speed warning at the top, then a table with validation chips (mono/poly mix, sample rate). Fixes are actions on the note, not instructions. The naming converter previews the mapping and renames only the copy.

**Hardware wizard.** Detected facts first ("read from the saber", step 1), then only what old firmware cannot report. Step 2 is the blade model in §7a. Windows driver is step 5 and is clearly marked as needed only for installing firmware.

## 9. Accessibility contract

- Text contrast 4.5 : 1 or better on its surface (table in §2); large mono readouts 3 : 1 minimum.
- Focus: 2 px white ring at 3 px offset on every interactive element. Never removed. Route changes move focus to the page heading.
- Targets: primary actions 40 px, list and colour rows 44 px, icon buttons 32 px with 8 px spacing.
- Status is never colour alone. Chips carry an icon or word; meter zones are written in the label.
- Keyboard: full operation without a mouse, including preset reorder (`Alt+↑/↓`) and blade preview effects (buttons, not gestures).
- Live regions: build progress and "saved to saber" announce politely; errors assertively.
- Reduced motion: blade bloom pulse, spinner and glow animations stop under `prefers-reduced-motion`; progress still updates.
- Plain language in primary copy. All-caps only on short tracked labels of three words or fewer. Body copy never all-caps.
- Radix primitives for menus, dialogs and selects so ARIA roles, typeahead and dismissal are correct by default.

## 10. Motion

Three animations, all CSS, all disabled under reduced motion:

1. Blade ignite / retract on the preview (width wipe, 300 to 500 ms, matched to the preset's ignition and retraction values).
2. Hologram pulse on the "live" dot and the current install step.
3. Panel reveal on route change (opacity plus 6 px rise, 160 ms).

## 11. Open questions

1. Light theme: deferred. The tokens are named by role so a light set can be added without touching components; contrast must be re-verified.
2. Preset preview fidelity: the Style Editor fork will render real style ASTs. The `BladePreview` here is the placeholder contract (colour, ignite, clash, retract) until that lands.
3. Whether Diagnostics exposes a raw serial console in v1 or only guided checks.
4. Font preview playback: play from the card over the saber's slow link, or from the user's local copy when one exists.
