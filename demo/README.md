# Hiltwright demo

Interactive React prototype of the Hiltwright renderer, with dummy data. Everything is simulated: there is no board, toolchain, driver or SD card behind it. It exists to try the flows from [docs/07-frontend-design.md](../docs/07-frontend-design.md) and the design canvas before the real Electron renderer is built.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html, one self-contained file
npm run artifact   # dist/hiltwright-demo.html, the same page as an artifact-ready fragment
```

What works:

- **Armory**: switch sabers, see computed flash use, start the hardware wizard.
- **Presets**: select, add, duplicate, delete, drag or Alt+arrow reorder. Every edit snapshots `presets.ini` so Undo and Restore work. One look row per blade, curated by role. Colour pickers write through to the preview. Effect buttons animate the blade, crystal, accent and motor.
- **Looks**: filter, pick, see the projected flash percentage, queue a look for a build.
- **Build & Install**: flash budget and pre-flight are computed from the saber. Install runs a simulated six-step timeline (about fifteen seconds) and moves queued looks into the firmware.
- **Fonts & SD**: mount and eject, fix the two classic font problems, convert and copy a Xenopixel-named font.
- **Hardware setup**: blade count, role and type per blade, wiring as "own data line" or "continues Blade N's wire" with computed pixel ranges, a live pin table with conflict detection, Blade ID variants with a simulated Measure, and a finish that adds the saber.
- **Diagnostics**: a fake serial console that answers `version`, `battery`, `list_presets`, `id`, `scanid`, `sdtest` and the effect commands.

Layout:

- `src/model.ts`: blade, preset, look and saber types plus the derived facts (sub-blade ranges, pin table, flash estimate, pre-flight).
- `src/data.ts`: dummy sabers, looks and fonts.
- `src/store.ts`: one zustand store with all actions, including the simulated build and wizard state.
- `src/components/`: shell, icons, UI primitives, blade and crystal drawings.
- `src/pages/`: one file per screen.
- `src/styles.css`: the design tokens and component classes from the canvas.
