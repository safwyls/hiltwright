import { describe, expect, it } from 'vitest';
import { LOADER_CELLS, loaderState } from '../src/renderer/src/loaderModel';

describe('the loading indicator', () => {
  it('working: power cells at size md, the crystal at size sm, hidden from screen readers (the words beside it speak)', () => {
    expect(loaderState('md', undefined)).toEqual({ kind: 'cells', progress: null, lit: 0, a11y: { 'aria-hidden': true } });
    expect(loaderState('sm', null).kind).toBe('kyber');
    expect(loaderState('md', Number.NaN).progress).toBeNull();
  });

  it('with progress: a progressbar, one cell per sixth, clamped to 0..100', () => {
    const s = loaderState('md', 34 / 55, 'Copying Loth_Hero');
    expect(s).toMatchObject({ progress: 34 / 55, lit: 4, a11y: { role: 'progressbar', 'aria-valuenow': 62, 'aria-label': 'Copying Loth_Hero' } });
    expect(loaderState('md', 3)).toMatchObject({ progress: 1, lit: LOADER_CELLS, a11y: { 'aria-valuenow': 100 } });
    expect(loaderState('md', -1)).toMatchObject({ progress: 0, lit: 0, a11y: { 'aria-valuenow': 0, 'aria-label': 'Progress' } });
  });
});
