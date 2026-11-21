// The app's loading indicator, in every theme's own colours and shapes (styles.css, "Loader").
//
// - Working, at size `md`: power cells, shaped like the step boxes, with a light passing along them.
// - With `progress` (0..1), at size `md`: the cells fill, one per sixth.
// - At size `sm` (a note, a button, a line of text): a kyber crystal whose facets catch the light in turn; with
//   `progress` it charges from the base.
//
// Inside a button it takes the button's ink, so it shows on an accent-coloured face. The words beside it say what is
// happening; the loader itself is hidden from screen readers unless it carries progress, when it is a progressbar.

import { LOADER_CELLS, loaderState } from './loaderModel';

let clipIds = 0;

export function Loader({ size = 'md', progress, label }: { size?: 'sm' | 'md'; progress?: number | null; label?: string }) {
  const s = loaderState(size, progress, label);
  if (s.kind === 'kyber') return <Kyber progress={s.progress} a11y={s.a11y} />;
  return (
    <span className={`ld-cells ${s.progress == null ? 'run' : 'prog'}`} {...s.a11y}>
      {Array.from({ length: LOADER_CELLS }, (_v, k) => <i key={k} className={k < s.lit ? 'on' : undefined} />)}
    </span>
  );
}

const OUTLINE = 'M10 1 L19 9 L16 37 L10 39 L4 37 L1 9 Z';

function Kyber({ progress, a11y }: { progress: number | null; a11y: Record<string, unknown> }) {
  // A clip path id of its own, so two crystals on a page never share one.
  const id = `ld-kyber-${++clipIds}`;
  return (
    <span className={`ld-kyber ${progress == null ? 'run' : 'prog'}`} {...a11y}>
      <svg viewBox="0 0 20 40" aria-hidden="true" focusable="false">
        {progress != null && <defs><clipPath id={id}><rect x="0" y={2 + 37 * (1 - progress)} width="20" height="40" /></clipPath></defs>}
        <path className="f f1" d="M10 1 L1 9 L4 37 L10 39 Z" />
        <path className="f f2" d="M10 1 L10 39 L16 37 L19 9 Z" />
        <path className="f f3" d="M10 1 L19 9 L10 12 L1 9 Z" />
        {progress != null && <path className="charge" d={OUTLINE} clipPath={`url(#${id})`} />}
        <path className="edge" d={`${OUTLINE} M1 9 L10 12 L19 9 M10 12 L10 39`} />
      </svg>
    </span>
  );
}
