import { describe, expect, it } from 'vitest';
import { START_RATE, aboutTime, copyRates, copySeconds, recordCopy } from '../src/renderer/src/copyRate';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('how long a copy onto the card takes', () => {
  it('starts from hote2\'s measurement: a 40 MB font in about 4 s by reader, about 2 minutes over the saber\'s USB', () => {
    const r = copyRates(memory());
    expect(copySeconds(40_000_000, 'reader', r)).toBeCloseTo(4, 0);
    expect(Math.round(copySeconds(40_000_000, 'saber', r))).toBeGreaterThanOrEqual(110);
    expect(Math.round(copySeconds(40_000_000, 'saber', r))).toBeLessThanOrEqual(125);
  });

  it('learns from a real copy on this computer, one route at a time', () => {
    const s = memory();
    recordCopy('reader', 100_000_000, 5_000, s); // 20 MB/s measured
    const r = copyRates(s);
    expect(r.reader).toBe(START_RATE.reader * 0.5 + 20_000_000 * 0.5);
    expect(r.saber).toBe(START_RATE.saber);
  });

  it('ignores copies too small to say anything, and anything unreadable kept before', () => {
    const s = memory();
    recordCopy('saber', 500_000, 100, s);
    expect(copyRates(s)).toEqual(START_RATE);
    s.setItem('hiltwright.copyRate', '{"reader":-3,"saber":"x"}');
    expect(copyRates(s)).toEqual(START_RATE);
    s.setItem('hiltwright.copyRate', 'not json');
    expect(copyRates(s)).toEqual(START_RATE);
  });

  it('says a time the way a person would', () => {
    expect(aboutTime(0.2)).toBe('a moment');
    expect(aboutTime(4)).toBe('about 5 s');
    expect(aboutTime(38)).toBe('about 40 s');
    expect(aboutTime(118)).toBe('about 2 minutes');
    expect(aboutTime(61)).toBe('about 1 minute');
    expect(aboutTime(80 * 60)).toBe('about 1 h 20 min');
    expect(aboutTime(120 * 60)).toBe('about 2 h');
  });
});
