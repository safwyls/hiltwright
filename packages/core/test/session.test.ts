import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoardClient, diffPreset, editCurrentPreset, parsePresetBlocks, selectPreset, splitLines, type PresetRecord, type Transport } from '../src';

const transcript = (name: string) => readFileSync(new URL(`./transcripts/${name}`, import.meta.url), 'latin1');

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

/** A board that behaves like the OS 7.8 transcripts: set_font is silent and the read-back is delayed by the save. */
class FakeBoard implements Transport {
  private cb: ((chunk: string) => void) | null = null;
  sent: string[] = [];
  font = 'GeneralPrincess;common';
  saveDelay = 1200;
  private pendingSave: number | null = null;
  constructor(private timers: FakeTimers) {}
  private emit(text: string, delay = 10) { this.timers.after(delay, () => this.cb?.(text)); }
  private block() { return `FONT=${this.font}\nTRACK=tracks/General.wav\nSTYLE1=builtin 2 1\nSTYLE2=builtin 2 2\nSTYLE3=builtin 2 3\nSTYLE4=builtin 2 4\nNAME=Preset: 3\nVARIATION=0\n`; }
  write(text: string) {
    const cmd = text.trim();
    this.sent.push(cmd);
    if (cmd.startsWith('set_font ')) {
      this.font = cmd.slice(9);
      this.pendingSave = this.timers.now + this.saveDelay; // nothing is printed now
      this.emit('Creating file presets.tmp iteration = 2\r\n', this.saveDelay);
      return;
    }
    if (cmd === 'show_current_preset') {
      // While a save is in flight the board blocks; the block arrives after the save finishes.
      const wait = this.pendingSave && this.pendingSave > this.timers.now ? this.pendingSave - this.timers.now + 50 : 10;
      this.emit(this.block(), wait);
      return;
    }
    if (cmd === 'get_preset') { this.emit('2\r\n'); return; }
    if (cmd.startsWith('set_preset ')) { this.emit(transcript('19-set_preset_2.txt'), 30); return; }
    if (cmd === 'list_presets') { this.emit(transcript('04-list_presets.txt'), 20); return; }
    this.emit(`Whut? :${cmd}\r\n`);
  }
  onData(cb: (chunk: string) => void) { this.cb = cb; return () => { this.cb = null; }; }
}

function setup() {
  const timers = new FakeTimers();
  const board = new FakeBoard(timers);
  const events: string[] = [];
  const client = new BoardClient(board, { now: () => timers.now, setTimer: (fn, ms) => timers.after(ms, fn), clearTimer: (h) => timers.cancel(h), onEvent: (l) => events.push(l) });
  return { timers, board, client, events };
}

describe('editCurrentPreset', () => {
  it('waits out the deferred save and reports success only after the read-back matches', async () => {
    const { timers, board, client, events } = setup();
    const p = editCurrentPreset(client, { font: 'TeensySF;common' }, () => timers.now);
    await timers.run(10000);
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.preset?.font).toBe('TeensySF;common');
    expect(board.sent).toEqual(['set_font TeensySF;common', 'show_current_preset']);
    expect(events).toContain('Creating file presets.tmp iteration = 2');
    expect(r.ms).toBeGreaterThanOrEqual(1200);
  });

  it('fails honestly when the board never confirms', async () => {
    const { timers, board, client } = setup();
    board.saveDelay = 60000; // the SD hangs
    const p = editCurrentPreset(client, { font: 'TeensySF;common' }, () => timers.now);
    await timers.run(60000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not confirm/);
    expect(r.readbacks).toBe(3);
  });

  it('a patch with nothing in it sends nothing', async () => {
    const { board, client } = setup();
    expect(await editCurrentPreset(client, {})).toMatchObject({ ok: true, readbacks: 0 });
    expect(board.sent).toEqual([]);
  });
});

describe('selectPreset', () => {
  it('selects, confirms the index and reads the block back through the font-scan chatter', async () => {
    const { timers, board, client, events } = setup();
    const p = selectPreset(client, 2);
    await timers.run(5000);
    const r = await p;
    expect(r.index).toBe(2);
    expect(r.preset?.name).toBe('Preset: 3');
    expect(board.sent[0]).toBe('set_preset 2');
    expect(events.some((e) => /^Scanning sound font/.test(e))).toBe(true);
  });
});

describe('diffPreset', () => {
  it('produces the smallest patch that restores a snapshot', () => {
    const { presets } = parsePresetBlocks(splitLines(transcript('04-list_presets.txt')));
    const edited: PresetRecord = { ...presets[2], font: 'TeensySF;common', styles: [...presets[2].styles] };
    edited.styles[0] = 'builtin 2 1 65535,0,0';
    expect(diffPreset(edited, presets[2])).toEqual({ font: 'GeneralPrincess;common', styles: { 1: 'builtin 2 1' } });
    expect(diffPreset(presets[2], presets[2])).toEqual({});
  });
});
