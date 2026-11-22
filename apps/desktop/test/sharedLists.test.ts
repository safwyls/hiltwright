import { describe, expect, it, vi } from 'vitest';
import { sharedList } from '../src/renderer/src/sharedLists';

describe('a list several pages show', () => {
  it('is loaded once for everyone asking at the same moment, and kept for the loads of one page opening', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const list = sharedList(async () => { calls++; return [calls]; });
    expect(list.value()).toBeNull();
    const [a, b] = await Promise.all([list.load(), list.load()]);
    expect(a).toEqual([1]);
    expect(b).toBe(a);
    await list.load();
    expect(calls).toBe(1);
    // A page opened later checks again.
    vi.advanceTimersByTime(2500);
    expect(await list.load()).toEqual([2]);
    vi.useRealTimers();
  });

  it('is loaded again after a change, and every page showing it hears', async () => {
    let n = 0;
    const list = sharedList(async () => ++n);
    const heard: number[] = [];
    const off = list.subscribe((v) => heard.push(v));
    await list.load();
    await list.refresh();
    off();
    await list.refresh();
    expect(heard).toEqual([1, 2]);
    expect(list.value()).toBe(3);
  });

  it('keeps the last list when a load fails, and lets the next one try', async () => {
    let fail = false;
    const list = sharedList(async () => { if (fail) throw new Error('no'); return 'ok'; });
    await list.load();
    fail = true;
    await expect(list.refresh()).rejects.toThrow('no');
    expect(list.value()).toBe('ok');
    fail = false;
    expect(await list.refresh()).toBe('ok');
  });
});
