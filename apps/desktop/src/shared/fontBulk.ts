// Words and rules for the Font library page that are worth testing without the page: what the banner says after an
// import, which rows a click selects, and what a bulk action reports.

import type { ImportResult } from './api';

const list = (names: string[]) => names.join(', ');

/** Each name once, in first-seen order, with how many times it came up: "Asteria (5 copies)". */
function counted(names: string[]): string[] {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].map(([name, count]) => (count > 1 ? `${name} (${count} copies)` : name));
}

/** The banner after adding packages or folders. Every folder left out is said once, grouped by why. */
export function importSummary(r: ImportResult): { tone: 'green' | 'amber' | 'red'; text: string } {
  const boards = counted(r.skipped.filter((s) => s.reason === 'other-board').map((s) => s.from ?? s.name));
  const extras = counted(r.skipped.filter((s) => s.reason === 'extra').map((s) => s.name));
  const other = [...new Set(r.skipped.filter((s) => !s.reason).map((s) => `${s.name}: ${s.why}`))];
  const parts: string[] = [];
  if (r.added.length) parts.push(`Added ${list(r.added)}.`);
  if (boards.length) parts.push(`Not added, made for another board: ${list(boards)}.`);
  if (extras.length) parts.push(`Not added, extra sounds that are not a whole font: ${list(extras)}.`);
  const have = r.skipped.filter((s) => s.reason === 'have').map((s) => s.name);
  if (have.length) parts.push(`Already in the library, left as ${have.length === 1 ? 'it is' : 'they are'}: ${list(have)}.`);
  if (other.length) parts.push(`Not added: ${other.join(' ')}`);
  // Nothing new because it is all here already is not a failure.
  if (!r.added.length) return { tone: r.skipped.length && have.length === r.skipped.length ? 'amber' : 'red', text: parts.join(' ') || 'Nothing was added.' };
  if (!r.skipped.length) parts.push('Give each a name and maker on the right.');
  return { tone: r.skipped.length ? 'amber' : 'green', text: parts.join(' ') };
}

export interface RowSelection {
  /** Every selected font, by folder. */
  picked: string[];
  /** The font whose details show when it is the only one, and where a Shift+click range starts. */
  anchor: string | null;
}

/**
 * The selection after a click on `folder`. `order` is the rows as shown, top to bottom. A plain click selects that
 * one; Ctrl adds or removes it; Shift selects from the last one clicked to this one.
 */
export function clickSelection(now: RowSelection, folder: string, order: string[], keys: { ctrl: boolean; shift: boolean }): RowSelection {
  if (keys.shift && now.anchor && order.includes(now.anchor) && order.includes(folder)) {
    const a = order.indexOf(now.anchor); const b = order.indexOf(folder);
    return { picked: order.slice(Math.min(a, b), Math.max(a, b) + 1), anchor: now.anchor };
  }
  if (keys.ctrl) {
    if (!now.picked.includes(folder)) return { picked: [...now.picked, folder], anchor: folder };
    const rest = now.picked.filter((f) => f !== folder);
    // The last font cannot be clicked away: the page always shows one.
    return rest.length ? { picked: rest, anchor: rest.includes(now.anchor ?? '') ? now.anchor : rest[rest.length - 1] } : now;
  }
  return { picked: [folder], anchor: folder };
}

export interface BulkLine { name: string; ok: boolean; text: string }

/** One line over a bulk action's per-font results: "Removed 4 of 5 fonts. 1 not removed." */
export function bulkHeadline(done: string, failed: string, lines: BulkLine[]): { tone: 'green' | 'amber' | 'red'; text: string } {
  const ok = lines.filter((l) => l.ok).length;
  const bad = lines.length - ok;
  const fonts = (n: number) => `${n} font${n === 1 ? '' : 's'}`;
  if (!bad) return { tone: 'green', text: `${done} ${fonts(ok)}.` };
  return { tone: ok ? 'amber' : 'red', text: `${done} ${ok} of ${fonts(lines.length)}. ${bad} ${failed}.` };
}
