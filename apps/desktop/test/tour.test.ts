// The guided tour: where its card goes, the order of its steps, that its words point at things that exist, the
// example saber it shows, and that nothing it does reaches a real saber or the owner's data.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { wiringConfirmed } from '@hiltwright/core';
import { EDGE, flattenTour, nextStep, placeCard, placementProblems, prevStep, skipChapter, spotlight, startForPage, stepCounter, type Rect, type Size, type TourChapter } from '../src/renderer/src/tourEngine';
import { TOUR } from '../src/renderer/src/tourSteps';
import { EXAMPLE_ID, EXAMPLE_INFO, EXAMPLE_QUEUED, EXAMPLE_SABER } from '../src/renderer/src/tourSaber';
import { tourBoard } from '../src/renderer/src/tourBoard';
import { TOUR_OFFERED_KEY, TOUR_REFUSAL, assertMaySend, holdConnect, operationRefusal, restorePrefs, setTourLock, snapshotPrefs, takeHeldConnect, tourLocked } from '../src/renderer/src/tourLock';
import { runOperation, type SaveState } from '../src/renderer/src/boardOps';
import { queuedLookIds } from '../src/renderer/src/slotModel';
import type { Board } from '../src/renderer/src/board';

const renderer = fileURLToPath(new URL('../src/renderer/src', import.meta.url));
const BIG: Size = { width: 1480, height: 980 };
const SMALL: Size = { width: 1180, height: 700 };
const CARD: Size = { width: 372, height: 300 };
const inside = (left: number, top: number, card: Size, view: Size) => left >= EDGE - 0.01 && top >= EDGE - 0.01 && left + card.width <= view.width - EDGE + 0.01 && top + card.height <= view.height - EDGE + 0.01;

describe('where the card goes', () => {
  it('is centred when the step points at nothing', () => {
    for (const view of [BIG, SMALL]) {
      const p = placeCard(null, CARD, view);
      expect(p.side).toBe('center');
      expect(p.left).toBeCloseTo((view.width - CARD.width) / 2);
      expect(p.top).toBeCloseTo((view.height - CARD.height) / 2);
    }
  });

  it('goes to the right of something in the sidebar, lined up with it', () => {
    const nav: Rect = { left: 10, top: 300, width: 204, height: 120 };
    const p = placeCard(nav, CARD, BIG);
    expect(p.side).toBe('right');
    expect(p.left).toBe(10 + 204 + 14);
    expect(p.top).toBeCloseTo(300 + 60 - CARD.height / 2);
    expect(placementProblems(p, CARD, BIG, nav)).toEqual([]);
  });

  it('goes to the left of a rail on the right of the window', () => {
    const rail: Rect = { left: 1100, top: 70, width: 360, height: 880 };
    const p = placeCard(rail, CARD, BIG);
    expect(p.side).toBe('left');
    expect(p.left + CARD.width).toBeLessThanOrEqual(1100);
    expect(placementProblems(p, CARD, BIG, rail)).toEqual([]);
  });

  it('goes below something wide at the top of the window', () => {
    const bar: Rect = { left: 240, top: 60, width: 1220, height: 90 };
    const p = placeCard(bar, CARD, BIG);
    expect(p.side).toBe('below');
    expect(p.top).toBe(60 + 90 + 14);
    expect(placementProblems(p, CARD, BIG, bar)).toEqual([]);
  });

  it('goes above something wide at the foot of the window', () => {
    const foot: Rect = { left: 240, top: 820, width: 1220, height: 140 };
    const p = placeCard(foot, CARD, BIG);
    expect(p.side).toBe('above');
    expect(p.top + CARD.height).toBeLessThanOrEqual(820);
  });

  it('stays inside the window when the target is at an edge or a corner', () => {
    for (const view of [BIG, SMALL]) {
      for (const t of [
        { left: 0, top: 0, width: 200, height: 40 }, { left: view.width - 150, top: 0, width: 150, height: 40 },
        { left: 0, top: view.height - 40, width: 200, height: 40 }, { left: view.width - 150, top: view.height - 50, width: 150, height: 50 },
        { left: 600, top: -100, width: 100, height: 140 },
      ]) {
        const p = placeCard(t, CARD, view);
        expect(inside(p.left, p.top, CARD, view), JSON.stringify({ t, view, p })).toBe(true);
        expect(placementProblems(p, CARD, view, t)).toEqual([]);
      }
    }
  });

  it('covers as little as it can of a target nearly as big as the window, and never leaves it', () => {
    const huge: Rect = { left: 230, top: 60, width: 1230, height: 900 };
    const p = placeCard(huge, CARD, BIG);
    expect(p.side).toBe('overlap');
    expect(inside(p.left, p.top, CARD, BIG)).toBe(true);
    // A corner of the window, so most of the target stays in view.
    expect([EDGE, BIG.width - EDGE - CARD.width]).toContain(p.left);
  });

  it('is centred when the target is entirely outside the window', () => {
    expect(placeCard({ left: 2000, top: 2000, width: 50, height: 50 }, CARD, BIG).side).toBe('center');
  });

  it('keeps the spotlight inside the window, a little larger than its target', () => {
    expect(spotlight({ left: 100, top: 100, width: 50, height: 20 }, BIG)).toEqual({ left: 94, top: 94, width: 62, height: 32 });
    expect(spotlight({ left: 0, top: 0, width: 50, height: 20 }, BIG)).toEqual({ left: 0, top: 0, width: 56, height: 26 });
  });

  it('reports a card that leaves the window or covers its target', () => {
    expect(placementProblems({ left: -5, top: 10, side: 'right' }, CARD, BIG, null)).toEqual(['leaves the window']);
    expect(placementProblems({ left: 100, top: 100, side: 'right' }, CARD, BIG, { left: 120, top: 120, width: 10, height: 10 })).toEqual(['covers its target']);
  });
});

describe('the order of the steps', () => {
  const chapters: TourChapter[] = [
    { id: 'a', name: 'A', page: 'armory', steps: [{ title: 'a1', text: ['x'] }, { title: 'a2', text: ['x'] }] },
    { id: 'b', name: 'B', page: 'wiring', steps: [{ title: 'b1', text: ['x'] }] },
    { id: 'c', name: 'C', page: 'presets', steps: [{ title: 'c1', text: ['x'] }, { title: 'c2', text: ['x'] }] },
  ];
  const steps = flattenTour(chapters);

  it('runs through every chapter in order, each step on its chapter page', () => {
    expect(steps.map((s) => `${s.title}@${s.page}`)).toEqual(['a1@armory', 'a2@armory', 'b1@wiring', 'c1@presets', 'c2@presets']);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(steps[4]).toMatchObject({ chapter: 'c', chapterName: 'C', inChapter: 2, chapterSize: 2 });
  });

  it('moves on across pages, ends after the last step, and goes back no further than the first', () => {
    expect(nextStep(steps, 1)).toBe(2);
    expect(nextStep(steps, 4)).toBeNull();
    expect(prevStep(steps, 3)).toBe(2);
    expect(prevStep(steps, 0)).toBe(0);
  });

  it('skips to the start of the next chapter, and ends from the last one', () => {
    expect(skipChapter(steps, 0)).toBe(2);
    expect(skipChapter(steps, 1)).toBe(2);
    expect(skipChapter(steps, 2)).toBe(3);
    expect(skipChapter(steps, 3)).toBeNull();
  });

  it('starts "Show me this page" at that page\'s chapter, past a welcome on the same page', () => {
    const withWelcome = flattenTour([{ id: 'w', name: 'W', page: 'armory', steps: [{ title: 'w', text: ['x'] }] }, ...chapters]);
    expect(startForPage(withWelcome, 'armory')).toBe(1);
    expect(startForPage(withWelcome, 'presets')).toBe(4);
    expect(startForPage(withWelcome, 'nowhere')).toBe(0);
  });

  it('counts the steps', () => {
    expect(stepCounter(steps, 2)).toBe('Step 3 of 5');
  });
});

describe('the words of the tour', () => {
  const steps = flattenTour(TOUR);
  const app = readFileSync(join(renderer, 'App.tsx'), 'utf8');
  const pages = [...(/^type Page = ([^;]+);/m.exec(app)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  const sources = readdirSync(renderer).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(renderer, f), 'utf8')).join('\n');

  it('has between 35 and 50 steps, a welcome first, then a chapter per page in sidebar order', () => {
    expect(steps.length).toBeGreaterThanOrEqual(35);
    expect(steps.length).toBeLessThanOrEqual(50);
    expect(TOUR[0].id).toBe('welcome');
    const order = TOUR.slice(1).map((c) => c.page);
    expect(order).toEqual(pages);
  });

  it('puts every step on a page the app has', () => {
    for (const s of steps) expect(pages, s.title).toContain(s.page);
  });

  it('points only at data-tour targets that are in the app, and clicks only those', () => {
    const named = (n: string) => sources.includes(`data-tour="${n}"`) || (/^nav-/.test(n) && sources.includes("data-tour={`nav-${g.section.toLowerCase() || 'top'}`}"))
      || (/^build-tab-/.test(n) && sources.includes('data-tour={`build-tab-${id}`}')) || (/^demo-tab-/.test(n) && sources.includes('data-tour={`demo-tab-${id}`}'))
      || (n === 'look-card-queued' && sources.includes("'look-card-queued'"));
    for (const s of steps) {
      if (s.target) expect(named(s.target), `${s.title}: ${s.target}`).toBe(true);
      for (const b of s.before ?? []) expect(named(b), `${s.title}: ${b}`).toBe(true);
    }
  });

  it('keeps each step short: a title and one to three sentences in plain words, saying "style", never "look"', () => {
    for (const s of steps) {
      expect(s.title.length, s.title).toBeLessThanOrEqual(48);
      expect(s.text.length, s.title).toBeGreaterThanOrEqual(1);
      expect(s.text.length, s.title).toBeLessThanOrEqual(3);
      const words = [s.title, ...s.text].join(' ');
      expect(words, s.title).not.toMatch(/\blooks?\b/i);
      expect(words.split(/\s+/).length, s.title).toBeLessThanOrEqual(70);
    }
  });

  it('covers what confuses newcomers', () => {
    const all = steps.map((s) => [s.title, ...s.text].join(' ')).join(' ');
    for (const must of ['Live on the saber', 'staged', 'Queued', 'Needs a build', 'On the saber', 'card reader', 'Share the saber', 'TeensySF', 'backup', 'Put back', 'Simple', 'Full', 'approximate', 'Save diagnostics', 'Space', 'Example', 'nothing is sent']) {
      expect(all.toLowerCase().includes(must.toLowerCase()), must).toBe(true);
    }
  });

  it('is counted by the screenshot script the way it is written: one title per step', () => {
    const text = readFileSync(join(renderer, 'tourSteps.ts'), 'utf8');
    expect((text.match(/^\s*title: '/gm) ?? []).length).toBe(steps.length);
  });
});

describe('the example saber', () => {
  it('is a two-button saber with one main blade and an accent, six presets on the free fonts, its wiring confirmed', () => {
    const m = EXAMPLE_SABER.model!;
    expect(m.buttons).toBe(2);
    expect(m.blades.map((b) => b.role)).toEqual(['main', 'accent']);
    expect(EXAMPLE_SABER.presets).toHaveLength(6);
    expect(EXAMPLE_SABER.presets.map((p) => p.font.split(';')[0]).sort()).toEqual(['RgueCmdr', 'SmthFuzz', 'SmthGrey', 'SmthJedi', 'TeensySF', 'TthCrstl']);
    expect(wiringConfirmed(m)).toBe(true);
  });

  it('has two styles queued for its next build', () => {
    expect(EXAMPLE_QUEUED).toHaveLength(2);
    expect(queuedLookIds(EXAMPLE_SABER.model, EXAMPLE_SABER.firmware).sort()).toEqual([...EXAMPLE_QUEUED].sort());
  });

  it('reads as plugged in, on its first preset, with the same presets as its record', () => {
    expect(EXAMPLE_INFO.currentPreset).toBe(0);
    expect(EXAMPLE_INFO.presets).toBe(EXAMPLE_SABER.presets);
  });
});

/** A real board session whose every function fails the test if the tour stand-in calls it. */
function tripwireBoard(): { real: Board; called: string[] } {
  const called: string[] = [];
  const source = readFileSync(join(renderer, 'board.ts'), 'utf8');
  const keys = /return \{ (card, cardShared[^}]+) \};\n\}/.exec(source)?.[1].split(',').map((k) => k.trim()) ?? [];
  expect(keys.length).toBeGreaterThan(30);
  const owner = { id: 'owner1', name: 'Owner saber' };
  const real = Object.fromEntries(keys.map((k) => [k, k === 'library' ? [owner] : k === 'refreshLibrary' ? async () => { called.push('refreshLibrary (a read)'); } : k === 'isPresetBlockEnd' ? () => false : typeof k === 'string' ? (..._a: unknown[]) => { called.push(k); throw new Error(`the real ${k} was called`); } : null])) as unknown as Board;
  return { real, called };
}

describe('nothing reaches a real saber during the tour', () => {
  it('the stand-in board shows the example saber, plugged in, with the owner\'s sabers listed after it', () => {
    const { real } = tripwireBoard();
    const b = tourBoard(real);
    expect(b.status).toBe('connected');
    expect(b.saber?.id).toBe(EXAMPLE_ID);
    expect(b.library.map((s) => s.id)).toEqual([EXAMPLE_ID, 'owner1']);
    expect(b.card.shared).toBe(false);
  });

  it('refuses every send and write with the plain message, and never calls the real session for them', async () => {
    const { real, called } = tripwireBoard();
    const saves: SaveState[] = [];
    const b = tourBoard(real, (s) => saves.push(s));
    await expect(b.send('on')).rejects.toThrow(TOUR_REFUSAL);
    for (const ok of [b.choosePreset(2), b.editPreset({ name: 'x' }, 'Rename'), b.setPresetStyles(0, { 1: 'builtin 0 1' }, 'Style'), b.movePreset(1), b.duplicatePreset(), b.deletePreset(), b.reachNext('X'), b.restartSaber(), b.rebootToBootloader()]) expect(await ok).toBe(false);
    for (const p of [b.updateSaber({ model: null }), b.renameSaber('x'), b.planSaber('x', EXAMPLE_SABER.model!), b.adoptPlan('x')]) await expect(p).rejects.toThrow(TOUR_REFUSAL);
    await b.connect(true); await b.disconnect(); await b.identify();
    b.cardShared('H:\\'); b.cardGivenBack(); b.expectAfterInstall('x', 'y');
    expect(called).toEqual([]);
    expect(saves.every((s) => s.kind === 'failed' && s.error === TOUR_REFUSAL)).toBe(true);
  });

  it('answers the example saber\'s questions itself (its settings, its voice pack), and refuses every command that changes something', async () => {
    const { real, called } = tripwireBoard();
    const b = tourBoard(real);
    expect((await b.send('get_volume', { idleMs: 400 })).lines).toEqual(['1800']);
    expect((await b.send('cat common/voicepack.ini')).lines).toEqual(['voice_pack_version=2']);
    for (const c of ['set_volume 2000', 'on', 'clash', 'sd 1', 'reset', 'RebootDFU', 'set_preset 3', 'set_style1 builtin 0 1']) await expect(b.send(c), c).rejects.toThrow(TOUR_REFUSAL);
    expect(called).toEqual([]);
  });

  it('every function of the real session is stood in for, so a new one cannot reach the board by being left out', () => {
    const { real } = tripwireBoard();
    const b = tourBoard(real);
    for (const k of Object.keys(real)) expect(b, k).toHaveProperty(k);
    for (const [k, v] of Object.entries(b)) if (typeof v === 'function' && k !== 'isPresetBlockEnd' && k !== 'refreshLibrary') expect(v, k).not.toBe((real as unknown as Record<string, unknown>)[k]);
  });

  it('while locked, the serial port refuses every write and operations are not sent', async () => {
    setTourLock(true);
    try {
      expect(tourLocked()).toBe(true);
      expect(() => assertMaySend('set_preset 2')).toThrow(TOUR_REFUSAL);
      expect(operationRefusal(false, 'Hote')).toBe(TOUR_REFUSAL);
      const client = { send: vi.fn() };
      const saves: SaveState[] = [];
      const ok = await runOperation({ client: () => client, setBusy: () => {}, setSave: (s) => saves.push(s), log: () => {}, snapshot: async () => {}, refuse: () => operationRefusal(false, 'Hote') }, 'Select preset 2', async (c) => { await c.send('set_preset 2'); return { ok: true }; }, true);
      expect(ok).toBe(false);
      expect(client.send).not.toHaveBeenCalled();
      expect(saves.at(-1)).toEqual({ kind: 'failed', what: 'Select preset 2', error: TOUR_REFUSAL });
    } finally { setTourLock(false); }
    expect(() => assertMaySend('set_preset 2')).not.toThrow();
    expect(operationRefusal(true, 'Hote')).toMatch(/card is shared/);
    expect(operationRefusal(false, 'Hote')).toBeNull();
  });

  it('a saber plugged in during the tour is held, and connected once it ends', () => {
    expect(holdConnect()).toBe(false);
    setTourLock(true);
    expect(holdConnect()).toBe(true);
    setTourLock(false);
    expect(takeHeldConnect()).toBe(true);
    expect(takeHeldConnect()).toBe(false);
  });

  it('board.ts and serial.ts check the lock on every path to the port: sending, operations, restarts, the bootloader, connecting', () => {
    const board = readFileSync(join(renderer, 'board.ts'), 'utf8');
    const serial = readFileSync(join(renderer, 'serial.ts'), 'utf8');
    const body = (src: string, start: string, len = 600) => src.slice(src.indexOf(start), src.indexOf(start) + len);
    expect(body(board, 'const sendNow = useCallback')).toContain('assertMaySend(command)');
    expect(body(board, 'const rebootToBootloader = useCallback')).toContain('tourLocked()');
    expect(body(board, 'const restartSaber = useCallback')).toContain('tourLocked()');
    expect(body(board, 'const connect = useCallback')).toContain('holdConnect()');
    expect(body(board, 'const run = useCallback')).toContain('operationRefusal(');
    expect(body(serial, 'async write(text: string)')).toContain('assertMaySend(');
    expect(body(serial, 'async open(baudRate')).toContain('tourLocked()');
  });
});

describe('small settings are put back when the tour ends', () => {
  function memoryStore(init: Record<string, string>) {
    const m = new Map(Object.entries(init));
    return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  }
  it('restores the page\'s own choices, drops new ones, and keeps the offer answered', () => {
    const store = memoryStore({ 'hiltwright.demo.tab': 'sound', 'hiltwright.saber': 'abc', other: '1' });
    const snap = snapshotPrefs(store);
    store.setItem('hiltwright.demo.tab', 'blade');
    store.setItem('hiltwright.fontlib.group', 'maker');
    store.setItem(TOUR_OFFERED_KEY, 'yes');
    store.removeItem('hiltwright.saber');
    restorePrefs(store, snap);
    expect(Object.fromEntries(store.m)).toEqual({ 'hiltwright.demo.tab': 'sound', 'hiltwright.saber': 'abc', other: '1', [TOUR_OFFERED_KEY]: 'yes' });
  });
});
