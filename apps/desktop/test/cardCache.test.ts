import { beforeEach, describe, expect, it } from 'vitest';
import { cachedCards, cachedRead, forgetCardRead, lastCardRead, rememberCards, rememberRead, sharedLook, sharedRead } from '../src/renderer/src/cardCache';
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

  it('keeps each card read, not just the last, so two cards in turn are not read again', () => {
    rememberRead(card(), read);
    rememberRead(card({ root: 'F:\\', volumeSerial: '0BADF00D' }), { ...read, tracks: [] });
    expect(cachedRead(card())?.tracks).toEqual(read.tracks);
    expect(cachedRead(card({ root: 'F:\\', volumeSerial: '0BADF00D' }))?.tracks).toEqual([]);
  });

  it('shares one look and one read between pages asking at the same moment, and reads again on Look again', async () => {
    const calls = { look: 0, fonts: 0 };
    const c = card();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    (globalThis as unknown as { hiltwright: unknown }).hiltwright = { sd: {
      look: async () => { calls.look++; await gate; return { answered: true, cards: [c], ms: 1 }; },
      listFonts: async () => { calls.fonts++; await gate; return []; },
      listTracks: async () => [],
      voicePack: async () => read.voice,
    } };
    const looks = Promise.all([sharedLook(), sharedLook()]);
    const reads = Promise.all([sharedRead(c), sharedRead(c)]);
    release();
    await looks; await reads;
    expect(calls).toEqual({ look: 1, fonts: 1 });
    await sharedRead(c);
    expect(calls.fonts).toBe(1);
    await sharedRead(c, true);
    expect(calls.fonts).toBe(2);
    await sharedLook();
    expect(calls.look).toBe(2);
  });

  it('the main process counts its writes to each card by drive, whatever the slash', () => {
    const before = cardWrites('Q:\\');
    noteCardWritten('Q:\\'); noteCardWritten('q:');
    expect(cardWrites('Q:')).toBe(before + 2);
    expect(cardWrites('R:\\')).toBe(0);
  });
});
