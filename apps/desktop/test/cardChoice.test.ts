// card-safety 2.2-2.4: the card Fonts & SD shows is the saber's own when it shares it, the owner's choice, or the only
// ProffieOS card. Any drive with media can be chosen; an empty or non-saber one is never picked by itself.

import { describe, expect, it } from 'vitest';
import { cardKind, chooseCard, rememberCardChoice, rememberedCardChoice } from '../src/renderer/src/cardChoice';
import type { CardInfo } from '../src/shared/api';

const card = (root: string, saberSerial: string | null = null, proffie = true, empty = false): CardInfo => ({ root, label: null, freeBytes: null, totalBytes: null, proffie, hasPresetsIni: proffie, saberSerial, fileSystem: null, empty, volumeSerial: null, presets: null });
const reader = card('E:\\');
const shared = card('H:\\', '209133815232');
const blankCard = card('G:\\', null, false, true);
const stick = card('F:\\', null, false, false);
const none = { sharedRoot: null, saberSerial: null, chosen: null };

describe('which card Fonts & SD shows (card-safety D3)', () => {
  it("the card the connected saber shares, found by its serial, is shown and marked as the saber's own", () => {
    const c = chooseCard([reader, shared], { ...none, saberSerial: '209133815232' });
    expect(c).toMatchObject({ card: shared, own: true, ask: false });
    expect(c.choices).toEqual([reader, shared]);
  });
  it('or found as the drive that appeared when the app asked it to share', () => {
    expect(chooseCard([reader, card('H:\\')], { ...none, sharedRoot: 'H:\\' })).toMatchObject({ card: { root: 'H:\\' }, own: true });
  });
  it("the saber's own card counts even before it has fonts on it", () => {
    const blank = card('H:\\', '209133815232', false, true);
    expect(chooseCard([reader, blank], { ...none, saberSerial: '209133815232' }).card).toBe(blank);
  });
  it("the owner's choice holds while that card is there, and is dropped once it is gone", () => {
    expect(chooseCard([reader, shared], { sharedRoot: null, saberSerial: '209133815232', chosen: 'E:\\' })).toMatchObject({ card: reader, own: false });
    expect(chooseCard([shared], { sharedRoot: null, saberSerial: '209133815232', chosen: 'E:\\' })).toMatchObject({ card: shared, own: true });
  });
  it('two cards and no saber sharing: ask, and show none', () => {
    expect(chooseCard([reader, card('F:\\')], none)).toMatchObject({ card: null, ask: true });
  });
  it('no drive at all: nothing to show, nothing to ask', () => {
    expect(chooseCard([], none)).toMatchObject({ card: null, ask: false, choices: [] });
  });
});

describe('any card can be chosen (card-safety 2.4)', () => {
  it('the one ProffieOS card is picked, with the empty card and the stick still offered', () => {
    const c = chooseCard([reader, blankCard, stick], none);
    expect(c).toMatchObject({ card: reader, ask: false });
    expect(c.choices).toEqual([reader, blankCard, stick]);
  });
  it('an empty card alone is offered and asked for, never picked by itself', () => {
    expect(chooseCard([blankCard], none)).toMatchObject({ card: null, ask: true, choices: [blankCard] });
  });
  it('once chosen, an empty card or a non-saber drive is the card', () => {
    expect(chooseCard([blankCard, stick], { ...none, chosen: 'G:\\' })).toMatchObject({ card: blankCard, ask: false });
    expect(chooseCard([blankCard, stick], { ...none, chosen: 'F:\\' })).toMatchObject({ card: stick, ask: false });
  });
  it('each drive is marked for what it holds', () => {
    expect([reader, blankCard, stick].map(cardKind)).toEqual(['saber', 'empty', 'other']);
  });
});

describe('the font library copies to the card chosen on Fonts & SD (card-safety 2.3)', () => {
  it('the remembered choice picks between two cards, and is dropped when its card is gone', () => {
    const other = card('F:\\');
    rememberCardChoice(null);
    expect(chooseCard([reader, other], { ...none, chosen: rememberedCardChoice() })).toMatchObject({ card: null, ask: true });
    rememberCardChoice('F:\\');
    expect(chooseCard([reader, other], { ...none, chosen: rememberedCardChoice() })).toMatchObject({ card: other, ask: false });
    expect(chooseCard([reader], { ...none, chosen: rememberedCardChoice() })).toMatchObject({ card: reader, ask: false });
    rememberCardChoice(null);
  });
});
