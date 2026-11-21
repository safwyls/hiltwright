import { beforeEach, describe, expect, it } from 'vitest';
import { cachedCards, cachedRead, forgetCardRead, lastCardRead, rememberCards, rememberRead } from '../src/renderer/src/cardCache';
import { cardWrites, noteCardWritten } from '../src/main/sd';
import type { CardInfo } from '../src/shared/api';

const card = (over: Partial<CardInfo> = {}): CardInfo => ({ root: 'E:\\', label: 'NIHILUS', freeBytes: 20_000_000_000, totalBytes: 32_000_000_000, proffie: true, hasPresetsIni: true, saberSerial: null, fileSystem: 'FAT32', empty: false, volumeSerial: '5A1C3F0E', presets: null, writes: 0, ...over });
const read = { fonts: [], tracks: [{ name: 'tracks/a.wav', size: 1 }], voice: { ini: true, version: 2, menuSounds: true } };

describe('what was read from a card, kept between pages', () => {
  beforeEach(() => forgetCardRead());

  it('is shown again while the same card is in, unchanged', () => {
    rememberCards([card()]);
    rememberRead(card(), read);
    expect(cachedCards()?.map((c) => c.root)).toEqual(['E:\\']);
    expect(cachedRead(card())?.tracks).toEqual(read.tracks);
    expect(lastCardRead()?.root).toBe('E:\\');
  });

  it('is read again when this app wrote to the card, its free space changed, or it is another card', () => {
    rememberRead(card(), read);
    expect(cachedRead(card({ writes: 1 }))).toBeNull();
    expect(cachedRead(card({ freeBytes: 19_000_000_000 }))).toBeNull();
    expect(cachedRead(card({ volumeSerial: '0BADF00D' }))).toBeNull();
    expect(cachedRead(card({ root: 'F:\\' }))).toBeNull();
    expect(cachedRead(null)).toBeNull();
  });

  it('the main process counts its writes to each card by drive, whatever the slash', () => {
    const before = cardWrites('Q:\\');
    noteCardWritten('Q:\\'); noteCardWritten('q:');
    expect(cardWrites('Q:')).toBe(before + 2);
    expect(cardWrites('R:\\')).toBe(0);
  });
});
