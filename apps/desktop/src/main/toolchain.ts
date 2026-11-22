// Toolchain manager: arduino-cli, the Proffieboard core (which brings GCC and dfu-util) and a pinned ProffieOS tree.
// Everything lives under one directory. HILTWRIGHT_TOOLCHAIN_DIR points at an existing one (the spike cache works).
// Electron-free so it can be exercised from tests.
//
// Every part is pinned (toolchain-integrity): arduino-cli and the ProffieOS source by SHA-256, checked before they are
// unpacked; the board support by version. What is installed is read back, not assumed, and a toolchain that differs
// from the pins is not ready. The folder is created only when the owner starts the setup, and locked so that only
// administrators and the owner can change what the compiler and flasher run. Nothing is run from a folder another
// Windows account owns or can change (#20).

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
const SOURCE_STAMP = '.hiltwright-source.json';

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
  /**
   * Windows: the folder fails the ownership check (#20), so nothing in it is run: another account owns it or can change
   * it, or its permissions could not be read. Null when it does not exist.
   */
  open: boolean | null;
  /** Why the folder is open: another account owns it, other accounts can change it, or the check could not run. */
  openWhy?: OpenWhy | null;
}

export type OpenWhy = 'owner' | 'writers' | 'unknown';

export { MAX_ROOT_LENGTH, INSTALL_DISK_BYTES, INSTALL_DISK_MARGIN } from '../shared/toolchainChecks';

/** Downloads and on-disk footprint of a full install, for the consent screen and the space check. */
export const INSTALL_DOWNLOAD_BYTES = 360 * 1024 * 1024;

export type Progress = (line: string) => void;

const isWin = process.platform === 'win32';

/**
 * Where the toolchain may live. On Windows this account's own %LOCALAPPDATA%\Hiltwright\tc comes first, as no other
 * account can plant files there (#20); it fits the compiler's path limit only for a short user name, so the shared
 * %ProgramData%\Hiltwright (25 characters) and %SystemDrive%\Hiltwright follow. A shared folder is used only once its
 * owner and permissions check out (folderTrust). Only candidates short enough for the compiler are offered.
 */
export interface RootCandidates { perUser: string | null; shared: string[]; fallback: string }

function rootCandidates(userData: string): RootCandidates {
  const fallback = join(userData, 'toolchain');
  if (!isWin) return { perUser: fallback, shared: [], fallback };
  const fits = (c: string | null): c is string => !!c && c.length <= MAX_ROOT_LENGTH;
  const own = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Hiltwright', 'tc') : null;
  return {
    perUser: fits(own) ? own : null,
    shared: [
      process.env.ProgramData ? join(process.env.ProgramData, 'Hiltwright') : null,
      process.env.SystemDrive ? `${process.env.SystemDrive}\\Hiltwright` : null,
    ].filter(fits),
    fallback,
  };
}

function candidateRoots(userData: string): string[] {
  const c = rootCandidates(userData);
  return [...(c.perUser ? [c.perUser] : []), ...c.shared];
}

const holdsToolchain = (c: string) => existsSync(join(c, 'arduino-cli')) || existsSync(join(c, 'ProffieOS'));

/**
 * The choice of folder, given what is on disk (#20). This account's own folder when it already holds a toolchain;
 * else a shared folder that holds one and passed the ownership check (existing installs keep working); else this
 * account's own folder when it fits; else, as before, a shared folder: one holding a toolchain (which then shows
 * Repair), or the first whose parent exists.
 */
export function pickToolchainRoot(c: RootCandidates, look: { installed: (p: string) => boolean; parentExists: (p: string) => boolean; trusted: (p: string) => boolean }): string {
  if (c.perUser && look.installed(c.perUser)) return c.perUser;
  const installed = c.shared.filter((s) => look.installed(s));
  const ok = installed.find((s) => look.trusted(s));
  if (ok) return ok;
  if (c.perUser) return c.perUser;
  return installed[0] ?? c.shared.find((s) => look.parentExists(s)) ?? c.shared[0] ?? c.fallback;
}

/**
 * The folder the toolchain is in, or will go into, chosen without creating or checking anything: no shared folder
 * counts as checked yet. `chooseToolchainRoot` makes the real choice, once the ownership check has run. The folder is
 * created by `ensureToolchainRoot`, when the owner starts the setup.
 */
export function plannedToolchainRoot(userData: string): string {
  return pickToolchainRoot(rootCandidates(userData), { installed: holdsToolchain, parentExists: (p) => existsSync(dirname(p)), trusted: () => false });
}

/** The folder to use: as `plannedToolchainRoot`, but a shared folder holding a toolchain counts when it passes folderTrust. */
export async function chooseToolchainRoot(userData: string, trust: (root: string) => Promise<FolderTrust | null> = folderTrust): Promise<string> {
  const c = rootCandidates(userData);
  const ok = new Set<string>();
  if (!(c.perUser && holdsToolchain(c.perUser))) {
    for (const s of c.shared) if (holdsToolchain(s) && (await trust(s))?.trusted) ok.add(s);
  }
  return pickToolchainRoot(c, { installed: holdsToolchain, parentExists: (p) => existsSync(dirname(p)), trusted: (p) => ok.has(p) });
}

/**
 * Create the toolchain folder when the setup starts: the planned one, or the next candidate that can be used. A
 * folder created here is locked at once (lockFolder). On Windows a folder is used only when it passes the ownership
 * check (#20): an existing empty one that fails is locked first, and one that still fails, or that already holds
 * files, is passed over (Repair deals with those).
 */
export async function ensureToolchainRoot(planned: string, userData: string, onLine: Progress, trust: (root: string) => Promise<FolderTrust | null> = folderTrust): Promise<string> {
  const order = [planned, ...candidateRoots(userData).filter((c) => c !== planned)];
  for (const c of order) {
    try {
      const existed = await exists(c);
      if (!existed) { await mkdir(c, { recursive: true }); onLine(`created ${c}`); }
      if (!isWin) return c;
      if ((await trust(c))?.trusted) return c;
      if (existed && (await readdir(c)).length) { onLine(`not using ${c}: another Windows account owns it or can change it, and it already holds files`); continue; }
      const r = await lockFolder(c, false);
      onLine(r.ok ? 'locked the toolchain folder: only administrators and this account can change it' : `could not lock the toolchain folder: ${r.text}`);
      // Checked again after locking: a folder another account made in the meantime is still theirs.
      if ((await trust(c))?.trusted) return c;
      onLine(`not using ${c}: another Windows account owns it or can change it`);
    } catch (err) { onLine(`cannot use ${c}: ${String(err)}`); }
  }
  throw new Error('Hiltwright could not find a toolchain folder that only administrators and your account can change. Choose Repair on the Compiler step; Windows may ask for approval.');
}

/**
 * Folders whose last ownership check failed (#20). The build and the flasher reach the toolchain through
 * toolchainPaths, so a folder in here refuses them too, not only the status check.
 */
const refused = new Set<string>();
const refusedText = (root: string) => `Hiltwright will not run the compiler or the flasher from ${root}: another Windows account owns the folder or can change it. Choose Repair on the Compiler step first.`;

export function toolchainPaths(root: string): ToolchainPaths {
  if (refused.has(root)) throw new Error(refusedText(root));
  return pathsIn(root);
}

function pathsIn(root: string): ToolchainPaths {
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
  const p = pathsIn(root);
  // The ownership check comes first: nothing is run from a folder that fails it (#20).
  let open: boolean | null = null;
  let openWhy: OpenWhy | null = null;
  if (isWin && (await exists(root))) {
    const t = await folderTrust(root);
    open = !t?.trusted;
    openWhy = !t ? 'unknown' : t.foreignOwner ? 'owner' : t.writers.length ? 'writers' : null;
    if (open) refused.add(root); else refused.delete(root);
  }
  const cliPresent = await exists(p.cli);
  let cliVersion: string | null = null;
  if (cliPresent && !open) {
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
  return {
    root, cli, cliVersion, core, gcc, dfuUtil, proffieOS, proffieOSVersion: proffieOS ? stamp!.tag : null,
    versions: { cli: cliVersion, core: cores.length ? cores.join(', ') : null, proffieOS: stamp ? stamp.tag : ino ? 'unknown (not from a checked download)' : null },
    ready: cli && core && gcc && !!dfuUtil && proffieOS && !pathTooLong && !open, freeBytes, pathTooLong, open, openWhy,
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
  if (blocked.untrusted) throw new Error(blocked.untrusted.error);
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

const SYSTEM = 'S-1-5-18';
const ADMINS = 'S-1-5-32-544';
const USERS = 'S-1-5-32-545';
/**
 * CREATOR OWNER and OWNER RIGHTS stand for whoever creates an item or owns it. Creating needs a right to write here,
 * and the owner is checked on its own, so neither lets another account in by itself.
 */
const STANDS_FOR_OWNER = new Set(['S-1-3-0', 'S-1-3-4']);
/**
 * The rights that let an account change what is in a folder: write or append data (create files and folders), write
 * attributes, delete, delete what is inside, change permissions, take ownership, and the generic all and write.
 */
const WRITE_RIGHTS = 0x2 | 0x4 | 0x10 | 0x40 | 0x100 | 0x10000 | 0x40000 | 0x80000 | 0x10000000 | 0x40000000;

function powershell(script: string, timeoutMs = 20000): Promise<{ ok: boolean; out: string }> {
  // Windows PowerShell gets its own module path. One inherited from PowerShell 7 makes it load PowerShell 7's modules,
  // which fail there (a test run from a PowerShell 7 prompt could not read permissions).
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'psmodulepath') delete env[k];
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: timeoutMs, windowsHide: true, env }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })));
}
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

function icacls(args: string[], timeoutMs = 120000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile('icacls', args, { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })));
}

/** The running Windows account's SID. */
async function currentUserSid(): Promise<string> {
  const r = await powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
  if (!/^S-1-[\d-]+$/.test(r.out)) throw new Error(`could not read this account's SID: ${r.out}`);
  return r.out;
}

/** What the ownership check found (#20). */
export interface FolderTrust {
  /** Hiltwright may run what is in the folder: the owner is this account, Administrators or SYSTEM, and no other account can change it. */
  trusted: boolean;
  /** The folder belongs to an account other than this one, Administrators and SYSTEM. */
  foreignOwner: boolean;
  owner: string;
  /** Other accounts (SIDs) that can change the folder or what is in it. */
  writers: string[];
}

/**
 * Judge a folder from its permissions, as `folderTrust`'s script prints them: `me <sid>`, `owner <sid>`, then one
 * `ace <Allow|Deny> <sid> <rights>` line per entry. An allow-list (#20): only this account, Administrators and SYSTEM
 * may own the folder or hold a right to change it, on the folder or inherited by what is in it. Deny entries only take
 * rights away, so they change nothing here. Null when the output is not that (the check failed).
 */
export function judgeFolderAcl(out: string): FolderTrust | null {
  let me: string | null = null;
  let owner: string | null = null;
  const writers = new Set<string>();
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const who = /^(me|owner) (S-1-[\d-]+)$/.exec(line);
    if (who) { if (who[1] === 'me') me = who[2]; else owner = who[2]; continue; }
    const ace = /^ace (Allow|Deny) (S-1-[\d-]+) (-?\d+)$/.exec(line);
    if (!ace) return null;
    if (ace[1] === 'Allow' && (Number(ace[3]) & WRITE_RIGHTS) !== 0) writers.add(ace[2]);
  }
  if (!me || !owner) return null;
  const allowed = new Set([me, ADMINS, SYSTEM]);
  const others = [...writers].filter((s) => !allowed.has(s) && !STANDS_FOR_OWNER.has(s));
  const foreignOwner = !allowed.has(owner);
  return { trusted: !foreignOwner && !others.length, foreignOwner, owner, writers: others };
}

/**
 * Read a folder's owner and permissions and judge them (judgeFolderAcl). Through .NET, not Get-Acl, so no PowerShell
 * module has to load. Null when they could not be read. Off Windows every folder passes.
 */
export async function folderTrust(root: string): Promise<FolderTrust | null> {
  if (!isWin) return { trusted: true, foreignOwner: false, owner: '', writers: [] };
  if (tainted.has(root)) return { trusted: false, foreignOwner: true, owner: '', writers: [] };
  const script = `$s = [System.Security.Principal.SecurityIdentifier]; $a = [System.IO.Directory]::GetAccessControl(${psq(root)}); `
    + `'me ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; 'owner ' + $a.GetOwner($s).Value; `
    + `foreach ($r in $a.GetAccessRules($true, $true, $s)) { 'ace ' + $r.AccessControlType + ' ' + $r.IdentityReference.Value + ' ' + [int]$r.FileSystemRights }`;
  const r = await powershell(script);
  return r.ok ? judgeFolderAcl(r.out) : null;
}

/** Whether accounts other than this one, Administrators and SYSTEM own the folder or can change it. Null when unknown. */
export async function folderOpenToOthers(root: string): Promise<boolean | null> {
  const t = await folderTrust(root);
  return t ? !t.trusted : null;
}

/** `foreignEntries`' output: the number of items in the folder another account owns, or that could not be read. */
export function parseForeignCount(out: string): number | null {
  const m = /^foreign (\d+)$/m.exec(out.trim());
  return m ? Number(m[1]) : null;
}

/**
 * How many items below the folder belong to an account other than this one, Administrators and SYSTEM, or could not
 * be read. Links are counted, not followed. Slow on a full toolchain, so only Repair runs it.
 */
export async function foreignEntries(root: string): Promise<number | null> {
  const script = `$ok = @('${SYSTEM}', '${ADMINS}', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value); $s = [System.Security.Principal.SecurityIdentifier]; `
    + `$bad = 0; $todo = New-Object System.Collections.Stack; $todo.Push(${psq(`\\\\?\\${root}`)}); `
    + `while ($todo.Count) { $d = $todo.Pop(); try { $items = [System.IO.Directory]::GetFileSystemEntries($d) } catch { $bad++; continue }; `
    + `foreach ($e in $items) { try { $at = [System.IO.File]::GetAttributes($e); $dir = ($at -band [System.IO.FileAttributes]::Directory) -ne 0; `
    + `$acl = if ($dir) { [System.IO.Directory]::GetAccessControl($e, 'Owner') } else { [System.IO.File]::GetAccessControl($e, 'Owner') }; `
    + `if ($ok -notcontains $acl.GetOwner($s).Value) { $bad++ }; if ($dir -and -not ($at -band [System.IO.FileAttributes]::ReparsePoint)) { $todo.Push($e) } } catch { $bad++ } } }; `
    + `'foreign ' + $bad`;
  const r = await powershell(script, 10 * 60 * 1000);
  return r.ok ? parseForeignCount(r.out) : null;
}

/**
 * Lock the folder: administrators, SYSTEM and this account can change it; other users can read and run it. The owner
 * is set too (#20), as an owner can always change a folder's permissions back: this account, or Administrators when
 * Windows' approval was needed. What is inside is given to the same owner and made to follow the folder's permissions,
 * as far as that can be done. With `elevate`, a folder this account may not re-permission (one an elevated run or
 * another account created) is locked through the Windows approval prompt.
 */
export async function lockFolder(root: string, elevate: boolean): Promise<{ ok: boolean; text: string }> {
  let sid: string;
  try { sid = await currentUserSid(); } catch (err) { return { ok: false, text: String(err) }; }
  const grant = [root, '/inheritance:r', '/grant:r', `*${SYSTEM}:(OI)(CI)F`, `*${ADMINS}:(OI)(CI)F`, `*${sid}:(OI)(CI)F`, `*${USERS}:(OI)(CI)RX`];
  const inside = join(root, '*');
  let plain = await icacls(grant);
  if (plain.ok) plain = await icacls([root, '/setowner', `*${sid}`]);
  if (plain.ok) {
    if (await hasEntries(root)) {
      await icacls([inside, '/setowner', `*${sid}`, '/T', '/C', '/Q'], 10 * 60 * 1000);
      await icacls([inside, '/reset', '/T', '/C', '/Q'], 10 * 60 * 1000);
    }
    return { ok: true, text: 'Locked.' };
  }
  if (!elevate) return { ok: false, text: plain.out };
  // One approval for every step: a script for an elevated Windows PowerShell, passed encoded so no quoting is lost.
  const script = [
    `& icacls ${psq(root)} /setowner '*${ADMINS}' | Out-Null; if ($LASTEXITCODE) { exit $LASTEXITCODE }`,
    `& icacls ${grant.map(psq).join(' ')} | Out-Null; if ($LASTEXITCODE) { exit $LASTEXITCODE }`,
    `if ([System.IO.Directory]::GetFileSystemEntries(${psq(root)}).Length) { & icacls ${psq(inside)} /setowner '*${ADMINS}' /T /C /Q | Out-Null; & icacls ${psq(inside)} /reset /T /C /Q | Out-Null }`,
    'exit 0',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const r = await powershell(`try { $p = Start-Process -FilePath powershell -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop; exit $p.ExitCode } catch { Write-Output $_.Exception.Message; exit 1 }`, 10 * 60 * 1000);
  if (r.ok) return { ok: true, text: 'Locked.' };
  return { ok: false, text: /cancel/i.test(r.out) ? 'Windows asked for administrator approval and it was declined, so the folder was not changed.' : `The folder could not be locked: ${r.out.slice(0, 200)}` };
}

async function hasEntries(dir: string): Promise<boolean> {
  try { return (await readdir(dir)).length > 0; } catch { return false; }
}

/**
 * Folders Repair locked but could not empty of another account's files: refused for the rest of the session, as the
 * folder itself would now pass the check.
 */
const tainted = new Set<string>();

/**
 * Repair (#20): lock the folder and set its owner. When another account owned the folder, or owns anything in it,
 * what is there cannot be trusted: it is removed once the folder is locked, and the setup downloads the pinned parts
 * again. A folder that was only open to others, with everything in it this account's or the administrators', keeps
 * what is installed.
 */
export async function repairToolchainFolder(root: string): Promise<{ ok: boolean; text: string }> {
  tainted.delete(root); // looked at afresh: the deep check below finds anything still left
  const before = await folderTrust(root);
  const foreign = before && !before.foreignOwner ? await foreignEntries(root) : 0;
  if (!before || foreign === null) return { ok: false, text: 'Hiltwright could not read who owns the folder and what is in it, so it changed nothing.' };
  const takeOver = before.foreignOwner || foreign > 0;
  const r = await lockFolder(root, true);
  if (!r.ok) return r;
  if (!(await folderTrust(root))?.trusted) return { ok: false, text: 'The folder was locked, but another Windows account can still change it, so Hiltwright still will not use it.' };
  if (!takeOver) return r;
  try {
    for (const name of await readdir(root)) await rm(join(root, name), { recursive: true, force: true });
  } catch (err) {
    tainted.add(root);
    refused.add(root);
    return { ok: false, text: `The folder was locked, but Hiltwright could not remove the files another Windows account put in it, so it will not use them: ${String(err).slice(0, 200)}` };
  }
  return { ok: true, text: 'Locked. Another Windows account had put files in this folder, so Hiltwright removed them. Download and install sets the compiler up again.' };
}