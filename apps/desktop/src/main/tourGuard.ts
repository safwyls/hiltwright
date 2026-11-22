// While the guided tour runs, the app shows an example saber, and nothing may change the owner's own data or reach a
// board: no writes to the saber library, styles, fonts, preset sets or a card, no build, no flash, no driver. Every
// page request passes through here (ipc.ts `handle`). Requests that only read are let through; every other one is
// refused with a plain message, and a request this list does not know is refused too, so a new one cannot slip by.

export const TOUR_REFUSAL = 'Not done: the tour is running, and nothing is saved or sent while it does. End the tour first.';

/** Requests that only read, or open something for the owner to look at. Allowed during the tour. */
export const TOUR_ALLOWED: ReadonlySet<string> = new Set([
  'library:list', 'banks:list', 'looks:list', 'snapshots:list', 'snapshots:read',
  'usb:proffieSerials', 'usb:portHolders',
  'sd:locate', 'sd:mounted', 'sd:listFonts', 'sd:hasFolder', 'sd:readFont', 'sd:listTracks', 'sd:voicePack', 'voicePack:list', 'voicePack:openLink', 'sd:configFiles', 'config:pick',
  'fontlib:status', 'fontlib:list', 'fontlib:detail', 'fontlib:readSound', 'fontlib:readFont', 'fontlib:open',
  'contributors:list', 'contributors:open',
  'hilts:list', 'hilts:model', 'hilts:packFits', 'hilts:room',
  'packs:list', 'packs:dir', 'packs:mesh', 'packs:font',
  'toolchain:status', 'build:preview', 'flash:usb', 'flash:listBackups',
  'app:storeProblems', 'app:userDataPath', 'app:boardAccess', 'app:openHelp', 'app:openPath', 'app:legal', 'app:openSource',
  'tour:set',
  // The update state only: what the page shows. A check during the tour is answered with it, and nothing is asked of GitHub.
  'updates:state',
]);

/** Requests that write, copy, build, flash or change a setting. Refused during the tour. Listed so tests can check every request is placed. */
export const TOUR_BLOCKED: ReadonlySet<string> = new Set([
  'library:upsert', 'library:rename', 'library:remove', 'library:linkCard', 'library:unlinkCard', 'library:update', 'library:plan', 'library:adopt', 'library:noteBootloader',
  'banks:save', 'banks:remove',
  'looks:add', 'looks:remove', 'looks:update',
  'snapshots:save',
  'usb:wantSerial',
  'sd:eject', 'sd:pickFont', 'sd:copyFont', 'sd:clearPresets', 'voicePack:pick', 'voicePack:install',
  'fontlib:setMeta', 'fontlib:remove', 'fontlib:copyToCard', 'fontlib:addZip', 'fontlib:addFolder', 'fontlib:importLegacy', 'fontlib:exportPack', 'fontlib:importPack', 'fontlib:dismissLegacy', 'fontlib:chooseRoot', 'fontlib:resetRoot',
  'contributors:setLogo', 'contributors:clearLogo', 'contributors:setUrl', 'contributors:copy',
  'hilts:add', 'hilts:setFit', 'hilts:setCreator', 'hilts:remove', 'hilts:setPackFit', 'hilts:resetPackFit', 'hilts:setRoom', 'hilts:adopt', 'hilts:export', 'hilts:import',
  'packs:copyFontToCard',
  'import:pickXeno', 'import:xenoFont',
  'toolchain:install', 'toolchain:cancel', 'toolchain:repair',
  'build:run', 'props:pick',
  'flash:waitForBootloader', 'flash:target', 'flash:leave', 'flash:backup', 'flash:write', 'flash:installDriver', 'flash:restore', 'flash:waitForRuntime',
  'support:save',
  // In-app updates: a check (answered quietly with the state as it is), a download and a restart to update.
  'updates:check', 'updates:download', 'updates:install',
  // The theme is a saved setting.
  'theme:set',
]);

/** Whether the tour is running, as the page last said. Main starts with it off; the page turns it off again when it loads. */
export interface TourState { active: boolean }
export const tourState: TourState = { active: false };

/** Why this request may not run now, or null when it may. */
export function tourRefusal(channel: string, state: TourState = tourState): string | null {
  if (!state.active || TOUR_ALLOWED.has(channel)) return null;
  return TOUR_REFUSAL;
}

type Handler = (...args: never[]) => unknown;

/**
 * The handler for `channel`, refusing while the tour runs. `quiet`: what to answer instead of refusing, for a request a
 * page makes by itself as it opens (the demo room remembering its scene), so the page shows no error; it must not write.
 */
export function tourGuarded<F extends Handler>(channel: string, fn: F, quiet?: (...args: Parameters<F>) => unknown, state: TourState = tourState): F {
  const wrapped = async (...args: Parameters<F>) => {
    const refused = tourRefusal(channel, state);
    if (refused) {
      if (quiet) return quiet(...args);
      console.log(`[tour] refused ${channel}`);
      throw new Error(refused);
    }
    return fn(...args);
  };
  return wrapped as unknown as F;
}
