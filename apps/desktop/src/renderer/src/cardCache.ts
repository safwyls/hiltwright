// What was last read from a card, kept while the app runs so Fonts & SD (and Build & Install) can show it at once when
// the owner comes back, instead of reading the whole card again. Reading the fonts takes seconds from a reader and
// minutes over the saber's USB link.
//
// A read is current while the same card (drive, serial number) is in, this app has not written to it since (`writes`,
// counted by the main process), and its free space is the same: copying or deleting anything changes that, also from
// Explorer. Look again on Fonts & SD always reads afresh.

import type { VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, FontEntry } from '../../shared/api';

export interface CardRead {
  root: string;
  volumeSerial: string | null;
  freeBytes: number | null;
  writes: number;
  fonts: FontEntry[];
  tracks: { name: string; size: number }[];
  voice: VoicePackStatus | null;
  /** When it was read (ms). */
  at: number;
}

let lastCards: CardInfo[] | null = null;
let lastRead: CardRead | null = null;

/** The drives seen at the last look, to draw the page with before looking again. */
export function cachedCards(): CardInfo[] | null { return lastCards; }
export function rememberCards(cards: CardInfo[]): void { lastCards = cards; }

/** What was read from this card, if that is still what is on it. */
export function cachedRead(card: CardInfo | null): CardRead | null {
  const r = lastRead;
  if (!card || !r) return null;
  const same = r.root === card.root && r.volumeSerial === card.volumeSerial && r.writes === card.writes && r.freeBytes === card.freeBytes;
  return same ? r : null;
}

/** The last read whatever it was of, to draw the page with before looking: the look then says whether it still holds. */
export function lastCardRead(): CardRead | null { return lastRead; }

export function rememberRead(card: CardInfo, read: Pick<CardRead, 'fonts' | 'tracks' | 'voice'>): void {
  lastRead = { root: card.root, volumeSerial: card.volumeSerial, freeBytes: card.freeBytes, writes: card.writes, ...read, at: Date.now() };
}

export function forgetCardRead(): void { lastRead = null; }
