// library-integrity 3.3: a backup remembers the config the saber reported when it was taken, so a restore can expect
// the saber back with it; backups from before this have none.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RESTORE_NO_FLASH_SIZE, listBackups, restoreBackup } from '../src/main/flash';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hw-backups-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// 256 KB that starts like firmware: stack pointer in SRAM, reset vector in flash.
const image = () => { const b = Buffer.alloc(262144); b[3] = 0x20; b[7] = 0x08; return b; };

describe('backups', () => {
  it('carry the config recorded beside them, and older ones have none', async () => {
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), image());
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin.json'), JSON.stringify({ configName: 'config/default_proffieboard_config.h' }));
    writeFileSync(join(dir, '2026-09-24T10-00-00-000Z-before-install.bin'), image());
    writeFileSync(join(dir, '2026-09-23T10-00-00-000Z-before-install.bin'), image());
    writeFileSync(join(dir, '2026-09-23T10-00-00-000Z-before-install.bin.json'), '{ not json');
    const list = await listBackups(dir);
    expect(list.map((b) => [b.at, b.configName, b.valid])).toEqual([
      ['2026-09-25T16:00:00.000Z', 'config/default_proffieboard_config.h', true],
      ['2026-09-24T10:00:00.000Z', null, true],
      ['2026-09-23T10:00:00.000Z', null, true],
    ]);
  });
});

// Baseline audit (baseline-firmware firmware-install 5.15): an erased or wrong-size read is never offered back.
describe('firmware-install audit', () => {
  it('5.15 an erased read: listed as not a usable image, and putting it back is refused', async () => {
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), Buffer.alloc(262144, 0xff));
    const [b] = await listBackups(dir);
    expect(b.valid).toBe(false);
    const r = await restoreBackup(join(dir, 'no-toolchain'), join(dir, b.file), () => undefined);
    expect(r).toEqual({ ok: false, ms: 0, detail: 'That backup does not look like firmware (it may be an erased or protected read), so it was not written.' });
  });

  // Issue #29: with the board's flash size unknown, whether the backup fits cannot be told, so nothing is written (a
  // backup read refuses in the same case).
  it('a good backup with the board\'s flash size unknown: putting it back is refused', async () => {
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), image());
    const lines: string[] = [];
    const r = await restoreBackup(join(dir, 'no-toolchain'), join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), (l) => lines.push(l), '209133815232', null);
    expect(r).toEqual({ ok: false, ms: 0, detail: RESTORE_NO_FLASH_SIZE });
    expect(lines).toEqual([]);
  });

  it('5.15 a wrong-size read that starts like firmware: putting it back is refused', async () => {
    const short = image().subarray(0, 100 * 1024);
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), short);
    const r = await restoreBackup(join(dir, 'no-toolchain'), join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), () => undefined);
    expect(r).toEqual({ ok: false, ms: 0, detail: 'That file is not a full flash backup (256 KB or 512 KB).' });
  });

  // FST-1, fixed by install-safety-nets (design D1): the list checks the size as well as the first bytes.
  it('5.15 a wrong-size read is listed as not a usable image', async () => {
    writeFileSync(join(dir, '2026-09-25T16-00-00-000Z-before-install.bin'), image().subarray(0, 100 * 1024));
    const [b] = await listBackups(dir);
    expect(b.valid).toBe(false);
  });
});
