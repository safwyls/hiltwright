// Sound font knowledge: WAV header parsing, ProffieOS file-name conventions, and the checks that catch the
// classic failures (mono/poly mixing, wrong sample rate, stereo, 24-bit) before a font reaches a saber.
// Pure functions over bytes and names; the desktop app supplies the files.

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bits: number;
  /** PCM (1) or something else. ProffieOS wants plain PCM. */
  format: number;
  /** Seconds, when the data chunk size is known. */
  seconds: number | null;
}

/** Parse the RIFF/WAVE header from the first bytes of a file. Needs at least the fmt chunk (usually < 64 bytes). */
export function parseWavHeader(bytes: Uint8Array): WavInfo | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let pos = 12;
  let info: WavInfo | null = null;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    if (id === 'fmt ' && pos + 24 <= bytes.length) {
      info = { format: dv.getUint16(pos + 8, true), channels: dv.getUint16(pos + 10, true), sampleRate: dv.getUint32(pos + 12, true), bits: dv.getUint16(pos + 22, true), seconds: null };
    } else if (id === 'data' && info) {
      const bytesPerSec = info.sampleRate * info.channels * (info.bits / 8);
      info.seconds = bytesPerSec > 0 ? size / bytesPerSec : null;
      return info;
    }
    pos += 8 + size + (size % 2);
  }
  return info;
}

/** Effects that exist in both monophonic (short, numbered from 1) and polyphonic (long, numbered from 01) forms. */
export const EFFECT_NAMES: { mono: string; poly: string; label: string }[] = [
  { mono: 'boot', poly: 'boot', label: 'boot' },
  { mono: 'poweron', poly: 'out', label: 'ignition' },
  { mono: 'poweroff', poly: 'in', label: 'retraction' },
  { mono: 'hum', poly: 'hum', label: 'hum' },
  { mono: 'swing', poly: 'swng', label: 'swing' },
  { mono: 'clash', poly: 'clsh', label: 'clash' },
  { mono: 'blaster', poly: 'blst', label: 'blaster' },
  { mono: 'lockup', poly: 'lock', label: 'lockup' },
  { mono: 'font', poly: 'font', label: 'font name' },
  { mono: 'force', poly: 'force', label: 'force' },
  { mono: 'stab', poly: 'stab', label: 'stab' },
  { mono: 'spin', poly: 'spin', label: 'spin' },
  { mono: 'drag', poly: 'drag', label: 'drag' },
  { mono: 'lockup', poly: 'lock', label: 'lockup' },
  { mono: 'endlock', poly: 'endlock', label: 'end lockup' },
  { mono: 'bgnlock', poly: 'bgnlock', label: 'begin lockup' },
  { mono: 'melt', poly: 'melt', label: 'melt' },
  { mono: 'preon', poly: 'preon', label: 'pre-on' },
  { mono: 'pstoff', poly: 'pstoff', label: 'post-off' },
];

/** The ProffieOS naming forms a file name can take: `clash1.wav`, `clsh01.wav`, `clsh/01.wav` are all clash sounds. */
/** `shared` names (hum.wav, font.wav, boot.wav) are the same in both conventions and decide nothing. */
export function classifySound(fileName: string): { effect: string; kind: 'mono' | 'poly' | 'shared' | 'other'; index: number | null } {
  const base = fileName.toLowerCase().replace(/\.wav$/, '');
  for (const e of EFFECT_NAMES) {
    let m: RegExpExecArray | null;
    // ProffieOS takes any numbering, with or without leading zeros. Where the two conventions use different names
    // (out, poweron), the name says which it is. Where they share one (hum, font, boot), two or more digits is the
    // polyphonic habit and a single digit (hum1.wav) says nothing either way.
    if (e.mono !== e.poly) {
      if ((m = new RegExp(`^${e.poly}(\\d+)$`).exec(base))) return { effect: e.label, kind: 'poly', index: Number(m[1]) };
      if ((m = new RegExp(`^${e.mono}(\\d+)$`).exec(base))) return { effect: e.label, kind: 'mono', index: Number(m[1]) };
    } else if ((m = new RegExp(`^${e.poly}(\\d+)$`).exec(base))) return { effect: e.label, kind: m[1].length >= 2 ? 'poly' : 'shared', index: Number(m[1]) };
    if (base === e.poly || base === e.mono) return { effect: e.label, kind: e.mono === e.poly ? 'shared' : 'mono', index: null };
  }
  return { effect: base.replace(/\d+$/, ''), kind: 'other', index: null };
}

/** How many bytes from the start of a wav are enough to find its format (the fmt chunk, past any extra header chunks). */
export const WAV_HEADER_BYTES = 512;

/** The sounds that make a folder a font, in words for messages. */
export const CORE_SOUNDS_TEXT = 'hum, font, out (ignition), poweron or in (retraction)';

export interface FontFile {
  name: string;
  size: number;
  wav: WavInfo | null;
}

export interface FontIssue {
  kind: 'mixed' | 'rate' | 'stereo' | 'bits' | 'format' | 'missing-hum';
  text: string;
  files: string[];
}

export interface FontReport {
  files: number;
  bytes: number;
  /** Predominant style of the effect files. */
  type: 'polyphonic' | 'monophonic' | 'mixed' | 'unknown';
  effects: Record<string, { mono: number; poly: number }>;
  issues: FontIssue[];
}

/** Check one font folder. `files` are its direct .wav entries. */
export function checkFont(files: FontFile[]): FontReport {
  const effects: Record<string, { mono: number; poly: number }> = {};
  const issues: FontIssue[] = [];
  let mono = 0;
  let poly = 0;
  let hum = 0;
  const byEffect: Record<string, { mono: string[]; poly: string[] }> = {};
  for (const f of files) {
    const c = classifySound(f.name);
    if (c.kind === 'other') continue;
    if (c.effect === 'hum') hum++;
    effects[c.effect] ??= { mono: 0, poly: 0 };
    byEffect[c.effect] ??= { mono: [], poly: [] };
    if (c.kind === 'shared') continue; // counts for the effect, decides nothing about mono vs poly
    effects[c.effect][c.kind]++;
    byEffect[c.effect][c.kind].push(f.name);
    if (c.kind === 'mono') mono++; else poly++;
  }
  for (const [effect, v] of Object.entries(byEffect)) {
    if (v.mono.length && v.poly.length) {
      issues.push({ kind: 'mixed', text: `${effect}: both ${v.mono[0]} and ${v.poly[0]} are present. They are two names for the same effect. The font still works, but the saber may play only one of the two sets.`, files: [...v.mono, ...v.poly] });
    }
  }
  const bad = { rate: [] as string[], stereo: [] as string[], bits: [] as string[], format: [] as string[] };
  for (const f of files) {
    if (!f.wav) continue;
    if (f.wav.sampleRate > 44100) bad.rate.push(f.name);
    if (f.wav.channels !== 1) bad.stereo.push(f.name);
    if (f.wav.bits !== 16) bad.bits.push(f.name);
    if (f.wav.format !== 1) bad.format.push(f.name);
  }
  if (bad.rate.length) issues.push({ kind: 'rate', text: `${bad.rate.length === 1 ? bad.rate[0] + ' is' : bad.rate.length + ' files are'} above 44.1 kHz. The saber needs 44.1 kHz or lower.`, files: bad.rate });
  if (bad.stereo.length) issues.push({ kind: 'stereo', text: `${bad.stereo.length === 1 ? bad.stereo[0] + ' is' : bad.stereo.length + ' files are'} stereo. Fonts should be mono.`, files: bad.stereo });
  if (bad.bits.length) issues.push({ kind: 'bits', text: `${bad.bits.length === 1 ? bad.bits[0] + ' is' : bad.bits.length + ' files are'} not 16-bit.`, files: bad.bits });
  if (bad.format.length) issues.push({ kind: 'format', text: `${bad.format.length === 1 ? bad.format[0] + ' is' : bad.format.length + ' files are'} not plain PCM.`, files: bad.format });
  if (hum === 0) issues.push({ kind: 'missing-hum', text: 'No hum sound found. Every font needs at least hum.wav or hum01.wav.', files: [] });
  const type: FontReport['type'] = mono && poly ? 'mixed' : poly ? 'polyphonic' : mono ? 'monophonic' : 'unknown';
  return { files: files.length, bytes: files.reduce((a, f) => a + f.size, 0), type, effects, issues };
}

/** Names ProffieOS has that EFFECT_NAMES does not, gathered under one label each. */
const EXTRA: [RegExp, string][] = [
  [/^(swingl|swingh|lswing|hswing)$/, 'smoothswing'],
  [/^(lb|bgnlb|endlb)$/, 'lightning block'],
  [/^(bgndrag|enddrag)$/, 'drag'],
  [/^(bgnmelt|endmelt)$/, 'melt'],
  [/^(tr|trloop|tron|troff)$/, 'blade transitions'],
  [/^(quote|quotes)$/, 'quotes'],
  [/^(ccbegin|ccend|ccchange|color|colour)$/, 'colour change'],
  [/^(blast)$/, 'blaster'],
  [/^(fastout|fastin)$/, 'fast ignition'],
  [/^(bgnauto|endauto|auto)$/, 'blaster auto'],
  [/^(lowbatt)$/, 'low battery'],
  [/^(battery|vmbegin|vmend|volup|voldown|volmin|volmax|mnum|mselect|mclick|mstart|mend|menu)$/, 'menu voice'],
];

/** The label for a `.wav` ProffieOS has no name for (readme.wav, notes.wav): shown, but never an effect. */
export const OTHER_FILES = 'other files';

/**
 * The name ProffieOS would treat a file as. Inside an effect's folder any numbering goes (`clsh/001.wav`,
 * `clsh/clsh1.wav`, `tr/001/000.wav`), and the file belongs to that folder's effect; it is renamed to the flat
 * form (`clsh01.wav`) so the checker sees the same thing the saber does.
 */
function soundName(rel: string): { checker: string; base: string } {
  const parts = rel.split('/');
  const file = parts[parts.length - 1];
  const stem = file.toLowerCase().replace(/\.wav$/, '');
  if (parts.length > 1) {
    const folder = parts[0].toLowerCase();
    const m = /^([a-z_]*?)(\d*)$/.exec(stem);
    if (m && (m[1] === '' || m[1] === folder)) return { checker: `${folder}${m[2] ? m[2].padStart(2, '0') : ''}.wav`, base: folder };
  }
  return { checker: file, base: stem.replace(/\d+$/, '') };
}

/** What a file at this path within a font plays for. `checker` is the flat name the checks see. */
export function classifyFontFile(rel: string): { effect: string; kind: 'mono' | 'poly' | 'shared' | 'other'; checker: string } {
  const { checker, base } = soundName(rel);
  const c = classifySound(checker);
  if (c.kind !== 'other') return { effect: c.effect, kind: c.kind, checker };
  for (const [re, label] of EXTRA) if (re.test(base)) return { effect: label, kind: 'other', checker };
  return { effect: OTHER_FILES, kind: 'other', checker };
}

/** Whether a path within a font is a track (inside a `tracks` folder): tracks are not sounds of the font. */
export const isTrackPath = (rel: string): boolean => rel.split('/').slice(0, -1).some((p) => /^tracks?$/i.test(p));

/** One `.wav` of a font as the main process found it: its path within the font (forward slashes), size, first bytes. */
export interface FontListingEntry {
  path: string;
  size: number;
  /** The first WAV_HEADER_BYTES of the file; null when it could not be read. */
  header: Uint8Array | null;
}

export interface FontSoundFact {
  path: string;
  effect: string;
  kind: 'mono' | 'poly' | 'shared' | 'other';
  seconds: number | null;
  size: number;
}

export interface FontCheck {
  report: FontReport;
  sounds: FontSoundFact[];
  tracks: FontSoundFact[];
  /** Every wav's size, tracks included. */
  bytes: number;
}

/**
 * The one font checker, for the library and the card alike: a pure function over a listing of the font's wavs.
 * Tracks are left out of the sound checks; per-sound folders and flat files get the same verdict.
 */
export function checkFontListing(entries: FontListingEntry[]): FontCheck {
  const sounds: FontSoundFact[] = [];
  const tracks: FontSoundFact[] = [];
  const checked: FontFile[] = [];
  let bytes = 0;
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  for (const e of sorted) {
    const wav = e.header ? parseWavHeader(e.header) : null;
    bytes += e.size;
    if (isTrackPath(e.path)) { tracks.push({ path: e.path, effect: 'track', kind: 'other', seconds: wav?.seconds ?? null, size: e.size }); continue; }
    const c = classifyFontFile(e.path);
    sounds.push({ path: e.path, effect: c.effect, kind: c.kind, seconds: wav?.seconds ?? null, size: e.size });
    checked.push({ name: c.checker, size: e.size, wav });
  }
  return { report: checkFont(checked), sounds, tracks, bytes };
}
