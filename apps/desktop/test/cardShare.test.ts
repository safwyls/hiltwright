// Sharing the saber's card (Fonts & SD), as the Proffieboard V3 showed it on 2026-11-18: `sd 1` quiet for over 10 s,
// Windows taking minutes to open the card, the drive list timing out meanwhile (cardShare.ts, boardOps sendOptionsFor).

import { describe, expect, it } from 'vitest';
import { BoardClient, type Response, type Transport } from '@hiltwright/core';
import type { CardInfo, DriveLook } from '../src/shared/api';
import { DRIVE_WAIT_MS, giveCardBack, pickSaberDrive, plainDuration, shareCard, waitForDrive, type ShareDeps, type WaitProgress } from '../src/renderer/src/cardShare';
import { CARD_ACCESS_SILENCE_MS, sendOptionsFor } from '../src/renderer/src/boardOps';

const SERIAL = '2050335B4D30';
const card = (root: string, saberSerial: string | null = null): CardInfo => ({ root, label: null, freeBytes: null, totalBytes: null, proffie: true, hasPresetsIni: true, saberSerial, fileSystem: 'FAT32', empty: false, volumeSerial: null, presets: null });

/**
 * A saber and a Windows on one fake clock. `drives(t)` is what Windows lists at time t, or 'no-answer'; each look
 * takes `lookMs(t)`. The saber answers `sd`, `sd 1` and `sd 0` from its card state.
 */
function world(opts: { drives: (t: number) => CardInfo[] | 'no-answer'; lookMs?: (t: number) => number; sharing?: boolean; sd1?: (w: { t: number }) => { lines: string[]; silent?: boolean }; cancelAt?: number; serial?: string | null }) {
  const w = {
    t: 0,
    sharing: opts.sharing ?? false,
    sent: [] as string[],
    ejected: [] as string[],
    progress: [] as WaitProgress[],
    logs: [] as string[],
  };
  const deps: ShareDeps = {
    now: () => w.t,
    sleep: async (ms) => { w.t += ms; },
    look: async (): Promise<DriveLook> => {
      const ms = opts.lookMs?.(w.t) ?? 900;
      const d = opts.drives(w.t);
      w.t += ms;
      return d === 'no-answer' ? { answered: false, detail: 'Windows did not answer within 15 s', ms } : { answered: true, cards: d, ms };
    },
    send: async (command) => {
      w.sent.push(command);
      if (command === 'sd') return { lines: [`SD Access ${w.sharing ? 'ON' : 'OFF'}`] };
      if (command === 'sd 1') { const r = opts.sd1?.(w) ?? { lines: ['SD Access ON'] }; w.sharing = true; return r; }
      if (command === 'sd 0') { w.sharing = false; return { lines: ['SD Access OFF'] }; }
      return { lines: [] };
    },
    eject: async (root) => { w.ejected.push(root); return { ok: true, detail: 'ejected' }; },
    saberSerial: opts.serial === undefined ? SERIAL : opts.serial,
    cancelled: () => opts.cancelAt !== undefined && w.t >= opts.cancelAt,
    onProgress: (p) => w.progress.push(p),
    log: (l) => w.logs.push(l),
  };
  return { w, deps };
}

describe('waiting for the shared card by the clock', () => {
  it('finds the drive that appears after 100 s, sending only sd and sd 1', async () => {
    const reader = card('E:\\');
    const { w, deps } = world({ drives: (t) => (t >= 100_000 ? [reader, card('F:\\')] : [reader]), serial: null });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'found', by: 'new', card: { root: 'F:\\' } });
    expect(out.kind === 'found' && out.waitedMs).toBeGreaterThanOrEqual(99_000);
    expect(out.kind === 'found' && out.waitedMs).toBeLessThan(DRIVE_WAIT_MS);
    expect(w.sent).toEqual(['sd', 'sd 1']);
  });

  it('a drive list Windows did not answer is not "no drive": it is waited through, then the drive is found', async () => {
    // Four looks time out at 15 s each while Windows opens the card, then it answers with the card.
    let fails = 0;
    const { w, deps } = world({
      drives: (t) => (t < 2000 ? [] : fails < 4 ? (fails++, 'no-answer') : [card('G:\\', SERIAL)]),
      lookMs: (t) => (t < 2000 ? 900 : fails < 4 ? 15_000 : 900),
    });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'found', by: 'serial', card: { root: 'G:\\' } });
    expect(w.progress.filter((p) => p.last === 'no-answer')).toHaveLength(4);
    expect(out.kind === 'found' && out.waitedMs).toBeGreaterThanOrEqual(60_000);
    expect(w.logs.some((l) => /Windows did not answer/.test(l))).toBe(true);
    expect(w.sent).toEqual(['sd', 'sd 1']);
  });

  it('a failed look is never taken as the list of drives already there', async () => {
    // Already sharing, no serial to know the drive by: a look Windows did not answer must not become the baseline,
    // or a drive that was there would later look new.
    const looks: (CardInfo[] | 'no-answer')[] = ['no-answer', [card('E:\\')], [card('E:\\')], [card('E:\\'), card('H:\\')]];
    let i = 0;
    const { deps } = world({ drives: () => looks[Math.min(i++, looks.length - 1)], sharing: true, serial: null });
    const out = await waitForDrive(deps, { before: null });
    expect(out).toMatchObject({ kind: 'found', card: { root: 'H:\\' }, by: 'new' });
  });

  it('when the wait runs out nothing is sent to the saber: the card stays shared', async () => {
    const { w, deps } = world({ drives: () => [], lookMs: () => 2500 });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'timeout' });
    expect(out.kind === 'timeout' && out.waitedMs).toBeGreaterThanOrEqual(DRIVE_WAIT_MS);
    expect(out.kind === 'timeout' && out.waitedMs).toBeLessThan(DRIVE_WAIT_MS + 5000);
    expect(w.sent).toEqual(['sd', 'sd 1']);
    expect(w.sent).not.toContain('sd 0');
    expect(w.sharing).toBe(true);
    expect(w.ejected).toEqual([]);
  });

  it('Share pressed while the saber already shares and its drive is already there: no sd 1, found at once by serial', async () => {
    const { w, deps } = world({ drives: () => [card('E:\\'), card('F:\\', SERIAL)], sharing: true });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'found', by: 'serial', card: { root: 'F:\\' }, alreadyShared: true });
    expect(w.sent).toEqual(['sd']);
    expect(out.kind === 'found' && out.waitedMs).toBeLessThan(2000);
  });

  it('keep waiting after a timeout uses the drives noted before the share', async () => {
    const { w, deps } = world({ drives: (t) => (t > 5000 ? [card('E:\\'), card('J:\\')] : [card('E:\\')]), sharing: true, serial: null });
    const out = await shareCard(deps, { before: new Set(['E:\\']) });
    expect(out).toMatchObject({ kind: 'found', by: 'new', card: { root: 'J:\\' } });
    expect(w.sent).toEqual(['sd']);
  });

  it('two new drives: the saber\'s own is picked by its USB serial', async () => {
    const { deps } = world({ drives: (t) => (t > 3000 ? [card('E:\\'), card('K:\\'), card('L:\\', SERIAL)] : [card('E:\\')]) });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'found', by: 'serial', card: { root: 'L:\\' } });
  });

  it('two new drives and no serial to tell them apart: the owner chooses; another saber\'s drive is never taken', () => {
    const before = new Set(['E:\\']);
    expect(pickSaberDrive([card('E:\\'), card('K:\\'), card('L:\\')], { saberSerial: SERIAL, before })).toMatchObject({ several: [{ root: 'K:\\' }, { root: 'L:\\' }] });
    expect(pickSaberDrive([card('E:\\'), card('K:\\', 'OTHERSABER1'), card('L:\\')], { saberSerial: SERIAL, before })).toMatchObject({ card: { root: 'L:\\' }, by: 'new' });
    expect(pickSaberDrive([card('E:\\')], { saberSerial: null, before: null })).toBeNull();
  });

  it('Cancel during the wait gives the card back: sd 0, confirmed by SD Access OFF', async () => {
    const { w, deps } = world({ drives: () => [], cancelAt: 30_000 });
    const out = await shareCard(deps);
    expect(out).toMatchObject({ kind: 'cancelled', giveBack: { kind: 'given-back' } });
    expect(w.sent).toEqual(['sd', 'sd 1', 'sd 0']);
    expect(w.sharing).toBe(false);
  });

  it('giving the card back with its drive known ejects it in Windows first, then sends sd 0', async () => {
    const { deps, w } = world({ drives: () => [], sharing: true });
    const g = await giveCardBack(deps, 'F:\\');
    expect(g).toEqual({ kind: 'given-back' });
    expect(w.ejected).toEqual(['F:\\']);
    expect(w.sent).toEqual(['sd 0']);
  });

  it('a give-back whose eject Windows refuses sends nothing to the saber', async () => {
    const { deps, w } = world({ drives: () => [] });
    deps.eject = async () => ({ ok: false, detail: 'Windows did not release the drive.' });
    expect(await giveCardBack(deps, 'F:\\')).toEqual({ kind: 'eject-failed', detail: 'Windows did not release the drive.' });
    expect(w.sent).toEqual([]);
  });

  it('after a pause on sd 1 the saber is asked for its card state, not assumed', async () => {
    const { w, deps } = world({ drives: (t) => (t > 3000 ? [card('F:\\', SERIAL)] : []), sd1: () => ({ lines: [], silent: true }) });
    const out = await shareCard(deps);
    expect(w.sent).toEqual(['sd', 'sd 1', 'sd']);
    expect(out).toMatchObject({ kind: 'found', card: { root: 'F:\\' } });
  });

  it('a saber that did not take its card back after a pause on sd 0 is asked, and the answer counts', async () => {
    const { deps, w } = world({ drives: () => [], sharing: true });
    const send = deps.send;
    deps.send = async (c) => (c === 'sd 0' ? (w.sent.push(c), { lines: [], silent: true }) : send(c));
    expect(await giveCardBack(deps, null)).toEqual({ kind: 'not-confirmed', access: true });
    expect(w.sent).toEqual(['sd 0', 'sd']);
  });

  it('firmware that cannot share says so, and nothing is waited for', async () => {
    const { deps } = world({ drives: () => [], sd1: () => ({ lines: ['Whut? :sd 1'] }) });
    expect(await shareCard(deps)).toEqual({ kind: 'unsupported' });
  });

  it('says waits in plain words', () => {
    expect(plainDuration(45_400)).toBe('45 s');
    expect(plainDuration(80_000)).toBe('1 min 20 s');
    expect(plainDuration(DRIVE_WAIT_MS)).toBe('3 min');
  });
});

// The link's silence limit for `sd 1` and `sd 0` only (usb-power-connect D3 still applies past it).
describe('sd 1 and sd 0 may be quiet while the saber lets go of its card', () => {
  class FakeTimers {
    now = 0;
    private timers: { at: number; fn: () => void; id: number }[] = [];
    private seq = 0;
    after(ms: number, fn: () => void): number { const id = ++this.seq; this.timers.push({ at: this.now + ms, fn, id }); return id; }
    cancel(id: unknown) { this.timers = this.timers.filter((t) => t.id !== id); }
    async run(untilMs: number) {
      for (;;) {
        await new Promise((r) => setTimeout(r, 0));
        const next = this.timers.filter((t) => t.at <= untilMs).sort((a, b) => a.at - b.at)[0];
        if (!next) { this.now = untilMs; return; }
        this.timers = this.timers.filter((t) => t !== next);
        this.now = next.at;
        next.fn();
      }
    }
  }
  /** An OS 8 board that answers every command after `delayMs`, saying nothing before, kicks included. */
  class SlowBoard implements Transport {
    cb: ((chunk: string) => void) | null = null;
    constructor(private timers: FakeTimers, public delayMs: number) {}
    write(text: string) {
      if (/^hwt\| version/.test(text)) { this.timers.after(10, () => this.cb?.('0,5,hwt|v8.10\r\n')); return; }
      const m = /^(h\d+)\| (.*)\n(h\d+x)\| hw_end/.exec(text);
      if (!m) return;
      const answer = m[2] === 'sd 1' ? 'SD Access ON' : 'ok';
      this.timers.after(this.delayMs, () => this.cb?.(`0,12,${m[1]}|${answer}\r\nWhut? :${m[3]}|\r\n`));
    }
    onData(cb: (chunk: string) => void) { this.cb = cb; return () => { this.cb = null; }; }
  }
  async function connected(delayMs: number) {
    const timers = new FakeTimers();
    const board = new SlowBoard(timers, 10);
    const silent: Response[] = [];
    const client = new BoardClient(board, { now: () => timers.now, setTimer: (fn, ms) => timers.after(ms, fn), clearTimer: (h) => timers.cancel(h), onSilent: (r) => silent.push(r) });
    const probe = client.detectTagging();
    await timers.run(2000);
    expect(await probe).toBe(true);
    board.delayMs = delayMs;
    return { client, timers, silent };
  }

  it('sd 1 silent for 12 s is not a stall: the answer is waited for and the link is not reopened', async () => {
    const { client, timers, silent } = await connected(12_000);
    const t0 = timers.now;
    const p = client.send('sd 1', sendOptionsFor('sd 1', { idleMs: 700 }, true));
    await timers.run(t0 + 13_000);
    const r = await p;
    expect(r).toMatchObject({ timedOut: false, silent: false, lines: ['SD Access ON'] });
    expect(silent).toEqual([]);
  });

  it('any other command silent for 12 s is still a stall', async () => {
    const { client, timers, silent } = await connected(12_000);
    const t0 = timers.now;
    const p = client.send('list_fonts', sendOptionsFor('list_fonts', undefined, true));
    await timers.run(t0 + 13_000);
    expect(await p).toMatchObject({ silent: true });
    expect(silent).toHaveLength(1);
  });

  it('sd 1 silent past its own limit is a stall, so the usual reopen applies', async () => {
    const { client, timers, silent } = await connected(CARD_ACCESS_SILENCE_MS + 30_000);
    const t0 = timers.now;
    const p = client.send('sd 1', sendOptionsFor('sd 1', undefined, true));
    await timers.run(t0 + CARD_ACCESS_SILENCE_MS + 2000);
    expect(await p).toMatchObject({ silent: true });
    expect(silent).toHaveLength(1);
  });

  it('only sd 1 and sd 0 get the long limit; other commands keep their options', () => {
    const opts = { idleMs: 500 };
    expect(sendOptionsFor('sd', opts, true)).toBe(opts);
    expect(sendOptionsFor('sd_card_info', opts, true)).toBe(opts);
    expect(sendOptionsFor('list_fonts', undefined, true)).toBeUndefined();
    expect(sendOptionsFor('sd 0', opts, true)).toMatchObject({ idleMs: 500, silentMs: CARD_ACCESS_SILENCE_MS });
    // Untagged (OS 7): the answer line ends it, and the quiet spell allowed is the same long one.
    const untagged = sendOptionsFor('sd 1', opts, false)!;
    expect(untagged).toMatchObject({ idleMs: CARD_ACCESS_SILENCE_MS, silentMs: CARD_ACCESS_SILENCE_MS });
    expect(untagged.until?.('SD Access ON', [])).toBe(true);
  });
});
