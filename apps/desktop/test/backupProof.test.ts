// Main's proof that a board was read just before it is written or restored (issue #29), and which reads count, as
// issue #12 decided: an install after a backup or a blank board, or, with the owner's word, after a read that could not
// be a backup; a restore after any read.
import { describe, expect, it } from 'vitest';
import { BOARD_CHANGED, BackupProofs, NOT_A_BACKUP, NO_FRESH_READ, NO_FRESH_READ_RESTORE, PROOF_FRESH_MS, SABER_ID, type ReadKind } from '../src/main/backupProof';

const HOTE2 = '209133815232';
const ID = 'ea8dbea42e78';

function clock() {
  let t = 1_000_000;
  return { now: () => t, pass: (ms: number) => { t += ms; } };
}
const after = (kind: ReadKind, c = clock()) => {
  const p = new BackupProofs(c.now);
  p.record({ saberId: ID, serial: HOTE2, board: 'V2', kind });
  return { p, c };
};

describe('a write needs a fresh read of that board', () => {
  it('with no read at all: refused', () => {
    expect(new BackupProofs().forWrite(ID, HOTE2, 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    expect(new BackupProofs().forWrite(ID, HOTE2, 'V2', true)).toEqual({ ok: false, text: NO_FRESH_READ });
  });

  it('after a backup or a blank board: allowed once, and the read is used up', () => {
    for (const kind of ['firmware', 'erased'] as const) {
      const { p } = after(kind);
      expect(p.forWrite(ID, HOTE2, 'V2', false).ok).toBe(true);
      expect(p.forWrite(ID, HOTE2, 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    }
  });

  it('after a read that is not a backup: only when the owner chose to install without one', () => {
    for (const kind of ['unusable', 'partial'] as const) {
      const { p } = after(kind);
      expect(p.forWrite(ID, HOTE2, 'V2', false)).toEqual({ ok: false, text: NOT_A_BACKUP });
      expect(p.forWrite(ID, HOTE2, 'V2', true).ok).toBe(true);
    }
  });

  it('after a read dfu-util could not make: refused, whatever the page says', () => {
    const { p } = after('failed');
    expect(p.forWrite(ID, HOTE2, 'V2', true)).toEqual({ ok: false, text: NOT_A_BACKUP });
  });

  it('for another board, another saber, or a board of another type now: refused', () => {
    expect(after('firmware').p.forWrite(ID, '207A349A5430', 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    expect(after('firmware').p.forWrite(ID, null, 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    expect(after('firmware').p.forWrite('0123456789ab', HOTE2, 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    expect(after('firmware').p.forWrite(ID, HOTE2, 'V3', false)).toEqual({ ok: false, text: BOARD_CHANGED });
  });

  it('a board that gave no serial is matched as such', () => {
    const p = new BackupProofs();
    p.record({ saberId: ID, serial: null, board: 'V2', kind: 'firmware' });
    expect(p.forWrite(ID, null, 'V2', false).ok).toBe(true);
  });

  it('a read older than ten minutes no longer counts', () => {
    const { p, c } = after('firmware');
    c.pass(PROOF_FRESH_MS + 1);
    expect(p.forWrite(ID, HOTE2, 'V2', false)).toEqual({ ok: false, text: NO_FRESH_READ });
    const fresh = after('firmware');
    fresh.c.pass(PROOF_FRESH_MS - 1);
    expect(fresh.p.forWrite(ID, HOTE2, 'V2', false).ok).toBe(true);
  });

  it('a newer read replaces an older one', () => {
    const { p } = after('firmware');
    p.record({ saberId: ID, serial: HOTE2, board: 'V2', kind: 'unusable' });
    expect(p.forWrite(ID, HOTE2, 'V2', false)).toEqual({ ok: false, text: NOT_A_BACKUP });
  });
});

describe('a restore needs a fresh read of that board, whatever it found', () => {
  it('after any read: allowed once', () => {
    for (const kind of ['firmware', 'erased', 'unusable', 'partial', 'failed'] as const) {
      const { p } = after(kind);
      expect(p.forRestore(ID, HOTE2).ok).toBe(true);
      expect(p.forRestore(ID, HOTE2)).toEqual({ ok: false, text: NO_FRESH_READ_RESTORE });
    }
  });

  it('with no read, or one of another board: refused', () => {
    expect(new BackupProofs().forRestore(ID, HOTE2)).toEqual({ ok: false, text: NO_FRESH_READ_RESTORE });
    expect(after('firmware').p.forRestore(ID, '207A349A5430')).toEqual({ ok: false, text: NO_FRESH_READ_RESTORE });
  });
});

describe('saber ids', () => {
  it('are twelve lower-case hex characters, as the library makes them', () => {
    expect(SABER_ID.test(ID)).toBe(true);
    for (const bad of ['..\\..\\x', 'ea8dbea42e7', 'EA8DBEA42E78', 'ea8dbea42e78/', 'ea8dbea42e78\n']) expect(SABER_ID.test(bad)).toBe(false);
  });
});
