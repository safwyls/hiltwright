#!/usr/bin/env node
// SaberBench flash spike (Windows). Exercises the install half of the pipeline against a real Proffieboard.
//
//   node spike/flash.mjs detect                      # USB + driver + COM port state (read-only)
//   node spike/flash.mjs probe                       # talk to the running board over serial (read-only)
//   node spike/flash.mjs backup                      # reboot to bootloader, read full flash to spike/backups/ (read-only for the board)
//   node spike/flash.mjs flash <path.dfu>            # backup, then write <path.dfu>, then verify over serial   [needs SPIKE_CONFIRM_FLASH=1]
//   node spike/flash.mjs restore <backup.bin>        # write a backup image back                               [needs SPIKE_CONFIRM_FLASH=1]
//
// Env: SPIKE_PORT=COM7 to force the serial port; SPIKE_BOARD=v3|v2 to select flash size for backup (default v3).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(here, ".cache");
const DATA = join(CACHE, "arduino-data");
const BACKUPS = join(here, "backups");
const LOG = join(here, "flash-log.json");
const RUNTIME_VIDPID = "1209:6668";
const DFU_VIDPID = "0483:df11";
const FLASH_SIZE = { v3: 0x80000, v2: 0x40000 };
const board = (process.env.SPIKE_BOARD || "v3").toLowerCase();

const log = (...a) => console.log("[flash]", ...a);
const events = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
const record = (e) => { events.push({ t: new Date().toISOString(), ...e }); writeFileSync(LOG, JSON.stringify(events, null, 2) + "\n"); };

function ps(script, opts = {}) {
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function psJson(script) { const r = ps(script + " | ConvertTo-Json -Depth 4"); if (!r.out) return []; const j = JSON.parse(r.out); return Array.isArray(j) ? j : [j]; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findDfuUtil() {
  const r = ps(`Get-ChildItem -Recurse -Filter dfu-util.exe '${DATA}' | Select-Object -First 1 -ExpandProperty FullName`);
  if (!r.out) throw new Error("dfu-util.exe not found under " + DATA + " (run the compile spike first)");
  return r.out;
}
function dfu(args) {
  const exe = findDfuUtil();
  const r = spawnSync(exe, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// ---------- detection ----------
function usbDevices() {
  return psJson(`Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_1209&PID_6668|VID_0483&PID_DF11' } | Select-Object Status, Class, Service, FriendlyName, InstanceId, Problem`);
}
function comPorts() {
  // Map COM ports to their PnP instance so we can pick the Proffieboard's CDC port.
  return psJson(`Get-PnpDevice -PresentOnly -Class Ports | Select-Object Status, FriendlyName, InstanceId`);
}
function proffiePort() {
  if (process.env.SPIKE_PORT) return process.env.SPIKE_PORT;
  const ports = comPorts().filter(p => /VID_1209&PID_6668/i.test(p.InstanceId));
  const m = ports.map(p => (p.FriendlyName.match(/\((COM\d+)\)/) || [])[1]).filter(Boolean);
  return m[0] || null;
}
function detect() {
  const usb = usbDevices();
  const ports = comPorts();
  const port = proffiePort();
  const dfuList = dfu(["-l"]).out;
  const state = {
    runtimePresent: usb.some(d => /VID_1209&PID_6668/i.test(d.InstanceId)),
    bootloaderPresent: usb.some(d => /VID_0483&PID_DF11/i.test(d.InstanceId)),
    bootloaderDriver: usb.filter(d => /VID_0483&PID_DF11/i.test(d.InstanceId)).map(d => ({ status: d.Status, service: d.Service, problem: d.Problem })),
    port,
  };
  console.log(JSON.stringify({ usb, ports: ports.filter(p => /1209|0483/i.test(p.InstanceId)), dfuList, state }, null, 2));
  record({ phase: "detect", state, usb });
  if (state.bootloaderPresent) {
    const drv = state.bootloaderDriver[0] || {};
    if (/winusb/i.test(drv.service || "")) log("STM32 BOOTLOADER is bound to WinUSB: dfu-util can talk to it.");
    else log(`STM32 BOOTLOADER present but driver service is '${drv.service || "none"}' (status ${drv.status}). dfu-util will NOT see it until WinUSB is installed (proffie-dfu-setup.exe or Zadig).`);
  }
  return state;
}

// ---------- serial ----------
function serialCommand(port, command, waitMs = 1500, baud = 115200) {
  // PowerShell SerialPort: send one line, collect output for waitMs. DTR is asserted so ProffieOS treats us as a console.
  const script = `
$p = New-Object System.IO.Ports.SerialPort '${port}',${baud},'None',8,'One'
$p.ReadTimeout = 200; $p.NewLine = "\`n"; $p.DtrEnable = $true; $p.RtsEnable = $true
$p.Open(); Start-Sleep -Milliseconds 200; $p.DiscardInBuffer()
$p.Write("${command.replace(/"/g, '`"')}\`n")
$sb = New-Object System.Text.StringBuilder; $deadline = (Get-Date).AddMilliseconds(${waitMs})
while ((Get-Date) -lt $deadline) { try { $null = $sb.Append($p.ReadExisting()) } catch {} ; Start-Sleep -Milliseconds 50 }
$p.Close(); $sb.ToString()`;
  return ps(script);
}
function probe() {
  const port = proffiePort();
  if (!port) throw new Error("No Proffieboard CDC port found. Is the saber on and connected with a data cable?");
  log("port", port);
  const out = {};
  for (const [cmd, wait] of [["version", 1500], ["battery", 1200], ["list_presets", 2500], ["list_named_style", 2500], ["id", 1200]]) {
    const r = serialCommand(port, cmd, wait);
    out[cmd] = r.out || r.err;
    console.log(`--- ${cmd}\n${out[cmd]}`);
  }
  record({ phase: "probe", port, out });
  return { port, out };
}

// ---------- bootloader entry ----------
async function enterBootloader() {
  if (detect().bootloaderPresent) { log("already in bootloader"); return; }
  const port = proffiePort();
  if (!port) throw new Error("No runtime port and no bootloader: hold BOOT, tap RESET, release BOOT, then rerun.");
  // Method 1: what the Arduino IDE does (use_1200bps_touch=true): open at 1200 baud, drop DTR, close.
  log(`1200-baud touch on ${port}`);
  const r = ps(`$p = New-Object System.IO.Ports.SerialPort '${port}',1200; $p.DtrEnable = $true; $p.Open(); Start-Sleep -Milliseconds 100; $p.DtrEnable = $false; $p.Close(); 'touched'`);
  log(r.out || r.err);
  for (let i = 0; i < 20; i++) { await sleep(500); if (usbDevices().some(d => /VID_0483&PID_DF11/i.test(d.InstanceId))) { log("bootloader enumerated after 1200-baud touch"); record({ phase: "enterBootloader", method: "1200bps", ok: true }); return; } }
  // Method 2: ProffieOS serial command.
  log("1200-baud touch did not work, trying RebootDFU over serial");
  const p2 = proffiePort();
  if (p2) serialCommand(p2, "RebootDFU", 300);
  for (let i = 0; i < 20; i++) { await sleep(500); if (usbDevices().some(d => /VID_0483&PID_DF11/i.test(d.InstanceId))) { log("bootloader enumerated after RebootDFU"); record({ phase: "enterBootloader", method: "RebootDFU", ok: true }); return; } }
  record({ phase: "enterBootloader", ok: false });
  throw new Error("Board did not enter bootloader. Manual: hold BOOT, tap RESET, release BOOT.");
}
async function waitForRuntime(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { await sleep(500); if (proffiePort()) return proffiePort(); }
  return null;
}
function requireDfuVisible() {
  // Two checks: Windows must have bound WinUSB to STM32 BOOTLOADER (libusb can *list* an unbound device but cannot
  // open it, which is what "Cannot open DFU device" means), and dfu-util must report the DfuSe memory layout,
  // which also tells us the flash size and therefore the board generation.
  const drv = usbDevices().filter(d => /VID_0483&PID_DF11/i.test(d.InstanceId))[0];
  if (!drv) throw new Error("STM32 BOOTLOADER is not enumerated.");
  if (!/winusb/i.test(drv.Service || "")) {
    throw new Error(`STM32 BOOTLOADER is present but Windows bound driver service '${drv.Service || "none"}' (status ${drv.Status}, problem code ${drv.Problem}). dfu-util needs WinUSB. Install it once with proffie-dfu-setup.exe (https://fredrik.hubbe.net/lightsaber/proffie-dfu-setup.exe) or Zadig (device 'STM32 BOOTLOADER' 0483 df11 -> WinUSB), then rerun.`);
  }
  const l = dfu(["-l"]).out;
  const layout = (l.match(/@Internal Flash\s*\/0x08000000\/([^"]+)/i) || [])[1];
  if (!layout) throw new Error("dfu-util does not report the DfuSe flash layout:\n" + l);
  // e.g. "128*02Kg" = 256 KB (STM32L433, V1/V2) or "256*02Kg" = 512 KB (STM32L452, V3)
  const bytes = layout.split(",").reduce((sum, seg) => {
    const m = seg.match(/(\d+)\*(\d+)([KM])/i);
    return m ? sum + Number(m[1]) * Number(m[2]) * (m[3].toUpperCase() === "M" ? 1048576 : 1024) : sum;
  }, 0);
  log(`bootloader on WinUSB; flash layout ${layout} = ${bytes} bytes`);
  record({ phase: "dfuVisible", layout, flashBytes: bytes });
  return { listing: l, flashBytes: bytes };
}

// ---------- backup / flash / restore ----------
async function backup() {
  await enterBootloader();
  const { flashBytes } = requireDfuVisible();
  mkdirSync(BACKUPS, { recursive: true });
  const size = flashBytes || FLASH_SIZE[board];
  const file = join(BACKUPS, `proffie-${board}-${new Date().toISOString().replace(/[:.]/g, "-")}.bin`);
  log(`reading ${size} bytes of flash to ${file}`);
  const t0 = Date.now();
  const r = dfu(["-d", DFU_VIDPID, "-a", "0", "-s", `0x08000000:${size}`, "-U", file]);
  const ms = Date.now() - t0;
  console.log(r.out.split("\n").slice(-8).join("\n"));
  if (r.code !== 0 || !existsSync(file)) { record({ phase: "backup", ok: false, out: r.out.slice(-2000) }); throw new Error("backup failed"); }
  log(`backup ok: ${statSync(file).size} bytes in ${(ms / 1000).toFixed(1)} s`);
  record({ phase: "backup", ok: true, file, bytes: statSync(file).size, ms });
  return file;
}
async function writeImage(file, label) {
  if (process.env.SPIKE_CONFIRM_FLASH !== "1") throw new Error(`Refusing to write the board. Set SPIKE_CONFIRM_FLASH=1 to confirm flashing ${file}`);
  if (!existsSync(file)) throw new Error("no such file " + file);
  await enterBootloader();
  requireDfuVisible();
  log(`writing ${label} ${file} (${statSync(file).size} bytes)`);
  const t0 = Date.now();
  const r = dfu(["-d", `${RUNTIME_VIDPID},${DFU_VIDPID}`, "-a", "0", "-s", "0x08000000:leave", "-D", file]);
  const ms = Date.now() - t0;
  console.log(r.out.split("\n").slice(-10).join("\n"));
  const ok = r.code === 0 && /File downloaded successfully|Download done/i.test(r.out);
  record({ phase: "write", label, file, ok, ms, out: r.out.slice(-2000) });
  if (!ok) throw new Error("dfu-util write failed");
  log(`write ok in ${(ms / 1000).toFixed(1)} s, waiting for the board to come back`);
  const port = await waitForRuntime();
  if (!port) { record({ phase: "verify", ok: false }); throw new Error("board did not re-enumerate as a serial port after flashing"); }
  await sleep(1500);
  const v = serialCommand(port, "version", 1500);
  console.log("--- version after flash\n" + (v.out || v.err));
  record({ phase: "verify", ok: true, port, version: v.out });
  return v.out;
}
async function flash(dfuFile) {
  if (!dfuFile) throw new Error("usage: flash <path.dfu>");
  const before = proffiePort() ? probe() : { out: { version: "(board already in bootloader, probe skipped)" } };
  const bak = await backup();
  const version = await writeImage(resolve(dfuFile), "firmware");
  log(`done. backup at ${bak}. To roll back: SPIKE_CONFIRM_FLASH=1 node spike/flash.mjs restore "${bak}"`);
  return { before: before.out.version, after: version, backup: bak };
}
async function restore(bin) {
  if (!bin) throw new Error("usage: restore <backup.bin>");
  // A raw .bin has no DFU suffix; dfu-util warns but writes it. Trim a trailing all-0xFF region to save time.
  const buf = readFileSync(bin);
  let end = buf.length; while (end > 0 && buf[end - 1] === 0xff) end--;
  const trimmed = join(BACKUPS, "restore-trimmed.bin"); writeFileSync(trimmed, buf.subarray(0, Math.max(end, 1024)));
  log(`restoring ${end} used bytes of ${buf.length}`);
  return writeImage(trimmed, "restore");
}

const [phase, arg] = process.argv.slice(2);
const phases = { detect, probe, backup, flash: () => flash(arg), restore: () => restore(arg) };
if (!phases[phase]) { console.error("phases: detect | probe | backup | flash <file.dfu> | restore <backup.bin>"); process.exit(2); }
try { await phases[phase](); } catch (e) { console.error("[flash] FAILED:", e.message); record({ phase, error: e.message }); process.exit(1); }
