import { describe, expect, it } from 'vitest';
import { holdSingleInstance, type InstanceApp, type InstanceWindow } from '../src/main/singleInstance';

function fakeApp(locked: boolean) {
  const calls: string[] = [];
  let second: (() => void) | null = null;
  const app: InstanceApp = {
    requestSingleInstanceLock: () => { calls.push('lock'); return locked; },
    quit: () => { calls.push('quit'); },
    on: (_event, listener) => { second = listener; },
  };
  return { app, calls, startAnother: () => second?.() };
}

function fakeWindow(minimized: boolean, destroyed = false) {
  const calls: string[] = [];
  const win: InstanceWindow = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => { calls.push('restore'); },
    show: () => { calls.push('show'); },
    focus: () => { calls.push('focus'); },
  };
  return { win, calls };
}

describe('one running copy per data folder (issue #10)', () => {
  it('a second copy is told to quit and starts nothing', () => {
    const { app, calls } = fakeApp(false);
    expect(holdSingleInstance(app, () => undefined)).toBe(false);
    expect(calls).toEqual(['lock', 'quit']);
  });

  it('the first copy keeps running and brings its minimised window back when another copy starts', () => {
    const { app, calls, startAnother } = fakeApp(true);
    const w = fakeWindow(true);
    expect(holdSingleInstance(app, () => w.win)).toBe(true);
    expect(calls).toEqual(['lock']);
    startAnother();
    expect(w.calls).toEqual(['restore', 'show', 'focus']);
  });

  it('a window that is not minimised is just shown and focused, and no window yet is not an error', () => {
    const shown = fakeWindow(false);
    const a = fakeApp(true);
    holdSingleInstance(a.app, () => shown.win);
    a.startAnother();
    expect(shown.calls).toEqual(['show', 'focus']);

    const b = fakeApp(true);
    holdSingleInstance(b.app, () => undefined);
    expect(() => b.startAnother()).not.toThrow();

    const gone = fakeWindow(true, true);
    const c = fakeApp(true);
    holdSingleInstance(c.app, () => gone.win);
    c.startAnother();
    expect(gone.calls).toEqual([]);
  });
});
