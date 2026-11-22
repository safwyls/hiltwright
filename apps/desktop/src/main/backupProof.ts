// Main's own proof that a board was just read before it is written (issue #29). The page's install and restore
// sequences read the board's flash first (installFlow.ts takeBackup); main used to trust them to. Now every read main
// makes for a saber is recorded here, and a write or a restore to that board needs a fresh record, which it uses up.
//
// What counts follows issue #12. An install goes on after a read that is a backup (firmware) or of a blank board
// (erased); after one that is not a backup (unusable, partial) only when the owner said to install without one, which
// the page passes along as `noBackup`. A restore goes on after any read, a failed one included: the backup it writes
// was checked, and a board a write left unreadable is the one that needs it. Either way the read must have happened.

import type { BoardType } from '../shared/boards';

/** A saber id as the library makes them (library.ts: six random bytes in hex). Anything else names no saber's folder. */
export const SABER_ID = /^[0-9a-f]{12}$/;

/** What the read was: as flash.ts judges it, or 'failed' when dfu-util could not read the board at all. */
export type ReadKind = 'firmware' | 'erased' | 'unusable' | 'partial' | 'failed';

export interface BackupRecord { saberId: string; serial: string | null; board: BoardType | null; kind: ReadKind; at: number }

/** How long a read stays fresh: the longest install between its backup and its write is well under a minute. */
export const PROOF_FRESH_MS = 10 * 60 * 1000;

export const NO_FRESH_READ = "This board was not read just before, so nothing was written. Press Install again: Hiltwright reads the board's firmware before it writes.";
export const NO_FRESH_READ_RESTORE = "This board was not read just before, so nothing was written. Press Restore again: Hiltwright reads the board's firmware before it puts a backup back.";
export const NOT_A_BACKUP = 'What was read from this board is not a backup, and installing without one was not chosen, so nothing was written.';
export const BOARD_CHANGED = 'The board in bootloader mode is not the type that was read just before, so nothing was written. Press Install again.';

export type Check = { ok: true; record: BackupRecord } | { ok: false; text: string };

export class BackupProofs {
  // One record per saber and serial: a newer read replaces an older one.
  private records = new Map<string, BackupRecord>();
  constructor(private now: () => number = Date.now) {}

  private key(saberId: string, serial: string | null) { return `${saberId}\u0000${serial ?? ''}`; }

  /** Remember that main just read this saber's board (with this serial; null for a board that gave none). */
  record(r: Omit<BackupRecord, 'at'>): void {
    this.records.set(this.key(r.saberId, r.serial), { ...r, at: this.now() });
  }

  /** The fresh record for this saber and serial, used up when `use` says it passes. */
  private take(saberId: string, serial: string | null, use: (r: BackupRecord) => string | null, stale: string): Check {
    const k = this.key(saberId, serial);
    const r = this.records.get(k);
    if (!r || this.now() - r.at > PROOF_FRESH_MS || this.now() < r.at) { this.records.delete(k); return { ok: false, text: stale }; }
    const why = use(r);
    if (why) return { ok: false, text: why };
    this.records.delete(k);
    return { ok: true, record: r };
  }

  /**
   * May firmware be written to this board? Only after a fresh read of it for this saber: a backup or a blank board, or,
   * with `noBackup` (the owner chose to install without one), a read that could not be a backup. `board`: the board
   * type the bootloader reports now; it must be the one read.
   */
  forWrite(saberId: string, serial: string | null, board: BoardType | null, noBackup: boolean): Check {
    return this.take(saberId, serial, (r) => {
      if (r.board && board && r.board !== board) return BOARD_CHANGED;
      if (r.kind === 'firmware' || r.kind === 'erased') return null;
      if (noBackup && (r.kind === 'unusable' || r.kind === 'partial')) return null;
      return NOT_A_BACKUP;
    }, NO_FRESH_READ);
  }

  /** May a backup be put back on this board? Only after a fresh read of it for this saber, whatever that read found. */
  forRestore(saberId: string, serial: string | null): Check {
    return this.take(saberId, serial, () => null, NO_FRESH_READ_RESTORE);
  }
}
