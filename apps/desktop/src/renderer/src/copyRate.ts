// How long a copy onto a saber's card takes, by route: a card reader on this computer, or the saber's own USB, which
// runs at USB 1.1 full speed (docs/install-live-plan.md). The starting rates come from hote2 on 2026-11-14: one font
// took about 4 s through a USB 3 reader and about 120 s over the saber's USB, some 30 times slower; taken as a typical
// 40 MB font. Each real copy on this computer then moves the rate towards what it measured.

export type CopyRoute = 'reader' | 'saber';

/** Bytes per second before anything has been measured here. */
export const START_RATE: Record<CopyRoute, number> = { reader: 10_000_000, saber: 340_000 };
const KEY = 'hiltwright.copyRate';
/** How far one new measurement moves the rate: enough to learn quickly, not so much that one odd copy rules. */
const WEIGHT = 0.5;
/** Copies this small are mostly overhead and say little about the rate. */
const MIN_BYTES = 2_000_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => { try { return localStorage; } catch { return null; } };

/** The rates known on this computer, each route falling back to its starting rate. */
export function copyRates(store: Store | null = storage()): Record<CopyRoute, number> {
  try {
    const kept = JSON.parse(store?.getItem(KEY) ?? '{}') as Partial<Record<CopyRoute, number>>;
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
    return { reader: ok(kept.reader) ? kept.reader : START_RATE.reader, saber: ok(kept.saber) ? kept.saber : START_RATE.saber };
  } catch { return { ...START_RATE }; }
}

/** Remember how a real copy went, so the next estimate on this computer is closer. */
export function recordCopy(route: CopyRoute, bytes: number, ms: number, store: Store | null = storage()): void {
  if (bytes < MIN_BYTES || ms <= 0) return;
  const now = copyRates(store);
  const measured = bytes / (ms / 1000);
  try { store?.setItem(KEY, JSON.stringify({ ...now, [route]: now[route] * (1 - WEIGHT) + measured * WEIGHT })); } catch { /* private mode */ }
}

/** Seconds to copy this many bytes by this route. */
export function copySeconds(bytes: number, route: CopyRoute, rates: Record<CopyRoute, number> = copyRates()): number {
  return bytes / rates[route];
}

/** A time in plain words, rounded the way a person would say it: "about 40 s", "about 3 minutes", "about 1 h 20 min". */
export function aboutTime(seconds: number): string {
  if (seconds < 1) return 'a moment';
  if (seconds < 60) return `about ${Math.max(1, Math.round(seconds / 5) * 5 || Math.round(seconds))} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `about ${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60); const m = min % 60;
  return `about ${h} h${m ? ` ${m} min` : ''}`;
}
