import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoardClient, parsePresetBlocks, splitLines, type Transport } from '../src';

const transcript = (name: string) => readFileSync(new URL(`./transcripts/os8/${name}`, import.meta.url), 'latin1');

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

/** An OS 8.10 board that understands `tag| command`, answers late when told to, and is otherwise the recorded board. */
class TaggedBoard implements Transport {
  private cb: ((chunk: string) => void) | null = null;
  sent: string[] = [];
  lagMs = 10;
  /** When > 0 the board runs this many lines behind: each answer is released only when that many further lines arrive. */
  behind = 0;
  private held: string[] = [];
  constructor(private timers: FakeTimers) {}
  private emit(text: string, delay = this.lagMs) {
    if (this.behind > 0) {
      this.held.push(text);
      while (this.held.length > this.behind) { const t = this.held.shift()!; this.timers.after(delay, () => this.cb?.(t)); }
      return;
    }
    this.timers.after(delay, () => this.cb?.(text));
  }
  private tagLines(tag: string, body: string): string {
    return splitLines(body).map((l, i) => `${i + 1},${l.length},${tag}|${l}\n`).join('');
  }
  write(text: string) {
    for (const raw of text.split('\n')) {
      const cmd = raw.trim();
      if (!cmd) continue;
      this.sent.push(cmd);
      const m = /^([A-Za-z0-9_]+)\| (.*)$/.exec(cmd);
      if (!m) { this.emit(`Whut? :${cmd.split(' ')[0]}\r\n`); continue; }
      const [, tag, inner] = m;
      if (inner === 'version') this.emit(this.tagLines(tag, 'v8.10 hiltwright ce12a06\nconfig/hiltwright_hote2.h\nprop: SaberFett263Buttons\nbuttons: 2\ninstalled: Sep 13 2026 10:25:36\n'));
      else if (inner === 'show_current_preset') this.emit(this.tagLines(tag, 'FONT=GeneralPrincess;common\nTRACK=tracks/General.wav\nSTYLE1=builtin 2 1\nSTYLE2=builtin 2 2\nSTYLE3=builtin 2 3\nNAME=Preset: 3\nVARIATION=0\n'));
      else if (inner === 'get_preset') this.emit(this.tagLines(tag, '2\n'));
      else if (inner.startsWith('set_style1 ')) this.emit('Creating file presets.tmp iteration = 9\r\n'); // STDERR, untagged
      else this.emit(`Whut? :${tag}|\r\n`); // unknown inner command, including the hw_end sentinel
    }
  }
  onData(cb: (chunk: string) => void) { this.cb = cb; return () => { this.cb = null; }; }
}

function setup() {
  const timers = new FakeTimers();
  const board = new TaggedBoard(timers);
  const events: string[] = [];
  const client = new BoardClient(board, { now: () => timers.now, setTimer: (fn, ms) => timers.after(ms, fn), clearTimer: (h) => timers.cancel(h), onEvent: (l) => events.push(l) });
  return { timers, board, client, events };
}

describe('tagged framing (OS 8.10)', () => {
  it('the recorded tagged answer parses once the prefixes are stripped', () => {
    const lines = splitLines(transcript('33-tagged_show_current_preset.txt'));
    expect(lines[0]).toMatch(/^1,27,a3\|FONT=/);
    const stripped = lines.map((l) => l.replace(/^\d+,\d+,[A-Za-z0-9_]+\|/, ''));
    expect(parsePresetBlocks(stripped).presets[0].name).toBe('Preset: 3');
    expect(splitLines(transcript('35-tagged_unknown_command.txt'))).toEqual(['Whut? :a7|']);
  });

  it('detects tagging and then frames every command with a sentinel that ends the response', async () => {
    const { timers, board, client, events } = setup();
    const d = client.detectTagging();
    await timers.run(2000);
    expect(await d).toBe(true);
    expect(client.isTagged).toBe(true);
    const p = client.send('show_current_preset');
    await timers.run(4000);
    const r = await p;
    expect(board.sent.slice(-2)).toEqual(['h1| show_current_preset', 'h1x| hw_end']);
    expect(r.lines).toHaveLength(7);
    expect(r.lines[0]).toBe('FONT=GeneralPrincess;common');
    expect(r.timedOut).toBe(false);
    // Ended by the sentinel, not by idle: the response settled as soon as the rejection arrived.
    expect(r.ms).toBeLessThan(100);
    expect(events.filter((e) => e.startsWith('(late'))).toEqual([]);
  });

  it('drops late answers to earlier commands instead of taking them for the current one', async () => {
    const { timers, board, client, events } = setup();
    const d = client.detectTagging();
    await timers.run(2000);
    await d;
    board.lagMs = 5000; // the board falls behind
    const p1 = client.send('version', { timeoutMs: 1000 });
    await timers.run(3100);
    const r1 = await p1;
    expect(r1.timedOut).toBe(true);
    expect(r1.lines).toEqual([]);
    board.lagMs = 10;
    const p2 = client.send('get_preset');
    await timers.run(9000);
    const r2 = await p2;
    expect(r2.lines).toEqual(['2']);
    expect(events.some((e) => e.startsWith('(late h1) v8.10'))).toBe(true);
  });

  it('an unknown command inside a tag is reported as Whut? with the real command name', async () => {
    const { timers, client } = setup();
    const d = client.detectTagging();
    await timers.run(2000);
    await d;
    const p = client.send('list_named_style');
    await timers.run(4000);
    const r = await p;
    expect(r.lines).toEqual(['Whut? :list_named_style']);
  });

  it('untagged STDERR lines during a tagged command are events, and the write still ends by sentinel', async () => {
    const { timers, client, events } = setup();
    const d = client.detectTagging();
    await timers.run(2000);
    await d;
    const p = client.send('set_style1 builtin 2 1 65535,0,0');
    await timers.run(4000);
    const r = await p;
    expect(r.lines).toEqual([]);
    expect(r.events).toContain('Creating file presets.tmp iteration = 9');
    expect(events).toContain('Creating file presets.tmp iteration = 9');
  });

  it('kicks a board that runs behind until the sentinel comes out, and still ends up with the right answer', async () => {
    const { timers, board, client, events } = setup();
    const d = client.detectTagging();
    await timers.run(2000);
    await d;
    board.behind = 2; // from now on every answer is released two lines late
    const p = client.send('get_preset');
    await timers.run(12000);
    const r = await p;
    expect(r.timedOut).toBe(false);
    expect(r.lines).toEqual(['2']);
    // Two kicks were needed to push the command and its sentinel through.
    expect(board.sent.filter((c) => /^k\d+\| hw_end$/.test(c)).length).toBeGreaterThanOrEqual(2);
    // The next command pushes the kicks' own rejections out; they are dropped, and the answer is still right.
    const q = client.send('get_preset');
    await timers.run(24000);
    const r2 = await q;
    expect(r2.timedOut).toBe(false);
    expect(r2.lines).toEqual(['2']);
    expect(events.some((e) => /^\(late\) Whut\? :k\d+\|/.test(e))).toBe(true);
    expect(events.filter((e) => e.startsWith('(late h'))).toEqual([]);
  });

  it('an OS 7 board that rejects the probe stays untagged', async () => {
    const timers = new FakeTimers();
    const board: Transport & { cb?: (c: string) => void } = { write: (t) => { timers.after(10, () => board.cb?.(`Whut? :${String(t).trim().split(' ')[0]}\r\n`)); }, onData: (cb) => { board.cb = cb; return () => undefined; } };
    const client = new BoardClient(board, { now: () => timers.now, setTimer: (fn, ms) => timers.after(ms, fn), clearTimer: (h) => timers.cancel(h) });
    const d = client.detectTagging();
    await timers.run(3000);
    expect(await d).toBe(false);
    expect(client.isTagged).toBe(false);
  });
});
