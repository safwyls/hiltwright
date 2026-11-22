# Releasing a beta

How to cut a Hiltwright beta from now on, and how an installed copy then finds it. Every release is a GitHub release on `safwyls/hiltwright`, marked as a pre-release, tagged `v<version>` (for example `v0.2.0-beta.2`).

**0.2.0-beta.1 has no updater, and the one in 0.2.0-beta.2 cannot check** (it failed to load electron-updater; that release was withdrawn). Anyone on either must install a newer beta by hand once: download the installer from the release page and run it (it installs over the old one and keeps their data). Every copy from 0.2.0-beta.3 on finds later betas itself.

**Before publishing, run a real check.** Unit tests stand in a fake for electron-updater, which is how 0.2.0-beta.2 shipped unable to check. After step 6, install the new build (or keep the previous one installed) and do step 7 every time.

## Steps

0. **Write the release notes** as `docs/release-notes-beta-N.md`, point `site/build.mjs` at that file, and update the version in `docs/install-guide.md` (its title, the download link and file name, and the source link).

1. **Bump the version** in all three package files and the lockfile, on a branch:

   ```
   npm version 0.2.0-beta.2 --workspaces --include-workspace-root --no-git-tag-version
   ```

   The app's version is `apps/desktop/package.json`'s. It must be valid semver with the pre-release part `beta.N` (`0.2.0-beta.2`, not `0.2.0b2`): the updater compares versions by semver, and the tag must be the version with a `v` in front.

2. **Font packs.** The six `.hwpack` files in `apps/desktop/resources/packs/` are not in git. If they are not there, make them (see [font-packs.md](font-packs.md)):

   ```
   npm run fontpacks --workspace @hiltwright/desktop -- "<folder of the default SD card>"
   ```

3. **Check and build** at the repo root:

   ```
   npm ci
   npm test
   npm run typecheck
   npm run dist
   ```

   `dist` never publishes anything (`--publish never`). It writes into `apps/desktop/release/`. It also sets Electron's fuses; see [Electron fuses](#electron-fuses-and-the-packaged-page).

4. **Make the GitHub release**, by hand, on https://github.com/safwyls/hiltwright/releases/new:

   - Tag: `v0.2.0-beta.2`, on the commit the build was made from.
   - Tick **Set as a pre-release**. Do not tick "Set as the latest release".
   - Save it as a **draft** first, attach the files below, then publish. A draft is invisible to installed copies, so none of them sees the release before its files are there.

5. **Attach exactly these three files** from `apps/desktop/release/`, with their names unchanged:

   | File | What it is for |
   |---|---|
   | `Hiltwright-0.2.0-beta.2-setup.exe` | The installer, for testers who install by hand and for the updater, which downloads it. |
   | `latest.yml` | What an installed copy reads: the version, the installer's file name, its size and SHA-512. Without it the release is not seen as an update. |
   | `Hiltwright-0.2.0-beta.2-setup.exe.blockmap` | Lets the copy after this one download only the parts of its installer that changed. Optional, but attach it every time: the next update looks for this release's blockmap. |

   A build writes only these and `builder-debug.yml` and the `win-unpacked` folder (checked with the 0.2.0-beta.1 version number on 2026-11-18). Do not attach the last two. There is no `beta.yml`: electron-builder writes only `latest.yml` for a GitHub build, whatever the version, and that is the file an installed beta falls back to.

   `latest.yml` looks like this; its `url` must match the installer's name on the release exactly:

   ```
   version: 0.2.0-beta.2
   files:
     - url: Hiltwright-0.2.0-beta.2-setup.exe
       sha512: ...
       size: ...
   path: Hiltwright-0.2.0-beta.2-setup.exe
   sha512: ...
   releaseDate: '...'
   ```

6. **Publish** the draft as a pre-release.

7. **Check from an installed copy** of the previous beta: About, **Check now**. It should say "Version 0.2.0-beta.2 is available".

## Builds on GitHub

`.github/workflows/builds.yml` ("Test builds") is run by hand from the repository's Actions tab. It has a Windows job and a macOS job. Each runs the tests, does the real first-time toolchain setup, compiles real firmware with it, packages the app and attaches the result to the run. Nothing is published.

- **The macOS disk images of a release come from it.** Run it on the release commit, download the `hiltwright-macos-test-build` artifact, and attach the two `.dmg` files to the release beside the Windows files. They are unsigned and do not update themselves.
- **The Windows job is a check, not the release build.** Its installer has no font packs, because the six free fonts are not in the repository (font-packs.md). The installer a release ships is still built on a PC that has the packs (step 3). A green Windows job says the release commit installs, tests, sets up its toolchain and compiles firmware on a clean Windows machine.

Node.js: the build tools, the tests, the site and every workflow use Node.js 24 (`.nvmrc`, and `engines` in the root and site `package.json`). The app itself runs on the Node.js that its Electron version carries (Electron 45 carries Node.js 24 and Chromium 156), which changes only with an Electron upgrade; `@types/node` and the build targets in `apps/desktop/electron.vite.config.ts` follow that one. An Electron upgrade can also raise the oldest system the app runs on (Electron 45 needs macOS 13; Windows 10 and 11, 64-bit): check the download page and the FAQ.

## How an installed copy finds it

The build writes the update source into the installed app (`resources/app-update.yml`: GitHub, owner `safwyls`, repo `hiltwright`), from the `publish` block in `apps/desktop/package.json`. In the app, electron-updater (main/updates.ts) then:

1. Reads `https://github.com/safwyls/hiltwright/releases.atom`, GitHub's public feed of releases, pre-releases included, drafts not. It takes the newest entry whose tag is a valid version on the beta line or a full release (an `alpha` tag is skipped by a beta copy).
2. Asks for `beta.yml` in that release, gets nothing (electron-builder writes only `latest.yml` for a GitHub build), and falls back to `latest.yml`.
3. Offers the version in `latest.yml` if it is newer than its own by semver. Nothing is downloaded until the owner presses Download.
4. On Download, fetches the installer named in `latest.yml` from the same release and checks its SHA-512. On Restart to update, runs it (not silently: the installer shows its progress window and opens Hiltwright again).

So the repository must stay public, the tag must be `v<version>`, and the installer's name on the release must be exactly the one in `latest.yml`. GitHub's feed can lag a few minutes behind a new release.

Checks happen in an installed copy only, a little after it starts and every four hours, unless the owner turns **Check for updates when Hiltwright starts** off on the About page. A check sends no saber or owner data; electron-updater's own per-install ID header is replaced by one value that every copy sends.

## Signing

The app is unsigned and stays unsigned. `win.verifyUpdateCodeSignature` is `false`, so `app-update.yml` carries no `publisherName` and the updater does not ask the downloaded installer for a signature. Smart App Control must be off on a tester's PC for the app to run at all. The browser warning and the **Unblock** step apply only to an installer downloaded in a browser: the updater's download is written by the app without the "downloaded from the internet" mark and started directly, so SmartScreen's "Windows protected your PC" prompt is not expected. That last point is from reading electron-updater's code, not from a test on a PC; check it with the first real update.

## Electron fuses and the packaged page

Packaging sets Electron's fuses in `Hiltwright.exe` (issue #30): switches compiled into the binary that no launch environment can turn back on. `apps/desktop/build/afterPack.mjs` runs as electron-builder's `afterPack` hook, after the app is packed and before anything is signed, and sets:

| Fuse | Set to | So that |
|---|---|---|
| RunAsNode | off | `ELECTRON_RUN_AS_NODE` cannot turn the app into a plain Node.js. |
| EnableNodeOptionsEnvironmentVariable | off | `NODE_OPTIONS` cannot load code into it. |
| EnableNodeCliInspectArguments | off | `--inspect` and the other inspector switches are refused. |
| OnlyLoadAppFromAsar | on | The app's code loads only from `resources/app.asar`. |
| EnableEmbeddedAsarIntegrityValidation | on | `app.asar` must match the hash electron-builder embeds in the executable, or the app does not start. |

The hook reads the fuses back and fails the build if one did not take, and it refuses to package an app that is not in `app.asar`: never set `"asar": false` in the build config, or the last two fuses would stop the app starting. It uses `@electron/fuses`, pinned in `apps/desktop/package.json`; do not also set electron-builder's own `electronFuses`. The build log shows a line "Electron fuses set in ...". To check a build, run `npx electron-fuses read --app release\win-unpacked\Hiltwright.exe` in `apps/desktop` (or point `--app` at an installed copy's `Hiltwright.exe`).

After a change to the build config or an Electron upgrade, install the new build and start it once before publishing: a wrong asar hash shows as the app closing straight away. The unit tests run the hook against stand-ins only.

A packaged build also ignores `ELECTRON_RENDERER_URL` (it always loads its own page), and its page's Content-Security-Policy allows no WebSocket. The development page allows `ws://localhost:*` for live reload; the build removes it (`apps/desktop/build/csp.ts`) and stops if the policy no longer reads as expected.

## Testing an update locally

Dev runs never check. To look at each state on screen, a development run takes `HILTWRIGHT_UPDATE_STATE=available | downloading:42 | ready | failed | latest | offline` (ignored by an installed copy). The shots script photographs them:

```
npm run shots --workspace @hiltwright/desktop -- <folder> update-available update-downloading update-ready update-refused update-failed update-latest
```
