// Card writes, one at a time per card (issue #6). Every request that changes a card (copying a font, putting a voice
// pack on, clearing the presets file, importing, ejecting) runs through here, so two pages, or two fonts copied one
// after the other from the Font Library, never write to one card at once. Each waits for the one before it on the
// same card, whether that one succeeded or not. Different cards do not wait for each other.

import { resolve } from 'node:path';

const tails = new Map<string, Promise<void>>();

const keyOf = (root: string) => resolve(root).toLowerCase();

export function onCard<T>(root: string, work: () => Promise<T>): Promise<T> {
  const key = keyOf(root);
  const before = tails.get(key) ?? Promise.resolve();
  const run = before.then(work);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(key, tail);
  void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}
