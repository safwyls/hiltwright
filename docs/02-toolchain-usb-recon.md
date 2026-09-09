# 02 · Toolchain, upload and USB recon: what "direct install" really requires

Date: 2026-09-07. Verified against the Arduino core, ProffieOS Makefile and docs; **(unverified)** marks assumptions.

## 1. Build toolchain

The Proffieboard Arduino core (`profezzorn/arduino-proffieboard`, platform v4.6 in the package index, archive v4.4 ≈ 22.7 MB) is a fork of the Arduino STM32L4 core. It depends on **xPack `arm-none-eabi-gcc` 14.2.1-1.1**:

| Host | Toolchain download |
|---|---|
| Windows x64 | 323 MB zip |
| macOS x64 / arm64 | 278 MB / 273 MB |
| Linux x64 / arm64 | 284 MB / 280 MB |

Source: https://profezzorn.github.io/arduino-proffieboard/package_proffieboard_index.json

Compiler flags: `-march=armv7e-m -mthumb -mfloat-abi=hard -mfpu=fpv4-sp-d16`, `-DSTM32L433xx` / `-DSTM32L452xx`.

### Headless compile is officially supported

ProffieOS's own `Makefile` drives `arduino-cli`:

```
PBV2_FQBN=proffieboard:stm32l4:ProffieboardV2-L433CC:usb=cdc,dosfs=sdspi,speed=80,opt=os
PBV3_FQBN=proffieboard:stm32l4:ProffieboardV3-L452RE:usb=cdc,dosfs=sdmmc1,speed=80,opt=os
arduino-cli compile --fqbn=$(FQBN) ProffieOS.ino
arduino-cli upload  --fqbn=$(FQBN) ProffieOS.ino
```

Source: https://raw.githubusercontent.com/profezzorn/ProffieOS/master/Makefile

Board menu tokens (V3), from `boards.txt`:

- `usb=` `cdc` | `cdc_msc` | `cdc_webusb` | `cdc_msc_webusb` | `cdc_hid` | `cdc_msc_hid` | `cdc_dap` | `cdc_msc_dap` | `none`
- `dosfs=` `sdspi` | `sdmmc` | `sdmmc1` (SDIO high speed, V3 default) | `none`
- `speed=` 80 … 1 MHz (`80` is standard)
- `opt=` `os` | `o1` | `o2` | `o3`

The Makefile only exercises `usb=cdc`; the installer recommendation is `cdc_msc_webusb`. The **entire build is reproducible from a container** — nothing requires the Arduino IDE GUI.

### Compile cost **(unverified numbers)**

A ProffieOS build is a single translation unit with heavy template instantiation. Community reports and Arduino's own guidance put a cold compile at "several minutes" on a laptop; incremental rebuilds are much faster because the core objects are cached. We must measure this ourselves on a reference machine and in a container before committing to a UX (see 05 open questions).

## 2. Upload path (how bytes get onto the board)

Exact mechanics, from `boards.txt` + `tools/*/stm32l4-upload`:

1. Running ProffieOS enumerates as VID `0x1209` PID `0x6668`, manufacturer `hubbe.net`, product `Proffieboard`, with a CDC serial interface (plus optional WebUSB / mass storage interfaces).
2. `upload.use_1200bps_touch=true`: the host opens the CDC port at 1200 baud and closes it. The firmware reboots into the **STM32 ROM DFU bootloader**, which enumerates as `0483:df11` "STM32 BOOTLOADER". Alternatives: serial command `RebootDFU`, or hold BOOT, tap RESET, release BOOT.
3. The upload script polls `dfu-util -l -d 0483:df11` up to 10 times, then runs:

```
dfu-util -d 1209:6668,0x0483:0xdf11 -a 0 -s 0x08000000:leave -D firmware.bin
```

`:leave` resets the board back into the freshly flashed firmware.

Sources: https://raw.githubusercontent.com/profezzorn/arduino-proffieboard/master/boards.txt , https://raw.githubusercontent.com/profezzorn/arduino-proffieboard/master/tools/windows/stm32l4-upload.bat

Consequences:

- The artefact that matters is a plain **.bin at 0x08000000**. Anything that can speak DFU (DfuSe) can install it: `dfu-util`, STM32CubeProgrammer, or **WebUSB DFU in a browser**.
- Fredrik already hosts a browser flasher: https://profezzorn.github.io/webdfu/dfu-util/ and the official "back up a Proffieboard" guide tells users to use it to *Read* and *Write* the whole flash. **Browser flashing of the Proffieboard is therefore an established, sanctioned path, not an experiment.**
- The backed-up .bin is opaque: *"there isn't a way to tell how the board was configured from the downloaded file."* We must store config identity ourselves (e.g. embed a config hash/JSON blob into the firmware, or keep it on SD).

Source: https://pod.hubbe.net/howto/how-to-back-up-a-proffieboard.html

## 3. Drivers per OS (the real friction)

| OS | Running ProffieOS (CDC serial) | WebUSB interface | STM32 BOOTLOADER (0483:df11) for flashing |
|---|---|---|---|
| Windows 10/11 | In-box `usbser`, no driver | *"ProffieOS has some code that allows Windows 8.1+ assign the right driver automatically to make WebUSB work"* (MS OS descriptors → WinUSB) | **WinUSB must be installed once** via `proffie-dfu-setup.exe` (Fredrik's libwdi-based installer, needs admin) or Zadig. Unavoidable for Arduino, dfu-util and WebUSB alike. |
| Windows 7 | Needs ACM driver installer | Needs Zadig | Needs Zadig |
| macOS | Works | Works | Works, *"No extra steps needed"* |
| Linux | Works (dialout group) | Works with udev rule | udev rules from the core's `drivers/linux` folder |

Sources: https://pod.hubbe.net/proffieboard-setup.html , https://pod.hubbe.net/tools/zadig.html , https://pod.hubbe.net/troubleshooting/webusb.html

**Hard truth for every path:** on Windows, the one-time bootloader driver install is a step no browser can perform, and a desktop app can only automate it by shipping/launching an elevated installer. Every runtime-only feature (presets, fonts, colours via serial/WebUSB) is driver-free on Windows 10+. This split is the strongest argument for a tiered product.

## 4. USB interfaces the board can expose

Selected at compile time by `usb=`:

- **CDC serial** — always (unless `none`). Works with Arduino Serial Monitor, any native serial lib, and **Web Serial** in Chromium browsers. **(Web Serial with ProffieOS specifically is unverified; it is a standard CDC ACM device so it should work, but the Workbench uses WebUSB, not Web Serial.)**
- **WebUSB** — the Workbench talks to a vendor interface ("CDC Data (interface 2)", `1209:6668` interface 2). Chrome/Edge/Opera desktop and **Chrome on Android**. Not Firefox, not Safari, not iOS.
- **Mass storage (MSC)** — the board acts as a *slow* SD card reader. OS8's `MOUNT_SD_SETTING` makes it opt-in via the `sd` serial command or a menu, to avoid corruption; it resets on reboot. While the host has the card mounted, ProffieOS cannot use it (Workbench docs say eject first).
- **HID / CMSIS-DAP** — irrelevant for us.

Installer recommendation: *"Serial + WebUSB + Mass Storage"* (`cdc_msc_webusb`). Costs flash versus `cdc` alone.

## 5. Browser capability matrix

| Capability | Chrome/Edge desktop | Chrome Android | Firefox | Safari / iOS |
|---|---|---|---|---|
| Web Serial (talk to running board) | Yes | No | No | No |
| WebUSB (Workbench-style vendor interface) | Yes | Yes | No | No |
| WebUSB DFU to STM32 BOOTLOADER | Yes (Windows needs WinUSB driver) | Yes **(unverified on Proffie; webdfu is Chromium-only per its README)** | No | No |
| File System Access API (write to a mounted SD / MSC drive) | Yes | No | No | No |
| Web Bluetooth (BLE modules) | Yes | Yes | No | Via WebBLE app |

Source: https://github.com/devanlai/webdfu README (*"WebUSB is currently only supported by Chromium / Google Chrome"*, *"On Windows … an appropriate WinUSB/libusb driver must first be installed"*)

## 6. Compiling in the browser? (ruled out)

There is no WebAssembly build of `arm-none-eabi-gcc` that can compile a ~250–500 KB template-heavy firmware in a tab in reasonable time or memory, and the Arduino core plus toolchain is ~350 MB. A web path therefore **must** compile server-side. A desktop path compiles locally with the real toolchain.

## 7. What is possible where (summary)

| Job | Native desktop | Browser (Chromium) | Browser (other) |
|---|---|---|---|
| Talk to running board (presets, fonts, colours, volume, diagnostics) | Yes | Yes (Web Serial / WebUSB) | No |
| Write fonts to SD | Yes (MSC drive or card reader) | Yes via File System Access on the MSC drive; or serial file push **(unverified: no documented bulk-upload command besides Workbench's font upload path)** | No |
| Compile firmware | Yes, local toolchain (~350 MB download) | No; needs a compile server | No |
| Flash firmware | Yes, dfu-util | Yes, WebUSB DFU | No |
| Install Windows bootloader driver | Yes, launch elevated installer | **No**, user must run `proffie-dfu-setup.exe` once | No |
| Work offline | Yes | Runtime editing yes; compile no | No |
| Auto-update | Needs updater + code signing/notarisation | Free | — |
