#!/usr/bin/env node
// SaberBench pipeline spike.
// Vets the Phase 2 build pipeline headlessly: arduino-cli bootstrap, Proffieboard core + GCC install,
// ProffieOS checkout, compile of real configs with timing and size, error capture, dfu-util presence.
// Everything lives under spike/.cache (gitignored). Idempotent: rerun to skip finished phases.
//
// Usage: node spike/run-spike.mjs [phase...]
//   phases: bootstrap core proffieos compile errors dfu report   (default: all)

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(here, ".cache");
const DATA = join(CACHE, "arduino-data");        // ARDUINO_DIRECTORIES_DATA: cores, tools
const DOWNLOADS = join(CACHE, "arduino-downloads");
const USER = join(CACHE, "arduino-user");        // sketchbook (unused but required)
const CLI_DIR = join(CACHE, "arduino-cli");
const OS_DIR = join(CACHE, "ProffieOS");
const BUILD_ROOT = join(CACHE, "builds");
const RESULTS = join(here, "results.json");

const PROFFIE_INDEX = "https://profezzorn.github.io/arduino-proffieboard/package_proffieboard_index.json";
const PROFFIEOS_TAG = "v8.10";
const CLI_VERSION = "1.3.1";

const isWin = platform() === "win32";
const CLI = join(CLI_DIR, isWin ? "arduino-cli.exe" : "arduino-cli");

const env = {
  ...process.env,
  ARDUINO_DIRECTORIES_DATA: DATA,
  ARDUINO_DIRECTORIES_DOWNLOADS: DOWNLOADS,
  ARDUINO_DIRECTORIES_USER: USER,
  ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS: PROFFIE_INDEX,
};

const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : {};
const save = () => writeFileSync(RESULTS, JSON.stringify(results, null, 2) + "\n");
const log = (...a) => console.log("[spike]", ...a);

function run(cmd, args, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  const ms = Date.now() - t0;
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms };
}
function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.code !== 0) {
    console.error(r.stdout); console.error(r.stderr);
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.code}`);
  }
  return r;
}
function cli(...args) { return run(CLI, args); }
function cliMust(...args) { return must(CLI, args); }

function bootstrap() {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(CLI)) { log("arduino-cli present:", cli("version").stdout.trim()); return; }
  if (!isWin) throw new Error("spike bootstrap only implemented for Windows x64 in this run");
  const zipName = `arduino-cli_${CLI_VERSION}_Windows_64bit.zip`;
  const url = `https://github.com/arduino/arduino-cli/releases/download/v${CLI_VERSION}/${zipName}`;
  const zip = join(CACHE, zipName);
  if (!existsSync(zip)) {
    log("downloading", url);
    must("curl", ["-L", "--fail", "-o", zip, url]);
  }
  mkdirSync(CLI_DIR, { recursive: true });
  must("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${CLI_DIR}'`]);
  const v = cliMust("version").stdout.trim();
  log("arduino-cli installed:", v);
  results.arduinoCli = { version: v, zipBytes: statSync(zip).size };
  save();
}

function core() {
  const t0 = Date.now();
  cliMust("config", "init", "--overwrite", "--dest-dir", DATA);
  cliMust("core", "update-index");
  const list = cli("core", "list", "--format", "json").stdout;
  const installed = list.includes("proffieboard:stm32l4");
  if (installed) {
    log("core already installed");
  } else {
    log("installing proffieboard:stm32l4 (downloads core + xPack GCC + dfu-util, ~350 MB)");
    const r = cliMust("core", "install", "proffieboard:stm32l4");
    log(r.stdout.split("\n").filter(l => l.trim()).slice(-5).join("\n"));
  }
  const ms = Date.now() - t0;
  const details = cliMust("core", "list", "--format", "json").stdout;
  const boards = cliMust("board", "listall", "proffieboard", "--format", "json").stdout;
  results.core = {
    installMs: installed ? null : ms,
    coreList: JSON.parse(details),
    boards: JSON.parse(boards),
  };
  // Measure on-disk footprint of the toolchain.
  const du = (p) => { try { return Number(must("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -Recurse -Force -File '${p}' | Measure-Object -Property Length -Sum).Sum`]).stdout.trim()); } catch { return null; } };
  results.core.dataDirBytes = du(DATA);
  results.core.downloadsDirBytes = du(DOWNLOADS);
  save();
  log("toolchain on disk (MB):", Math.round(results.core.dataDirBytes / 1e6), "downloads (MB):", Math.round(results.core.downloadsDirBytes / 1e6));
}

function proffieos() {
  if (existsSync(join(OS_DIR, "ProffieOS.ino"))) { log("ProffieOS present"); }
  else {
    log("cloning ProffieOS", PROFFIEOS_TAG);
    must("git", ["clone", "--depth", "1", "--branch", PROFFIEOS_TAG, "https://github.com/profezzorn/ProffieOS.git", OS_DIR]);
  }
  const head = must("git", ["-C", OS_DIR, "rev-parse", "HEAD"]).stdout.trim();
  results.proffieos = { tag: PROFFIEOS_TAG, commit: head };
  save();
}

// Build a sketch copy that points CONFIG_FILE at the given config, then compile with the FQBN.
function compileOne(name, { configFile, fqbn, mutate, incremental }) {
  if (process.env.SPIKE_ONLY && !process.env.SPIKE_ONLY.split(",").includes(name)) return null;
  const sketchDir = join(BUILD_ROOT, name, "ProffieOS");
  const buildPath = join(BUILD_ROOT, name, "build");
  if (!incremental) rmSync(join(BUILD_ROOT, name), { recursive: true, force: true });
  mkdirSync(dirname(sketchDir), { recursive: true });
  // Copy the OS tree (no .git) so each build is isolated, exactly as the app would do.
  if (!incremental) cpSync(OS_DIR, sketchDir, { recursive: true, filter: (src) => !src.includes(`${OS_DIR}${isWin ? "\\" : "/"}.git`) });
  const ino = join(sketchDir, "ProffieOS.ino");
  let src = readFileSync(ino, "utf8");
  // Neutralise any active CONFIG_FILE and set ours. This is the exact edit the app must own.
  src = src.replace(/^\s*#define CONFIG_FILE\b.*$/mg, (m) => "// " + m.trim());
  src = src.replace(/(#ifndef CONFIG_FILE\s*\n)/, `#define CONFIG_FILE "config/${configFile}"\n$1`);
  if (!src.includes(`"config/${configFile}"`)) src = `#define CONFIG_FILE "config/${configFile}"\n` + src;
  writeFileSync(ino, src);
  if (mutate) mutate(sketchDir);

  log(`compile ${name}: ${configFile} @ ${fqbn}`);
  const r = cli("compile", "--fqbn", fqbn, "--build-path", buildPath, "--warnings", "none", "--format", "json", sketchDir);
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* non-json on hard failure */ }
  const stderr = (json?.compiler_err ?? "") + r.stderr;
  const stdout = json?.compiler_out ?? r.stdout;
  const sizes = json?.builder_result?.executable_sections_size ?? null;
  const binCandidates = ["ProffieOS.ino.bin", "ProffieOS.ino.dfu", "ProffieOS.ino.elf"];
  const artifacts = {};
  for (const f of binCandidates) { const p = join(buildPath, f); if (existsSync(p)) artifacts[f] = statSync(p).size; }
  const entry = {
    configFile, fqbn, ok: r.code === 0 && json?.success !== false, ms: r.ms,
    sizes, artifacts,
    errorExcerpt: r.code === 0 ? null : stderr.split("\n").filter(l => /error|Error|will not fit/.test(l)).slice(0, 12),
    compilerErrHead: r.code === 0 ? null : stderr.slice(0, 6000),
  };
  results.compiles ??= {};
  results.compiles[name] = entry;
  save();
  log(`  -> ${entry.ok ? "OK" : "FAIL"} in ${(r.ms / 1000).toFixed(1)}s`, sizes ? JSON.stringify(sizes) : "", JSON.stringify(artifacts));
  if (!entry.ok) log("  errors:", entry.errorExcerpt);
  return entry;
}

const V3 = (usb = "cdc_msc_webusb") => `proffieboard:stm32l4:ProffieboardV3-L452RE:usb=${usb},dosfs=sdmmc1,speed=80,opt=os`;
const V2 = (usb = "cdc_msc_webusb") => `proffieboard:stm32l4:ProffieboardV2-L433CC:usb=${usb},dosfs=sdspi,speed=80,opt=os`;

// Derive a realistic "SaberBench baseline" config from the stock OS6 example (Fett263 prop, edit mode,
// two blades: 136 px main + 6 px accent). Adds the golden-baseline defines the app will always emit.
const GOLDEN = "#define SAVE_STATE\n#define MOUNT_SD_SETTING\n";
function baseline(board) {
  return (dir) => {
    const src = readFileSync(join(dir, "config", "OS6_config_example.h"), "utf8");
    let out = src.replace('#include "proffieboard_v2_config.h"', `#include "proffieboard_${board}_config.h"`);
    out = out.replace("#define ENABLE_SD\n", "#define ENABLE_SD\n" + GOLDEN);
    writeFileSync(join(dir, "config", `saberbench_${board}_baseline.h`), out);
  };
}
const CONFIGS_DIR = join(here, "configs");
function fromConfigs(file, board) {
  return (dir) => {
    let src = readFileSync(join(CONFIGS_DIR, file), "utf8");
    if (board === "v2") src = src.replace('#include "proffieboard_v3_config.h"', '#include "proffieboard_v2_config.h"');
    writeFileSync(join(dir, "config", file), src);
  };
}
const OS8_V3 = { configFile: "saberbench_v3_os8.h", fqbn: V3(), mutate: fromConfigs("saberbench_v3_os8.h", "v3") };
const OS8_V2 = { configFile: "saberbench_v3_os8.h", fqbn: V2(), mutate: fromConfigs("saberbench_v3_os8.h", "v2") };
const BASE_V3 = { configFile: "saberbench_v3_baseline.h", fqbn: V3(), mutate: baseline("v3") };
const BASE_V2 = { configFile: "saberbench_v2_baseline.h", fqbn: V2(), mutate: baseline("v2") };

function compile() {
  mkdirSync(BUILD_ROOT, { recursive: true });
  compileOne("v3-baseline-cold", BASE_V3);                       // first build of this config
  compileOne("v3-baseline-warm", BASE_V3);                       // identical rebuild in a fresh build dir (core cache warm)
  compileOne("v3-baseline-cdc-only", { ...BASE_V3, fqbn: V3("cdc") });
  compileOne("v2-baseline", BASE_V2);                            // same saber on the 256 KB board
  compileOne("v2-os6-example", { configFile: "OS6_config_example.h", fqbn: V2() });
  compileOne("v3-verification-3blade", { configFile: "proffieboard_v3_verification_config.h", fqbn: V3() });
  // OS8-native baseline: Fett263 OS7/8 library styles (dual phase, corruption, special abilities).
  compileOne("v3-os8-cold", OS8_V3);
  compileOne("v3-os8-incremental", { ...OS8_V3 });
  compileOne("v3-os8-incremental", { ...OS8_V3, incremental: true, mutate: null });
  compileOne("v2-os8", OS8_V2);
  // Incremental: same sketch copy and same --build-path, config untouched, then config touched (one colour changed).
  compileOne("v3-baseline-incremental-nochange", { ...BASE_V3 });
  compileOne("v3-baseline-incremental-nochange", { ...BASE_V3, mutate: null, incremental: true });
  compileOne("v3-baseline-incremental-edited", { ...BASE_V3 });
  compileOne("v3-baseline-incremental-edited", { ...BASE_V3, incremental: true, mutate: (dir) => { const p = join(dir, "config", "saberbench_v3_baseline.h"); writeFileSync(p, readFileSync(p, "utf8").replace("Blue", "DodgerBlue")); } });
}

function errors() {
  // Representative user mistakes, to see what the compiler says and whether it is translatable.
  const mutateBase = (edit) => (dir) => {
    baseline("v3")(dir);
    const p = join(dir, "config", "saberbench_v3_baseline.h");
    const before = readFileSync(p, "utf8"); const after = edit(before);
    if (after === before) throw new Error("mutation did not apply");
    writeFileSync(p, after);
  };
  compileOne("err-board-mismatch", { configFile: "OS6_config_example.h", fqbn: V3() });
  compileOne("err-blade-count", { ...BASE_V3, mutate: mutateBase((s) => s.replace("#define NUM_BLADES 2", "#define NUM_BLADES 3")) });
  compileOne("err-style-typo", { ...BASE_V3, mutate: mutateBase((s) => s.replace("StylePtr<Layers<", "StylePtr<Layerz<")) });
  compileOne("err-missing-comma", { ...BASE_V3, mutate: mutateBase((s) => s.replace('"Fallen/tracks/JFO6.wav",', '"Fallen/tracks/JFO6.wav"')) });
  compileOne("err-prop-define-conflict", { ...BASE_V3, mutate: mutateBase((s) => s.replace("#define FETT263_EDIT_MODE_MENU", "#define FETT263_EDIT_MODE_MENU\n#define FETT263_EDIT_SETTINGS_MENU")) });
  compileOne("err-wrong-pin-name", { ...BASE_V3, mutate: mutateBase((s) => s.replace("blade2Pin", "blade7Pin")) });
}

function dfu() {
  // Locate dfu-util shipped inside the installed core and see what it can enumerate.
  const find = must("powershell", ["-NoProfile", "-Command", `Get-ChildItem -Recurse -Filter dfu-util.exe '${DATA}' | Select-Object -ExpandProperty FullName`]).stdout.trim().split(/\r?\n/).filter(Boolean);
  const dfuUtil = find[0] ?? null;
  const listing = dfuUtil ? run(dfuUtil, ["-l"]) : null;
  const usb = must("powershell", ["-NoProfile", "-Command",
    "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_1209&PID_6668|VID_0483&PID_DF11' } | Select-Object Status,Class,FriendlyName,InstanceId | ConvertTo-Json"]).stdout.trim();
  const uploadScript = must("powershell", ["-NoProfile", "-Command", `Get-ChildItem -Recurse -Filter stm32l4-upload.bat '${DATA}' | Select-Object -ExpandProperty FullName`]).stdout.trim();
  results.dfu = {
    dfuUtilPath: dfuUtil, dfuUtilVersion: dfuUtil ? run(dfuUtil, ["--version"]).stdout.split("\n")[0] : null,
    listOutput: listing ? (listing.stdout + listing.stderr).trim() : null,
    proffieDevicesPresent: usb ? JSON.parse(usb) : [],
    uploadScript,
  };
  save();
  log("dfu-util:", dfuUtil, "\n", results.dfu.listOutput);
}

function report() {
  const c = results.compiles ?? {};
  const rows = Object.entries(c).map(([k, v]) => {
    const text = v.sizes?.find?.(s => s.name === "text")?.size ?? v.sizes?.text ?? null;
    return `| ${k} | ${v.configFile} | ${v.fqbn.split(":")[2]} | ${v.ok ? "ok" : "FAIL"} | ${(v.ms / 1000).toFixed(1)} s | ${v.artifacts["ProffieOS.ino.dfu"] ?? ""} | ${text ?? ""} |`;
  });
  const md = [
    `| build | config | board | result | wall time | .dfu bytes | .text bytes |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
  ].join("\n");
  writeFileSync(join(here, "results.md"), md + "\n");
  console.log(md);
}

const phases = { bootstrap, core, proffieos, compile, errors, dfu, report };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(phases);
for (const p of wanted) {
  if (!phases[p]) throw new Error(`unknown phase ${p}`);
  log(`=== ${p} ===`);
  phases[p]();
}
