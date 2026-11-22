// The voice pack a saber carries, chosen on Install › Fonts like its fonts and put on its card on
// Install › Card. The card gets a pack when it has no working one (none, too old, or an old pack's files mixed with a
// newer one's), or when the owner chose a voice other than the one Hiltwright last put on it.
//
// Which pack is on a card cannot be read back (voicepack.ini says only its version), so the one Hiltwright put on
// is remembered per saber on this computer. Not known is not different: a saber Hiltwright never gave a voice to
// gets the chosen one only when the owner chose one.

import { FETT263_REQUIRED_VOICE_PACK, type VoicePackStatus } from '@hiltwright/core';

export type VoiceNeed = 'missing' | 'old' | 'mixed' | 'change';

/** Whether the card needs a voice pack put on, and which. Null when it does not, or its pack is not known yet. */
export function voiceWork(o: { chosen: string | undefined; fallback: string | null; voice: VoicePackStatus | null; onCard: string | null }): { pack: string; why: VoiceNeed } | null {
  const pack = o.chosen ?? o.fallback;
  if (!pack || !o.voice) return null;
  const v = o.voice;
  if (!v.menuSounds && !v.ini) return { pack, why: 'missing' };
  if ((v.version ?? 1) < FETT263_REQUIRED_VOICE_PACK) return { pack, why: 'old' };
  if (!v.menuSounds) return { pack, why: 'missing' };
  if (v.mixed?.length) return { pack, why: 'mixed' };
  if (o.chosen && o.onCard !== o.chosen) return { pack, why: 'change' };
  return null;
}

/** One line on what the card's pack needs, for the Card step and Install › Fonts. */
export function voiceNeedText(why: VoiceNeed, name: string, voice: VoicePackStatus | null): string {
  switch (why) {
    case 'missing': return `Put the ${name} voice pack on: the card has ${voice?.ini ? 'no menu sounds' : 'no voice pack'}.`;
    case 'old': return `Put the ${name} voice pack on, in place of the card's version ${voice?.version ?? 1} pack.`;
    case 'mixed': return `Put the ${name} voice pack on again, clearing an older pack's ${voice?.mixed?.join(' and ') ?? ''} files that make the saber say "error in font directory".`;
    case 'change': return `Put the ${name} voice pack on, in place of the one on the card.`;
  }
}

interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
const KEY = 'hiltwright.voiceOn';
const store = (): KeyStore | null => (globalThis as { localStorage?: KeyStore }).localStorage ?? null;
const readAll = (): Record<string, string> => {
  try { const t = store()?.getItem(KEY); return t ? (JSON.parse(t) as Record<string, string>) : {}; } catch { return {}; }
};

/** The catalogue pack Hiltwright last put on this saber's card; null when not known, or a zip the owner chose. */
export function voiceOnCard(saberId: string): string | null {
  const v = readAll()[saberId];
  return typeof v === 'string' && v !== 'file' ? v : null;
}

/** Remember what was just put on this saber's card: a catalogue pack's id, or null for a zip the owner chose. */
export function rememberVoiceOn(saberId: string, pack: string | null): void {
  try { store()?.setItem(KEY, JSON.stringify({ ...readAll(), [saberId]: pack ?? 'file' })); } catch { /* not kept: asked again next time */ }
}
