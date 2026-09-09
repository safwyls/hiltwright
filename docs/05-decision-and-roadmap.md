# 05 · Decision record

**Superseded on 2026-09-07 by [00-plan.md](00-plan.md).**

## History

1. First recommendation in this repo: Path C, web-first hybrid (shared core, PWA with a cloud build service, desktop shell later).
2. The owner rejected the standing cost and operational commitment of a cloud build service that would be paid for on behalf of every user.
3. A parallel plan in `hiltwright_bionic` independently settled on Path A, desktop-only, Electron + TypeScript, committed without a web tier.
4. Review of that plan agreed with the decision and proposed five refinements: a pure TypeScript core package, a renderer-side Web Serial/WebUSB board bridge, runtime tier shipped before the build tier, a flash-budget meter, and CFX/Xenopixel import. The owner accepted all of them.

## Current decision

Path A, desktop-only, Electron + TypeScript, with the refinements above. Full plan, architecture, sequencing, risks and pre-Phase-2 measurements are in [00-plan.md](00-plan.md). The evaluation of all three paths remains in [04-paths.md](04-paths.md) for the record.
