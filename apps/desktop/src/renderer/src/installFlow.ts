// The install and restore sequences of Build & Flash, as plain functions: the calls to the flasher and the board
// come in as arguments, and every change to the page is a report. Build.tsx wraps them with the real calls and its
// state; tests drive them with fakes.
//
// Which board is written (install-target-safety): a connected saber is rebooted and the one bootloader that appears is
// its own; a board already in its bootloader is used only when its USB serial is this saber's, or the owner says it
// is. The bootloader's flash size must be the build's board. Every refusal comes before anything is read or written.
//
// Safety nets (install-safety-nets): a backup counts only when it reads back as firmware (an erased board goes on; a
// restore goes on whatever the board holds, and an install does when the owner says so, issue #12);
// a stop before the write sends this saber's board back to its firmware; the record is written as soon as the write
// succeeds; and the install is checked against what the saber reports once it is back.
//
// Staged presets (safe-staged-install): nothing is removed before the reboot. Only once the new firmware is installed
// and checked are the saber's presets files removed and the saber restarted, and the list stops being staged only when
// the saber then reports the staged presets.

import type { PresetRecord, SaberConfigModel, VersionInfo } from '@hiltwright/core';
import type { BackupInfo, BuildResult, FlashTarget, HiltwrightApi, SaberPatch, SaberRecord } from '../../shared/api';
import { BACK_ON_FIRMWARE, IGNORED_REBOOT, LEAVE_BOOTLOADER, NOTHING_TO_BACK_UP, NO_BOOTLOADER, NO_DRIVER_FOR_CHECK, SEVERAL_BOOTLOADERS, backupSizeMismatch, otherSaber, unknownBoard, wrongBoard, type BoardType } from '../../shared/boards';

export type InstallStep = 'backup' | 'bootloader' | 'driver' | 'writing' | 'verifying' | 'done' | 'failed' | 'built';
export interface InstallNote { tone: 'green' | 'amber' | 'red'; text: string }
/**
 * A change to the page: any of the step, the note (null clears it), further notes under it (a record problem, a blank
 * board), and the transfer progress.
 */
export interface InstallReport { step?: InstallStep; note?: InstallNote | null; notes?: InstallNote[]; xfer?: number }

/**
 * How long a reboot into the bootloader may take. Set from twenty reboots each on the V2.2 hote2 and the V3.9
 * (install-safety-nets 1.1).
 */
export const BOOTLOADER_WAIT_MS = 45000;
/** How long the saber may take to run its firmware again after a write, a restore or a leave. */
export const RUNTIME_WAIT_MS = 25000;

export interface InstallDeps {
  flash: Pick<HiltwrightApi['flash'], 'usb' | 'waitForBootloader' | 'target' | 'leave' | 'backup' | 'write' | 'restore' | 'waitForRuntime'>;
  snapshots: Pick<HiltwrightApi['snapshots'], 'save'>;
  /** Remember what this saber's bootloader showed (its serial and flash size). */
  noteBootloader: HiltwrightApi['library']['noteBootloader'];
  /** Every saber Hiltwright knows, to name the one a board in its bootloader belongs to. */
  sabers: SaberRecord[];
  /** Ask the owner whether the board in its bootloader, which Hiltwright cannot place, is this saber. */
  confirmTarget: (saberName: string) => Promise<boolean>;
  /**
   * Ask the owner whether to install with no backup, when the board was read but what it holds cannot be a backup (a
   * write that did not finish, a protected or damaged read). Absent, or no: the install stops (issue #12).
   */
  confirmNoBackup?: (saberName: string, why: string) => Promise<boolean>;
  /** The parts of the board link (board.ts useBoard) the sequences use. Described here so tests need no browser. */
  board: {
    info: { presets: PresetRecord[] } | null;
    send(command: string, opts: { idleMs: number }): Promise<unknown>;
    rebootToBootloader(): Promise<boolean>;
    connect(interactive?: boolean, opts?: { serial?: string | null }): Promise<unknown>;
    expectAfterInstall(id: string, configName: string): void;
    /** Reach only this board next, so another saber plugged in is not opened first when this one comes back. */
    reachNext(serial: string | null, hold?: boolean): Promise<boolean>;
    /** The saber on the other end now: after the reconnect, which one was reached. */
    currentSaber(): SaberRecord | null;
    /** Restart the saber's firmware and let go of the port (staged presets are applied this way). */
    restartSaber(): Promise<boolean>;
    /** The presets the saber reported at its last reading. */
    currentPresets(): PresetRecord[] | null;
    updateSaber(patch: SaberPatch, id?: string): Promise<unknown>;
  };
  report: (r: InstallReport) => void;
  sleep: (ms: number) => Promise<void>;
  /**
   * Where the saber's SD card is, for staged presets: `reader` is its card in a card reader on this computer (its
   * presets files are removed there), `out` that the saber cannot read a card and none of its own is in a reader.
   * Absent or `saber`: the card is in the saber, and the saber removes them. `cleared` says whether the card trip
   * removed its presets file for this staged list (by its start time); only then is nothing removed (issue #13).
   */
  card?: { where: 'saber'; cleared?: (saberId: string, stagedAt: string) => boolean } | { where: 'reader'; root: string; clearPresets: (root: string, saberId: string) => Promise<string[]> } | { where: 'out' };
}
/**
 * What is being installed: the saber, the model the build was made from, the build, what the saber last reported,
 * and whether it is connected now (a connected saber is rebooted; otherwise a board already in its bootloader is used).
 */
export interface InstallJob { saber: SaberRecord; model: SaberConfigModel | null; result: BuildResult; info: { version: VersionInfo | null } | null; connected?: boolean }

/**
 * The board an install or restore writes to. `observed`: seen appearing after this saber's own reboot. `asked`: the
 * owner said so. `pairable`: asked, and this saber's running serial was not present then, so seeing it appear after
 * the write proves the board was this saber.
 */
interface Target { serial: string | null; observed: boolean; asked: boolean; pairable?: boolean }

/** Shown under a stopped install or restore. */
export const STOPPED_HINT = 'If the saber does not show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Install again. A backup can always be put back from the Backups tab.';

/** A USB serial belongs to a saber when it is the one it runs with, or the one its bootloader showed before. */
const belongsTo = (s: SaberRecord, serial: string | null) => !!serial && (s.identity.usbSerial === serial || s.bootloader?.serial === serial);

const fail = (deps: InstallDeps, text: string, tone: InstallNote['tone'] = 'red', notes: InstallNote[] = []) => deps.report({ step: 'failed', note: { tone, text }, notes });

/**
 * Stop with this saber's board in its bootloader and nothing written: send it back to its firmware and reconnect, then
 * report the stop. Only when that fails is the owner told to press RESET (FW29).
 */
async function stopInBootloader(deps: InstallDeps, saber: SaberRecord, target: Target, text: string, notes: InstallNote[] = []): Promise<void> {
  const { flash, board } = deps;
  let back = false;
  try {
    if ((await flash.leave(target.serial)).ok) {
      const serial = runningSerial(saber, target);
      if (serial) await board.reachNext(serial);
      back = await flash.waitForRuntime(RUNTIME_WAIT_MS, serial);
      if (back) { await deps.sleep(1500); await board.connect(false, { serial }); }
    }
  } catch { back = false; }
  fail(deps, `${text} ${back ? BACK_ON_FIRMWARE : LEAVE_BOOTLOADER}`, 'red', notes);
}

/**
 * Bring this saber to its bootloader and say which board that is. A connected saber is rebooted, and the bootloader
 * that appears is its own. Otherwise one already there is used when its serial is this saber's, refused when it is
 * another saber's, and asked about when it is nobody's. Null: stopped (reported), or waiting on the driver.
 */
async function reachBootloader(deps: InstallDeps, saber: SaberRecord, connected: boolean): Promise<Target | null> {
  const { flash, board } = deps;
  const usb = await flash.usb();
  if (connected) {
    const was = usb.bootloaders.map((b) => b.serial);
    const touched = await board.rebootToBootloader();
    if (!touched) { fail(deps, 'Could not reboot the saber into bootloader mode. Hold BOOT, tap RESET, release BOOT, then press Install again.'); return null; }
    const boot = await flash.waitForBootloader(BOOTLOADER_WAIT_MS, was);
    if (boot.serials.length > 1) { fail(deps, SEVERAL_BOOTLOADERS); return null; }
    if (!boot.ok) {
      // The board is there but Windows has no WinUSB driver for it: a one-time step, then the install resumes.
      if (boot.serials.length === 1) { deps.report({ step: 'driver', note: null }); return null; }
      // No bootloader: a saber still running its firmware ignored the reboot (FW29), rather than vanishing.
      const own = saber.identity.usbSerial;
      if (own && (await flash.usb()).runtimeSerials.includes(own)) { fail(deps, IGNORED_REBOOT); return null; }
      fail(deps, boot.text); return null;
    }
    const serial = boot.serials[0] ?? null;
    // The bootloader that appeared may not be this saber's (issue #4): another saber put into bootloader mode while this
    // one ignored or delayed its reboot. A board's bootloader shows the same serial as its running firmware, so:
    // another saber's serial is refused; one that is not this saber's is never taken as certain.
    const other = deps.sabers.find((s) => s.id !== saber.id && belongsTo(s, serial));
    if (other) { fail(deps, `${otherSaber(other.name, saber.name)} ${LEAVE_BOOTLOADER}`); return null; }
    const own = saber.identity.usbSerial;
    if (serial && own && !belongsTo(saber, serial)) {
      if ((await flash.usb()).runtimeSerials.includes(own)) { fail(deps, IGNORED_REBOOT); return null; }
      if (!(await deps.confirmTarget(saber.name))) { deps.report({ step: 'built', note: null }); return null; }
      return { serial, observed: false, asked: true, pairable: false };
    }
    return { serial, observed: true, asked: false };
  }
  const boots = usb.bootloaders;
  const mine = boots.filter((b) => belongsTo(saber, b.serial));
  if (mine.length === 1) return { serial: mine[0].serial, observed: false, asked: false };
  if (boots.length === 0) { fail(deps, NO_BOOTLOADER); return null; }
  if (boots.length > 1) { fail(deps, SEVERAL_BOOTLOADERS); return null; }
  const other = deps.sabers.find((s) => s.id !== saber.id && belongsTo(s, boots[0].serial));
  if (other) { fail(deps, `${otherSaber(other.name, saber.name)} ${LEAVE_BOOTLOADER}`); return null; }
  if (!(await deps.confirmTarget(saber.name))) { deps.report({ step: 'built', note: null }); return null; }
  const own = saber.identity.usbSerial;
  return { serial: boots[0].serial, observed: false, asked: true, pairable: !!own && !usb.runtimeSerials.includes(own) };
}

/**
 * The bootloader's flash size must mean a board Hiltwright knows, and, for an install, the build's board. The pairing
 * is remembered when it is certain: seen after this saber's reboot, or recognised by serial; never on the owner's word.
 */
async function checkTarget(deps: InstallDeps, saber: SaberRecord, target: Target, built: 'V2' | 'V3' | null): Promise<FlashTarget | null> {
  const t = await deps.flash.target(target.serial);
  if (!t.found) { fail(deps, NO_BOOTLOADER); return null; }
  if (!t.board) { await stopInBootloader(deps, saber, target, unknownBoard(t.flashBytes)); return null; }
  // Learnt even when this build is refused: the Wiring page then shows the board the saber really has.
  if (!target.asked && t.flashBytes) { try { await deps.noteBootloader(saber.id, { serial: target.serial, flashBytes: t.flashBytes }); } catch { /* the install goes on; the board is learnt next time */ } }
  if (built && t.board !== built) { await stopInBootloader(deps, saber, target, wrongBoard(t.board, built)); return null; }
  return t;
}

/**
 * The serial to wait for and reconnect to once the saber is back: its own, or, when never read, the bootloader's (a
 * board keeps its serial). None when the owner only said which saber it was: any board coming back will do.
 */
const runningSerial = (saber: SaberRecord, target: Target) => (target.asked ? null : saber.identity.usbSerial ?? target.serial);

/**
 * Read the whole flash to a backup before a write. A firmware read is the backup; an erased read (a blank board) goes
 * on with a note; anything else stops, sending the board back (FW7). Null: stopped.
 *
 * A board left by a write that did not finish cannot be backed up, and that is when it most needs a write (issue #12).
 * So with no `stopWords` (a restore, which writes a checked backup) any other read goes on with a note; for an
 * install a read that is not a backup goes on only when the owner says so. A partial read is kept by main for a
 * diagnosis, never as a backup.
 */
async function takeBackup(deps: InstallDeps, saber: SaberRecord, target: Target, label: string, configName: string | null, stopWords: string | null): Promise<{ file: string | null; notes: InstallNote[] } | null> {
  deps.report({ xfer: 0, step: 'backup' });
  const bak = await deps.flash.backup(saber.id, label, configName, target.serial);
  if (bak.ok && bak.file) return { file: bak.file, notes: [] };
  if (bak.kind === 'erased') return { file: null, notes: [{ tone: 'amber', text: NOTHING_TO_BACK_UP }] };
  const read = bak.kind === 'unusable' || bak.kind === 'partial';
  const kept = read && bak.file ? ` What was read is kept at ${bak.file} in case it helps find the fault. It is not listed as a backup.` : '';
  if (stopWords === null) return { file: null, notes: [{ tone: 'amber', text: `What was on the board could not be backed up, so Hiltwright went on and put back the backup you chose. ${bak.detail}${kept}` }] };
  if (read && deps.confirmNoBackup && (await deps.confirmNoBackup(saber.name, bak.detail))) {
    return { file: null, notes: [{ tone: 'amber', text: `No backup was taken this time: you chose to install without one. ${bak.detail}${kept}` }] };
  }
  // A board whose last write did not finish is not sent to that half-written firmware: it stays where a backup can go back.
  if (bak.kind === 'partial') { fail(deps, `${stopWords} ${bak.detail} The board stays in bootloader mode: put a backup back from the Backups tab.`); return null; }
  await stopInBootloader(deps, saber, target, `${stopWords} ${bak.detail}`);
  return null;
}

/**
 * What the saber reports once it is back, against what was written: its config name and, for a build, the Hiltwright
 * version stamp. Only a reading taken after the write counts (`since`). Null: nothing to compare (not read).
 */
function checkBack(board: InstallDeps['board'], saber: SaberRecord, since: number, expect: { config: string | null; os?: string }): { ok: boolean; reports: string } | null {
  const reached = board.currentSaber();
  if (!reached || reached.id !== saber.id || !(Date.parse(reached.lastSeen) >= since)) return null;
  const { configName, version } = reached.identity;
  const reports = `${configName ?? 'no config name'}, ${version ?? 'no version'}`;
  const ok = (!expect.config || configName === expect.config) && (!expect.os || (version ?? '').startsWith(`${expect.os} hiltwright`));
  return { ok, reports };
}

/**
 * From a board sitting in its bootloader with a usable driver: which board, check it, backup, write, record, wait,
 * reconnect, check. `target` is given when the install sequence rebooted the saber itself.
 */
export async function writeFromBootloader(deps: InstallDeps, job: InstallJob, given?: Target): Promise<void> {
  const { flash, board, report } = deps;
  const { saber, model, result, info } = job;
  if (!result?.ok || !result.dfuPath || !saber) return;
  try {
    const target = given ?? (await reachBootloader(deps, saber, false));
    if (!target) return;
    const checked = await checkTarget(deps, saber, target, result.board);
    if (!checked) return;
    // The board comes back as this saber, reporting this config, whether or not a USB serial can be read.
    const expected = model ? `config/${model.name}.h` : null;
    if (expected) board.expectAfterInstall(saber.id, expected);
    const bak = await takeBackup(deps, saber, target, 'before-install', info?.version?.config ?? null, 'Backup failed, so nothing was written.');
    if (!bak) return;
    const notes = [...bak.notes];
    const kept = bak.file ? ` Backup of the previous firmware: ${bak.file}` : '';
    const serial = runningSerial(saber, target);
    // From here, the saber coming back is the only board the page may open (HW-2026-09-25c).
    if (serial) await board.reachNext(serial);
    report({ xfer: 0, step: 'writing' });
    const w = await flash.write(saber.id, result.dfuPath, target.serial);
    // Main would not write it (FW10): nothing was written, so this is a stop before the write.
    if (w.refused) { await stopInBootloader(deps, saber, target, w.detail, notes); return; }
    // A failed write leaves a partial image: the board stays in its bootloader, where a backup can be put back.
    if (!w.ok) { report({ step: 'failed', note: { tone: 'red', text: `Writing failed.${bak.file ? ` The backup from just now is at ${bak.file}.` : ''} ${w.detail}` }, notes }); return; }
    const written = Date.now();
    // The record describes the new firmware from now on, whether or not the saber comes back in time (FW9). Staged
    // presets stay staged: the saber keeps its own until they are applied after the check.
    if (model && result.manifest) {
      try { await board.updateSaber({ model, firmware: { ...result.manifest, os: result.os, at: new Date().toISOString() } }, saber.id); } catch (err) {
        notes.push({ tone: 'amber', text: `Installed, but Hiltwright could not update its record of the saber: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` });
      }
    }
    report({ step: 'verifying' });
    const back = await flash.waitForRuntime(RUNTIME_WAIT_MS, serial);
    if (!back) { report({ step: 'failed', note: { tone: 'amber', text: 'The firmware was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' }, notes }); return; }
    // The owner said which saber this was, and its running serial appeared only now: the pairing is certain.
    const own = saber.identity.usbSerial;
    const cameBackAs = target.pairable && own && (await flash.usb()).runtimeSerials.includes(own);
    if (cameBackAs && checked.flashBytes) { try { await deps.noteBootloader(saber.id, { serial: target.serial, flashBytes: checked.flashBytes }); } catch { /* learnt next time */ } }
    await deps.sleep(1500);
    await board.connect(false, { serial: cameBackAs ? own : serial });
    let reached = board.currentSaber();
    // The install is checked against what the saber now reports (FW12). A saber back on USB may not answer for
    // 20 s or more (hote2, install-safety-nets 1.1), so a failed reading gets one more try.
    let check = checkBack(board, saber, written, { config: expected, os: result.os });
    if (!check && !(reached && reached.id !== saber.id)) {
      await deps.sleep(10000);
      await board.connect(false, { serial: cameBackAs ? own : serial });
      reached = board.currentSaber();
      check = checkBack(board, saber, written, { config: expected, os: result.os });
    }
    const note: InstallNote = reached && reached.id !== saber.id
      ? { tone: 'amber', text: `Installed on ${saber.name}. Reconnected to ${reached.name}, which is also plugged in, so the install was not checked.${kept}` }
      : !check
        ? { tone: 'amber', text: `The firmware was written, but the saber could not be read to check it. Press Connect to read it.${kept}` }
        : check.ok
          ? { tone: 'green', text: `Installed and checked: the saber reports ${check.reports}.${kept}` }
          : { tone: 'amber', text: `The firmware was written, but the saber reports ${check.reports} instead of ${expected ?? 'this build'}, ${result.os} hiltwright. If it misbehaves, put the backup from just now back from the Backups tab.${kept}` };
    report({ step: 'done', note, notes });
    // Staged presets go on only now, on this saber, with the install checked.
    if (model?.presetsFrom) {
      const ours = check?.ok && !(reached && reached.id !== saber.id);
      if (!ours) { report({ notes: [...notes, keepStaged('The install could not be checked, so the saber keeps its own presets for now.')] }); return; }
      report({ notes: [...notes, { tone: 'amber', text: 'Putting your staged presets on the saber: it restarts once more.' }] });
      report({ notes: [...notes, await applyStagedPresets(deps, saber, model, cameBackAs ? own : serial)] });
    }
  } catch (err) {
    report({ step: 'failed', note: { tone: 'red', text: String(err) } });
  }
}

/** The install sequence. The renderer does the reboot because it owns the serial port. */
export async function installSequence(deps: InstallDeps, job: InstallJob): Promise<void> {
  const { board, report } = deps;
  const { saber, model, result } = job;
  if (!result?.ok || !result.dfuPath || !saber) return;
  try {
    // A saber whose board is known from an earlier install is never rebooted for firmware built for the other one.
    if (saber.bootloader && saber.bootloader.board !== result.board) { fail(deps, wrongBoard(saber.bootloader.board, result.board)); return; }
    report({ step: 'bootloader' });
    // Staged presets are not touched here: they are applied after the install is checked (applyStagedPresets).
    const target = await reachBootloader(deps, saber, !!job.connected);
    if (!target) return;
    await writeFromBootloader(deps, job, target);
  } catch (err) {
    report({ step: 'failed', note: { tone: 'red', text: String(err) } });
  }
}

/** The staged list stays staged: why, and how to try again. */
const keepStaged = (why: string): InstallNote => ({ tone: 'amber', text: `${why} Your staged presets are still waiting; press "Use the staged presets" on Build & Flash to try again.` });

/** Style arguments as words, so spacing does not count. */
const argWords = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).join(' ');

/**
 * The saber reports the staged list as its firmware compiled it: the same names, fonts and tracks in this order. A
 * change to only a track, or to a colour, must show too (issue #13), so more is compared than the names:
 * - the variation is 0: a compiled preset starts there, and only a presets file keeps another;
 * - each style is the firmware's own (`builtin`), with no arguments, or the ones the list gives that blade. A named
 *   style or other arguments come from a presets file. With no arguments the compiled defaults are used, which the
 *   saber does not print, so a colour compiled into the style cannot be told apart that way.
 */
export function samePresets(
  saber: { name: string; font: string; track?: string; variation?: number; styles?: string[] }[],
  list: { name: string; font: string; track?: string; styles?: { kind: string; args?: string }[] }[],
): boolean {
  return saber.length === list.length && saber.every((p, i) => {
    const want = list[i];
    if (p.name.trim() !== want.name.trim() || p.font.trim() !== want.font.trim()) return false;
    if (p.track !== undefined && want.track !== undefined && p.track.trim() !== want.track.trim()) return false;
    if (p.variation !== undefined && p.variation !== 0) return false;
    return (p.styles ?? []).every((s) => {
      const m = /^builtin\s+\d+\s+(\d+)(?:\s+(.*))?$/.exec(s.trim());
      if (!m) return false;
      if (!argWords(m[2])) return true;
      const style = want.styles?.[Number(m[1]) - 1];
      return !!style && argWords(style.args) === argWords(m[2]);
    });
  });
}

export const STAGED_ON = 'Your staged presets are on the saber now; its previous presets are kept as a snapshot.';

/**
 * Put staged presets on a saber whose firmware already carries them (safe-staged-install D1): snapshot what it has,
 * remove its presets files, restart it so it starts with the compiled presets, and read them back. Only when the
 * saber reports the staged list is the list settled. Anything else leaves it staged, and says why.
 */
export async function applyStagedPresets(deps: Pick<InstallDeps, 'flash' | 'snapshots' | 'board' | 'sleep' | 'card'>, saber: SaberRecord, model: SaberConfigModel, serial: string | null): Promise<InstallNote> {
  const { flash, board } = deps;
  const card = deps.card ?? { where: 'saber' as const };
  // With its card out, the saber starts with its firmware's presets anyway and would report the staged list; the card's
  // own presets.ini would win again once it is back. So the file must go from the card itself, wherever it is.
  if (card.where === 'out') return keepStaged(`${saber.name}'s SD card is out of the saber, so its presets file could not be removed. Put the card back in the saber, or in a card reader on this computer, then apply the staged presets again.`);
  try {
    const own = board.currentPresets();
    if (!own) return keepStaged("The saber's presets could not be read, so they were not replaced.");
    // Its presets file went when the card was prepared in a reader (the card trip on Install › Card, which kept the
    // snapshot): the saber, with its card back, already starts with the staged list. Nothing to remove or restart.
    // Only when the trip really removed it for this list: a presets file with the same names would otherwise be
    // taken for the staged list, and a change to a track or colour reported as installed (issue #13).
    const clearedOnTrip = card.where === 'saber' && !!model.presetsFrom && !!card.cleared?.(saber.id, model.presetsFrom.at);
    if (clearedOnTrip && samePresets(own, model.presets)) {
      const { presetsFrom: _applied, ...settled } = model;
      try { await board.updateSaber({ model: settled }, saber.id); } catch (err) {
        return { tone: 'amber', text: `Your staged presets are on the saber now, but Hiltwright could not update its record of the saber: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` };
      }
      return { tone: 'green', text: 'Your staged presets are on the saber now; its previous presets were kept as a snapshot when the card was prepared.' };
    }
    // With the card in the saber, what it reports is what its card holds: that is kept. With the card in a reader, the
    // saber reports its firmware's list (the staged one), so the card's own files are kept by main instead (issue #7).
    if (card.where !== 'reader') {
      try { await deps.snapshots.save(saber.id, 'Before install with staged presets', own); } catch {
        return keepStaged("A snapshot of the saber's presets could not be kept, so they were not replaced.");
      }
    }
    if (card.where === 'reader') {
      try { await card.clearPresets(card.root, saber.id); } catch (err) {
        return keepStaged(`The presets file on the card in the reader (${card.root}) could not be removed: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}.`);
      }
    } else {
      // ProffieOS's del says nothing either way; what the saber reports after its restart is the check.
      await board.send('del presets.ini', { idleMs: 400 });
      await board.send('del presets.tmp', { idleMs: 400 });
    }
    if (!(await board.restartSaber())) return keepStaged('The saber could not be restarted to pick up the staged presets.');
    // Let the USB device go before waiting for it to come back.
    await deps.sleep(1500);
    if (serial) await board.reachNext(serial);
    if (!(await flash.waitForRuntime(RUNTIME_WAIT_MS, serial))) return keepStaged('The saber has not come back after its restart. Unplug and replug it, then press Connect.');
    await deps.sleep(1500);
    await board.connect(false, { serial });
    const now = board.currentPresets();
    if (!now || !samePresets(now, model.presets)) return keepStaged('The saber still reports its own presets after its restart.');
    const { presetsFrom: _applied, ...settled } = model;
    try { await board.updateSaber({ model: settled }, saber.id); } catch (err) {
      return { tone: 'amber', text: `Your staged presets are on the saber now, but Hiltwright could not update its record of the saber: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` };
    }
    return { tone: 'green', text: card.where === 'reader' ? `${STAGED_ON} Their old presets file is gone from the card in the reader (${card.root}): put the card back in the saber before you use it.` : STAGED_ON };
  } catch (err) {
    return keepStaged(`Putting the staged presets on the saber stopped: ${String(err)}.`);
  }
}

/** What checking the board found, in the words the Wiring page shows. */
export interface BoardCheck { tone: InstallNote['tone']; text: string; board: BoardType | null }

/**
 * Find out which board a connected saber has without installing anything (design D8): reboot it into its bootloader,
 * read the flash size, remember it, send the saber back to its firmware and reconnect. Nothing is read beyond four
 * bytes, and nothing is written.
 */
export async function checkBoard(deps: Pick<InstallDeps, 'flash' | 'noteBootloader' | 'board' | 'sleep'>, saber: SaberRecord): Promise<BoardCheck> {
  const { flash, board } = deps;
  try {
    const was = (await flash.usb()).bootloaders.map((b) => b.serial);
    if (!(await board.rebootToBootloader())) return { tone: 'red', text: 'Could not reboot the saber into bootloader mode, so the board was not checked. Nothing was changed.', board: null };
    const boot = await flash.waitForBootloader(BOOTLOADER_WAIT_MS, was);
    if (boot.serials.length > 1) return { tone: 'red', text: `${SEVERAL_BOOTLOADERS} ${LEAVE_BOOTLOADER}`, board: null };
    if (!boot.ok) {
      if (boot.serials.length === 1) return { tone: 'amber', text: `${NO_DRIVER_FOR_CHECK} ${LEAVE_BOOTLOADER}`, board: null };
      return { tone: 'red', text: `The saber did not appear in bootloader mode, so the board was not checked. ${LEAVE_BOOTLOADER}`, board: null };
    }
    const serial = boot.serials[0] ?? null;
    // Another board that entered bootloader mode during the wait is not this saber: nothing is read or remembered (issue #4).
    const own = saber.identity.usbSerial;
    if (serial && own && !belongsTo(saber, serial)) return { tone: 'red', text: `The board that appeared in bootloader mode is not ${saber.name}, so nothing was checked or remembered. ${LEAVE_BOOTLOADER}`, board: null };
    const t = await flash.target(serial);
    // Seen appearing after this saber's own reboot: certain, so remembered.
    if (t.board && t.flashBytes) { try { await deps.noteBootloader(saber.id, { serial, flashBytes: t.flashBytes }); } catch { /* shown below all the same */ } }
    const found = t.board ? `This saber is a Proffieboard ${t.board}.` : unknownBoard(t.flashBytes);
    const left = await flash.leave(serial);
    if (!left.ok) return { tone: 'amber', text: `${found} Hiltwright could not send it back to its firmware. ${LEAVE_BOOTLOADER}`, board: t.board };
    const running = saber.identity.usbSerial ?? serial;
    if (running) await board.reachNext(running);
    const back = await flash.waitForRuntime(RUNTIME_WAIT_MS, running);
    if (!back) return { tone: 'amber', text: `${found} The saber has not reappeared yet. Unplug and replug it, then press Connect.`, board: t.board };
    await deps.sleep(1500);
    await board.connect(false, { serial: running });
    return t.board
      ? { tone: 'green', text: `${found} Nothing was written.`, board: t.board }
      : { tone: 'amber', text: `${found} Choose the board yourself.`, board: null };
  } catch (err) {
    return { tone: 'red', text: `${String(err)} ${LEAVE_BOOTLOADER}`, board: null };
  }
}

/**
 * Put a backup back, through the same bootloader sequence and the same checks, plus the backup's size. What is on the
 * board is backed up first, as for an install (FW8). `connected: false` uses a board already in its bootloader (after
 * the driver step, say).
 */
export async function restoreSequence(deps: InstallDeps, saber: SaberRecord, b: BackupInfo, connected: boolean): Promise<void> {
  const { flash, board, report } = deps;
  try {
    report({ step: 'bootloader' });
    const target = await reachBootloader(deps, saber, connected);
    if (!target) return;
    const t = await checkTarget(deps, saber, target, null);
    if (!t) return;
    if (t.flashBytes && b.bytes !== t.flashBytes) { await stopInBootloader(deps, saber, target, backupSizeMismatch(b.bytes, t.flashBytes)); return; }
    // What is on the board cannot stop the restore (issue #12): the backup going back was checked as firmware for
    // this board's size, and a board a write left unreadable is the one that needs it.
    const bak = await takeBackup(deps, saber, target, 'before-restore', saber.identity.configName ?? null, null);
    if (!bak) return;
    const notes = [...bak.notes];
    // The restored firmware reports the config it had when this backup was taken; expect the saber back with it.
    if (b.configName) board.expectAfterInstall(saber.id, b.configName);
    const serial = runningSerial(saber, target);
    if (serial) await board.reachNext(serial);
    report({ xfer: 0, step: 'writing' });
    const w = await flash.restore(saber.id, b.file, target.serial);
    if (!w.ok) { report({ step: 'failed', note: { tone: 'red', text: `The backup was not written.${bak.file ? ` What was on the board is kept at ${bak.file}.` : ''} ${w.detail}` }, notes }); return; }
    const written = Date.now();
    // The restored firmware is not the one Hiltwright built: the record forgets the manifest now, so styles and
    // colours are not mislabelled even if the saber is slow to come back (FW9).
    try { await board.updateSaber({ firmware: null }, saber.id); } catch (err) {
      notes.push({ tone: 'amber', text: `Restored, but Hiltwright could not update its record of the saber: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` });
    }
    report({ step: 'verifying' });
    const back = await flash.waitForRuntime(RUNTIME_WAIT_MS, serial);
    if (!back) { report({ step: 'failed', note: { tone: 'amber', text: 'The backup was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' }, notes }); return; }
    await deps.sleep(1500);
    await board.connect(false, { serial });
    const reached = board.currentSaber();
    const when = new Date(b.at).toLocaleString();
    const check = b.configName ? checkBack(board, saber, written, { config: b.configName }) : null;
    const note: InstallNote = reached && reached.id !== saber.id
      ? { tone: 'amber', text: `Restored the backup from ${when} on ${saber.name}. Reconnected to ${reached.name}, which is also plugged in.` }
      : check && !check.ok
        ? { tone: 'amber', text: `The backup from ${when} was written, but the saber reports ${check.reports} instead of ${b.configName}.` }
        : { tone: 'green', text: check ? `Restored the backup from ${when}, and checked: the saber reports ${check.reports}.` : `Restored the backup from ${when}.` };
    report({ step: 'done', note, notes });
  } catch (err) { report({ step: 'failed', note: { tone: 'red', text: String(err) } }); }
}
