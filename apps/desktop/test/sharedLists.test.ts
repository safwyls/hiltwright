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

  it('never lets an older, slower load overwrite a newer refresh (#33)', async () => {
    // A loader whose answers are handed out by hand, in whatever order the test likes.
    const waiting: { resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
    const list = sharedList(() => new Promise<string>((resolve, reject) => { waiting.push({ resolve, reject }); }));
    const heard: string[] = [];
    list.subscribe((v) => heard.push(v));
    const old = list.load();
    const fresh = list.refresh();
    waiting[1].resolve('old+new-font');
    expect(await fresh).toBe('old+new-font');
    waiting[0].resolve('old');
    // The older load answers with the newest list, and nobody hears the old one.
    expect(await old).toBe('old+new-font');
    expect(heard).toEqual(['old+new-font']);
    expect(list.value()).toBe('old+new-font');
  });

  it('gives an older load the newest answer even when it finishes first, or fails (#33)', async () => {
    const waiting: { resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
    const list = sharedList(() => new Promise<string>((resolve, reject) => { waiting.push({ resolve, reject }); }));
    const heard: string[] = [];
    list.subscribe((v) => heard.push(v));
    const first = list.load();
    const second = list.refresh();
    const third = list.refresh();
    waiting[0].resolve('first');
    waiting[1].reject(new Error('dropped'));
    await Promise.resolve();
    expect(heard).toEqual([]);
    expect(list.value()).toBeNull();
    waiting[2].resolve('third');
    expect(await Promise.all([first, second, third])).toEqual(['third', 'third', 'third']);
    expect(heard).toEqual(['third']);
    // The next load starts a fresh request only once the list is no longer fresh; until then it is the newest one.
    expect(await list.load()).toBe('third');
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
