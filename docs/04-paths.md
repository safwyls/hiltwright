# 04 · Paths forward

> **Status:** evaluation record. The decision is Path A, desktop-only, Electron; see [00-plan.md](00-plan.md). The Path C section below describes the rejected hybrid, kept for the record.

Three candidate architectures. A and B are the pure forms the brief asked for; C is the composite that the analysis converges on. Each section states the stack, what it can and cannot do, and the per-platform truth table. Diagrams: `docs/diagrams/path-a-desktop.html`, `path-b-web.html`, `path-c-hybrid.html`.

The three product tiers used below:

- **Tier 1 · Runtime editing** (no reflash): presets, fonts, tracks, order, names, colours/options exposed as style arguments, variation, volume, diagnostics, backups. Talks to a *running* board over serial/WebUSB; needs **no driver on Windows 10+**.
- **Tier 2 · Firmware build & install**: anything compile-time (new style structures, blade layout, prop, defines, OS upgrade). Needs a compiler and a DFU flash; on Windows needs the one-time WinUSB driver for `STM32 BOOTLOADER`.
- **Tier 3 · SD content**: writing fonts/tracks/presets.ini to the card, via the board's mass-storage mode or a card reader.

---

## Path A · Installed desktop application

**Stack.** Tauri 2 shell (Rust host, WebView UI in React/TypeScript). Rust host owns: serial (`serialport`), USB enumeration (`nusb`), sidecar processes, filesystem. First run downloads a pinned toolchain bundle into an app cache: `arduino-cli`, Proffieboard core 4.x, xPack `arm-none-eabi-gcc` 14.2.1 (≈280–325 MB), `dfu-util` (shipped inside the core), and pinned ProffieOS source trees per supported version. Windows adds `proffie-dfu-setup.exe` (libwdi) launched with UAC elevation exactly once. Compile = `arduino-cli compile --fqbn proffieboard:stm32l4:ProffieboardV3-L452RE:usb=cdc_msc_webusb,dosfs=sdmmc1,speed=80,opt=os`. Flash = 1200-baud touch (or `RebootDFU`) then `dfu-util -d 1209:6668,0483:df11 -a 0 -s 0x08000000:leave -D out.bin`.

**What it can do.** Everything: Tier 1, 2 and 3. Fully offline after first run. Local build cache makes rebuilds fast. Reads SD via the MSC drive letter/mount or any card reader. Whole-flash backup and restore with `dfu-util -U`. Serial monitor. Can automate the Windows driver.

**What it cannot do.**
- Run on a phone or tablet. Ever.
- Avoid the ~350 MB first-run download and ~1 GB on disk.
- Avoid **code signing**. Unsigned binaries trigger Windows SmartScreen "unrecognised app" and macOS Gatekeeper refusal. For an audience that already fears Arduino, that is a conversion killer. Costs: Windows Authenticode/Azure Trusted Signing, Apple Developer Program + notarisation, yearly.
- Avoid a three-OS build/test/update matrix and an updater.
- Escape antivirus false positives on a bundled compiler toolchain.
- Share a saber config with a friend by link.
- Ship a new ProffieOS version without the user updating the app (mitigated by keeping OS/prop definitions data-driven and downloadable).

**Per-platform truth table.**

| | Windows 10/11 | macOS | Linux | Android / iOS |
|---|---|---|---|---|
| Tier 1 | Yes, no driver | Yes | Yes (udev) | No |
| Tier 2 | Yes; app runs driver installer once (UAC) | Yes | Yes | No |
| Tier 3 | Yes | Yes | Yes | No |
| Offline | Yes | Yes | Yes | — |
| Install friction | Download, SmartScreen unless signed | Gatekeeper unless notarised | Package/AppImage | — |

**Pros.** Maximum capability; no server bill; privacy (config never leaves machine); proven model (ProffieConfig does this today in C++).
**Cons.** Heaviest install; signing costs and ceremony; slowest iteration for us; competes head-on with ProffieConfig's niche; excludes mobile forever.

---

## Path B · Web application with cloud build

**Stack.** React/TypeScript PWA hosted statically (HTTPS required for WebUSB/Web Serial). Board access in the browser: Web Serial for the CDC console (`tag|command` framing), WebUSB for the Workbench-style vendor interface and for **DFU flashing** (fork of `profezzorn/webdfu`, DfuSe download to `0x08000000` then detach). SD writes through the File System Access API pointed at the board's mass-storage drive or a card reader. Backend: build API (auth optional, rate limit) → queue → Docker build workers (arduino-cli + core + gcc + pinned ProffieOS trees) → artifact store holding `firmware.bin` plus a **source bundle** (config + OS version pointer) for GPL compliance. Build cache keyed by `sha256(normalised config, OS version, FQBN)` so popular hardware profiles never rebuild. Saber library and style sharing in a database; style gallery on a CDN.

**What it can do.** Tier 1 with zero install on any Chromium desktop and on Android Chrome (WebUSB). Tier 2 via cloud build + WebUSB DFU on Chromium desktop (Android **unverified**). Tier 3 on Chromium desktop via File System Access. Always up to date. Shareable links (a vendor can send a customer "your saber" URL). Centralised OS-version validation and telemetry on what fails to compile.

**What it cannot do.**
- Work in Firefox or Safari, or on iOS at all (no WebUSB/Web Serial). Must say so on the landing page.
- Compile offline. A Tier 2 change needs the internet and our servers being up.
- Install the Windows bootloader driver. The user must download and run `proffie-dfu-setup.exe` once. We can *detect* the missing driver (the bootloader never shows up in `navigator.usb.requestDevice`) and guide them, but not fix it.
- Keep the config private from us. Every build uploads the config. Needs a clear policy and per-build deletion.
- Push large font packs over serial. Tier 3 must go through MSC/card reader; serial file transfer is impractical.
- Escape a running cost: build workers, storage, abuse control. A cold ProffieOS build is minutes of CPU **(to be measured)**.

**Per-platform truth table.**

| | Windows 10/11 Chrome/Edge | macOS Chrome | Linux Chrome | Android Chrome | iOS / Firefox / Safari |
|---|---|---|---|---|---|
| Tier 1 | Yes, no driver (WebUSB auto-WinUSB, CDC in-box) | Yes | Yes (udev) | Yes (WebUSB only, not Web Serial) | No |
| Tier 2 | Yes after **manual** one-time `proffie-dfu-setup.exe` | Yes | Yes | **Unverified** | No |
| Tier 3 | Yes (File System Access) | Yes | Yes | No | No |
| Offline | Tier 1 only (PWA) | Tier 1 only | Tier 1 only | Tier 1 only | — |
| Install friction | None | None | None | None | — |

**Pros.** Zero install, zero signing, instant updates, shareability, mobile Tier 1, central build cache, easiest to iterate and to A/B the onboarding. Browser flashing is already a path Fredrik documents.
**Cons.** Chromium-only; server cost and uptime become product features; the Windows driver step is a documented manual hop; GPL source-offer plumbing; config privacy.

---

## Path C · Hybrid: one shared core, web-first, desktop shell later

**Stack.** A platform-agnostic TypeScript core: config model ⇄ `config.h` codec, style AST (parser, pretty-printer, validator, argument extraction, preview renderer forked from the GPL Style Editor), `presets.ini` codec, board protocol client (`tag|command`), hardware profiles, flash-budget estimator. A shared React UI. Two thin shells behind three interfaces (`BoardTransport`, `FirmwareBuilder`, `StorageProvider`):

- **PWA shell** = Path B adapters (Web Serial/WebUSB, cloud builder, File System Access).
- **Tauri shell** = Path A adapters (native serial/USB, local arduino-cli builder with cloud fallback, driver installer, direct filesystem).

**The cloud build service is the Path B service, unchanged.** It is one deployment with the same parts: Build API (HTTPS, auth, rate limit), build cache keyed by `sha256(normalised config, OS version, FQBN)`, a queue feeding Docker build workers (arduino-cli, pinned Proffieboard core, xPack GCC, pinned ProffieOS trees), and an artifact store holding the `.bin` plus its GPL source bundle. What differs is the caller: the PWA shell uses it as its only `FirmwareBuilder`; the Tauri shell uses its local toolchain first and falls back to the same API when the toolchain is absent or the user declines the download. Because the cache is shared, a config built once from a browser is a cache hit from the desktop app, and vice versa.

**What it can do.** Union of A and B, chosen per user: consumers use the web app; installers, offline users and Firefox/Safari holdouts use the desktop app. One codebase, one UI, one test suite for the core.

**What it cannot do.** Remove the fundamental ProffieOS limits (compile-time blade layout, styles compiled in, Windows bootloader driver). Avoid eventually running two delivery pipelines. Be built in one go: the adapter boundary must be designed before Phase 1 or the desktop shell becomes a rewrite.

**Pros.** Ships value earliest (Tier 1 web needs no server, no driver, no signing); defers the expensive decisions (signing, compile farm sizing) until usage justifies them; keeps the door open to desktop and mobile.
**Cons.** Discipline cost of the abstraction layer; risk of doing both shells half-way if scope is not policed.

---

## Side-by-side

| Criterion | A · Desktop | B · Web + cloud | C · Hybrid (web-first) |
|---|---|---|---|
| Time to first useful release | Medium (toolchain bootstrap + signing) | **Short** (Tier 1 needs no backend) | **Short** (same as B) |
| Install friction for target user | High unless signed | **None** | None (web), later optional desktop |
| Windows first-flash driver | Automated (UAC) | Manual one-time | Manual (web) / automated (desktop) |
| Offline compile | Yes | No | Desktop only |
| Mobile | No | Android Tier 1 (Tier 2 unverified) | Same as B |
| Firefox/Safari | N/A | No | Desktop shell covers them |
| Running cost | ~0 | Compile farm + storage | Compile farm, offset by local builds |
| Privacy | Best | Config uploaded per build | User's choice |
| Shareability / vendor hand-off | Poor | **Best** | Best |
| Competes with ProffieConfig? | Head-on | Different niche | Different niche first |
| Long-term capability ceiling | High | Medium | **Highest** |
