import { describe, expect, it } from 'vitest';
import { fontsInFolder, listOpenFonts, readOpenFont, rememberFonts } from '../src/renderer/web/webFonts';
import { playableKey } from '../src/shared/fontSounds';

const f = (path: string, body = 'x') => ({ file: new File([body], path.split('/').pop()!), path });

describe('which files a listen needs (shared with the app)', () => {
  it('takes numbered sounds, sound folders and transition sounds, and leaves the rest', () => {
    expect(playableKey(['hum01.wav'])).toBe('hum01.wav');
    expect(playableKey(['clsh', 'clsh3.wav'])).toBe('clsh/clsh3.wav');
    expect(playableKey(['tr', '001', '000.wav'])).toBe('tr/001/000.wav');
    expect(playableKey(['track1.wav'])).toBeNull();
    expect(playableKey(['tracks', 'theme.wav'])).toBeNull();
    expect(playableKey(['config.ini'])).toBeNull();
    expect(playableKey(['.hidden', 'hum.wav'])).toBeNull();
  });
});

describe('fonts in a folder the visitor opened', () => {
  it('reads one font folder as one font', () => {
    const found = fontsInFolder([f('Kylo/hum01.wav'), f('Kylo/clsh/clsh1.wav'), f('Kylo/config.ini')]);
    expect([...found.keys()]).toEqual(['Kylo']);
    expect([...found.get('Kylo')!.keys()].sort()).toEqual(['clsh/clsh1.wav', 'config.ini', 'hum01.wav']);
  });

  it('reads a folder of fonts as each font in it, and skips folders with no saber sound', () => {
    const found = fontsInFolder([f('Fonts/Kylo/hum01.wav'), f('Fonts/Ronin/hum/hum1.wav'), f('Fonts/readme/notes.txt'), f('Fonts/tracks/theme.wav')]);
    expect([...found.keys()].sort()).toEqual(['Kylo', 'Ronin']);
  });

  it('says so when there is no font at all', () => {
    expect(rememberFonts([f('Holiday/photo.jpg')])).toEqual({ added: [], skipped: [{ name: 'Holiday', why: expect.stringContaining('No sound font') }] });
  });

  it('keeps an opened font for the visit and reads its sounds and ini files as the app does', async () => {
    expect(rememberFonts([f('Ember/hum01.wav', 'hum!'), f('Ember/clsh01.wav', 'clash'), f('Ember/track.wav', 'music'), f('Ember/smoothsw.ini', 'SwingSensitivity=450\n')])).toEqual({ added: ['Ember'], skipped: [] });
    expect(listOpenFonts().find((x) => x.folder === 'Ember')?.support.smoothSwing).toBe(true);
    const sounds = await readOpenFont('Ember');
    expect(Object.keys(sounds.files).sort()).toEqual(['clsh01.wav', 'hum01.wav']);
    expect(new TextDecoder().decode(sounds.files['hum01.wav'])).toBe('hum!');
    expect(sounds.smoothsw).toEqual({ SwingSensitivity: '450' });
    await expect(readOpenFont('Nowhere')).rejects.toThrow('not open here');
  });
});
