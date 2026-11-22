import { describe, expect, it } from 'vitest';
import { voiceNeedText, voiceWork } from '../src/renderer/src/voiceChoice';

const good = { ini: true, version: 2, menuSounds: true, mixed: [] };

describe('the voice pack a saber carries', () => {
  it('puts the chosen pack, else the bundled one, on a card without a working pack', () => {
    const base = { chosen: undefined, fallback: 'english-a', onCard: null };
    expect(voiceWork({ ...base, voice: { ini: false, version: null, menuSounds: false } })).toEqual({ pack: 'english-a', why: 'missing' });
    expect(voiceWork({ ...base, voice: { ini: true, version: 1, menuSounds: true } })).toEqual({ pack: 'english-a', why: 'old' });
    expect(voiceWork({ ...base, voice: { ini: true, version: 2, menuSounds: false } })).toEqual({ pack: 'english-a', why: 'missing' });
    expect(voiceWork({ ...base, chosen: 'english-b', voice: { ...good, mixed: ['mnum'] } })).toEqual({ pack: 'english-b', why: 'mixed' });
  });

  it('leaves a working pack alone unless the owner chose another voice', () => {
    expect(voiceWork({ chosen: undefined, fallback: 'english-a', voice: good, onCard: null })).toBeNull();
    expect(voiceWork({ chosen: 'english-b', fallback: 'english-a', voice: good, onCard: 'english-b' })).toBeNull();
    expect(voiceWork({ chosen: 'english-b', fallback: 'english-a', voice: good, onCard: 'english-a' })).toEqual({ pack: 'english-b', why: 'change' });
    // Never given a voice by Hiltwright: the owner's choice goes on.
    expect(voiceWork({ chosen: 'english-b', fallback: 'english-a', voice: good, onCard: null })).toEqual({ pack: 'english-b', why: 'change' });
  });

  it('says nothing while the card is not read, or with no pack to offer', () => {
    expect(voiceWork({ chosen: 'english-b', fallback: 'english-a', voice: null, onCard: null })).toBeNull();
    expect(voiceWork({ chosen: undefined, fallback: null, voice: { ini: false, version: null, menuSounds: false }, onCard: null })).toBeNull();
  });

  it('says what the card step will do', () => {
    expect(voiceNeedText('mixed', 'English A', { ...good, mixed: ['mnum'] })).toMatch(/English A voice pack on again.*mnum.*"error in font directory"/);
    expect(voiceNeedText('old', 'English A', { ini: true, version: 1, menuSounds: true })).toMatch(/version 1 pack/);
  });
});
