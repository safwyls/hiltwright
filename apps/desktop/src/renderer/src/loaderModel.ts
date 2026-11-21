// What the loading indicator (Loader.tsx) shows, kept apart from React so it can be tested under node.

export const LOADER_CELLS = 6;

export interface LoaderState {
  /** `cells` at size md, `kyber` (the crystal) at size sm. */
  kind: 'cells' | 'kyber';
  /** Progress from 0 to 1 when it is known; null while only working. */
  progress: number | null;
  /** Cells lit, with progress. */
  lit: number;
  /** A progressbar when progress is known; otherwise hidden from screen readers, since the words beside it speak. */
  a11y: Record<string, string | number | boolean>;
}

export function loaderState(size: 'sm' | 'md', progress: number | null | undefined, label?: string): LoaderState {
  const known = typeof progress === 'number' && Number.isFinite(progress);
  const p = known ? Math.max(0, Math.min(1, progress)) : null;
  return {
    kind: size === 'sm' ? 'kyber' : 'cells',
    progress: p,
    lit: p == null ? 0 : Math.round(p * LOADER_CELLS),
    a11y: p == null
      ? { 'aria-hidden': true }
      : { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': label ?? 'Progress' },
  };
}
