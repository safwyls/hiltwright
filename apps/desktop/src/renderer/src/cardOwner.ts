// Whose SD card is this? A saber's card is often out of the saber, in a card reader, so the app can copy to it
// quickly; the checks on Build & Flash and Fonts & SD then need to know the card in the reader is that saber's.
// Kept apart from React so it can be tested under node.
//
// In order:
// - shared: the saber is sharing it over USB (its drive belongs to the saber's USB serial)
// - linked: the card's volume serial number is in the saber's record (linked when it was shared, or by the owner)
// - presets: its presets.ini holds the presets that saber last reported, and no other saber's

import type { CardInfo, SaberRecord } from '../../shared/api';

export type OwnedBy = 'shared' | 'linked' | 'presets';
export interface CardOwner { saber: SaberRecord; by: OwnedBy }

const sameList = (a: { font: string; name: string }[], b: { font: string; name: string }[]) =>
  a.length > 0 && a.length === b.length && a.every((p, i) => p.font.trim().toLowerCase() === b[i].font.trim().toLowerCase() && p.name.trim() === b[i].name.trim());

/** The saber this card belongs to, and how that is known; null when it cannot be told. */
export function ownerOfCard(card: CardInfo, sabers: SaberRecord[]): CardOwner | null {
  const real = sabers.filter((s) => !s.planned);
  if (card.saberSerial) { const s = real.find((x) => x.identity.usbSerial === card.saberSerial); if (s) return { saber: s, by: 'shared' }; }
  if (card.volumeSerial) { const s = real.find((x) => x.cards?.some((c) => c.serial === card.volumeSerial)); if (s) return { saber: s, by: 'linked' }; }
  if (card.presets?.length) {
    const m = real.filter((x) => sameList(card.presets!, x.presets));
    if (m.length === 1) return { saber: m[0], by: 'presets' };
  }
  return null;
}

/** The saber's own card among `cards`, the surest first; null when none of them is known to be its. */
export function saberCardIn(cards: CardInfo[], saber: SaberRecord | null, sabers: SaberRecord[]): { card: CardInfo; by: OwnedBy } | null {
  if (!saber) return null;
  const rank: Record<OwnedBy, number> = { shared: 0, linked: 1, presets: 2 };
  let best: { card: CardInfo; by: OwnedBy } | null = null;
  for (const card of cards) {
    const o = ownerOfCard(card, sabers);
    if (o && o.saber.id === saber.id && (!best || rank[o.by] < rank[best.by])) best = { card, by: o.by };
  }
  return best;
}

/** What to say about how the card is known to be the saber's. */
export function ownedByText(by: OwnedBy): string {
  return by === 'shared' ? 'shared by the saber' : by === 'linked' ? 'its own card' : 'its presets match';
}
