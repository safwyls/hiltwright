// Issue #9: a card is known by the volume in its drive, not by the drive letter alone. A card swapped for another in
// the same reader is refused before any write (the check runs inside the card's queue, right before writing), and the
// cheap drive poll notices the swap.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SlowDrives, checkSameCard, driveName, mountedRoots, pollLetters, volumeId } from '../src/main/sd';
import { onCard } from '../src/main/cardQueue';
import { drivesKey } from '../src/renderer/src/cardCache';

const made: string[] = [];
const temp = async () => { const d = await mkdtemp(join(tmpdir(), 'hw-cardid-')); made.push(d); return d; };
const sdRoot = process.env.HILTWRIGHT_SD_ROOT;
afterEach(async () => {
  if (sdRoot === undefined) delete process.env.HILTWRIGHT_SD_ROOT; else process.env.HILTWRIGHT_SD_ROOT = sdRoot;
  for (const d of made.splice(0)) await rm(d, { recursive: true, force: true });
});

describe('which card is in a drive (issue #9)', () => {
  it('reads the volume as hex digits, the same for two folders on one volume, and nothing for a drive that does not open', async () => {
    const a = await temp();
    const id = await volumeId(a);
    expect(id).toMatch(process.platform === 'win32' ? /^[0-9A-F]{8}$/ : /^[0-9A-F]{8,}$/);
    expect(await volumeId(await temp())).toBe(id);
    expect(await volumeId(join(a, 'not-there'))).toBeNull();
  });

  it('lets a write through to the card that was read, and refuses another card, a card gone, or one never read', async () => {
    const card = await temp();
    const id = await volumeId(card);
    await expect(checkSameCard(card, id)).resolves.toBeUndefined();
    await expect(checkSameCard(card, id === 'DEADBEEF' ? 'FEEDFACE' : 'DEADBEEF')).rejects.toThrow(`The card in ${card} is not the one Hiltwright read. Look again.`);
    await expect(checkSameCard(card, null)).rejects.toThrow(/not the one Hiltwright read/);
    await expect(checkSameCard(join(card, 'gone'), id)).rejects.toThrow(/not the one Hiltwright read/);
    expect(driveName('E:\\')).toBe('E:');
    expect(driveName('e:')).toBe('E:');
    expect(driveName('/Volumes/SABER')).toBe('/Volumes/SABER');
  });

  it('checks when the write runs, not when it was asked for: a card pulled while a write waits its turn is not written', async () => {
    const card = await temp();
    const id = await volumeId(card);
    let release!: () => void;
    const first = onCard(card, () => new Promise<void>((r) => { release = r; }));
    let written = false;
    const second = onCard(card, async () => { await checkSameCard(card, id); written = true; });
    await rm(card, { recursive: true, force: true });
    release();
    await first;
    await expect(second).rejects.toThrow(/not the one Hiltwright read\. Look again\./);
    expect(written).toBe(false);
  });

  it('the drive poll says which volume is in each drive, so a swap at the same letter changes what it sees', async () => {
    const card = await temp();
    process.env.HILTWRIGHT_SD_ROOT = card;
    expect(await mountedRoots()).toEqual([{ root: card, volumeId: await volumeId(card) }]);
    process.env.HILTWRIGHT_SD_ROOT = join(card, 'not-there');
    expect(await mountedRoots()).toEqual([]);

    const before = drivesKey([{ root: 'E:\\', volumeId: '9E9B2C9D' }, { root: 'F:\\', volumeId: '12345678' }]);
    expect(drivesKey([{ root: 'E:\\', volumeId: '9E9B2C9D' }, { root: 'F:\\', volumeId: '12345678' }])).toBe(before);
    expect(drivesKey([{ root: 'E:\\', volumeId: '5A1C3F0E' }, { root: 'F:\\', volumeId: '12345678' }])).not.toBe(before);
    expect(drivesKey([{ root: 'F:\\', volumeId: '12345678' }])).not.toBe(before);
  });
});

// Issue #26: a letter slow to answer the drive poll is left out only while its ask waits and for a minute after,
// not for the rest of the run. No real drive is asked here: the asks are stand-ins.
describe('a slow drive letter is polled again later (issue #26)', () => {
  it('skips a slow letter while its ask waits and for the backoff, then asks it again; a found card clears it at once', async () => {
    let now = 1_000_000;
    const slow = new SlowDrives(60_000, () => now);
    let finishE!: (id: string | null) => void;
    const asked: string[] = [];
    let eHangs = true;
    const ask = (root: string) => {
      asked.push(root);
      if (root === 'E:\\' && eHangs) return new Promise<string | null>((r) => { finishE = r; });
      return Promise.resolve(root === 'F:\\' ? '12345678' : '9E9B2C9D');
    };
    const poll = () => pollLetters(['E', 'F'], slow, ask, 20);

    expect(await poll()).toEqual([{ root: 'F:\\', volumeId: '12345678' }]);
    expect(slow.skip('E')).toBe(true);

    // Still waiting, long past the backoff: not asked again, so asks do not pile up on a drive that hangs.
    now += 120_000;
    asked.length = 0;
    await poll();
    expect(asked).toEqual(['F:\\']);

    // The ask finishes (the shared card opened); E: is asked once the backoff from when it was slow has passed.
    eHangs = false;
    finishE('9E9B2C9D');
    await Promise.resolve();
    expect(slow.skip('E')).toBe(false);
    expect(await poll()).toEqual([{ root: 'E:\\', volumeId: '9E9B2C9D' }, { root: 'F:\\', volumeId: '12345678' }]);

    // Slow again, then a full look finds a card there: polled again at once, within the backoff.
    eHangs = true;
    await poll();
    expect(slow.skip('E')).toBe(true);
    slow.clear('e:\\');
    expect(slow.skip('E')).toBe(false);
  });

  it('a letter whose ask finished still waits out the backoff', async () => {
    let now = 0;
    const slow = new SlowDrives(60_000, () => now);
    slow.slow('G', Promise.resolve(null));
    await Promise.resolve();
    now = 59_000;
    expect(slow.skip('G')).toBe(true);
    now = 60_000;
    expect(slow.skip('G')).toBe(false);
  });
});
