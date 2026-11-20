# Product

<!-- impeccable:product-schema 1 -->

This record covers the whole product: the desktop app (`apps/desktop`) and the website (`site/`, published at hiltwright.com).

## Platform

web

## Users

**Primary: people who own a Proffieboard saber and do not want to write code.** Their saber was often built and wired by someone else. They want to change sound fonts, presets and blade styles, and to install the result, without Arduino, C++ or a config file. They work at a Windows PC with the saber on a USB cable, usually one saber at a time, sometimes a small collection.

**Second: people moving from simpler boards** (Crystal Focus X, Golden Harvest, Xenopixel). They expect the ease of a config file on an SD card and are new to ProffieOS. They are a named audience, but the imports that would serve them directly are not in the beta.

Contributors are a third, smaller group: sound font makers, style authors and hilt makers whose work the app carries and credits.

## Product Purpose

Hiltwright takes one saber from a bare board to installed firmware: describe the wiring, choose presets, put fonts on the SD card, then build and install over USB. Beside that path is a workshop for browsing, building and trying styles and fonts for any saber.

It exists because ProffieOS is the most capable saber firmware and the hardest to set up. Success is an owner changing their saber and installing it without opening Arduino, reading a compile error or editing a config by hand.

## Positioning

Confirmed by the owner on 2026-11-19 as what sets Hiltwright apart:

- **Free and open source.** GPL-3.0-or-later, no price, source on GitHub.
- **A preview that is true to the saber.** Styles are simulated LED by LED with the same maths ProffieOS runs, and the demo room plays real font sounds. Where the preview can only be approximate, the app says so.
- **A style editor with no code.** A style is built and edited as layers that say what the blade shows, where and when.

Neighbouring products, for context: ProffieConfig (open source, C++) and SaberBench (announced November 2026, closed source, to be sold on the Microsoft Store). Hiltwright is unrelated to both and uses no code or data from either. It must not be mistaken for SaberBench.

## Operating Context

- A Windows 10 or 11 PC, 64-bit. The app is an Electron desktop app; its interface is a web page in a window of at least 1180 px wide.
- A Proffieboard V2.2 or V3, in a saber or on the bench, connected by a USB data cable. The app connects to a plugged-in saber by itself.
- The saber's SD card, reached through a card reader or lent by the saber over USB.
- The first build downloads a compiler (about 360 MB) once. A build then takes about a minute. The first install asks Windows for a USB driver, once.
- Sabers the app has seen are remembered, so most pages also work with no saber plugged in; changes are then staged for the next install.
- The website's jobs are to explain the app, give the download, and hold the docs, the install guide, the release notes and a step-by-step walkthrough that mirrors the tour built into the app.

## Capabilities and Constraints

In the beta (0.2.0-beta.9):

- **The saber path:** Armory (remembered sabers, plan one ahead, remove one), Wiring, Presets, Fonts & SD, Build & Install.
- **The workshop:** Styles, Style editor (Simple and Full), Font library, Contributors, Demo room.
- **Safety:** the whole firmware is backed up before every install and can be put back; nothing installs until the wiring is confirmed; presets keep a history; fonts on the card are checked; risky diagnostic commands ask first; "Save diagnostics" writes a local file and sends nothing.
- **Updates:** the app checks GitHub releases for a newer version and installs it when asked.
- **Themes:** ten, chosen on the About page. A theme changes colours, shapes, lines, type and the backdrop; it never moves anything.
- **Asset packs:** `.hwpack` files carry hilts or fonts with a creator, a licence and permissions. There are no style packs.

Constraints:

- Windows and macOS. macOS is the newer and less proven: its builds are made on GitHub, unsigned, with no font packs and no self-update; toolchain setup and firmware builds are proven on a Mac runner, and nothing with a saber is proven there yet (owner's decision, 2026-11-19, to present macOS as part of the beta). No Linux build.
- The installer is not code-signed. Windows warns about it, and Smart App Control must be off.
- A closed beta. Tester invitations are still open.
- The app does not format SD cards and does not build fonts from sounds.
- Blade ID and the Xenopixel and CFX imports are shelved and hidden.

Terminology:

- Say **style**, never "look", in anything a user reads. (`look` survives in code names only.)
- A **blade** is anything the saber lights or runs: main blade, crystal chamber, accent LED, motor.
- A **preset** is one setup the buttons switch to: a font, a track and a style for each blade.

Undecided:

- The licence shown for the built-in Punk Saber hilt. The owner chose CC BY 4.0; the app still shows "All rights reserved".
- Whether styles can be exported, imported or packed.

## Brand Commitments

- **Name:** Hiltwright. A wright is a maker; the hilt is what the owner holds.
- **Naming rule:** no Lucasfilm terms or marks; none of Fredrik Hubbe's names as product names (Proffie, Workbench, Crucible); nothing named Crystal.
- **Exception to the naming rule, accepted by the owner on 2026-11-19 as a fan project's risk:** five themes are named after Star Wars places and stories (Hoth, Ronin, The Ninth Jedi, Coruscant at night, Crait), and the Hoth and Coruscant backdrops show film vehicles and the Rebel insignia. The product's own name, logo and site stay inside the rule.
- **Voice, as shipped in the app and on the site:** plain and direct, short sentences, no hype. Limits are stated openly ("Not in this beta").
- **Credit:** makers of fonts, styles and hilts are named, with their licence and a link.
- **Visual constraint, given by the owner on 2026-11-19:** move away from the blues. It must not look like SaberBench (dark navy, cyan, a wide techno typeface). The app's appearance is a set of themes: the default, Station, is gloss black with trooper green; the others are Scorched hull, Hoth, Ronin, The Ninth Jedi, Coruscant at night and Crait. Every theme keeps the same layout.

## Evidence on Hand

- Screenshots of every tour step: `site/assets/shots/` (47 `tour-NN.png`, 18 `clean-NN.png`). These show the earlier blue appearance and need retaking in the Station theme.
- The walkthrough text: `site/data/tour.json`, generated from the app's own tour.
- Docs: `site/content/docs/*.md`, plus `docs/install-guide.md` and `docs/release-notes-beta-9.md`.
- A live blade demo on the site that runs the app's own simulator (`site/src/blade-demo.ts`).
- The Punk Saber hilt model and a side-on render of it (`site/assets/hilt.png`).
- Six free ProffieOS sound fonts shipped with the app.
- Eight public releases on GitHub: 0.2.0-beta.1 and 0.2.0-beta.3 to 0.2.0-beta.9.

Not on hand, and not to be invented: testimonials, user counts, download numbers, reviews, press, comparisons measured against other tools.

## Product Principles

1. **No code on the owner's path.** If a step needs Arduino, C++ or a hand-edited file, the product has not finished its job.
2. **What the preview shows is what the saber does.** When it cannot be exact, say so beside the preview.
3. **A mistake can be undone.** Back up before writing, keep history, and make putting things back one action.
4. **Free, open, and credited.** The source is public, and other people's work carries their name and licence.
5. **Say what it does not do.** Limits and unfinished parts are stated plainly, in the app and on the site.
