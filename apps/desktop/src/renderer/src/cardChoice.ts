// Which card Fonts & SD shows and copies to (card-safety D3). Kept apart from React so it can be tested under node.

import type { CardInfo } from '../../shared/api';

export interface CardChoice {
  /** The card to show, or null while there is none, or while the owner must choose. */
  card: CardInfo | null;
  /** The card is the connected saber's own, shared over USB. */
  own: boolean;
  /** Several ProffieOS cards and none of them the saber's: the owner chooses, and nothing is copied meanwhile. */
  ask: boolean;
  /** Every drive with media the owner could switch to: ProffieOS cards, empty cards and others (card-safety 2.4). */
  choices: CardInfo[];
}

/** What a drive holds, for the list and the page's note. */
export function cardKind(c: CardInfo): 'saber' | 'empty' | 'other' {
  return c.proffie ? 'saber' : c.empty ? 'empty' : 'other';
}

/**
 * - the owner's own choice, while that card is still there (they switched, or answered "which card")
 * - the card the connected saber is sharing: its drive belongs to that saber's USB serial, or it is the drive that
 *   appeared when the app asked the saber to share
 * - the working saber's own card in a card reader (`ownRoots`)
 * - the only ProffieOS card
 * - otherwise ask, when there is anything to choose: an empty or non-saber drive is never picked by itself
 */
export function chooseCard(cards: CardInfo[], opts: { sharedRoot: string | null; saberSerial: string | null; chosen: string | null; ownRoots?: string[] }): CardChoice {
  const isOwn = (c: CardInfo) => (!!opts.saberSerial && c.saberSerial === opts.saberSerial) || (!!opts.sharedRoot && c.root === opts.sharedRoot);
  const choices = cards;
  const pick = (card: CardInfo | null, ask = false): CardChoice => ({ card, own: !!card && isOwn(card), ask, choices });
  const chosen = opts.chosen ? choices.find((c) => c.root === opts.chosen) : undefined;
  if (chosen) return pick(chosen);
  const own = choices.find(isOwn);
  if (own) return pick(own);
  // The working saber's own card in a reader (cardOwner.ts): known by its serial number or its presets.
  const mine = opts.ownRoots?.length ? choices.find((c) => opts.ownRoots!.includes(c.root)) : undefined;
  if (mine) return pick(mine);
  const saberCards = choices.filter((c) => c.proffie);
  if (saberCards.length === 1) return pick(saberCards[0]);
  return pick(null, choices.length > 0);
}

/**
 * The card the owner picked on Fonts & SD, kept for this run so the font library copies to the same one. Not saved:
 * drive letters change from one day to the next.
 */
let remembered: string | null = null;
export function rememberCardChoice(root: string | null): void { remembered = root; }
export function rememberedCardChoice(): string | null { return remembered; }
