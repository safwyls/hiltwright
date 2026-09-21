// Reading dfu-util's transfer progress out of its output.

/**
 * dfu-util redraws one progress line over and over ("Download [=====   ] 68% 151552 bytes"), and the pipe can cut it
 * anywhere, so a fragment may be only the bar, only the percentage or only the byte count. Those fragments feed the
 * progress bar and stay out of the log.
 */
const TRANSFER_FRAGMENT = /^[\s\r]*(Download|Upload)?[\s\r]*(\[[=\s]*\]?)?[\s\r]*(\d{1,3}%)?[\s\r]*(\d+ bytes)?[\s\r]*$/;
export function readTransfer(line: string): { fragment: boolean; mode: 'Download' | 'Upload' | null; pct: number | null } {
  const fragment = TRANSFER_FRAGMENT.test(line);
  const mode = /Upload/.test(line) ? 'Upload' : /Download/.test(line) ? 'Download' : null;
  const m = fragment ? /(\d{1,3})%/.exec(line) : null;
  return { fragment, mode, pct: m ? Math.min(100, Number(m[1])) : null };
}
