import { describe, expect, it } from 'vitest';
import { firmwareLine, presetBase, presetDrift } from '../src/renderer/src/saberModel';
import type { SaberConfigModel } from '@hiltwright/core';
import type { BoardInfo } from '../src/renderer/src/board';

const base: BoardInfo = {
  version: { version: 'v7.14', config: 'config/hiltwright_kylo.h', prop: 'fett263', buttons: 2, installed: 'Nov 20 2026 14:02:11', major: 7 },
  battery: 3.9, volume: 1500, currentPreset: 0, presets: [], fonts: [], tracks: [],
  pixelBlades: null, bladeConfig: null, rejected: [], timings: {}, sdMissing: false,
} as unknown as BoardInfo;
const presets = (n: number) => Array.from({ length: n }, (_, i) => ({ font: `F${i}`, track: '', name: `P${i}` })) as BoardInfo['presets'];

describe('the firmware line in the bar along the bottom of the window', () => {
  it('says everything the firmware reports, with the config name bare and the install date without its time', () => {
    expect(firmwareLine({ ...base, presets: presets(9) }, 'Kylo')).toBe('ProffieOS v7.14 · fett263 · 2 buttons · 9 presets · hiltwright_kylo · installed Nov 20 2026');
  });

  it('leaves out a config name that is only the saber\'s own name', () => {
    const v = { ...base.version!, config: 'config/SF_nihilus.h' };
    expect(firmwareLine({ ...base, version: v, presets: presets(10) }, 'sf_nihilus')).toBe('ProffieOS v7.14 · fett263 · 2 buttons · 10 presets · installed Nov 20 2026');
  });

  it('leaves out what is not known, and counts one of a thing as one', () => {
    const v = { ...base.version!, prop: null, config: null, installed: null, buttons: 1 };
    expect(firmwareLine({ ...base, version: v, presets: presets(1) })).toBe('ProffieOS v7.14 · 1 button · 1 preset');
  });

  it('is nothing for a saber never read, or none at all', () => {
    expect(firmwareLine(null)).toBeNull();
    expect(firmwareLine({ ...base, version: null })).toBeNull();
    expect(firmwareLine({ ...base, version: { ...base.version!, version: '' } })).toBeNull();
  });
});

describe('a list for the next install, and the saber changing after it was started', () => {
  const saberHas = (list: [string, string][]): BoardInfo => ({ ...base, presets: list.map(([name, font]) => ({ name, font, track: '' })) as BoardInfo['presets'] });
  const started = saberHas([['Kylo', 'Kylo;common'], ['Vader', 'Vader;common'], ['Rey', 'Rey;common']]);
  const draft = (b: ReturnType<typeof presetBase> | null = presetBase(started)): SaberConfigModel => ({ presets: [], presetsFrom: { name: 'edits made here', at: '2026-11-21T10:00:00.000Z', ...(b ? { base: b } : {}) } } as unknown as SaberConfigModel);

  it('remembers the saber\'s names and fonts as the list starts', () => {
    expect(presetBase(started)).toEqual([{ name: 'Kylo', font: 'Kylo;common' }, { name: 'Vader', font: 'Vader;common' }, { name: 'Rey', font: 'Rey;common' }]);
    expect(presetBase(null)).toBeUndefined();
  });

  it('sees nothing changed while the saber still has what the list started from', () => {
    expect(presetDrift(draft(), started)).toBeNull();
  });

  it('counts the presets changed on the saber since: a new font, a rename, one added', () => {
    expect(presetDrift(draft(), saberHas([['Kylo', 'Kylo2;common'], ['Vader', 'Vader;common'], ['Rey', 'Rey;common']]))).toBe(1);
    expect(presetDrift(draft(), saberHas([['Kylo', 'Kylo;common'], ['Lord Vader', 'Vader;common'], ['Rey', 'Rey;common'], ['Ahsoka', 'Ahsoka;common']]))).toBe(2);
  });

  it('says nothing without a list, or for a list that does not know what it started from', () => {
    expect(presetDrift(null, started)).toBeNull();
    expect(presetDrift({ presets: [] } as unknown as SaberConfigModel, started)).toBeNull();
    expect(presetDrift(draft(null), saberHas([['Other', 'X']]))).toBeNull();
  });
});
