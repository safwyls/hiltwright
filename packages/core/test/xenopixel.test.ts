import { describe, expect, it } from 'vitest';
import { checkFont, parseXenoFontConfig, planXenoFont, proffieFolderName, xenoColorHex, xenoColorWord } from '../src';

describe('Xenopixel fontconfig.ini', () => {
  it('parses the documented line, with or without quotes and a BOM', () => {
    const c = parseXenoFontConfig('﻿"Proffie Gold=(255,165,0),1,0,1,0,0,0,200,500"\r\n');
    expect(c).toEqual({ name: 'Proffie Gold', color: { r: 255, g: 165, b: 0 }, bladeEffect: 1, bladeStyle: 0, ignitionSpeed: 200, retractionSpeed: 500, raw: [1, 0, 1, 0, 0, 0, 200, 500] });
    expect(parseXenoFontConfig('font46=(0,0,255),0,2,0,0,0,0,500,700')?.retractionSpeed).toBe(700);
    expect(parseXenoFontConfig('Short=(300,0,0)')).toMatchObject({ name: 'Short', color: { r: 255, g: 0, b: 0 }, bladeEffect: null });
    expect(parseXenoFontConfig('; nothing here\n[section]\n')).toBeNull();
  });

  it('converts colours to ProffieOS words and hex', () => {
    expect(xenoColorWord({ r: 255, g: 165, b: 0 })).toBe('65535,42405,0');
    expect(xenoColorHex({ r: 0, g: 0, b: 255 })).toBe('#0000ff');
  });
});

describe('Xenopixel font conversion plan', () => {
  const files = ['hum (1).wav', 'in (1).wav', 'in (2).wav', 'out (1).wav', 'clash (1).wav', 'clash (10).wav', 'clash (2).wav', 'swing (1).wav', 'blaster (1).wav',
    'lock (1).wav', 'beginlock (1).wav', 'force (1).wav', 'font (1).wav', 'track (1).wav', 'track (2).wav', 'fontconfig.ini', 'Thumbs.db'];
  it('renames to ProffieOS names with two-digit numbers and moves music into tracks/', () => {
    const p = planXenoFont(files);
    const to = Object.fromEntries(p.moves.map((m) => [m.from, m.to]));
    expect(to['hum (1).wav']).toBe('hum01.wav');
    expect(to['clash (10).wav']).toBe('clsh10.wav');
    expect(to['swing (1).wav']).toBe('swng01.wav');
    expect(to['blaster (1).wav']).toBe('blst01.wav');
    expect(to['beginlock (1).wav']).toBe('bgnlock01.wav');
    expect(to['in (2).wav']).toBe('in02.wav');
    expect(to['out (1).wav']).toBe('out01.wav');
    expect(to['track (2).wav']).toBe('tracks/track02.wav');
    expect(p.skipped.sort()).toEqual(['Thumbs.db', 'fontconfig.ini']);
    expect(p).toMatchObject({ tracks: 2, sounds: 13 });
  });
  it('the converted names form a font ProffieOS can play', () => {
    const p = planXenoFont(files);
    const report = checkFont(p.moves.filter((m) => !m.to.startsWith('tracks/')).map((m) => ({ name: m.to, size: 100000, wav: { sampleRate: 44100, bits: 16, channels: 1, format: 1, seconds: 1.1 } })));
    expect(report.issues).toEqual([]);
  });
  it('never maps two files onto one name', () => {
    const p = planXenoFont(['clash (1).wav', 'clash.wav', 'Clash (1).WAV']);
    expect(new Set(p.moves.map((m) => m.to)).size).toBe(3);
  });
  it('makes folder names safe for the card and for font paths', () => {
    expect(proffieFolderName('Kylo; Ren / v2', 'font7')).toBe('Kylo Ren v2');
    expect(proffieFolderName(';;', 'font7')).toBe('font7');
  });
});
