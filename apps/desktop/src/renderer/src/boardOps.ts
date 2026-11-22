// Rules of the board session, kept apart from React and Web Serial so they can be tested under node
// (test/boardOps.test.ts). useBoard (board.ts) uses each.

import { NO_SD_CARD, parseBattery, parseBatteryVoltage, sdFailureIn, wasRejected } from '@hiltwright/core';
import type { PresetRecord, SendOptions } from '@hiltwright/core';
import type { SaberIdentity, SnapshotMeta } from '../../shared/api';

/** Whether the saber said it cannot read its SD card (preset-editor-fixes D6); the rule lives with `editCurrentPreset`. */
export { NO_SD_CARD, sdFailureIn };

/**
 * History with a snapshot just saved at the top (issue #23). Main hands back the newest one when nothing changed since
 * it, so a snapshot already listed is moved up, never shown twice.
 */
export function withNewSnapshot(list: SnapshotMeta[], meta: SnapshotMeta): SnapshotMeta[] {
  return [meta, ...list.filter((m) => m.file !== meta.file)];
}

/** Why a snapshot cut short when it was saved is not restored (issue #28). */
export const INCOMPLETE_SNAPSHOT = 'This snapshot is incomplete: it was cut short when it was saved, so it cannot be restored.';

/**
 * One connection attempt at a time. After a reflash, the install flow and the Web Serial 'connect' event both try to
 * open the port; one is enough. The check and the claim happen together, with no await between them.
 * Returns whether this attempt ran.
 */
export function connectGate(isOpen: () => boolean): (attempt: () => Promise<void>) => Promise<boolean> {
  let inFlight = false;
  return async (attempt) => {
    if (inFlight || isOpen()) return false;
    inFlight = true;
    try { await attempt(); } finally { inFlight = false; }
    return true;
  };
}

/** Board operations run one after another, in the order they were asked for. A failure does not stop the next one. */
export function serialQueue(): <T>(op: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (op) => {
    const next = tail.then(op);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}

/** What the save status shows: nothing yet, an operation writing, the last one saved, or why it failed. */
export type SaveState = { kind: 'idle' } | { kind: 'writing'; what: string } | { kind: 'saved'; what: string; ms: number; at: number } | { kind: 'failed'; what: string; error: string };
export interface OpResult { ok: boolean; error?: string; ms?: number; note?: string }
export interface OpDeps<C> {
  /** The board client, or null when the saber is no longer connected. */
  client: () => C | null;
  setBusy: (busy: boolean) => void;
  setSave: (save: SaveState) => void;
  log: (kind: 'in' | 'out', text: string) => void;
  snapshot: (label: string) => Promise<void>;
  /** The stall recovery, when the session has one: an operation whose turn met a stall waits for it and is judged. */
  recovery?: Pick<Recovery, 'count' | 'since'>;
  /** Why nothing may be sent right now (the saber's card is shared, card-safety D2), or null. */
  refuse?: () => string | null;
}

/** Why a change did not reach the saber when the connection went away while it was being written. */
export const DISCONNECTED_DURING = 'Not saved: the saber was disconnected during the change.';
/** A change that met a stall, after which the saber was reached again but does not show it (usb-power-connect D5). */
export const NOT_MADE_AFTER_PAUSE = 'Not made: the saber paused and did not take this change. The page shows what it has now.';

/**
 * Run one board operation with busy state, snapshot and save-state bookkeeping. An operation whose turn comes after
 * the saber has gone (unplugged while it waited in the queue) is reported as not sent, never dropped silently; one
 * that was under way when the connection went says that, rather than whatever its last command made of the silence.
 * Returns whether the saber confirmed the operation, so the caller can act on success only (preset-editor-fixes D5).
 */
export async function runOperation<C>(deps: OpDeps<C>, label: string, op: (c: C) => Promise<OpResult>, withSnapshot: boolean, confirm?: () => boolean): Promise<boolean> {
  const { setBusy, setSave, log, snapshot, recovery } = deps;
  const client = deps.client();
  const refused = deps.refuse?.() ?? null;
  if (refused) {
    setSave({ kind: 'failed', what: label, error: refused });
    log('out', `✗ ${label}: not sent, ${refused}`);
    console.log(`[board] NOT SENT: ${label} · ${refused}`);
    return false;
  }
  if (!client) {
    setSave({ kind: 'failed', what: label, error: 'Not sent: the saber is not connected.' });
    log('out', `✗ ${label}: not sent, the saber is not connected`);
    console.log(`[board] NOT SENT: ${label} · the saber is not connected`);
    return false;
  }
  setBusy(true);
  setSave({ kind: 'writing', what: label });
  const started = Date.now();
  const stallsBefore = recovery?.count ?? 0;
  // A stall during this turn: wait for the reopen, then judge the change by what the saber now reports (D5). It is
  // never sent again here; the owner decides.
  const afterStall = async (): Promise<boolean | null> => {
    const outcome = recovery ? await recovery.since(stallsBefore) : null;
    if (outcome === null) return null;
    if (outcome === 'recovered' && confirm?.()) {
      setSave({ kind: 'saved', what: `${label} · after a pause`, ms: Date.now() - started, at: Date.now() });
      log('out', `✓ ${label} (after a pause)`);
      console.log(`[board] ok after a pause: ${label}`);
      return true;
    }
    const error = outcome === 'recovered' ? NOT_MADE_AFTER_PAUSE : DISCONNECTED_DURING;
    setSave({ kind: 'failed', what: label, error });
    log('out', `✗ ${label}: ${outcome === 'recovered' ? 'not made, the saber paused' : 'disconnected during the change'}`);
    console.log(`[board] FAILED: ${label} · ${outcome === 'recovered' ? 'not made after a pause' : 'disconnected during the change, the reconnect failed'}`);
    return false;
  };
  try {
    if (withSnapshot) await snapshot(`Before: ${label}`);
    log('in', label);
    const r = await op(client);
    if (!r.ok && r.error !== NO_SD_CARD) { const judged = await afterStall(); if (judged !== null) return judged; }
    const gone = deps.client() !== client;
    // A saber without a card may reset when asked to save: the card is the reason, not the lost connection.
    if (!r.ok && gone && r.error !== NO_SD_CARD) {
      setSave({ kind: 'failed', what: label, error: DISCONNECTED_DURING });
      log('out', `✗ ${label}: disconnected during the change`);
      console.log(`[board] FAILED: ${label} · disconnected during the change (${r.error ?? 'no detail'})`);
    } else if (r.ok) {
      setSave({ kind: 'saved', what: r.note ? `${label} · ${r.note}` : label, ms: r.ms ?? Date.now() - started, at: Date.now() });
      log('out', `✓ ${label}`);
      console.log(`[board] ok: ${label} · ${r.ms ?? Date.now() - started} ms`);
      return true;
    } else {
      setSave({ kind: 'failed', what: label, error: r.error ?? 'unknown' });
      log('out', `✗ ${label}: ${r.error}`);
      console.log(`[board] FAILED: ${label} · ${r.error}`);
    }
  } catch (err) {
    const judged = await afterStall();
    if (judged !== null) return judged;
    const gone = deps.client() !== client;
    setSave({ kind: 'failed', what: label, error: gone ? DISCONNECTED_DURING : String(err) });
    console.log(`[board] FAILED: ${label} · ${gone ? 'disconnected during the change: ' : ''}${String(err)}`);
  } finally {
    setBusy(false);
  }
  return false;
}

/** What a battery reading needs from the session: send a command, get its lines. */
export type LineSend = (command: string, opts?: { until?: (line: string) => boolean }) => Promise<{ lines: string[] }>;

/**
 * The battery voltage without the saber saying it aloud (usb-power-connect D1): `battery_voltage` prints the number
 * only, where `battery` also speaks it. Firmware without it gets `battery`, and the quiet command is not reported as
 * missing; `rejected` names only what could not be read at all.
 */
export async function readBattery(send: LineSend): Promise<{ volts: number | null; rejected: string[] }> {
  const quiet = await send('battery_voltage', { until: (l) => /^\s*\d+(?:\.\d+)?\s*$/.test(l) });
  if (!wasRejected(quiet.lines)) return { volts: parseBatteryVoltage(quiet.lines), rejected: [] };
  const loud = await send('battery', { until: (l) => /^Battery voltage:/.test(l) });
  return { volts: parseBattery(loud.lines), rejected: wasRejected(loud.lines) ? ['battery'] : [] };
}

export interface BladeLayout { pixelBlades: number[]; bladeConfig: number | null }

/**
 * The blade layout already stored for this board and firmware build, so connecting need not send `scanid`, which
 * makes the saber detect its blades and rescan its font all over again (usb-power-connect D2). The layout is part of
 * how a saber is recognised, so it is reused only when there is no doubt which record this board is:
 * - with a USB serial: that serial's record, when it has the same config and install stamp;
 * - without one: the single record with that config and install stamp.
 * Anything else (a new install stamp, an unknown serial, two candidates, nothing stored) is null: read it afresh.
 */
export function storedLayout(records: { identity: SaberIdentity }[], serial: string | null, version: { config: string | null; installed: string | null } | null): BladeLayout | null {
  if (!version?.config || !version.installed) return null;
  const sameBuild = (id: SaberIdentity) => id.configName === version.config && id.installed === version.installed;
  const layout = (id: SaberIdentity): BladeLayout | null => (id.pixelBlades.length ? { pixelBlades: [...id.pixelBlades], bladeConfig: id.bladeConfig } : null);
  if (serial) {
    const mine = records.find((r) => r.identity.usbSerial === serial);
    return mine && sameBuild(mine.identity) ? layout(mine.identity) : null;
  }
  const candidates = records.filter((r) => sameBuild(r.identity));
  return candidates.length === 1 ? layout(candidates[0].identity) : null;
}

export type RecoveryOutcome = 'recovered' | 'lost';
export interface RecoveryDeps {
  /** Close the port and open it again, with a new client. Throws when it does not open. */
  reopen: () => Promise<void>;
  /** Read the saber again on the new client. False when it is silent again. */
  reread: () => Promise<boolean>;
  log: (line: string) => void;
  now?: () => number;
}

/**
 * A connected saber that goes silent mid-command is given one reopen of its port, as the Connect button does, and is
 * read again (usb-power-connect D3). One recovery at a time: a second silence while one is under way joins it.
 * `count` grows with each recovery started; `since(n)` resolves to the outcome of the latest one if any started
 * after `n` was read, or null, so an operation can tell whether its own turn met a stall.
 */
export function createRecovery(deps: RecoveryDeps) {
  const now = deps.now ?? (() => Date.now());
  let current: Promise<RecoveryOutcome> | null = null;
  let latest: Promise<RecoveryOutcome> = Promise.resolve('recovered');
  let count = 0;
  const run = async (why: string): Promise<RecoveryOutcome> => {
    const started = now();
    deps.log(`paused: ${why}, reconnecting`);
    try {
      await deps.reopen();
      if (!(await deps.reread())) { deps.log('reconnect failed: still silent after the port was opened again'); return 'lost'; }
    } catch (err) {
      deps.log(`reconnect failed: ${String(err)}`);
      return 'lost';
    }
    deps.log(`reconnected after ${now() - started} ms`);
    return 'recovered';
  };
  return {
    get count() { return count; },
    get active() { return current !== null; },
    start(why: string): Promise<RecoveryOutcome> {
      if (current) return current;
      count++;
      const p = run(why).finally(() => { if (current === p) current = null; });
      current = p;
      latest = p;
      return p;
    },
    since(n: number): Promise<RecoveryOutcome | null> {
      return count === n ? Promise.resolve(null) : latest;
    },
  };
}
export type Recovery = ReturnType<typeof createRecovery>;

// What the saber's list must show for a list operation to count as made, judged after a stall (D5). The source is
// recognised by name and font: positions are what the operation changed.
const samePreset = (a: PresetRecord | undefined, b: PresetRecord | undefined) => !!a && !!b && a.name === b.name && a.font === b.font;
/** A duplicate of `before[pos - 1]` placed at `pos`. */
export function duplicateShown(before: PresetRecord[], after: PresetRecord[], pos: number): boolean {
  return after.length === before.length + 1 && samePreset(after[pos], before[pos - 1]);
}
export function deleteShown(before: PresetRecord[], after: PresetRecord[]): boolean {
  return after.length === before.length - 1;
}
/** The preset that was at `from` now at `to`. */
export function moveShown(before: PresetRecord[], after: PresetRecord[], from: number, to: number): boolean {
  return after.length === before.length && samePreset(after[to], before[from]);
}

/**
 * Whether the saber's card is shared with the computer, from its answer to `sd` (bare, `sd 0` or `sd 1`): true for
 * `SD Access ON`, false for `SD Access OFF`, null for anything else, such as firmware without `MOUNT_SD_SETTING`
 * answering `Whut?` (card-safety D1).
 */
export function parseSdAccess(lines: string[]): boolean | null {
  for (const l of lines) {
    const m = /SD Access (ON|OFF)\b/.exec(l);
    if (m) return m[1] === 'ON';
  }
  return null;
}

/**
 * How long `sd 1` and `sd 0` may be quiet before the link is called stalled. Before it answers, the saber waits for
 * its sound to stop and lets go of its card (or takes it back): a Proffieboard V3 was silent for more than 10 s after
 * `sd 1` on 2026-11-18, which the ordinary 10 s limit took for a stall. 45 s is well past that and still ends the
 * wait for a saber that really has stopped answering; then the usual reopen applies (usb-power-connect D3).
 */
export const CARD_ACCESS_SILENCE_MS = 45_000;
const CARD_ACCESS = /^\s*sd\s+[01]\s*$/;

/**
 * The send options for a command: `sd 1` and `sd 0` get their own silence limit, and a total limit past it; every
 * other command is sent with its options unchanged. On an untagged board (ProffieOS 7) a response ends after a quiet
 * spell, so there the answer line ends it instead, and the quiet spell allowed is the same long one.
 */
export function sendOptionsFor(command: string, opts: SendOptions | undefined, tagged: boolean): SendOptions | undefined {
  if (!CARD_ACCESS.test(command)) return opts;
  const timeoutMs = Math.max(opts?.timeoutMs ?? 0, CARD_ACCESS_SILENCE_MS + 15_000);
  if (tagged) return { ...opts, silentMs: CARD_ACCESS_SILENCE_MS, timeoutMs };
  return { ...opts, silentMs: CARD_ACCESS_SILENCE_MS, timeoutMs, idleMs: CARD_ACCESS_SILENCE_MS, until: (l) => /SD Access (ON|OFF)\b/.test(l) };
}
