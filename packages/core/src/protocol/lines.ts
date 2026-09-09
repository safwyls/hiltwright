// Line handling for the ProffieOS serial console.
// Observed on a V2.2 running OS 7.8 (see test/transcripts): responses mix bare LF and CRLF within one session,
// and the board interleaves unsolicited status lines with command output.

/** Incremental line splitter. Feed raw text chunks; get complete lines back, CR stripped. */
export class LineBuffer {
  private buf = '';

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      out.push(this.buf.slice(0, i).replace(/\r$/, ''));
      this.buf = this.buf.slice(i + 1);
    }
    return out;
  }

  /** Whatever is left without a newline. */
  pending(): string {
    return this.buf;
  }

  flush(): string[] {
    const rest = this.buf.replace(/\r$/, '');
    this.buf = '';
    return rest.length ? [rest] : [];
  }
}

export function splitLines(text: string): string[] {
  const b = new LineBuffer();
  return [...b.push(text), ...b.flush()];
}

/** Lines the board prints on its own: font scanning, audio, SD activity, display updates. Not part of any response. */
const NOISE: RegExp[] = [
  /^Style RAM = \d+$/,
  /^Scanning sound font: .* done$/,
  /^Activating (polyphonic|monophonic) font\.$/,
  /^Activating SmoothSwing V\d$/,
  /^Accent Swings (Enabled|Disabled)\.$/,
  /^(Polyphonic|Monophonic) swings: \d+$/,
  /^Accent Slashes (NOT )?Detected: ?/,
  /^DISPLAY: /,
  /^unit = \d+ vol = [\d.]+, Playing /,
  /^channels: \d+ rate: \d+ bits: \d+$/,
  /^Audio underflows: \d+$/,
  /^Amplifier (off|on)\.$/,
  /^(Unmounting|Mounting) SD Card\.$/,
  /^Creating file presets\.(ini|tmp) iteration = \d+$/,
  /^EVENT: /,
  /^Ignition\.$|^Retraction\.$/,
];

export function isNoise(line: string): boolean {
  return NOISE.some((re) => re.test(line));
}

/** The board's "I do not know that command" reply. */
export function isWhut(line: string): boolean {
  return /^Whut\? :/.test(line);
}

/** Unescape a value the board printed with PrintQuotedValue or wrote with write_key_value. */
export function unescapeValue(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const d = s[++i];
      out += d === 'n' ? '\n' : d === 't' ? '\t' : d;
    } else out += c;
  }
  return out;
}

/** Escape a value the way write_key_value does. */
export function escapeValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
