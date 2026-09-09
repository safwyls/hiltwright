# Hiltwright · planning docs

Goal: a platform that gives non-technical lightsaber owners (typically arriving from Crystal Focus X, Xenopixel or LGT boards) everything that makes ProffieOS exceptional, without Arduino, C++, drivers or the style-template language.

| Doc | Contents |
|---|---|
| [00-plan.md](00-plan.md) | **Plan of record.** Path A desktop-only, Electron + TypeScript, committed 2026-09-07. Architecture, tiers, roadmap, risks, measurements. Supersedes 05. |
| [01-proffieos-recon.md](01-proffieos-recon.md) | What a ProffieOS config is, the style language, the exact runtime-vs-compile boundary, presets.ini, serial commands, SD layout, flash budget, OS8, licensing |
| [02-toolchain-usb-recon.md](02-toolchain-usb-recon.md) | Compiler, arduino-cli FQBNs, the DFU upload mechanics, per-OS drivers, USB interfaces, browser capability matrix, what is possible where |
| [03-ecosystem-and-users.md](03-ecosystem-and-users.md) | Existing tools (ProffieConfig, Fett263, Workbench, Style Editor, webdfu), CFX/Xeno mental models, recurring friction, font licensing |
| [04-paths.md](04-paths.md) | Path A desktop app, Path B web + cloud build, Path C hybrid; pros, cons, hard limits, per-platform truth tables |
| [05-decision-and-roadmap.md](05-decision-and-roadmap.md) | Decision history: how the recommendation moved from Path C to Path A |
| [06-spike-results.md](06-spike-results.md) | Pipeline spike: headless bootstrap, compile matrix with timings and flash usage, error scenarios, artifact format. Script in `spike/` |
| [07-frontend-design.md](07-frontend-design.md) | **Frontend design.** React renderer architecture, routes, state, preload contract, component inventory, accessibility contract. Visuals on the Hiltwright Console design canvas, generated from `design/` |
| [../demo/](../demo/) | **Interactive prototype.** Vite + React + TypeScript demo of the renderer with dummy data: presets, looks, simulated build, fonts, hardware wizard with the blade model. `npm run dev` in `demo/` |
| [09-board-protocol-notes.md](09-board-protocol-notes.md) | Serial behaviour recorded from a real V2.2 on OS 7.8: mixed line endings, interleaved status lines, silent writes with deferred saves, `list_presets` shape, missing commands on old firmware. Raw transcripts in `packages/core/test/transcripts/` |
| [../packages/core/](../packages/core/README.md) | **Phase 0 · `@hiltwright/core`.** Pure TypeScript domain package: blade model, `config.h` codec, `presets.ini` codec, board protocol client and response parsers tested against recorded transcripts. `npm run test:core` |
| [diagrams/](diagrams/) | Archify architecture diagrams: `committed-desktop.html` (the plan of record), plus the evaluation diagrams `path-a-desktop.html`, `path-b-web.html`, `path-c-hybrid.html` (open in a browser; sources are the `.architecture.json` files; `*.visual-check.*` files are the automated browser evidence and screenshots) |

Key facts in one breath: ProffieOS configs are C++ headers compiled into the firmware; only preset order, font, track, name, variation and `RgbArg`/`IntArg` values are editable at runtime through `presets.ini`; new style structures, blade layout, prop and every `#define` need a compile with xPack GCC 14.2 (~300 MB) and a DFU flash to `0x08000000`; Windows needs a one-time WinUSB driver for the STM32 bootloader on every path; Chromium browsers can do serial, WebUSB and DFU flashing but cannot compile.
