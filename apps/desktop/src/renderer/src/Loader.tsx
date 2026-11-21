// The app's loading indicator, in every theme's own colours and shapes (styles.css, "Loader").
//
// - Working, at size `md`: power cells, shaped like the step boxes, with a light passing along them.
// - With `progress` (0..1), at size `md`: the cells fill, one per sixth.
// - At size `sm` (a note, a button, a line of text): a kyber crystal turning (the real mesh, pre-drawn); with
//   `progress` it holds still and charges from the base.
//
// Inside a button it takes the button's ink, so it shows on an accent-coloured face. The words beside it say what is
// happening; the loader itself is hidden from screen readers unless it carries progress, when it is a progressbar.

import type React from 'react';
import { LOADER_CELLS, loaderState } from './loaderModel';

export function Loader({ size = 'md', progress, label }: { size?: 'sm' | 'md'; progress?: number | null; label?: string }) {
  const s = loaderState(size, progress, label);
  if (s.kind === 'kyber') return <Kyber progress={s.progress} a11y={s.a11y} />;
  return (
    <span className={`ld-cells ${s.progress == null ? 'run' : 'prog'}`} {...s.a11y}>
      {Array.from({ length: LOADER_CELLS }, (_v, k) => <i key={k} className={k < s.lit ? 'on' : undefined} />)}
    </span>
  );
}

/**
 * A space whose content has not arrived yet: the working cells, centred in it, over a short line saying what is being
 * read. It fills its container (a panel, a tab, a table cell), so the layout does not jump when the content comes.
 */
export function LoadingSpace({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`ld-space${compact ? ' compact' : ''}`} role="status">
      <Loader />
      <span>{text}</span>
    </div>
  );
}

/** The crystal: the real mesh turning, from a pre-drawn strip of frames (scripts/crystal.mjs, styles.css). */
function Kyber({ progress, a11y }: { progress: number | null; a11y: Record<string, unknown> }) {
  return (
    <span className={`ld-kyber ${progress == null ? 'run' : 'prog'}`} style={progress == null ? undefined : ({ '--p': progress } as React.CSSProperties)} {...a11y}>
      <span className="gem" />
    </span>
  );
}
