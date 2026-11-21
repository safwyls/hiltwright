import { describe, expect, it } from 'vitest';
import { hasMenuSounds, presetsWithoutCommon, parseVoicePackIni, voicePackFolder, voicePackFromSerial, voicePackVerdict } from '../src';

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

  it('finds the voice pack inside a package however it is wrapped', () => {
    // The V2 C-3PO package: common/ at the top, with a readme and picture beside it.
    expect(voicePackFolder(['a_ReadMe.txt', 'common/', 'common/voicepack.ini', 'common/mnum/', 'common/mnum/mnum1.wav', 'common/mup.wav'])).toBe('common/');
    // The hubbe.net English packs: wrapped in a folder named after the pack, and no voicepack.ini (version 1).
    expect(voicePackFolder(['ProffieOS_Voicepack_English_B/common/mup.wav', 'ProffieOS_Voicepack_English_B/common/mnum/mnum1.wav'])).toBe('ProffieOS_Voicepack_English_B/common/');
    // Loose files, and the shallowest voicepack.ini when a package carries a spare copy deeper down.
    expect(voicePackFolder(['voicepack.ini', 'mnum1.wav', 'extras/voicepack.ini'])).toBe('');
    expect(voicePackFolder(['__MACOSX/common/voicepack.ini', 'x/common/voicepack.ini'])).toBe('x/common/');
    expect(voicePackFolder(['TeensySF/hum.wav', 'TeensySF/config.ini'])).toBeNull();
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

  it('the three outcomes: found, missing, could not check', () => {
    const found = voicePackVerdict('fett263', { ini: true, version: 2, menuSounds: true })!;
    expect(found).toMatchObject({ ok: true, tone: 'green' });
    expect(found.text).toMatch(/found on the card/);

    const missing = voicePackVerdict('fett263', { ini: false, version: null, menuSounds: false })!;
    expect(missing).toMatchObject({ ok: false, tone: 'amber' });
    expect(missing.text).toMatch(/No voice pack found/);
    expect(missing.text).toMatch(/speaks a voice pack error/);

    const unread = voicePackVerdict('fett263', null, 'the saber is not answering')!;
    expect(unread).toMatchObject({ ok: false, tone: 'amber' });
    expect(unread.text).toMatch(/could not check/);
    expect(unread.text).toMatch(/the saber is not answering/);
    // Not being able to read the card is not the pack being missing.
    expect(unread.text).not.toMatch(/No voice pack found|speaks a voice pack error|Put the Fett263/);
  });

  it('a pack in common is not seen by presets whose font path leaves common out', () => {
    const pack = { ini: true, version: 2, menuSounds: true };
    const presets = [{ font: 'TeensySF' }, { font: 'SmthJedi' }, { font: 'Good;common' }, { font: 'common' }];
    expect(presetsWithoutCommon(presets)).toBe(2);
    expect(presetsWithoutCommon([])).toBe(0);
    expect(voicePackVerdict('fett263', pack, null, 0)).toMatchObject({ ok: true, tone: 'green' });
    const v = voicePackVerdict('fett263', pack, null, 2)!;
    expect(v).toMatchObject({ ok: false, tone: 'amber' });
    expect(v.text).toMatch(/2 presets/);
    expect(v.text).toMatch(/voice pack not found/);
    expect(v.text).toMatch(/Also use common sounds/);
    // A card that could not be read, or a prop without the pack, says nothing about presets.
    expect(voicePackVerdict('fett263', null, 'x', 2)!.text).not.toMatch(/voice pack not found/);
    expect(voicePackVerdict('sa22c', pack, null, 2)).toBeNull();
  });
});
