import { describe, expect, it } from 'vitest';
import { ownerOfCard, saberCardIn } from '../src/renderer/src/cardOwner';
import type { CardInfo, SaberRecord } from '../src/shared/api';

const preset = (font: string, name: string) => ({ font, track: '', styles: [], name, variation: 0 });
const saber = (id: string, over: Partial<SaberRecord> = {}): SaberRecord => ({
  id, name: id, firstSeen: '', lastSeen: '', fonts: [], tracks: [],
  identity: { usbSerial: `USB${id}`, configName: null, version: null, prop: null, buttons: null, installed: null, pixelBlades: [], bladeConfig: null },
  presets: [preset('Loth_Hero;common', 'Hero'), preset('Dark;common', 'Dark')], ...over,
});
const card = (root: string, over: Partial<CardInfo> = {}): CardInfo => ({ root, label: null, freeBytes: null, totalBytes: null, proffie: true, hasPresetsIni: true, saberSerial: null, fileSystem: 'FAT32', empty: false, volumeSerial: null, presets: null, ...over });

const nihilus = saber('nihilus', { cards: [{ serial: '5A1C3F0E', label: 'NIHILUS', at: '' }] });
const other = saber('other', { presets: [preset('TeensySF', 'Teensy')] });

describe('whose card is this', () => {
  it('the saber sharing it, then a linked serial number, then the presets it holds', () => {
    expect(ownerOfCard(card('H:\\', { saberSerial: 'USBother', volumeSerial: '5A1C3F0E' }), [nihilus, other])).toMatchObject({ saber: { id: 'other' }, by: 'shared' });
    expect(ownerOfCard(card('E:\\', { volumeSerial: '5A1C3F0E', presets: [{ font: 'TeensySF', name: 'Teensy' }] }), [nihilus, other])).toMatchObject({ saber: { id: 'nihilus' }, by: 'linked' });
    // Font case and the extra ;common folder spelling as the saber wrote it are the same preset.
    expect(ownerOfCard(card('E:\\', { presets: [{ font: 'loth_hero;COMMON', name: 'Hero' }, { font: 'Dark;common', name: 'Dark' }] }), [nihilus, other])).toMatchObject({ saber: { id: 'nihilus' }, by: 'presets' });
  });

  it('presets that two sabers share, or none, or a planned saber: not known', () => {
    const twin = saber('twin');
    const theirs = card('E:\\', { presets: [{ font: 'Loth_Hero;common', name: 'Hero' }, { font: 'Dark;common', name: 'Dark' }] });
    expect(ownerOfCard(theirs, [nihilus, twin])).toBeNull();
    expect(ownerOfCard(card('E:\\', { presets: [] }), [nihilus])).toBeNull();
    expect(ownerOfCard(card('E:\\', { volumeSerial: '5A1C3F0E' }), [{ ...nihilus, planned: true }])).toBeNull();
  });

  it("finds the saber's own card among several, the surest first", () => {
    const byPresets = card('F:\\', { presets: [{ font: 'Loth_Hero;common', name: 'Hero' }, { font: 'Dark;common', name: 'Dark' }] });
    const linked = card('E:\\', { volumeSerial: '5A1C3F0E' });
    expect(saberCardIn([byPresets, linked], nihilus, [nihilus, other])).toMatchObject({ card: { root: 'E:\\' }, by: 'linked' });
    expect(saberCardIn([byPresets], nihilus, [nihilus, other])).toMatchObject({ card: { root: 'F:\\' }, by: 'presets' });
    expect(saberCardIn([card('G:\\')], nihilus, [nihilus, other])).toBeNull();
    expect(saberCardIn([linked], null, [nihilus])).toBeNull();
  });
});
