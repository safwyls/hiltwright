import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BoardClient, LineBuffer, emitPresetsIni, formatBuiltin, isNoise, isPresetBlockEnd, parseBattery, parseBuiltin, parseId, parseInteger,
  parseList, parsePresetBlocks, parsePresetsIni, parseScanId, parseVersion, presetCommands, splitLines, wasRejected, type Transport,
} from '../src';

const transcript = (name: string) => readFileSync(new URL(`./transcripts/${name}`, import.meta.url), 'latin1');
const lines = (name: string) => splitLines(transcript(name));

describe('line handling', () => {
  it('splits mixed CRLF and LF and keeps partial lines pending', () => {
    const b = new LineBuffer();
    expect(b.push('v7.8\nBattery voltage: 3.50\r\nID: 9')).toEqual(['v7.8', 'Battery voltage: 3.50']);
    expect(b.pending()).toBe('ID: 9');
    expect(b.push('16.00\r\n')).toEqual(['ID: 916.00']);
    expect(b.flush()).toEqual([]);
  });

  it('recognises the status lines the board prints on its own', () => {
    for (const l of ['Style RAM = 936', 'Scanning sound font: common done', 'Activating polyphonic font.', 'Accent Slashes NOT Detected: ', 'DISPLAY: Preset: 3', 'unit = 0 vol = 0.50, Playing GeneralPrincess/font/font.wav', 'channels: 1 rate: 44100 bits: 16', 'Audio underflows: 149', 'Amplifier off.', 'Unmounting SD Card.', 'Creating file presets.tmp iteration = 2']) {
      expect(isNoise(l), l).toBe(true);
    }
    expect(isNoise('FONT=TeensySF;common')).toBe(false);
    expect(isNoise('0')).toBe(false);
  });
});

describe('recorded OS 7.8 transcripts', () => {
  it('version', () => {
    expect(parseVersion(lines('01-version.txt'))).toEqual({ version: 'v7.8', major: 7, config: 'config/hote2.h', prop: 'SaberSF24Buttons', buttons: 2, installed: 'Sep 11 2024 17:34:59' });
  });
  it('version survives an unsolicited battery line printed on connect (seen from Electron)', () => {
    expect(parseVersion(['Battery voltage: 3.51', ...lines('01-version.txt')])?.version).toBe('v7.8');
    expect(parseVersion(['Battery voltage: 3.51', ...lines('01-version.txt')])?.config).toBe('config/hote2.h');
    expect(parseVersion(['Whut? :version'])).toBeNull();
    // OS 8.10 built from the release zip answers with the git keyword instead of a number.
    const os8 = parseVersion(['$Id: ce12a06a1e236b5101ec60c950530a9a4719a74d $', 'config/hiltwright_hote2.h', 'prop: SaberSA22CButtons', 'buttons: 2', 'installed: Sep  9 2026 15:20:11']);
    expect(os8).toEqual({ version: 'git-ce12a06', major: null, config: 'config/hiltwright_hote2.h', prop: 'SaberSA22CButtons', buttons: 2, installed: 'Sep  9 2026 15:20:11' });
    // A Hiltwright build stamps a readable version into the sketch.
    expect(parseVersion(['v8.10 hiltwright ce12a06', 'config/x.h'])).toMatchObject({ version: 'v8.10 hiltwright ce12a06', major: 8 });
  });
  it('battery and volume', () => {
    expect(parseBattery(lines('02-battery.txt'))).toBe(3.5);
    expect(parseInteger(lines('03-get_volume.txt'))).toBe(1400);
    expect(parseInteger(lines('16-get_preset.txt'))).toBe(0);
  });
  it('list_presets: 13 presets, 4 blades each, names with escaped newlines', () => {
    const { presets, incomplete } = parsePresetBlocks(lines('04-list_presets.txt'));
    expect(incomplete).toBe(false);
    expect(presets).toHaveLength(13);
    expect(presets[0]).toEqual({ font: 'Mara Jade Skywalker;common', track: 'Mara Jade Skywalker/tracks/The_Force.wav', styles: ['builtin 0 1', 'builtin 0 2', 'builtin 0 3', 'builtin 0 4'], name: 'Mara Jade Skywalker', variation: 0 });
    expect(presets[2].name).toBe('Preset: 3');
    expect(presets[12].name).toBe('Battery\nLevel');
    expect(presets.every((p) => p.styles.length === 4)).toBe(true);
    expect(parseBuiltin(presets[5].styles[2])).toEqual({ preset: 5, blade: 3, args: null });
  });
  it('commands the firmware lacks are rejected with Whut?', () => {
    for (const f of ['05-list_named_style.txt', '10-dir.txt', '11-help.txt', '12-sb1_version.txt', '18-get_variation.txt']) expect(wasRejected(lines(f)), f).toBe(true);
    expect(wasRejected(lines('01-version.txt'))).toBe(false);
  });
  it('list_fonts and list_tracks drop the SD unmount notice', () => {
    const fonts = parseList(lines('06-list_fonts.txt'));
    expect(fonts).toHaveLength(18);
    expect(fonts).toContain('Mara Jade Skywalker');
    expect(fonts).not.toContain('Unmounting SD Card.');
    expect(parseList(lines('07-list_tracks.txt'))).toHaveLength(22);
  });
  it('id and scanid', () => {
    expect(parseId(lines('08-id.txt'))).toBe(916);
    expect(parseScanId(lines('09-scanid.txt'))).toEqual({ bladeConfig: 0, pixelBlades: [140, 2, 1] });
  });
  it('set_font answers with nothing; the save shows up later as an event', () => {
    expect(transcript('21-set_font_TeensySF_common.txt')).toBe('');
    expect(lines('22-show_current_preset.txt')).toEqual(['Creating file presets.tmp iteration = 2']);
  });
  it('a delayed show_current_preset ran into the next list_presets: the parser still separates 14 blocks', () => {
    const { presets } = parsePresetBlocks(lines('23-list_presets.txt'));
    expect(presets).toHaveLength(14);
    expect(presets[0].font).toBe('TeensySF;common');
    expect(presets[3].font).toBe('TeensySF;common'); // preset 2 in the list, after set_font
    expect(presets[3].track).toBe('tracks/General.wav');
  });
  it('restoring the font reads back', () => {
    const { presets } = parsePresetBlocks(lines('25-show_current_preset.txt'));
    expect(presets).toEqual([{ font: 'GeneralPrincess;common', track: 'tracks/General.wav', styles: ['builtin 2 1', 'builtin 2 2', 'builtin 2 3', 'builtin 2 4'], name: 'Preset: 3', variation: 0 }]);
  });
});

describe('commands', () => {
  it('build the exact strings the board accepts', () => {
    expect(presetCommands.setFont('TeensySF;common')).toBe('set_font TeensySF;common');
    expect(presetCommands.select(2)).toBe('set_preset 2');
    expect(presetCommands.setStyle(3, 'builtin 1 3 65535,0,0')).toBe('set_style3 builtin 1 3 65535,0,0');
    expect(presetCommands.setName('Battery\nLevel')).toBe('set_name Battery\\nLevel');
    expect(formatBuiltin({ preset: 4, blade: 1, args: '0,65535,0' })).toBe('builtin 4 1 0,65535,0');
    expect(() => presetCommands.setTrack('bad\nname')).toThrow();
  });
});

describe('presets.ini', () => {
  it('round-trips what the board reported, with escaping', () => {
    const { presets } = parsePresetBlocks(lines('04-list_presets.txt'));
    const text = emitPresetsIni({ installed: 'Sep 11 2024 17:34:59', presets, terminated: true });
    expect(text.startsWith('installed=Sep 11 2024 17:34:59\nnew_preset\nfont=Mara Jade Skywalker;common\n')).toBe(true);
    expect(text).toContain('name=Battery\\nLevel\n');
    expect(text.endsWith('variation=0\nend\n')).toBe(true);
    const back = parsePresetsIni(text);
    expect(back.terminated).toBe(true);
    expect(back.installed).toBe('Sep 11 2024 17:34:59');
    expect(back.presets).toEqual(presets);
  });
  it('reads the documented hand-written form, comments and mixed case', () => {
    const ini = parsePresetsIni('# my presets\nNEW_PRESET\nFont=TFAFlex\ntrack=tracks/rey_training.wav\nstyle=builtin 0 1\nstyle=builtin 0 2\nname=Graflex8\nvariation=23299\nend\n');
    expect(ini.presets).toEqual([{ font: 'TFAFlex', track: 'tracks/rey_training.wav', styles: ['builtin 0 1', 'builtin 0 2'], name: 'Graflex8', variation: 23299 }]);
    expect(ini.installed).toBeNull();
  });
  it('flags a truncated file', () => {
    expect(parsePresetsIni('new_preset\nfont=A\n').terminated).toBe(false);
  });
});

// ---------- Client against a replay transport ----------

class Replay implements Transport {
  private cb: ((chunk: string) => void) | null = null;
  public sent: string[] = [];
  constructor(private script: Record<string, { chunks: string[]; delays?: number[] }>, private timers: FakeTimers) {}
  write(text: string) {
    this.sent.push(text);
    const entry = this.script[text.trim()];
    if (!entry) return;
    entry.chunks.forEach((chunk, i) => this.timers.after(entry.delays?.[i] ?? 10 * (i + 1), () => this.cb?.(chunk)));
  }
  onData(cb: (chunk: string) => void) { this.cb = cb; return () => { this.cb = null; }; }
}

class FakeTimers {
  now = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  after(ms: number, fn: () => void): number { const id = ++this.seq; this.timers.push({ at: this.now + ms, fn, id }); return id; }
  cancel(id: unknown) { this.timers = this.timers.filter((t) => t.id !== id); }
  async run(untilMs: number) {
    while (true) {
      // Let queued promise callbacks (the client's send queue) register their timers before we look.
      await new Promise((r) => setTimeout(r, 0));
      const next = this.timers.filter((t) => t.at <= untilMs).sort((a, b) => a.at - b.at)[0];
      if (!next) { this.now = untilMs; return; }
      this.timers = this.timers.filter((t) => t !== next);
      this.now = next.at;
      next.fn();
    }
  }
}

function makeClient(script: Record<string, { chunks: string[]; delays?: number[] }>, events: string[] = []) {
  const timers = new FakeTimers();
  const transport = new Replay(script, timers);
  const client = new BoardClient(transport, { idleMs: 300, timeoutMs: 5000, now: () => timers.now, setTimer: (fn, ms) => timers.after(ms, fn), clearTimer: (h) => timers.cancel(h), onEvent: (l) => events.push(l) });
  return { client, timers, transport };
}

describe('BoardClient', () => {
  it('completes show_current_preset at VARIATION= without waiting for idle', async () => {
    const { client, timers } = makeClient({ show_current_preset: { chunks: [transcript('17-show_current_preset.txt')] } });
    const p = client.send('show_current_preset', { until: isPresetBlockEnd });
    await timers.run(50);
    const r = await p;
    expect(r.timedOut).toBe(false);
    expect(r.ms).toBeLessThan(300);
    expect(parsePresetBlocks(r.lines).presets[0].name).toBe('Mara Jade Skywalker');
  });

  it('a write completes by idle and its save notice arrives as an event, not a response line', async () => {
    const events: string[] = [];
    const { client, timers } = makeClient({ 'set_font TeensySF;common': { chunks: ['', 'Creating file presets.tmp iteration = 2\n'], delays: [5, 900] } }, events);
    const p = client.send('set_font TeensySF;common');
    await timers.run(2000);
    const r = await p;
    expect(r.lines).toEqual([]);
    expect(r.timedOut).toBe(false);
    expect(events).toContain('Creating file presets.tmp iteration = 2');
  });

  it('serialises commands and routes the SD unmount notice to events', async () => {
    const events: string[] = [];
    const { client, timers, transport } = makeClient({
      battery: { chunks: ['Battery voltage: 3.50\r\n'] },
      list_fonts: { chunks: [transcript('06-list_fonts.txt').slice(0, 40), transcript('06-list_fonts.txt').slice(40)], delays: [10, 120] },
    }, events);
    const a = client.send('battery');
    const b = client.send('list_fonts');
    await timers.run(3000);
    const [ra, rb] = await Promise.all([a, b]);
    expect(transport.sent).toEqual(['battery\n', 'list_fonts\n']);
    expect(parseBattery(ra.lines)).toBe(3.5);
    expect(parseList(rb.lines)).toHaveLength(18);
    expect(events).toContain('Unmounting SD Card.');
  });

  it('gives up on a silent board', async () => {
    const { client, timers } = makeClient({});
    const p = client.send('version', { idleMs: 100, timeoutMs: 1000 });
    await timers.run(2000);
    const r = await p;
    expect(r.lines).toEqual([]);
    expect(r.timedOut).toBe(false); // idle fires first: silence is a legitimate empty answer for writes
  });
});
