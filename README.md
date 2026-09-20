# Hiltwright

A desktop app that gives lightsaber owners coming from Crystal Focus X, Xenopixel and LGT boards everything ProffieOS can do, without Arduino, C++, drivers or the style language. Plan of record: [docs/00-plan.md](docs/00-plan.md). Docs index: [docs/README.md](docs/README.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | `@hiltwright/core`: pure TypeScript domain logic (config.h and presets.ini codecs, blade model, board protocol client). `npm run test:core` |
| `apps/desktop` | `@hiltwright/desktop`: the Electron app. Connects to a Proffieboard over Web Serial; live presets, looks and colours; fonts and SD; builds and installs firmware with its own toolchain. `npm run dev` |
| `demo/` | Interactive React prototype of the renderer with dummy data. `npm run dev` inside `demo/` |
| `design/` | Design canvas sources (`node design/build.mjs` regenerates the artboards) |
| `docs/` | Recon, plan, spike results, frontend design |
| `spike/` | Pipeline spike scripts and results (toolchain, compile, DFU flash) |

```bash
npm install
npm test
npm run typecheck
npm run dev     # run the desktop app from source
npm run dist    # build the Windows installer into apps/desktop/release
```
