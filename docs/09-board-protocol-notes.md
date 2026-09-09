# 09 · Board protocol notes from a real V2.2

**Date:** 2026-09-09
**Board:** Proffieboard V2.2, vendor firmware ProffieOS **v7.8**, config `hote2.h`, prop `SaberSF24Buttons`, 2 buttons, 4 blades (140 px + 2 px + 1 px pixel strips and one more), 13 presets, installed Sep 2024. A good stand-in for a saber that has never been touched since purchase. Raw recordings: [`packages/core/test/transcripts/`](../packages/core/test/transcripts/) (`index.json` lists order and timing). Recorder: [`tools/record-transcripts.ps1`](../tools/record-transcripts.ps1).

These facts shape `@hiltwright/core`'s protocol client and the Tier 1 write path.

## What the board does

1. **Mixed line endings in one session.** `version` and preset blocks end lines with bare LF; `Battery voltage`, `Whut?`, font lists and status lines use CRLF. The line splitter strips a trailing CR and never assumes one convention.
2. **Unsolicited lines interleave with responses.** Font scanning (`Scanning sound font: … done`, `Style RAM = …`, `Activating polyphonic font.`, swing counts), audio (`unit = 0 vol = …, Playing …`, `Audio underflows: N`, `Amplifier off.`), SD (`Unmounting SD Card.`, `Creating file presets.tmp iteration = N`) and display (`DISPLAY: …`) lines arrive whenever the board feels like it, including in the middle of a later command's output. The client classifies them as events and never counts them as response lines.
3. **Writes answer with nothing.** `set_font TeensySF;common` produced zero bytes. The save is deferred: `Creating file presets.tmp iteration = 2` arrived during the *next* command, and the `show_current_preset` sent right after the write was itself delayed by the SD write and its output ran into the following `list_presets` response. Consequences: every write completes by idle timeout, is followed by a read-back (`show_current_preset`) to verify, and the read-back parser must tolerate a stray block at the start of the next response. The OS alternates `presets.ini` and `presets.tmp` and bumps an iteration counter on each save.
4. **`list_presets` has no terminator.** It prints `FONT=`, `TRACK=`, `STYLE1..N=`, `NAME=`, `VARIATION=` per preset and stops. A block is complete at `VARIATION=`; the list is complete when the stream goes idle.
5. **Values are escaped like the file.** Newlines print as `\n` (`NAME=Battery\nLevel`), backslashes are doubled; `presets.ini` uses the same escaping plus `\t`, and its reader lowercases keys.
6. **Edits act on the current preset.** `set_preset N` (0-based) selects, then `set_font`, `set_track`, `set_name`, `set_styleK`, `move_preset`, `duplicate_preset`, `delete_preset` act on it and save. `get_preset` returns the current index; `show_current_preset` prints its block.
7. **Older firmware lacks commands.** On this 7.8 build, `list_named_style`, `dir`, `help`, `get_variation` and the OS 8 `tag|command` framing all answer `Whut? :<command>`. The app must feature-detect from `version` and from `Whut?` replies rather than assume the OS 8 surface, and cannot rely on tag framing for its first target users.
8. **Useful read-only facts.** `id` prints the Blade ID resistance (`ID: 916.00`). `scanid` re-runs blade detection and prints `blade = N` plus `WS2811 Blade with N leds.` per pixel blade, which is enough for the wizard's "read from the saber" step to learn the blade count and pixel lengths even from old firmware. `list_fonts` and `list_tracks` list the SD card and end with an unmount notice.

9. **OS 8.10 from the release zip has no version number.** After the first Hiltwright install (2026-09-09, same V2.2), `version` answered `$Id: ce12a06a1e236b5101ec60c950530a9a4719a74d $` followed by the usual config/prop/buttons/installed lines: the sketch's `version[]` is a git keyword the release zip never expanded. `parseVersion` shows that as `git-ce12a06`, and Hiltwright's build stamps `v8.10 hiltwright <sha>` into its private copy of the sketch so its own boards report a readable version.
10. **Reflash sequence, verified.** `RebootDFU` over the open port drops the CDC device within a second and the bootloader (0483:df11) enumerates with WinUSB already bound from the earlier spike, so the 1200-baud touch was never needed. `dfu-util -U` read 256 KB in about 25 s; `-D` wrote 183 KB in about 40 s and left the board in `dfuMANIFEST`, after which the runtime re-enumerated on its own and Web Serial fired a `connect` event. That event races the install flow's own reconnect; `useBoard.connect` now refuses to open while a transport exists or a connect is in flight.

11. **OS 8.10 recorded (`packages/core/test/transcripts/os8`, same V2.2 after the Hiltwright install).** There is **no `tag|command` framing** in 8.10 at all (`sb1|version` → `Whut?`); that idea came from recon, not from the source, and the client's untagged, idle-terminated mode is the only mode. The style listing command is **`list_named_styles`** (plural): it prints the named looks (`standard`, `advanced`, `fire`, `unstable`, `strobe`, `cycle`, `rainbow`, `charging`) then `builtin <preset> <blade>` for every compiled preset and blade. `describe_named_style` is `DEBUG`-only, `help` does not exist, and `id` is gone (the reading now heads `scanid` as `BLADE ID: 916.00`). New runtime queries that work: `get_variation`, `get_on`, `get_track` (prints nothing when no track plays), `get_blade_dimming` (16384 = full), `get_max_blade_length N` / `get_blade_length N` (−1 until `set_blade_length` has been used), `get_clash_threshold` (3.50), plus `dir` with file sizes. `get_style`, `get_gesture`, `variation` and `list_current_tracks` (a Caiwyn-prop command) are rejected on this prop. The full command list of 8.10 is every `strcmp(cmd, "…")` in the tree; the ones worth exposing in Tier 1 are the get/set pairs for blade length, clash threshold, dimming and volume.

## What this means for the design

- The Presets page's "saved to saber" state can only turn green after a read-back matches. Silence is not success.
- The `presets.ini` snapshot that backs Undo can be built from `list_presets` alone, without mounting the card, using the codec in `packages/core/src/presetsIni.ts`.
- The OS 8 transcript is recorded (item 11). There is no tag framing to adopt; the client stays untagged. The Looks page can list compiled looks with `list_named_styles` on Hiltwright firmware and must fall back to the preset blocks on vendor firmware.
- Timing: first bytes arrived within 10–50 ms; `list_presets` for 13 presets took about 0.6 s at 115200 baud.

## Electron Web Serial, verified 2026-09-09

The walking skeleton (`apps/desktop`) reached the same V2.2 from Electron's built-in Web Serial, which retires the last transport unknown from [02](02-toolchain-usb-recon.md). What it took:

- **No click is needed.** With `session.setDevicePermissionHandler` returning true for the board, `navigator.serial.getPorts()` returns it at startup and `open()` works without any `requestPort()` gesture. `requestPort()` without a gesture throws `SecurityError`, and Electron can only fake a gesture through `webContents.executeJavaScript(code, true)`; the app keeps that as a fallback but does not need it.
- **The handler must recognise Windows's shape.** On Windows the handler receives `{ device_instance_id: "USB\VID_1209&PID_6668&MI_00\…", name: "Serial" }` with no `vendorId` / `productId`. A handler that only checks ids returns false, and because Electron consults the handler again at open time, the port then fails with `NetworkError: Failed to open serial port` even though the chooser granted it. Match on the instance id on Windows and on ids elsewhere.
- **`select-serial-port` reports ids as decimal strings** (`"4617"`, `"26216"`), not hex.
- **CSP needs `worker-src 'self' blob:`** in dev; Chromium's serial plumbing under Vite raised a blob SharedWorker that the default `default-src 'self'` policy blocked.
- **Timings from Electron:** `version` 3 ms, `battery` 9 ms, `get_volume` 19 ms, `get_preset` 8 ms, `list_presets` for 13 presets 1048 ms including the idle wait. DTR and RTS asserted via `port.setSignals`.

## Live preset edit from Electron, verified 2026-09-09

The Presets page changed preset 3's font on the same V2.2 through the app and put it back, driven by a dev-only hook (`HILTWRIGHT_E2E=1`) so no clicks were involved:

- `set_preset 2` → confirmed index 2, font `GeneralPrincess;common`.
- `set_font TeensySF;common` → confirmed by read-back after 1 attempt in 411 ms.
- restore → confirmed after 1 attempt in 406 ms. `list_presets` afterwards shows preset 3 back on `GeneralPrincess;common`.
- Read-backs were fast this time; the multi-second delay seen from PowerShell the day before was the first save creating `presets.ini`. The client still allows up to three read-backs with a 6 s ceiling each.
- One stale-buffer incident: the first command after opening the port answered in 4 ms with leftovers from a killed session, and a stale `installed:` line satisfied `version`. The transport now waits 250 ms after opening and discards what arrives, the same settle the PowerShell recorder used.
