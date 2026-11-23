// The real first-time setup, downloads and all: arduino-cli, the Proffieboard core with its compiler and dfu-util, and
// ProffieOS, into the folder HILTWRIGHT_REAL_SETUP names. Skipped unless that is set: it downloads about 360 MB and
// takes several minutes. The macOS workflow runs it on a Mac, then points HILTWRIGHT_TOOLCHAIN_DIR at the same folder
// so the real-compile tests in build.test.ts build firmware there.

import { mkdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { installToolchain, run, toolchainPaths, toolchainStatus, findDfuUtil, folderOpenToOthers, lockFolder } from '../src/main/toolchain';

const dir = process.env.HILTWRIGHT_REAL_SETUP;

describe.skipIf(!dir)('the real toolchain setup', () => {
  // The app creates the folder and locks it before the setup starts (ensureToolchainRoot): the setup refuses a folder
  // other accounts can change (#20), and one made at the root of C: lets every signed-in user change it.
  beforeAll(async () => {
    await mkdir(dir!, { recursive: true });
    if (await folderOpenToOthers(dir!)) expect(await lockFolder(dir!, false)).toEqual({ ok: true, text: 'Locked.' });
  });

  it('installs everything and reports ready', async () => {
    const status = await installToolchain(dir!, (line) => console.log(`[setup] ${line}`));
    console.log(`[setup] ${JSON.stringify(status)}`);
    expect(status).toMatchObject({ cli: true, core: true, gcc: true, proffieOS: true, pathTooLong: false, ready: true });
    expect(status.dfuUtil).toBeTruthy();
  }, 45 * 60 * 1000);

  it('is still ready when asked again, and installs nothing a second time', async () => {
    const lines: string[] = [];
    const status = await installToolchain(dir!, (line) => lines.push(line));
    expect(status.ready).toBe(true);
    expect(lines.filter((l) => l.startsWith('downloading'))).toEqual([]);
    expect((await toolchainStatus(dir!)).ready).toBe(true);
  }, 5 * 60 * 1000);

  it('has a dfu-util that runs on this system', async () => {
    const dfuUtil = await findDfuUtil(toolchainPaths(dir!));
    expect(dfuUtil).toBeTruthy();
    const version = await run(dfuUtil!, ['--version'], { timeoutMs: 20000 });
    console.log(`[setup] dfu-util --version: exit ${version.code}: ${(version.stdout + version.stderr).split('\n')[0]}`);
    expect(version.code).toBe(0);
    // With no board attached, a listing still has to run and find nothing, not fail to start.
    const list = await run(dfuUtil!, ['-l'], { timeoutMs: 20000 });
    console.log(`[setup] dfu-util -l: exit ${list.code}`);
    expect(list.stdout + list.stderr).not.toMatch(/Found DFU/);
  }, 60 * 1000);
});
