// The renderer's half of keeping the guided tour away from real sabers. While the tour runs, the board session
// (board.ts) sends nothing over the serial port, opens no port and restarts no saber, even when one is plugged in; the
// connection itself is left as it was. Main refuses every request that would change anything (main/tourGuard.ts).
// No React and no DOM here, so it is tested directly (test/tour.test.ts).

export const TOUR_REFUSAL = 'Not sent: the tour is running with an example saber, and nothing is sent to a real saber until it ends.';

let locked = false;
/** A saber that tried to connect while the tour ran: it is connected once the tour ends. */
let heldConnect = false;

export function setTourLock(on: boolean): void {
  locked = on;
  if (on) heldConnect = false;
}

export function tourLocked(): boolean {
  return locked;
}

/** Throws the plain refusal while the tour runs: the one check before anything is written to the serial port. */
export function assertMaySend(command: string): void {
  if (!locked) return;
  console.log(`[tour] not sent: ${command}`);
  throw new Error(TOUR_REFUSAL);
}

/** Why a board operation may not run now: the tour, else the saber's card shared with this computer, else null. */
export function operationRefusal(cardShared: boolean, saberName: string | null): string | null {
  if (locked) return TOUR_REFUSAL;
  return cardShared ? `Not sent: ${saberName ?? 'the saber'}'s card is shared with this computer. Give it back on Live › Card first.` : null;
}

/** A connection attempt during the tour is held, and remembered so it can be made once the tour ends. */
export function holdConnect(): boolean {
  if (!locked) return false;
  heldConnect = true;
  console.log('[tour] connect held until the tour ends');
  return true;
}

/** Whether a connection was held during the tour; reading it forgets it. */
export function takeHeldConnect(): boolean {
  const held = heldConnect;
  heldConnect = false;
  return held;
}

// Pages remember small choices (a tab, a filter, the card picked) in the window's storage, under `hiltwright.`. The
// tour clicks tabs to show them, so those choices are put back as they were when it ends.

/** Kept as the tour sets it: whether the first-launch offer has been answered. */
export const TOUR_OFFERED_KEY = 'hiltwright.tour.offered';
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
const ours = (k: string | null): k is string => !!k && k.startsWith('hiltwright.') && k !== TOUR_OFFERED_KEY;

export function snapshotPrefs(store: Store): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (ours(k)) out.set(k, store.getItem(k) ?? ''); }
  return out;
}

export function restorePrefs(store: Store, snap: Map<string, string>): void {
  const now: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (ours(k)) now.push(k); }
  for (const k of now) if (!snap.has(k)) store.removeItem(k);
  for (const [k, v] of snap) if (store.getItem(k) !== v) store.setItem(k, v);
}
