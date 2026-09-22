import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFonts } from '../src/main/sd';

/** A minimal 16-bit mono 44.1 kHz PCM wav header with no samples. */
function wav(): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0); b.writeUInt32LE(36, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(0, 40);
  return b;
}

describe('fonts on a card', () => {
  it('finds fonts laid out flat and fonts with one folder per sound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-card-'));
    // Flat: hum01.wav in the font folder.
    await mkdir(join(root, 'Flat'));
    for (const n of ['hum01.wav', 'out01.wav', 'in01.wav', 'clsh01.wav']) await writeFile(join(root, 'Flat', n), wav());
    // Folders: hum/hum01.wav and clsh/001.wav.
    for (const d of ['hum', 'out', 'in', 'clsh']) await mkdir(join(root, 'Foldered', d), { recursive: true });
    await writeFile(join(root, 'Foldered', 'hum', 'hum01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'out', 'out01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'in', 'in01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'clsh', '001.wav'), wav());
    await writeFile(join(root, 'Foldered', 'clsh', '002.wav'), wav());
    // Not a font: a folder of something else, and the common folder.
    await mkdir(join(root, 'tracks')); await writeFile(join(root, 'tracks', 'song.wav'), wav());
    await mkdir(join(root, 'common')); await writeFile(join(root, 'common', 'voicepack.ini'), 'voice_pack_version=2\n');

    const fonts = await listFonts(root);
    expect(fonts.map((f) => f.name)).toEqual(['Flat', 'Foldered']);
    const foldered = fonts[1].report;
    expect(foldered.files).toBe(5);
    expect(foldered.effects.hum).toBeTruthy();
    expect(foldered.effects.clash?.poly).toBe(2); // 001.wav under clsh/ counts as a clash
    expect(foldered.issues.find((i) => i.kind === 'missing-hum')).toBeUndefined();
  });
});
