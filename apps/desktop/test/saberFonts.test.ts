import { describe, expect, it } from 'vitest';
import { chosenFonts, presetFolders, presetsUsing, withFontChosen, withFontDropped, withPresetFonts } from '../src/renderer/src/saberFonts';

const model = (fonts: string[] | undefined, presetFonts: string[]) => ({ ...(fonts ? { fonts } : {}), presets: presetFonts.map((font, i) => ({ font, track: '', name: `P${i}` })) });

describe('the fonts a saber will carry', () => {
  it('reads every folder of a preset\'s font, never common', () => {
    expect(presetFolders('Kylo;Extra;common')).toEqual(['Kylo', 'Extra']);
    expect(presetFolders('common')).toEqual([]);
  });

  it('lists the chosen fonts in order, then any a preset names, once each whatever the case', () => {
    expect(chosenFonts(model(['Vader', 'Rey'], ['Kylo;common', 'vader;common', 'Rey']))).toEqual(['Vader', 'Rey', 'Kylo']);
  });

  it('works for a saber with no list yet, from its presets alone', () => {
    expect(chosenFonts(model(undefined, ['Kylo;common', 'Kylo;common', 'Ahsoka']))).toEqual(['Kylo', 'Ahsoka']);
    expect(chosenFonts(null)).toEqual([]);
  });

  it('says which presets use a font', () => {
    expect(presetsUsing(model([], ['Kylo;common', 'Rey', 'kylo']), 'KYLO')).toEqual([0, 2]);
  });

  it('adds a font at the end, once', () => {
    expect(withFontChosen(model(['Vader'], ['Kylo']), 'Rey').fonts).toEqual(['Vader', 'Rey', 'Kylo']);
    expect(withFontChosen(model(['Vader'], []), 'vader').fonts).toEqual(['Vader']);
  });

  it('drops a font no preset uses, and refuses one a preset still names', () => {
    expect(withFontDropped(model(['Vader', 'Rey'], ['Kylo']), 'rey')?.fonts).toEqual(['Vader', 'Kylo']);
    expect(withFontDropped(model(['Vader'], ['Vader;common']), 'Vader')).toBeNull();
  });

  it('writes down every font the presets name', () => {
    expect(withPresetFonts(model(['Vader'], ['Kylo;common'])).fonts).toEqual(['Vader', 'Kylo']);
  });
});
