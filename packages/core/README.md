# @hiltwright/core

Pure TypeScript domain logic. No Node, Electron or DOM imports: `tsconfig.json` has `lib: ["ES2022"]` and no ambient types, so anything platform-specific fails to type-check here by design. Main and renderer both import it.

```bash
npm run test:core        # from the repo root
npm run typecheck        # root app + core
```

## What is here (Phase 0, slice one)

- `src/model.ts`: the blade model the wizard and presets editor share. A `BladeSpec` is one ProffieOS blade slot with its wiring answered the way the wizard asks it: own data line, continues another blade's wire (sub-blade), or power pins only (simple LEDs and motors). `BladeConfiguration` is one Blade ID row.
- `src/config/`: the `config.h` codec.
  - `parse.ts` splits the file into `#ifdef CONFIG_*` sections, parses `CONFIG_TOP` line by line (defines, includes, `maxLedsPerStrip`), parses `CONFIG_PRESETS` into preset arrays and blade tables, and parses `CONFIG_BUTTONS`. Everything else, and anything containing a preprocessor conditional inside an initializer, is kept verbatim.
  - `emit.ts` writes it back. Top and button lines keep their original text; preset arrays and blade tables are regenerated in one canonical layout. Emitting twice is a fixed point.
  - `blades.ts` converts blade rows to `BladeSpec`s and back. Chained blades become `SubBlade` ranges with the strip's total pixel count on the first entry and `NULL` on the rest; reversed chains become `SubBladeReverse`. `sharedPowerPins` reports pins used by more than one independent blade, which is legal with `SHARED_POWER_PINS`.
- `test/`: golden fixtures (see `test/fixtures/README.md`) and tests that assert parse → emit → parse stability plus specific extracted facts.

## Not here yet

`presets.ini` codec, board protocol framing and transcript tests, flash estimator, hardware profiles, importers, style AST. Those follow in the order set out in `docs/07-frontend-design.md` and the Phase 0 plan.
