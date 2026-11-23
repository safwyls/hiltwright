import { describe, expect, it } from 'vitest';
import { STYLE_SHARE_FORMAT, makeStyleShare, placeImportedStyles, readStyleShare, type LookDef } from '../src';

const pasted: LookDef = { id: 'look_flame', name: 'Flame', source: 'pasted', by: 'Fett263', code: 'StylePtr<Red>()', header: '/* copyright */', roles: ['main'], args: [], preview: '#ff0000', description: '' };
const built: LookDef = { ...pasted, id: 'look_mine', name: 'Mine', source: 'built', by: 'you', code: 'StylePtr<Blue>()', header: null };
const starter: LookDef = { ...pasted, id: 'hw_blade', source: 'starter', by: 'Hiltwright' };
const fresh = (l: LookDef, n: number) => `${l.id}_${n}`;

describe('a styles file (.hwstyle)', () => {
  it('carries pasted and built styles, not Hiltwright\'s own, and reads back', () => {
    const share = makeStyleShare([pasted, built, starter], 'website', new Date('2026-11-23T00:00:00Z'));
    expect(share.format).toBe(STYLE_SHARE_FORMAT);
    expect(share.styles.map((l) => l.id)).toEqual(['look_flame', 'look_mine']);
    const back = readStyleShare(JSON.parse(JSON.stringify(share)));
    expect(back.from).toBe('website');
    expect(back.styles).toHaveLength(2);
  });

  it('refuses what is not a styles file, or one from a newer Hiltwright', () => {
    expect(() => readStyleShare({ format: 'hiltwright-saber', version: 1 })).toThrow('not a styles file');
    expect(() => readStyleShare({ format: STYLE_SHARE_FORMAT, version: 2, styles: [] })).toThrow('newer Hiltwright');
    expect(() => readStyleShare({ format: STYLE_SHARE_FORMAT, version: 1 })).toThrow('holds no styles');
  });

  it('skips a style the owner already has, and gives a different one under a taken id its own id', () => {
    const changed = { ...pasted, code: 'StylePtr<Green>()' };
    const r = placeImportedStyles([pasted, changed, built], [pasted], fresh);
    expect(r.same).toBe(1);
    expect(r.add.map((l) => l.id)).toEqual(['look_flame_2', 'look_mine']);
    expect(r.add[0].code).toBe('StylePtr<Green>()');
  });
});
