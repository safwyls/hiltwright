import { describe, expect, it } from 'vitest';
import { checkFont, checkFontListing, classifySound, parseWavHeader } from '../src';

function wav(sampleRate: number, channels = 1, bits = 16, format = 1, dataBytes = 44100 * 2): Uint8Array {
  const b = new Uint8Array(44 + 8);
  const dv = new DataView(b.buffer);
  const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE');
  tag(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, format, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * channels * (bits / 8), true); dv.setUint16(32, channels * (bits / 8), true); dv.setUint16(34, bits, true);
  tag(36, 'data'); dv.setUint32(40, dataBytes, true);
  return b;
}

describe('WAV header', () => {
  it('reads rate, channels, bits and duration', () => {
    expect(parseWavHeader(wav(44100))).toEqual({ format: 1, channels: 1, sampleRate: 44100, bits: 16, seconds: 1 });
    expect(parseWavHeader(wav(48000, 2, 24))).toMatchObject({ sampleRate: 48000, channels: 2, bits: 24 });
    expect(parseWavHeader(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('sound file names', () => {
  it('tells monophonic from polyphonic forms', () => {
    expect(classifySound('clash1.wav')).toEqual({ effect: 'clash', kind: 'mono', index: 1 });
    expect(classifySound('clsh01.wav')).toEqual({ effect: 'clash', kind: 'poly', index: 1 });
    expect(classifySound('hum.wav')).toEqual({ effect: 'hum', kind: 'shared', index: null });
    expect(classifySound('hum01.wav')).toEqual({ effect: 'hum', kind: 'poly', index: 1 });
    expect(classifySound('poweron.wav')).toEqual({ effect: 'ignition', kind: 'mono', index: null });
    expect(classifySound('out01.wav')).toEqual({ effect: 'ignition', kind: 'poly', index: 1 });
    expect(classifySound('swng03.wav')).toEqual({ effect: 'swing', kind: 'poly', index: 3 });
    expect(classifySound('track.wav').kind).toBe('other');
  });
});

describe('numbering without leading zeros', () => {
  it('knows hum1.wav as a hum, and out1.wav and clsh1.wav by their names', () => {
    expect(classifySound('hum1.wav')).toEqual({ effect: 'hum', kind: 'shared', index: 1 });
    expect(classifySound('font2.wav')).toEqual({ effect: 'font name', kind: 'shared', index: 2 });
    expect(classifySound('out1.wav')).toEqual({ effect: 'ignition', kind: 'poly', index: 1 });
    expect(classifySound('in2.wav')).toEqual({ effect: 'retraction', kind: 'poly', index: 2 });
    expect(classifySound('clsh1.wav')).toEqual({ effect: 'clash', kind: 'poly', index: 1 });
    expect(classifySound('swng12.wav')).toEqual({ effect: 'swing', kind: 'poly', index: 12 });
    expect(classifySound('humidity.wav').kind).toBe('other');
  });

  it('a font whose only hum is hum1.wav has a hum, flat or polyphonic or monophonic', () => {
    const poly = checkFont(['hum1.wav', 'out1.wav', 'in1.wav', 'clsh1.wav', 'clsh2.wav'].map((name) => ({ name, size: 1, wav: null })));
    expect(poly.issues).toEqual([]);
    expect(poly.type).toBe('polyphonic');
    const mono = checkFont(['hum1.wav', 'poweron.wav', 'poweroff.wav', 'clash1.wav'].map((name) => ({ name, size: 1, wav: null })));
    expect(mono.issues).toEqual([]);
    expect(mono.type).toBe('monophonic');
  });

  it('two names for one effect is said plainly, and is not a missing hum', () => {
    const r = checkFont(['hum1.wav', 'poweron.wav', 'out01.wav', 'in01.wav'].map((name) => ({ name, size: 1, wav: null })));
    expect(r.issues.map((i) => i.kind)).toEqual(['mixed']);
    expect(r.issues[0].text).toBe('ignition: both poweron.wav and out01.wav are present. They are two names for the same effect. The font still works, but the saber may play only one of the two sets.');
  });
});

describe('font checks', () => {
  const ok = (name: string, rate = 44100) => ({ name, size: 1000, wav: parseWavHeader(wav(rate)) });
  it('accepts a clean polyphonic font', () => {
    const r = checkFont([ok('hum01.wav'), ok('out01.wav'), ok('in01.wav'), ok('clsh01.wav'), ok('clsh02.wav'), ok('swng01.wav'), ok('font.wav')]);
    expect(r.type).toBe('polyphonic');
    expect(r.issues).toEqual([]);
    expect(r.effects.clash).toEqual({ mono: 0, poly: 2 });
  });
  it('flags mono/poly mixing for the same effect, per effect', () => {
    const r = checkFont([ok('hum.wav'), ok('clash1.wav'), ok('clsh01.wav'), ok('swng01.wav')]);
    expect(r.type).toBe('mixed');
    expect(r.issues.map((i) => i.kind)).toEqual(['mixed']);
    expect(r.issues[0].files).toEqual(['clash1.wav', 'clsh01.wav']);
  });
  it('a monophonic font with a bare hum.wav is monophonic, not mixed', () => {
    const r = checkFont([ok('hum.wav'), ok('poweron.wav'), ok('poweroff.wav'), ok('clash1.wav'), ok('swing1.wav'), ok('font.wav')]);
    expect(r.type).toBe('monophonic');
    expect(r.issues).toEqual([]);
  });
  it('flags 48 kHz, stereo, 24-bit and a missing hum', () => {
    const r = checkFont([{ name: 'clsh01.wav', size: 1, wav: parseWavHeader(wav(48000, 2, 24)) }]);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['bits', 'missing-hum', 'rate', 'stereo']);
  });
});

describe('one checker over a listing (font-check-alignment)', () => {
  const entry = (path: string, header: Uint8Array | null = wav(44100)) => ({ path, size: 1000, header });
  it('gives flat and per-sound-folder layouts the same verdict, however the files are numbered', () => {
    const flat = checkFontListing(['hum01.wav', 'out01.wav', 'in01.wav', 'clsh01.wav', 'clsh02.wav'].map((p) => entry(p)));
    const padded = checkFontListing(['hum/hum01.wav', 'out/out01.wav', 'in/in01.wav', 'clsh/clsh01.wav', 'clsh/clsh02.wav'].map((p) => entry(p)));
    const plain = checkFontListing(['hum/hum1.wav', 'out/out1.wav', 'in/in1.wav', 'clsh/clsh1.wav', 'clsh/clsh2.wav'].map((p) => entry(p)));
    const numbered = checkFontListing(['hum/001.wav', 'out/001.wav', 'in/001.wav', 'clsh/001.wav', 'clsh/002.wav'].map((p) => entry(p)));
    for (const other of [padded, plain, numbered]) expect(other.report).toEqual(flat.report);
    expect(flat.report.issues).toEqual([]);
    expect(plain.report.effects.hum).toBeTruthy();
    expect(plain.report.effects.clash?.poly).toBe(2);
  });
  it('leaves tracks out of the sound checks but counts their size', () => {
    const r = checkFontListing([entry('hum01.wav'), entry('tracks/theme.wav', wav(48000, 2, 24)), entry('tracks/hum1.wav')]);
    expect(r.report.issues).toEqual([]);
    expect(r.report.files).toBe(1);
    expect(r.tracks.map((t) => t.path)).toEqual(['tracks/hum1.wav', 'tracks/theme.wav']);
    expect(r.bytes).toBe(3000);
  });
  it('shows unrecognised wav names as other files, not as effects', () => {
    const r = checkFontListing([entry('hum01.wav'), entry('readme.wav'), entry('lock01.wav')]);
    expect(r.sounds.find((s) => s.path === 'readme.wav')).toMatchObject({ effect: 'other files', kind: 'other' });
    expect(r.sounds.find((s) => s.path === 'lock01.wav')?.effect).toBe('lockup');
  });
  it('finds the format after a long extra chunk before fmt', () => {
    const fmt = wav(48000, 2, 16).subarray(12);
    const head = new Uint8Array(12 + 8 + 300 + fmt.length);
    head.set(wav(48000).subarray(0, 12));
    head.set([76, 73, 83, 84], 12);
    new DataView(head.buffer).setUint32(16, 300, true);
    head.set(fmt, 12 + 8 + 300);
    const r = checkFontListing([entry('hum01.wav', head)]);
    expect(r.report.issues.map((i) => i.kind).sort()).toEqual(['rate', 'stereo']);
  });
});
