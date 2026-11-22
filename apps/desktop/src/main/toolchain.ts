// Toolchain manager: arduino-cli, the Proffieboard core (which brings GCC and dfu-util) and a pinned ProffieOS tree.
// Everything lives under one directory. HILTWRIGHT_TOOLCHAIN_DIR points at an existing one (the spike cache works).
// Electron-free so it can be exercised from tests.
//
// Every part is pinned (toolchain-integrity): arduino-cli and the ProffieOS source by SHA-256, checked before they are
// unpacked; the board support by version. What is installed is read back, not assumed, and a toolchain that differs
// from the pins is not ready. The machine-wide folder is created only when the owner starts the setup, and locked so
// that only administrators and the owner can change what the compiler and flasher run.

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { MAX_ROOT_LENGTH, toolchainBlockers } from '../shared/toolchainChecks';

export const PROFFIE_INDEX = 'https://profezzorn.github.io/arduino-proffieboard/package_proffieboard_index.json';
export const PROFFIEOS_TAG = 'v8.10';
export const CLI_VERSION = '1.3.1';
/** The board support Hiltwright is checked with: the version on the owner's working install (2026-09-26). */
export const CORE_VERSION = '4.6';
/**
 * SHA-256 of each pinned download. arduino-cli's matches its published `1.3.1-checksums.txt`; ProffieOS's is the tag
 * archive as GitHub serves it (the owner's working install and a fresh download, 2026-09-26, 4,760,062 bytes).
 * The macOS assets are pinned from the same checksums file (and a download on 2026-11-19); Linux is not pinned yet.
 */
export const CLI_SHA256: Record<string, string> = {
  [`arduino-cli_${CLI_VERSION}_Windows_64bit.zip`]: 'cfece6f356fdc9ca003cc3f0a488470030719c8e0e7bfce5e42ac9410d87441f',
  [`arduino-cli_${CLI_VERSION}_macOS_ARM64.tar.gz`]: '723f8ddaf4875e87a20380c88c15ff9d55916c3c80cb432f1f980ea32cec2341',
  [`arduino-cli_${CLI_VERSION}_macOS_64bit.tar.gz`]: 'a0ca73f7e599d33a532fb2b1f8af9260541d990a684988bf8208abb42be83ced',
};
export const PROFFIEOS_SHA256 = '454f2374960ab517b087cb63b438688bc4b5f4b4f2458335afca398d34938dae';
/** Written into the ProffieOS folder after a verified unpack: what the tree is, so its version is read, not assumed. */
export const SOURCE_STAMP = '.hiltwright-source.json';

export interface ToolchainPaths {
  root: string;
  cli: string;
  data: string;
  downloads: string;
  user: string;
  osDir: string;
}

export interface ToolchainStatus {
  root: string;
  cli: boolean;
  cliVersion: string | null;
  core: boolean;
  gcc: boolean;
  dfuUtil: string | null;
  proffieOS: boolean;
  proffieOSVersion: string | null;
  /** What is installed, read back: arduino-cli's own version, the board support's version folders, the source stamp. */
  versions: { cli: string | null; core: string | null; proffieOS: string | null };
  /** Every part present at its pinned version, and the folder not too long. */
  ready: boolean;
  /** Free space on the volume holding the root, when known. */
  freeBytes: number | null;
  /** Windows: the root is so deep that GCC's own tools would exceed the 260-character path limit. */
  pathTooLong: boolean;
  /** Windows: standard users other than the owner can change the folder. Null when it does not exist or is unknown. */
  open: boolean | null;
}

export { MAX_ROOT_LENGTH, INSTALL_DISK_BYTES, INSTALL_DISK_MARGIN } from '../shared/toolchainChecks';

/** Downloads and on-disk footprint of a full install, for the consent screen and the space check. */
export const INSTALL_DOWNLOAD_BYTES = 360 * 1024 * 1024;

export type Progress = (line: string) => void;

const isWin = process.platform === 'win32';

/**
 * Where the toolchain may live. On Windows, %ProgramData%\Hiltwright (25 characters) first: per-user folders are too
 * deep once the user name is added. Only candidates short enough for the compiler are offered.
 */
function candidateRoots(userData: string): string[] {
  if (!isWin) return [join(userData, 'toolchain')];
  return [
    process.env.ProgramData ? join(process.env.ProgramData, 'Hiltwright') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Hiltwright', 'tc') : null,
    process.env.SystemDrive ? `${process.env.SystemDrive}\\Hiltwright` : null,
  ].filter((c): c is string => !!c && c.length <= MAX_ROOT_LENGTH);
}

/**
 * The folder the toolchain is in, or will go into, chosen without creating anything: the first candidate that
 * already holds a toolchain, else the first whose parent exists. The folder is created by `ensureToolchainRoot`, when
 * the owner starts the setup.
 */
export function plannedToolchainRoot(userData: string): string {
  const all = candidateRoots(userData);
  const installed = all.find((c) => existsSync(join(c, 'arduino-cli')) || existsSync(join(c, 'ProffieOS')));
  return installed ?? all.find((c) => existsSync(dirname(c))) ?? all[0] ?? join(userData, 'toolchain');
}

/**
 * Create the toolchain folder when the setup starts: the planned one, or the next candidate that can be created. A
 * folder created here is locked at once (lockFolder); an existing one is left as it is and flagged if open.
 */
export async function ensureToolchainRoot(planned: string, userData: string, onLine: Progress): Promise<string> {
  const order = [planned, ...candidateRoots(userData).filter((c) => c !== planned)];
  for (const c of order) {
    if (await exists(c)) return c;
    try {
      await mkdir(c, { recursive: true });
      onLine(`created ${c}`);
      if (isWin) {
        const r = await lockFolder(c, false);
        onLine(r.ok ? 'locked the toolchain folder: only administrators and this account can change it' : `could not lock the toolchain folder: ${r.text}`);
      }
      return c;
    } catch (err) { onLine(`cannot use ${c}: ${String(err)}`); }
  }
  throw new Error('Hiltwright could not create a toolchain folder: none of the places it can use could be written.');
}

export function toolchainPaths(root: string): ToolchainPaths {
  return {
    root,
    cli: join(root, 'arduino-cli', isWin ? 'arduino-cli.exe' : 'arduino-cli'),
    data: join(root, 'arduino-data'),
    downloads: join(root, 'arduino-downloads'),
    user: join(root, 'arduino-user'),
    osDir: join(root, 'ProffieOS'),
  };
}

/**
 * Where builds go: a short folder of the Windows user's own, never shared, so files another user or an elevated run
 * wrote can never block a build (HW-2026-09-25a). One folder per saber below it.
 */
export function userBuildRoot(): string {
  // Dev aid: HILTWRIGHT_BUILD_ROOT puts builds elsewhere (packaged builds remove every HILTWRIGHT_ switch).
  if (process.env.HILTWRIGHT_BUILD_ROOT) return process.env.HILTWRIGHT_BUILD_ROOT;
  if (isWin && process.env.LOCALAPPDATA) {
    const own = join(process.env.LOCALAPPDATA, 'Hiltwright', 'b');
    if (own.length <= BUILD_ROOT_MAX) return own;
    // A very long user folder: a short one of this user's own on the system drive instead, locked to them (ensureBuildRoot).
    const tag = createHash('sha256').update(process.env.USERNAME ?? 'user').digest('hex').slice(0, 8);
    return join(`${process.env.SystemDrive ?? 'C:'}\\`, 'HiltwrightB', tag);
  }
  return join(process.env.HOME ?? process.cwd(), '.hiltwright', 'b');
}

/**
 * The deepest path a build writes below its saber folder was 58 characters (toolchain-integrity 3.1, a fresh V2
 * build): `build\sketch\config\proffieboard_v2_verification_config2.h`. With the saber id (13) and a wide margin, a build
 * root up to 150 characters keeps every build path well inside Windows' 259.
 */
const BUILD_ROOT_MAX = 150;

/** Create the build root if needed; the system-drive fallback is locked to this user, as the toolchain folder is. */
export async function ensureBuildRoot(root: string): Promise<void> {
  if (await exists(root)) return;
  await mkdir(root, { recursive: true });
  if (isWin && !root.startsWith(process.env.LOCALAPPDATA ?? '//no-local-app-data')) await lockFolder(root, false);
}

export function cliEnv(p: ToolchainPaths): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARDUINO_DIRECTORIES_DATA: p.data,
    ARDUINO_DIRECTORIES_DOWNLOADS: p.downloads,
    ARDUINO_DIRECTORIES_USER: p.user,
    ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS: PROFFIE_INDEX,
  };
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

const CANCELLED = 'The setup was cancelled.';

/** Run a command, streaming lines to `onLine`. Resolves with the exit code and captured output. `signal` stops it. */
export function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; onLine?: Progress; timeoutMs?: number; quietStdout?: boolean; signal?: AbortSignal } = {}): Promise<{ code: number; stdout: string; stderr: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const feed = (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString('utf8');
      if (isErr) stderr += text; else stdout += text;
      if (opts.onLine && (isErr || !opts.quietStdout)) for (const l of text.split(/\r?\n/)) if (l.trim()) opts.onLine(l);
    };
    child.stdout.on('data', (c: Buffer) => feed(c, false));
    child.stderr.on('data', (c: Buffer) => feed(c, true));
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : null;
    const stop = () => { stderr += `\n${CANCELLED}`; child.kill(); };
    opts.signal?.addEventListener('abort', stop, { once: true });
    const done = () => { if (timer) clearTimeout(timer); opts.signal?.removeEventListener('abort', stop); };
    child.on('close', (code) => { done(); resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - t0 }); });
    child.on('error', (err) => { done(); resolve({ code: -1, stdout, stderr: stderr + String(err), ms: Date.now() - t0 }); });
  });
}

/** The board support's installed version folders, newest listed last. */
async function coreVersions(p: ToolchainPaths): Promise<string[]> {
  try { return (await readdir(join(p.data, 'packages', 'proffieboard', 'hardware', 'stm32l4'))).sort(); } catch { return []; }
}

/** dfu-util from the pinned board support only. */
export async function findDfuUtil(p: ToolchainPaths): Promise<string | null> {
  const cand = join(p.data, 'packages', 'proffieboard', 'hardware', 'stm32l4', CORE_VERSION, 'tools', isWin ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux', isWin ? 'dfu-util.exe' : 'dfu-util');
  return (await exists(cand)) ? cand : null;
}

async function readStamp(osDir: string): Promise<{ tag: string; sha256: string } | null> {
  try {
    const s = JSON.parse(await readFile(join(osDir, SOURCE_STAMP), 'utf8')) as { tag?: unknown; sha256?: unknown };
    return typeof s.tag === 'string' && typeof s.sha256 === 'string' ? { tag: s.tag, sha256: s.sha256 } : null;
  } catch { return null; }
}

export async function toolchainStatus(root: string): Promise<ToolchainStatus> {
  const p = toolchainPaths(root);
  const cliPresent = await exists(p.cli);
  let cliVersion: string | null = null;
  if (cliPresent) {
    const r = await run(p.cli, ['version'], { env: cliEnv(p), timeoutMs: 10000 });
    cliVersion = /Version:\s*(\S+)/.exec(r.stdout)?.[1] ?? /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null;
  }
  const cores = await coreVersions(p);
  const core = cores.includes(CORE_VERSION);
  const gcc = await exists(join(p.data, 'packages', 'proffieboard', 'tools', 'arm-none-eabi-gcc'));
  const dfuUtil = await findDfuUtil(p);
  const ino = await exists(join(p.osDir, 'ProffieOS.ino'));
  const stamp = ino ? await readStamp(p.osDir) : null;
  const proffieOS = !!stamp && stamp.tag === PROFFIEOS_TAG && stamp.sha256 === PROFFIEOS_SHA256;
  let freeBytes: number | null = null;
  try { const probe = (await exists(root)) ? root : dirname(root); const f = await statfs(probe); freeBytes = Number(f.bavail) * Number(f.bsize); } catch { /* unknown */ }
  const pathTooLong = isWin && root.length > MAX_ROOT_LENGTH;
  const cli = cliPresent && cliVersion === CLI_VERSION;
  const open = isWin && (await exists(root)) ? await folderOpenToOthers(root) : null;
  return {
    root, cli, cliVersion, core, gcc, dfuUtil, proffieOS, proffieOSVersion: proffieOS ? stamp!.tag : null,
    versions: { cli: cliVersion, core: cores.length ? cores.join(', ') : null, proffieOS: stamp ? stamp.tag : ino ? 'unknown (not from a checked download)' : null },
    ready: cli && core && gcc && !!dfuUtil && proffieOS && !pathTooLong, freeBytes, pathTooLong, open,
  };
}

/**
 * Download to `dest` through `<dest>.part`, renamed only when complete. Stops when `signal` aborts (cancel) or when
 * nothing arrives for `stallMs` (a stalled connection); either way nothing is left under the real name.
 */
export async function download(url: string, dest: string, onLine: Progress, opts: { signal?: AbortSignal; stallMs?: number } = {}): Promise<void> {
  onLine(`downloading ${url}`);
  const stallMs = opts.stallMs ?? 60000;
  const ctrl = new AbortController();
  let why: string | null = null;
  const stop = (reason: string) => { if (!why) { why = reason; ctrl.abort(); } };
  const onCancel = () => stop(CANCELLED);
  if (opts.signal?.aborted) throw new Error(CANCELLED);
  opts.signal?.addEventListener('abort', onCancel, { once: true });
  let stall = setTimeout(() => stop(`The download stalled: nothing arrived for ${Math.round(stallMs / 1000)} seconds. ${url}`), stallMs);
  const alive = () => { clearTimeout(stall); stall = setTimeout(() => stop(`The download stalled: nothing arrived for ${Math.round(stallMs / 1000)} seconds. ${url}`), stallMs); };
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${url}`);
    await mkdir(dirname(dest), { recursive: true });
    // Report progress every 5% when the size is known, so a long download is visibly alive.
    const total = Number(res.headers.get('content-length') ?? 0);
    let got = 0;
    let nextPct = 5;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        alive();
        got += chunk.length;
        if (total && (got / total) * 100 >= nextPct) { onLine(`  ${nextPct}% of ${(total / 1048576).toFixed(0)} MB`); nextPct += 5; }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(tmp), { signal: ctrl.signal });
    await rename(tmp, dest);
    onLine(`saved ${dest} (${(await stat(dest)).size} bytes)`);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw why ? new Error(why) : err;
  } finally {
    clearTimeout(stall);
    opts.signal?.removeEventListener('abort', onCancel);
  }
}

async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/** Download, then check the file is exactly the pinned one before anything uses it. A mismatch is deleted. */
export async function verifiedDownload(sys: Pick<ToolchainSys, 'download'>, url: string, dest: string, sha256: string | null, label: string, onLine: Progress, signal?: AbortSignal): Promise<void> {
  await sys.download(url, dest, onLine, { signal });
  if (!sha256) { onLine(`${label} is not pinned on this platform; not checked`); return; }
  const got = await sha256File(dest);
  onLine(`${label} sha256 ${got}`);
  if (got !== sha256) {
    await rm(dest, { force: true });
    throw new Error(`The ${label} download is not the file Hiltwright expects, so it was not used.`);
  }
}

async function extractZip(zip: string, into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  if (isWin) {
    await new Promise<void>((resolve, reject) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${into.replace(/'/g, "''")}' -Force`], { windowsHide: true }, (err) => (err ? reject(err) : resolve())));
  } else {
    const r = await run('unzip', ['-o', '-q', zip, '-d', into]);
    if (r.code !== 0) throw new Error(`unzip failed: ${r.stderr}`);
  }
}

/** The system calls the setup makes, so a test can stand in for them. The default is the real thing. */
export interface ToolchainSys {
  run: typeof run;
  download: typeof download;
  extract: (zip: string, into: string) => Promise<void>;
  status: (root: string) => Promise<ToolchainStatus>;
  /** The files the downloads must be: the pinned hashes unless a test says otherwise. */
  expected?: { cli: Record<string, string>; proffieOS: string };
}
const realToolchainSys: ToolchainSys = { run, download, extract: (zip, into) => extractZip(zip, into), status: (root) => toolchainStatus(root) };

/**
 * Install everything that is missing or not at its pinned version. Idempotent. Roughly 360 MB of downloads, 1.9 GB on
 * disk. `signal` cancels it between and during steps; what is already installed is kept for the next attempt.
 */
export async function installToolchain(root: string, onLine: Progress, sys: ToolchainSys = realToolchainSys, signal?: AbortSignal): Promise<ToolchainStatus> {
  const { run } = sys;
  const extractZip = sys.extract;
  const toolchainStatus = sys.status;
  const check = () => { if (signal?.aborted) throw new Error(CANCELLED); };
  const pins = sys.expected ?? { cli: CLI_SHA256, proffieOS: PROFFIEOS_SHA256 };
  const p = toolchainPaths(root);
  await mkdir(root, { recursive: true });
  let status = await toolchainStatus(root);
  const blocked = toolchainBlockers(status);
  if (blocked.pathTooLong) throw new Error(blocked.pathTooLong.error);
  if (blocked.lowSpace) throw new Error(blocked.lowSpace.error);

  if (!status.cli) {
    check();
    const asset = isWin ? `arduino-cli_${CLI_VERSION}_Windows_64bit.zip`
      : process.platform === 'darwin' ? `arduino-cli_${CLI_VERSION}_macOS_${process.arch === 'arm64' ? 'ARM64' : '64bit'}.tar.gz`
      : `arduino-cli_${CLI_VERSION}_Linux_${process.arch === 'arm64' ? 'ARM64' : '64bit'}.tar.gz`;
    const url = `https://github.com/arduino/arduino-cli/releases/download/v${CLI_VERSION}/${asset}`;
    const archive = join(root, asset);
    await verifiedDownload(sys, url, archive, pins.cli[asset] ?? null, 'arduino-cli', onLine, signal);
    check();
    onLine('extracting arduino-cli');
    const dir = join(root, 'arduino-cli');
    if (asset.endsWith('.zip')) await extractZip(archive, dir);
    else { await mkdir(dir, { recursive: true }); const r = await run('tar', ['-xzf', archive, '-C', dir], { signal }); if (r.code !== 0) throw new Error(r.stderr); }
  }

  status = await toolchainStatus(root);
  if (!status.core || !status.gcc || !status.dfuUtil) {
    check();
    onLine('updating the board index');
    let r = await run(p.cli, ['core', 'update-index'], { env: cliEnv(p), onLine, timeoutMs: 300000, signal });
    check();
    if (r.code !== 0) throw new Error(`core update-index failed: ${r.stderr || r.stdout}`);
    onLine(`installing the Proffieboard core ${CORE_VERSION}, GCC and dfu-util (about 360 MB)`);
    r = await run(p.cli, ['core', 'install', `proffieboard:stm32l4@${CORE_VERSION}`], { env: cliEnv(p), onLine, timeoutMs: 1800000, signal });
    check();
    if (r.code !== 0) throw new Error(`core install failed: ${r.stderr || r.stdout}`);
  }

  status = await toolchainStatus(root);
  if (!status.proffieOS) {
    check();
    const url = `https://github.com/profezzorn/ProffieOS/archive/refs/tags/${PROFFIEOS_TAG}.zip`;
    const archive = join(root, `ProffieOS-${PROFFIEOS_TAG}.zip`);
    await verifiedDownload(sys, url, archive, pins.proffieOS, 'ProffieOS source', onLine, signal);
    check();
    onLine('extracting ProffieOS');
    const tmp = join(root, 'ProffieOS-extract');
    await rm(tmp, { recursive: true, force: true });
    await extractZip(archive, tmp);
    const inner = (await readdir(tmp)).find((n) => n.toLowerCase().startsWith('proffieos'));
    if (!inner) throw new Error('ProffieOS archive had an unexpected layout');
    await writeFile(join(tmp, inner, SOURCE_STAMP), JSON.stringify({ tag: PROFFIEOS_TAG, sha256: PROFFIEOS_SHA256 }), 'utf8');
    await rm(p.osDir, { recursive: true, force: true });
    await rename(join(tmp, inner), p.osDir);
    await rm(tmp, { recursive: true, force: true });
  }

  status = await toolchainStatus(root);
  onLine(status.ready ? 'toolchain ready' : 'toolchain incomplete');
  return status;
}

let running: { promise: Promise<ToolchainStatus>; ctrl: AbortController } | null = null;

/** Only one setup at a time: starting it again while it runs joins the running one. */
export function setupOnce(start: (signal: AbortSignal) => Promise<ToolchainStatus>): Promise<ToolchainStatus> {
  if (running) return running.promise;
  const ctrl = new AbortController();
  const promise = start(ctrl.signal).finally(() => { if (running?.promise === promise) running = null; });
  running = { promise, ctrl };
  return promise;
}

/** Stop the running setup. False when none is running. */
export function cancelSetup(): boolean {
  if (!running) return false;
  running.ctrl.abort();
  return true;
}

// ---- The folder's permissions (Windows) ----

const USERS = 'S-1-5-32-545';

function powershell(script: string, timeoutMs = 20000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })));
}
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The running Windows account's SID. */
async function currentUserSid(): Promise<string> {
  const r = await powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
  if (!/^S-1-[\d-]+$/.test(r.out)) throw new Error(`could not read this account's SID: ${r.out}`);
  return r.out;
}

/**
 * Whether standard users other than the folder's owner can change it: Users, Authenticated Users or Everyone holding
 * any right to write, create, delete or change permissions, on the folder or inherited by what is in it.
 */
export async function folderOpenToOthers(root: string): Promise<boolean | null> {
  const script = `$a = Get-Acl -LiteralPath ${psq(root)}; $who = 'S-1-5-32-545','S-1-5-11','S-1-1-0'; `
    + `$w = [System.Security.AccessControl.FileSystemRights]'WriteData, AppendData, WriteExtendedAttributes, WriteAttributes, Delete, DeleteSubdirectoriesAndFiles, ChangePermissions, TakeOwnership'; `
    + `$open = @($a.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and ($who -contains $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value) -and (($_.FileSystemRights -band $w) -ne 0) }); `
    + `if ($open.Count) { 'open' } else { 'closed' }`;
  const r = await powershell(script);
  return r.out === 'open' ? true : r.out === 'closed' ? false : null;
}

/**
 * Lock the folder: administrators, SYSTEM and this account can change it; other users can read and run it. With
 * `elevate`, a folder this account may not re-permission (one an elevated run created) is locked through the Windows
 * approval prompt.
 */
export async function lockFolder(root: string, elevate: boolean): Promise<{ ok: boolean; text: string }> {
  let sid: string;
  try { sid = await currentUserSid(); } catch (err) { return { ok: false, text: String(err) }; }
  const args = [root, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', `*${sid}:(OI)(CI)F`, `*${USERS}:(OI)(CI)RX`];
  const plain = await new Promise<{ ok: boolean; out: string }>((resolve) => execFile('icacls', args, { windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })));
  if (plain.ok) return { ok: true, text: 'Locked.' };
  if (!elevate) return { ok: false, text: plain.out };
  const argList = args.map((a) => `'"${a.replace(/'/g, "''")}"'`).join(',');
  const r = await powershell(`try { $p = Start-Process -FilePath icacls -ArgumentList @(${argList}) -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop; exit $p.ExitCode } catch { Write-Output $_.Exception.Message; exit 1 }`, 10 * 60 * 1000);
  if (r.ok) return { ok: true, text: 'Locked.' };
  return { ok: false, text: /cancel/i.test(r.out) ? 'Windows asked for administrator approval and it was declined, so the folder was not changed.' : `The folder could not be locked: ${r.out.slice(0, 200)}` };
}
