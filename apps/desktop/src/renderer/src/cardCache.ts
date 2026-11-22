// What was read from cards, kept while the app runs so every page that shows a card (Install › Fonts, the two Card
// pages, Build & Flash) uses one read instead of each reading the card again. Reading the fonts takes seconds from a
// reader and minutes over the saber's USB link.
//
// A read is current while the same card (drive, serial number) is in, this app has not written to it since (`writes`,
// counted by the main process), and its free space is the same: copying or deleting anything changes that, also from
// Explorer. Two pages asking at once share one look for drives and one read of a card (`sharedLook`, `sharedRead`).
// Look again always reads afresh.

import type { VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, DriveLook, FontEntry, HiltwrightApi, MountedDrive } from '../../shared/api';

/**
 * The drives mounted (sd.mounted), as one text to compare between two asks: each root with the volume in it, so a
 * card swapped for another at the same drive letter changes it too (issue #9), not only a card put in or taken out.
 */
export function drivesKey(drives: MountedDrive[]): string {
  return drives.map((d) => `${d.root}=${d.volumeId ?? ''}`).join('|');
}

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

// Through globalThis: this module is also checked without the page's types (its tests run under Node).
const api = () => (globalThis as unknown as { hiltwright: HiltwrightApi }).hiltwright;
let lastCards: CardInfo[] | null = null;
let lastRead: CardRead | null = null;
/** Every card read this run, by drive and serial number: a few at most. */
const reads = new Map<string, CardRead>();
const cardKey = (c: { root: string; volumeSerial: string | null }) => `${c.root}|${c.volumeSerial ?? ''}`;

/** The drives seen at the last look, to draw the page with before looking again. */
export function cachedCards(): CardInfo[] | null { return lastCards; }
export function rememberCards(cards: CardInfo[]): void { lastCards = cards; }

/** What was read from this card, if that is still what is on it. */
export function cachedRead(card: CardInfo | null): CardRead | null {
  const r = card ? reads.get(cardKey(card)) : undefined;
  if (!card || !r) return null;
  const same = r.writes === card.writes && r.freeBytes === card.freeBytes;
  return same ? r : null;
}

/** The last read whatever it was of, to draw the page with before looking: the look then says whether it still holds. */
export function lastCardRead(): CardRead | null { return lastRead; }

export function rememberRead(card: CardInfo, read: Pick<CardRead, 'fonts' | 'tracks' | 'voice'>): void {
  lastRead = { root: card.root, volumeSerial: card.volumeSerial, freeBytes: card.freeBytes, writes: card.writes, ...read, at: Date.now() };
  reads.set(cardKey(card), lastRead);
}

export function forgetCardRead(): void { lastRead = null; reads.clear(); }

let looking: Promise<DriveLook> | null = null;
/** Look for cards; a look already under way (another page asking at the same moment) is shared, not repeated. */
export function sharedLook(): Promise<DriveLook> {
  if (looking) return looking;
  const p = api().sd.look().then((l: DriveLook) => { if (l.answered) rememberCards(l.cards); return l; }).finally(() => { looking = null; });
  looking = p;
  return p;
}

const reading = new Map<string, Promise<CardRead>>();
/**
 * This card's fonts, tracks and voice pack: as read before while that still holds, else read now, sharing a read
 * another page already started of the same card in the same state. `fresh` (Look again) always reads.
 */
export function sharedRead(card: CardInfo, fresh = false): Promise<CardRead> {
  const kept = fresh ? null : cachedRead(card);
  if (kept) return Promise.resolve(kept);
  const key = `${cardKey(card)}|${card.writes}|${card.freeBytes ?? ''}`;
  const under = reading.get(key);
  if (under) return under;
  const p = Promise.all([api().sd.listFonts(card.root), api().sd.listTracks(card.root), api().sd.voicePack(card.root)])
    .then(([fonts, tracks, voice]) => { rememberRead(card, { fonts, tracks, voice }); return lastRead!; })
    .finally(() => { reading.delete(key); });
  reading.set(key, p);
  return p;
}
