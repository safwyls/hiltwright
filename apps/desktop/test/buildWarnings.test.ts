// Build & Flash warns before an install when presets name fonts the card lacks, or leave out `common`
// where the voice pack lives. Both decisions are pure.

import { describe, expect, it } from 'vitest';
import { presetsWithoutCommon, voicePackVerdict } from '@hiltwright/core';
import { missingFontWarning } from '../src/renderer/src/fontNeeds';

const pack = { ini: true, version: 2, menuSounds: true };
const stock = ['TeensySF', 'SmthJedi', 'SmthGrey', 'SmthFuzz', 'RgueCmdr', 'TthCrstl'].map((font) => ({ font }));
const card = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'common'];

describe('build warnings', () => {
  it('no warning when every font is on the card and every preset has common', () => {
    const presets = [{ font: 'Alpha;common' }, { font: 'bravo;common' }];
    expect(missingFontWarning(presets, card)).toBeNull();
    expect(voicePackVerdict('fett263', pack, null, presetsWithoutCommon(presets))).toMatchObject({ ok: true });
  });

  it('the stock-font case gives both warnings with counts and names', () => {
    const w = missingFontWarning(stock, card)!;
    expect(w.presets).toBe(6);
    expect(w.fonts).toEqual(['TeensySF', 'SmthJedi', 'SmthGrey', 'SmthFuzz', 'RgueCmdr', 'TthCrstl']);
    expect(w.text).toMatch(/^6 presets name fonts that are not on the card \(TeensySF, /);
    expect(w.text).toMatch(/"font directory not found"/);
    expect(w.text).toMatch(/Card step/);
    const v = voicePackVerdict('fett263', pack, null, presetsWithoutCommon(stock))!;
    expect(v.ok).toBe(false);
    expect(v.text).toMatch(/6 presets/);
    expect(v.text).toMatch(/"voice pack not found"/);
  });

  it('judges whichever list the caller passes, so staged presets are the ones judged', () => {
    const own = [{ font: 'TeensySF' }];
    const staged = [{ font: 'Alpha;common' }];
    expect(missingFontWarning(own, card)).not.toBeNull();
    expect(missingFontWarning(staged, card)).toBeNull();
    expect(presetsWithoutCommon(staged)).toBe(0);
  });

  it('says nothing about fonts when the card contents are unknown', () => {
    expect(missingFontWarning(stock, null)).toBeNull();
  });

  it('a preset whose font path is only common is not missing a font', () => {
    expect(missingFontWarning([{ font: 'common' }, { font: '' }], card)).toBeNull();
    expect(presetsWithoutCommon([{ font: 'common' }])).toBe(0);
  });

  it('counts each missing font once and uses singular wording for one', () => {
    const w = missingFontWarning([{ font: 'Nope;common' }, { font: 'nope' }], card)!;
    expect(w.presets).toBe(2);
    expect(w.fonts).toEqual(['Nope']);
    expect(missingFontWarning([{ font: 'Nope' }], card)!.text).toMatch(/^1 preset names a font that is not on the card/);
  });
});
