// The page's long jobs, as they run: an install or a restore sequence, a copy to the card, sharing the card. Kept
// here, outside any page, because a job goes on when its page is left (Build & Flash, Fonts & SD). Restart to
// update asks what is running (shared/updates.ts restartRefusal); main adds the requests it is still answering.
// No React and no DOM here, so it is tested directly (test/updates.test.ts).

import type { WorkKind } from '../../shared/updates';

const running = new Map<WorkKind, number>();

/** Run `fn` counted as a job of this kind, until it settles. */
export async function duringWork<T>(kind: WorkKind, fn: () => Promise<T>): Promise<T> {
  running.set(kind, (running.get(kind) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    const n = (running.get(kind) ?? 1) - 1;
    if (n > 0) running.set(kind, n); else running.delete(kind);
  }
}

/** The kinds of job running now. */
export function workNow(): WorkKind[] {
  return [...running.keys()];
}
