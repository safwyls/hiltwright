// In-app updates: the decisions, with no Electron and no network, so main, the page and tests share them.
//
// Main asks GitHub's release list (through electron-updater, main/updates.ts) whether a newer Hiltwright exists. It
// never downloads by itself and never installs by itself: the owner presses Download, then Restart to update. A
// restart is refused while anything that must not be cut short is running (restartRefusal below).

/** How long after the app starts the first check is made, when the owner leaves checking on. */
export const FIRST_CHECK_MS = 60 * 1000;
/** How often a check is made after that, while the app stays open. */
export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
/** The page's setting (localStorage, with its other small settings): '0' means do not check when Hiltwright starts. */
export const CHECK_ON_START_KEY = 'hiltwright.updates.checkOnStart';

/** Whether the owner wants checks made by themselves. On unless they turned it off. */
export function checksOnStart(stored: string | null): boolean {
  return stored !== '0';
}

/**
 * Where an update stands.
 * - off: this is not an installed copy (a development run), so nothing is checked.
 * - idle: nothing checked yet in this run.
 * - checking: asking GitHub.
 * - latest: the check found nothing newer.
 * - offline: the check could not reach GitHub because this computer is offline. Not an error.
 * - available: a newer version exists; nothing is downloaded yet.
 * - downloading: the owner pressed Download.
 * - ready: downloaded and checked; Restart to update installs it.
 * - failed: a check the owner asked for, a download or an install did not work.
 */
export type UpdatePhase = 'off' | 'idle' | 'checking' | 'latest' | 'offline' | 'available' | 'downloading' | 'ready' | 'failed';

export interface UpdateState {
  phase: UpdatePhase;
  /** This copy's version. */
  current: string;
  /** The newer version, once one is found. */
  version: string | null;
  /** Download progress, 0 to 100. */
  percent: number;
  /** What failed, as a plain sentence. Only with phase 'failed'. */
  error: string | null;
  /** What was being done when it failed. */
  failedAt: 'check' | 'download' | 'install' | null;
  /** When the last check finished (ISO time), or null. */
  checkedAt: string | null;
  /** The check now running was asked for by the owner (Check now), so its result is shown even if it fails. */
  asked: boolean;
}

export function initialState(current: string, packaged: boolean): UpdateState {
  return { phase: packaged ? 'idle' : 'off', current, version: null, percent: 0, error: null, failedAt: null, checkedAt: null, asked: false };
}

export type UpdateEvent =
  | { type: 'check'; asked: boolean }
  | { type: 'none'; at: string }
  | { type: 'found'; version: string; at: string }
  | { type: 'download' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string; at?: string }
  | { type: 'install' };

/** What a newer state is, given what happened. Pure: main keeps the state, tests drive this directly. */
export function nextState(s: UpdateState, e: UpdateEvent): UpdateState {
  if (s.phase === 'off') return s;
  switch (e.type) {
    case 'check':
      // A download or an update waiting for its restart is never thrown away by a later check.
      if (s.phase === 'downloading' || s.phase === 'ready' || s.phase === 'checking') return s.phase === 'checking' && e.asked ? { ...s, asked: true } : s;
      return { ...s, phase: 'checking', asked: e.asked, error: null, failedAt: null };
    case 'none':
      if (s.phase !== 'checking') return s;
      return { ...s, phase: 'latest', version: null, checkedAt: e.at, asked: false };
    case 'found':
      if (s.phase !== 'checking') return s;
      return { ...s, phase: 'available', version: e.version, percent: 0, checkedAt: e.at, asked: false };
    case 'download':
      if (s.phase !== 'available' && !(s.phase === 'failed' && s.failedAt === 'download')) return s;
      return { ...s, phase: 'downloading', percent: 0, error: null, failedAt: null };
    case 'progress':
      if (s.phase !== 'downloading') return s;
      return { ...s, percent: Math.max(0, Math.min(100, Math.round(e.percent))) };
    case 'downloaded':
      if (s.phase !== 'downloading') return s;
      return { ...s, phase: 'ready', version: e.version || s.version, percent: 100 };
    case 'install':
      return s;
    case 'error': {
      if (s.phase === 'checking') {
        const offline = isOffline(e.message);
        // A check nobody asked for fails quietly: the page keeps showing what it showed before.
        if (!s.asked) return { ...s, phase: s.version ? 'available' : s.checkedAt ? 'latest' : 'idle', asked: false };
        if (offline) return { ...s, phase: 'offline', asked: false, checkedAt: e.at ?? s.checkedAt };
        return { ...s, phase: 'failed', failedAt: 'check', error: plainReason(e.message), asked: false };
      }
      if (s.phase === 'downloading') return { ...s, phase: 'failed', failedAt: 'download', error: isOffline(e.message) ? 'this computer went offline during the download.' : plainReason(e.message) };
      if (s.phase === 'ready') return { ...s, phase: 'failed', failedAt: 'install', error: plainReason(e.message) };
      return s;
    }
  }
}

const OFFLINE = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(?:REFUSED|RESET|TIMED_OUT|CLOSED|ABORTED)|ERR_TIMED_OUT|ERR_PROXY_CONNECTION_FAILED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|net::ERR_NETWORK/i;

/** Whether a failure only means this computer could not reach GitHub. */
export function isOffline(message: string): boolean {
  return OFFLINE.test(message);
}

/** A failure from electron-updater or the network, said plainly. The full text goes to the run log, not the page. */
export function plainReason(message: string): string {
  const m = message || '';
  if (isOffline(m)) return 'GitHub could not be reached.';
  if (/ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_NO_PUBLISHED_VERSIONS|No published versions/i.test(m)) return 'no Hiltwright release was found on GitHub.';
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find (latest|beta|alpha)\.yml/i.test(m)) return 'the newest release on GitHub is missing its update file (latest.yml).';
  if (/ERR_UPDATER_INVALID_RELEASE_FEED|Cannot parse releases feed/i.test(m)) return "GitHub's list of releases could not be read.";
  if (/sha512 checksum mismatch|checksum/i.test(m)) return 'the downloaded file did not match its checksum, so it was thrown away.';
  if (/ENOSPC/i.test(m)) return 'there is not enough free disk space.';
  if (/HttpError: 403|status(?:Code)? 403|rate limit/i.test(m)) return 'GitHub refused the request for now. Try again later.';
  if (/HttpError: 404|status(?:Code)? 404/i.test(m)) return 'the file was not found on GitHub.';
  if (/HttpError: 5\d\d|status(?:Code)? 5\d\d/i.test(m)) return 'GitHub had a problem answering. Try again later.';
  if (/app-update\.yml/i.test(m)) return 'this copy of Hiltwright was not built with update information.';
  return 'something unexpected went wrong. The run log has the details.';
}

/** The long-running jobs a restart must wait for. */
export type WorkKind = 'build' | 'install' | 'restore' | 'copy' | 'share' | 'setup' | 'driver';

/** What is running now, as the page and main see it. */
export interface BusyFacts {
  /** Jobs running, from the page (install sequences, copies) and from main (requests not yet answered). */
  work: readonly WorkKind[];
  /** A saber's card is shared with this computer over USB, or may still be after the connection went while it was. */
  cardShared: boolean;
}

/** In this order, so the most important wait is the one named. */
const WAIT_FOR: [WorkKind, string][] = [
  ['install', 'Wait for the firmware install to finish, then restart to update.'],
  ['restore', 'Wait for Put back to finish, then restart to update.'],
  ['driver', 'Wait for the driver install to finish, then restart to update.'],
  ['build', 'Wait for the build to finish, then restart to update.'],
  ['copy', 'Wait for the copy to the card to finish, then restart to update.'],
  ['share', "Wait for the saber's card to be shared or given back, then restart to update."],
  ['setup', 'Wait for the build tools to finish installing, then restart to update.'],
];
const GIVE_CARD_BACK = "Give the saber's card back on Live › Card first, then restart to update.";

/** Why Restart to update may not run now, as a plain sentence, or null when it may. */
export function restartRefusal(f: BusyFacts): string | null {
  for (const [kind, words] of WAIT_FOR) if (kind !== 'share' && f.work.includes(kind)) return words;
  if (f.cardShared) return GIVE_CARD_BACK;
  if (f.work.includes('share')) return WAIT_FOR.find(([k]) => k === 'share')![1];
  return null;
}

/** Requests to main that are long-running jobs: while one is unanswered, main counts it as running. */
export const WORK_CHANNELS: Readonly<Record<string, WorkKind>> = {
  'build:run': 'build',
  'toolchain:install': 'setup', 'toolchain:repair': 'setup',
  'flash:waitForBootloader': 'install', 'flash:target': 'install', 'flash:leave': 'install', 'flash:backup': 'install', 'flash:write': 'install', 'flash:waitForRuntime': 'install',
  'flash:restore': 'restore',
  'flash:installDriver': 'driver',
  'sd:copyFont': 'copy', 'fontlib:copyToCard': 'copy', 'packs:copyFontToCard': 'copy', 'import:xenoFont': 'copy', 'voicePack:install': 'copy',
  'sd:eject': 'share',
};

/** What the owner can press. */
export type UpdateAction = 'check' | 'download' | 'restart';

/** The buttons for a state: the main one first. */
export function actionsFor(s: UpdateState): UpdateAction[] {
  switch (s.phase) {
    case 'off': case 'checking': case 'downloading': return [];
    case 'idle': case 'latest': case 'offline': return ['check'];
    case 'available': return ['download', 'check'];
    case 'ready': return ['restart'];
    case 'failed': return s.failedAt === 'download' ? ['download', 'check'] : s.failedAt === 'install' ? ['restart'] : ['check'];
  }
}

/** The words for the result of the last check or step, as shown beside the setting on the About page. */
export function statusText(s: UpdateState): string {
  switch (s.phase) {
    // A development run, or a system whose builds are not published as releases yet (the macOS test build).
    case 'off': return 'Updates are checked only in the installed Windows app.';
    case 'idle': return 'Not checked yet.';
    case 'checking': return 'Checking for a newer version…';
    case 'latest': return 'You have the latest version.';
    case 'offline': return 'This computer is offline, so nothing was checked. Hiltwright tries again later.';
    case 'available': return `Version ${s.version} is available.`;
    case 'downloading': return `Downloading version ${s.version}: ${s.percent}%`;
    case 'ready': return `Version ${s.version} is downloaded. Restart to update.`;
    case 'failed':
      return s.failedAt === 'download' ? `Could not download: ${s.error}`
        : s.failedAt === 'install' ? `Could not start the update: ${s.error}`
        : `Could not check: ${s.error}`;
  }
}

/** The small chip beside the version in the sidebar, or null when there is nothing to say. */
export function chipText(s: UpdateState): string | null {
  switch (s.phase) {
    case 'available': return `Version ${s.version} is available`;
    case 'downloading': return `Downloading, ${s.percent}%`;
    case 'ready': return 'Restart to update';
    case 'failed': return s.failedAt === 'check' ? null : 'Update did not finish';
    default: return null;
  }
}

/** The label of each button. */
export function actionLabel(a: UpdateAction, s: UpdateState): string {
  if (a === 'check') return 'Check now';
  if (a === 'download') return s.phase === 'failed' ? 'Try the download again' : `Download version ${s.version}`;
  return 'Restart to update';
}

/**
 * When the page should next ask for a check by itself, in ms from now, or null for never. Checks by themselves need
 * the setting on and an installed copy; the first comes a little after start, then one every few hours.
 */
export function nextCheckIn(opts: { on: boolean; phase: UpdatePhase; checkedBefore: boolean }): number | null {
  if (!opts.on || opts.phase === 'off') return null;
  // Once found, downloading or downloaded, nothing more is checked by itself in this run.
  if (opts.phase === 'available' || opts.phase === 'downloading' || opts.phase === 'ready') return null;
  return opts.checkedBefore ? CHECK_EVERY_MS : FIRST_CHECK_MS;
}

/**
 * Dev aid: HILTWRIGHT_UPDATE_STATE=available | downloading:<percent> | ready | failed | latest | offline puts the
 * About page and the sidebar into that state, so it can be photographed. Development runs only (main/devEnv.ts).
 */
export function pretendState(spec: string, current: string): UpdateState | null {
  const [what, arg] = spec.trim().toLowerCase().split(':');
  const base: UpdateState = { ...initialState(current, true), checkedAt: new Date().toISOString() };
  const newer = '0.2.0-beta.2';
  switch (what) {
    case 'available': return { ...base, phase: 'available', version: newer };
    case 'downloading': return { ...base, phase: 'downloading', version: newer, percent: Math.max(0, Math.min(100, Number(arg ?? 42) || 0)) };
    case 'ready': return { ...base, phase: 'ready', version: newer, percent: 100 };
    case 'failed': return { ...base, phase: 'failed', failedAt: 'check', error: plainReason('net::ERR_HTTP_RESPONSE_CODE_FAILURE HttpError: 503') };
    case 'latest': return { ...base, phase: 'latest' };
    case 'offline': return { ...base, phase: 'offline' };
    default: return null;
  }
}

/** Said beside the setting: what a check sends, and what it does not. */
export const NETWORK_NOTE = "A check asks GitHub for Hiltwright's list of releases. The check sends nothing about your sabers or you; GitHub sees your internet address, as with any web page. A new version is downloaded only when you press Download.";

/**
 * electron-updater sends a random ID of its own (kept in the data folder as .updaterId) with every request, for
 * staged roll-outs, which Hiltwright does not use. Every copy sends this same value instead, so a check cannot be
 * told apart from anyone else's.
 */
export const SHARED_STAGING_ID = '00000000-0000-4000-8000-000000000000';
