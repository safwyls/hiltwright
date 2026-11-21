import { describe, expect, it } from 'vitest';
import { firmwareLine } from '../src/renderer/src/saberModel';
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
