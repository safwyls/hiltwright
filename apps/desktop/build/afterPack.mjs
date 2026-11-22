// electron-builder's afterPack hook: set Electron's fuses in the packaged app (issue #30). They are switches compiled
// into the Electron binary that no launch environment can turn back on:
// - RunAsNode off: ELECTRON_RUN_AS_NODE cannot make Hiltwright.exe a plain Node.js.
// - NODE_OPTIONS ignored, and --inspect and the other inspector switches refused: no code or debugger can be slipped
//   in at launch.
// - The app's code loads only from app.asar, and app.asar is checked against the hash electron-builder embeds in the
//   executable, so a changed app.asar does not start.
// The hook refuses to package an app that is not in app.asar (the last two need it), and reads the fuses back after
// setting them, so a build that did not take them fails instead of shipping without.

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import fusesPackage from '@electron/fuses';

// @electron/fuses is CommonJS: its exports are read off the package object.
const { FuseV1Options, FuseVersion, flipFuses, getCurrentFuseWire } = fusesPackage;
// How the fuse wire stores a fuse that is on or off (the characters '1' and '0'; @electron/fuses FuseState).
const ENABLED = 49;
const DISABLED = 48;

/** The fuses Hiltwright sets, by their @electron/fuses name. Every other fuse keeps Electron's default. */
export const FUSES = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  OnlyLoadAppFromAsar: true,
  EnableEmbeddedAsarIntegrityValidation: true,
};

/** The config @electron/fuses takes: the fuses above by their index in the fuse wire. */
export function fuseConfig(platform) {
  const config = { version: FuseVersion.V1, ...(platform === 'darwin' || platform === 'mas' ? { resetAdHocDarwinSignature: true } : {}) };
  for (const [name, on] of Object.entries(FUSES)) config[FuseV1Options[name]] = on;
  return config;
}

/** Where the packaged Electron binary and app.asar are, for this platform's output folder. */
export function packagedPaths(context) {
  const { appOutDir, electronPlatformName: platform, packager } = context;
  const name = packager.appInfo.productFilename;
  if (platform === 'darwin' || platform === 'mas') {
    const app = join(appOutDir, `${name}.app`);
    return { electron: app, asar: join(app, 'Contents', 'Resources', 'app.asar') };
  }
  if (platform === 'win32') return { electron: join(appOutDir, `${name}.exe`), asar: join(appOutDir, 'resources', 'app.asar') };
  return { electron: join(appOutDir, packager.executableName ?? name), asar: join(appOutDir, 'resources', 'app.asar') };
}

/** Set the fuses, then read them back. `fuses` stands in for @electron/fuses in a test. */
export async function setFuses(context, fuses = { flipFuses, getCurrentFuseWire }) {
  const { electron, asar } = packagedPaths(context);
  try { await access(asar); } catch {
    throw new Error(`No app.asar at ${asar}. The fuses OnlyLoadAppFromAsar and EnableEmbeddedAsarIntegrityValidation need the app packed as an asar archive: do not set "asar": false in the build config.`);
  }
  await fuses.flipFuses(electron, fuseConfig(context.electronPlatformName));
  const wire = await fuses.getCurrentFuseWire(electron);
  const wrong = Object.entries(FUSES).filter(([name, on]) => wire[FuseV1Options[name]] !== (on ? ENABLED : DISABLED)).map(([name]) => name);
  if (wrong.length) throw new Error(`These Electron fuses did not take in ${electron}: ${wrong.join(', ')}.`);
  console.log(`  • Electron fuses set in ${electron}: ${Object.entries(FUSES).map(([n, on]) => `${n} ${on ? 'on' : 'off'}`).join(', ')}`);
}

export async function afterPack(context) {
  await setFuses(context);
}

export default afterPack;
