import { describe, expect, it } from 'vitest';
import { checkFont, classifySound, parseWavHeader } from '../src';

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
