// Toolchain manager: arduino-cli, the Proffieboard core (which brings GCC and dfu-util) and a pinned ProffieOS tree.
// Everything lives under one directory. HILTWRIGHT_TOOLCHAIN_DIR points at an existing one (the spike cache works).
// Electron-free so it can be exercised from tests.

import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const PROFFIE_INDEX = 'https://profezzorn.github.io/arduino-proffieboard/package_proffieboard_index.json';
export const PROFFIEOS_TAG = 'v8.10';
export const CLI_VERSION = '1.3.1';

export interface ToolchainPaths {
  root: string;
  cli: string;
  data: string;
  downloads: string;
  user: string;
  osDir: string;
  buildRoot: string;
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
  ready: boolean;
}

export type Progress = (line: string) => void;

const isWin = process.platform === 'win32';

export function toolchainPaths(root: string): ToolchainPaths {
  return {
    root,
    cli: join(root, 'arduino-cli', isWin ? 'arduino-cli.exe' : 'arduino-cli'),
    data: join(root, 'arduino-data'),
    downloads: join(root, 'arduino-downloads'),
    user: join(root, 'arduino-user'),
    osDir: join(root, 'ProffieOS'),
    buildRoot: join(root, 'builds'),
  };
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

/** Run a command, streaming lines to `onLine`. Resolves with the exit code and captured output. */
export function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; onLine?: Progress; timeoutMs?: number; quietStdout?: boolean } = {}): Promise<{ code: number; stdout: string; stderr: string; ms: number }> {
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
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - t0 }); });
    child.on('error', (err) => { if (timer) clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(err), ms: Date.now() - t0 }); });
  });
}

export async function findDfuUtil(p: ToolchainPaths): Promise<string | null> {
  const hw = join(p.data, 'packages', 'proffieboard', 'hardware', 'stm32l4');
  try {
    for (const v of await readdir(hw)) {
      const cand = join(hw, v, 'tools', isWin ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux', isWin ? 'dfu-util.exe' : 'dfu-util');
      if (await exists(cand)) return cand;
    }
  } catch { /* core not installed */ }
  return null;
}

export async function toolchainStatus(root: string): Promise<ToolchainStatus> {
  const p = toolchainPaths(root);
  const cli = await exists(p.cli);
  let cliVersion: string | null = null;
  if (cli) {
    const r = await run(p.cli, ['version'], { env: cliEnv(p), timeoutMs: 10000 });
    cliVersion = /Version:\s*(\S+)/.exec(r.stdout)?.[1] ?? /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null;
  }
  const core = await exists(join(p.data, 'packages', 'proffieboard', 'hardware', 'stm32l4'));
  const gcc = await exists(join(p.data, 'packages', 'proffieboard', 'tools', 'arm-none-eabi-gcc'));
  const dfuUtil = await findDfuUtil(p);
  const proffieOS = await exists(join(p.osDir, 'ProffieOS.ino'));
  let proffieOSVersion: string | null = null;
  if (proffieOS) {
    try { proffieOSVersion = (await stat(join(p.osDir, 'ProffieOS.ino'))).isFile() ? PROFFIEOS_TAG : null; } catch { /* ignore */ }
  }
  return { root, cli, cliVersion, core, gcc, dfuUtil, proffieOS, proffieOSVersion, ready: cli && core && gcc && !!dfuUtil && proffieOS };
}

async function download(url: string, dest: string, onLine: Progress): Promise<void> {
  onLine(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${url}`);
  await mkdir(join(dest, '..'), { recursive: true });
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  await rename(tmp, dest);
  onLine(`saved ${dest} (${(await stat(dest)).size} bytes)`);
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

/** Install everything that is missing. Idempotent. Roughly 360 MB of downloads, 1.6 GB on disk. */
export async function installToolchain(root: string, onLine: Progress): Promise<ToolchainStatus> {
  const p = toolchainPaths(root);
  await mkdir(root, { recursive: true });
  let status = await toolchainStatus(root);

  if (!status.cli) {
    const asset = isWin ? `arduino-cli_${CLI_VERSION}_Windows_64bit.zip`
      : process.platform === 'darwin' ? `arduino-cli_${CLI_VERSION}_macOS_${process.arch === 'arm64' ? 'ARM64' : '64bit'}.tar.gz`
      : `arduino-cli_${CLI_VERSION}_Linux_${process.arch === 'arm64' ? 'ARM64' : '64bit'}.tar.gz`;
    const url = `https://github.com/arduino/arduino-cli/releases/download/v${CLI_VERSION}/${asset}`;
    const archive = join(root, asset);
    await download(url, archive, onLine);
    onLine('extracting arduino-cli');
    const dir = join(root, 'arduino-cli');
    if (asset.endsWith('.zip')) await extractZip(archive, dir);
    else { await mkdir(dir, { recursive: true }); const r = await run('tar', ['-xzf', archive, '-C', dir]); if (r.code !== 0) throw new Error(r.stderr); }
  }

  status = await toolchainStatus(root);
  if (!status.core || !status.gcc) {
    onLine('updating the board index');
    let r = await run(p.cli, ['core', 'update-index'], { env: cliEnv(p), onLine, timeoutMs: 300000 });
    if (r.code !== 0) throw new Error(`core update-index failed: ${r.stderr || r.stdout}`);
    onLine('installing the Proffieboard core, GCC and dfu-util (about 360 MB)');
    r = await run(p.cli, ['core', 'install', 'proffieboard:stm32l4'], { env: cliEnv(p), onLine, timeoutMs: 1800000 });
    if (r.code !== 0) throw new Error(`core install failed: ${r.stderr || r.stdout}`);
  }

  status = await toolchainStatus(root);
  if (!status.proffieOS) {
    const url = `https://github.com/profezzorn/ProffieOS/archive/refs/tags/${PROFFIEOS_TAG}.zip`;
    const archive = join(root, `ProffieOS-${PROFFIEOS_TAG}.zip`);
    await download(url, archive, onLine);
    onLine('extracting ProffieOS');
    const tmp = join(root, 'ProffieOS-extract');
    await rm(tmp, { recursive: true, force: true });
    await extractZip(archive, tmp);
    const inner = (await readdir(tmp)).find((n) => n.toLowerCase().startsWith('proffieos'));
    if (!inner) throw new Error('ProffieOS archive had an unexpected layout');
    await rm(p.osDir, { recursive: true, force: true });
    await rename(join(tmp, inner), p.osDir);
    await rm(tmp, { recursive: true, force: true });
  }

  status = await toolchainStatus(root);
  onLine(status.ready ? 'toolchain ready' : 'toolchain incomplete');
  return status;
}
