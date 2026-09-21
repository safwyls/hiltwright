import { describe, expect, it } from 'vitest';
import { hasMenuSounds, parseVoicePackIni, voicePackFromSerial, voicePackVerdict } from '../src';

describe('voice pack', () => {
  it('parses voicepack.ini; a file without the key counts as version 1, like ProffieOS', () => {
    expect(parseVoicePackIni(null)).toEqual({ ini: false, version: null });
    expect(parseVoicePackIni('# Fett263 voice pack\r\nvoice_pack_version=2\r\n')).toEqual({ ini: true, version: 2 });
    expect(parseVoicePackIni('voice_pack_version = 1 # old')).toEqual({ ini: true, version: 1 });
    expect(parseVoicePackIni('')).toEqual({ ini: true, version: 1 });
  });

  it('recognises the menu number sounds as files or as a folder', () => {
    expect(hasMenuSounds(['hum01.wav', 'mnum1.wav', 'mnum2.wav'])).toBe(true);
    expect(hasMenuSounds(['mnum'])).toBe(true);
    expect(hasMenuSounds(['hum.wav', 'minimum.wav'])).toBe(false);
  });

  it('reads the board answers to cat and dir', () => {
    const s = voicePackFromSerial(['voice_pack_version=2'], ['mnum 0', 'voicepack.ini 23', 'mzoom.wav 40012', 'Done listing files.']);
    expect(s).toEqual({ ini: true, version: 2, menuSounds: true });
    expect(voicePackFromSerial([], ['No such directory.'])).toEqual({ ini: false, version: null, menuSounds: false });
    expect(voicePackFromSerial(['Whut? :cat'], ['Whut? :dir'])).toEqual({ ini: false, version: null, menuSounds: false });
  });

  it('only Fett263 needs the pack, and it needs version 2', () => {
    expect(voicePackVerdict('sa22c', null)).toBeNull();
    expect(voicePackVerdict('fett263', { ini: true, version: 2, menuSounds: true })).toMatchObject({ ok: true, tone: 'green' });
    expect(voicePackVerdict('fett263', { ini: true, version: 1, menuSounds: true })?.text).toMatch(/version 1.*needs version 2/);
    expect(voicePackVerdict('fett263', { ini: false, version: null, menuSounds: false })?.text).toMatch(/No voice pack found/);
    expect(voicePackVerdict('fett263', { ini: true, version: 2, menuSounds: false })?.text).toMatch(/menu sounds/);
    expect(voicePackVerdict('fett263', null)?.text).toMatch(/could not check/);
  });
});
