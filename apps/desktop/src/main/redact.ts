// Keeps personal details out of the log and the diagnostics file: the owner's user folder, Windows user name and
// computer name become fixed placeholders. The rest of a path is kept so the location still reads.
//
// Serial numbers (a board's USB serial, an SD card's volume serial) are masked to their last four characters, so a
// helper can still tell two boards apart without the full number leaving this computer (issue #24).

import { spawnSync } from 'node:child_process';
import { homedir, hostname, userInfo } from 'node:os';

export interface Personal {
  home: string;
  user: string;
  host: string;
  /** The home folder's 8.3 short form (C:\Users\SAMSMI~1), when Windows has one; looked up once (issue #24). */
  short?: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One character as itself or percent-encoded (its UTF-8 bytes, either hex case), so the file:// form of a path, which
// renderer stack traces use (file:///C:/Users/Sam%20Smith/...), matches as well as the plain one (issue #24).
function charPattern(c: string): string {
  const bytes = [...Buffer.from(c, 'utf8')].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
  return `(?:${escape(c)}|${bytes})`;
}
const textPattern = (s: string) => [...s].map(charPattern).join('');

// A path's parts joined by any run of slashes in either direction, each part plain or percent-encoded.
const pathPattern = (parts: string[]) => parts.map(textPattern).join('[\\\\/]+');

/**
 * The start of the 8.3 short name Windows would most likely give a long folder name: spaces and dots dropped, other
 * characters a short name cannot hold made `_`, upper-cased, the first six; the name goes on with ~N. Used to match a
 * short path when the real one could not be looked up. Null when the name needs no short form.
 */
export function shortNamePrefix(name: string): string | null {
  const allowed = /[A-Za-z0-9!#$%&'()\-@^_`{}~]/;
  const needsShort = name.length > 8 || [...name].some((c) => !allowed.test(c));
  const plain = [...name.replace(/[ .]/g, '')].map((c) => (allowed.test(c) ? c : '_')).join('').toUpperCase();
  if (!needsShort || !plain) return null;
  return plain.slice(0, 6);
}

/** A serial number as it appears in the log and the diagnostics file: its last four characters (issue #24). */
export function maskSerial(serial: string): string {
  return `****${serial.length > 4 ? serial.slice(-4) : ''}`;
}

// A serial is masked only when it is long enough not to be an ordinary word or number.
const MIN_SERIAL = 6;
const worthMasking = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim().length >= MIN_SERIAL && /^[A-Za-z0-9]+$/.test(s.trim());

/** `text` with every one of these serials masked, wherever it stands as a whole word. */
export function maskSerials(text: string, serials: Iterable<string | null | undefined>): string {
  const list = [...new Set([...serials].filter(worthMasking).map((s) => s.trim()))].sort((a, b) => b.length - a.length);
  if (!list.length) return text;
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${list.map(escape).join('|')})(?![A-Za-z0-9])`, 'gi');
  return text.replace(re, (m) => maskSerial(m));
}

// Serials named in a line even when the app has not been told them: `serial="X"` (dfu-util), `serial=X`, `serial X`,
// `"USB Serial Number" = "X"` (macOS), and the tail of a Windows USB instance id. A value needs a digit, so "serial
// opened" is left alone.
const NAMED_SERIAL = /(\bserial(?:[ _]?number)?(?:["']?\s*(?:[=:]|is)?\s*["']?|\s+))(?=[A-Za-z]*\d)([A-Za-z0-9]{6,40})(?![A-Za-z0-9])/gi;
const INSTANCE_ID = /(\bUSB\\VID_[0-9A-F]{4}&PID_[0-9A-F]{4}(?:&MI_[0-9A-F]{2})?\\)([A-Za-z0-9]{6,40})(?![A-Za-z0-9&])/gi;

export function makeRedactor(p: Personal, serials: () => Iterable<string> = () => []): (text: string) => string {
  const rules: [RegExp, string][] = [];
  // The home folder first, in either slash direction, so C:\Users\Sam\x and C:/Users/Sam/x both keep their shape.
  const home = p.home.replace(/[\\/]+$/, '');
  if (home.length > 3) {
    const parts = home.split(/[\\/]+/);
    rules.push([new RegExp(pathPattern(parts) + '(?![A-Za-z0-9])', 'gi'), '%USERPROFILE%']);
    // The short form Windows gives the same folder (TEMP is often C:\Users\SAMSMI~1\AppData\Local\Temp): the one looked
    // up, and failing that the usual shape of one, the first six letters and ~N (issue #24).
    const short = p.short?.replace(/[\\/]+$/, '');
    if (short && short.length > 3 && short.toLowerCase() !== home.toLowerCase()) {
      rules.push([new RegExp(pathPattern(short.split(/[\\/]+/)) + '(?![A-Za-z0-9])', 'gi'), '%USERPROFILE%']);
    }
    const prefix = shortNamePrefix(parts[parts.length - 1]);
    if (prefix && parts.length > 1) {
      rules.push([new RegExp(pathPattern(parts.slice(0, -1)) + '[\\\\/]+' + escape(prefix) + '~\\d{1,6}(?![A-Za-z0-9])', 'gi'), '%USERPROFILE%']);
    }
  }
  // Names only as whole words, so a short name does not eat the middle of another word.
  const word = (s: string, to: string) => {
    if (s.trim().length < 2) return;
    rules.push([new RegExp(`(?<![A-Za-z0-9])${textPattern(s)}(?![A-Za-z0-9])`, 'gi'), to]);
  };
  word(p.user, '<user>');
  word(p.host, '<computer>');
  return (text) => {
    let t = rules.reduce((acc, [re, to]) => acc.replace(re, to), text);
    t = maskSerials(t, serials());
    t = t.replace(NAMED_SERIAL, (_m, lead: string, s: string) => lead + maskSerial(s));
    return t.replace(INSTANCE_ID, (_m, lead: string, s: string) => lead + maskSerial(s));
  };
}

/** The 8.3 short form of a folder (Windows only), or null when there is none or it cannot be told. */
export function shortPathOf(path: string): string | null {
  if (process.platform !== 'win32') return null;
  // cmd would expand a % or trip on a quote inside the name; such a folder falls back to the pattern.
  if (/[%"\r\n]/.test(path)) return null;
  // Verbatim, so Node does not wrap the line in quotes cmd would read differently.
  const r = spawnSync('cmd.exe', ['/d', '/c', `for %I in ("${path}") do @echo %~sI`], { encoding: 'utf8', timeout: 5000, windowsHide: true, windowsVerbatimArguments: true });
  const out = r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() : '';
  return /^[A-Za-z]:\\[\x20-\x7e]*$/.test(out) && out.toLowerCase() !== path.toLowerCase() ? out : null;
}

function personal(): Personal {
  let user = '';
  try { user = userInfo().username; } catch { /* no user record */ }
  const home = homedir();
  return { home, user, host: hostname(), short: shortPathOf(home) };
}

// Serials the app has seen this run (from the library, the USB look, card looks): masked wherever they appear.
const known = new Set<string>();

/** Mask these serials from now on, in the log and the diagnostics file. */
export function rememberSerials(...serials: (string | null | undefined)[]): void {
  for (const s of serials) if (worthMasking(s)) known.add(s.trim());
}

let shared: ((text: string) => string) | null = null;

/** The redactor for this computer. */
export function redact(text: string): string {
  shared ??= makeRedactor(personal(), () => known);
  return shared(text);
}
