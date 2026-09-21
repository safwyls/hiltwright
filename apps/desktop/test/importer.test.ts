import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { importXenoFont, scanXenoCard } from '../src/main/importer';

/** A tiny but valid 44.1 kHz 16-bit mono WAV. */
function wav(samples = 441): Buffer {
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24); h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let card = '';
let proffie = '';

beforeAll(async () => {
  card = await mkdtemp(join(tmpdir(), 'hw-xeno-'));
  proffie = await mkdtemp(join(tmpdir(), 'hw-proffie-'));
  await mkdir(join(card, '1'));
  await mkdir(join(card, '2'));
  await mkdir(join(card, '12'));
  await mkdir(join(card, 'setting'));
  await writeFile(join(card, '1', 'fontconfig.ini'), '"Proffie Gold=(255,165,0),1,0,1,0,0,0,200,500"\r\n');
  for (const f of ['hum (1).wav', 'in (1).wav', 'out (1).wav', 'clash (1).wav', 'clash (2).wav', 'swing (1).wav', 'blaster (1).wav', 'track (1).wav']) await writeFile(join(card, '1', f), wav());
  await writeFile(join(card, '2', 'fontconfig.ini'), 'font2=(0,0,255),0,2,0,0,0,0,500,700');
  for (const f of ['hum (1).wav', 'out (1).wav']) await writeFile(join(card, '2', f), wav());
  await writeFile(join(card, '12', 'readme.txt'), 'empty slot');
  await writeFile(join(card, 'setting', 'config.ini'), 'volume=50');
});

afterAll(async () => {
  await rm(card, { recursive: true, force: true });
  await rm(proffie, { recursive: true, force: true });
});

describe('Xenopixel import', () => {
  it('lists the fonts on the card with their names, colours and counts, skipping empty slots', async () => {
    const fonts = await scanXenoCard(card);
    expect(fonts.map((f) => f.slot)).toEqual(['1', '2']);
    expect(fonts[0]).toMatchObject({ name: 'Proffie Gold', folder: 'Proffie Gold', hex: '#ffa500', colorWord: '65535,42405,0', effect: 'Steady', sounds: 7, tracks: 1 });
    // A placeholder name like "font2" is not a useful folder name.
    expect(fonts[1]).toMatchObject({ name: 'font2', folder: 'Xeno font 2', hex: '#0000ff', effect: 'Fire' });
  });

  it('converts a font onto the ProffieOS card without touching the source', async () => {
    const before = (await readdir(join(card, '1'))).sort();
    const entry = await importXenoFont(join(card, '1'), proffie, 'Proffie Gold', false);
    expect((await readdir(join(proffie, 'Proffie Gold'))).sort()).toEqual(['blst01.wav', 'clsh01.wav', 'clsh02.wav', 'hum01.wav', 'in01.wav', 'out01.wav', 'swng01.wav', 'tracks']);
    expect(await readdir(join(proffie, 'Proffie Gold', 'tracks'))).toEqual(['track01.wav']);
    expect(entry.report.issues).toEqual([]);
    expect((await readdir(join(card, '1'))).sort()).toEqual(before);
  });

  it('refuses to overwrite unless asked, and refuses unsafe folder names', async () => {
    await expect(importXenoFont(join(card, '1'), proffie, 'Proffie Gold', false)).rejects.toThrow(/already on the card/);
    await expect(importXenoFont(join(card, '1'), proffie, '../escape', false)).rejects.toThrow(/cannot be used/);
    await expect(importXenoFont(join(card, '1'), proffie, 'Proffie Gold', true)).resolves.toBeTruthy();
  });
});
