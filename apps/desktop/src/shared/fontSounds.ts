// Which files of a sound font a listen needs, for the app (main/sd.ts, reading a folder on disk) and the workshop on
// the website (reading a folder the visitor opened). Everything else in a font (tracks, ini files, quotes) is left.

/** The sounds a listen needs, by the name before a file's number or a sound folder's name. */
export const PLAYABLE = /^(hum|humm|out|poweron|fastout|preon|in|poweroff|pwroff|pstoff|clsh|clash|blst|blaster|stab|force|font|boot|lock|lockup|bgnlock|endlock|drag|bgndrag|enddrag|lb|bgnlb|endlb|swingl|swingh|lswing|hswing|swng|swing|tr)$/i;
/** At most this much sound is read for one font; the rest is skipped and counted. */
export const FONT_BYTES_CAP = 120 * 1024 * 1024;

/**
 * The key a file inside a font folder is played by, or null when a listen does not need it. `parts` is its path
 * within the font: `hum01.wav`, `clsh/clsh3.wav`, or `tr/001/000.wav` (a style transition sound).
 */
export function playableKey(parts: string[]): string | null {
  if (!parts.length || parts.some((p) => p.startsWith('.'))) return null;
  const last = parts[parts.length - 1];
  if (!/\.wav$/i.test(last)) return null;
  if (parts.length === 1) { const m = /^([a-z]+)\d*\.wav$/i.exec(last); return m && PLAYABLE.test(m[1]) ? last : null; }
  if (!PLAYABLE.test(parts[0])) return null;
  if (parts.length === 2) return parts.join('/');
  if (parts.length === 3 && /^\d+$/.test(parts[1])) return parts.join('/');
  return null;
}

/** An ini file's `key=value` lines. */
export function parseFontIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.+?)\s*$/.exec(line); if (m) out[m[1]] = m[2]; }
  return out;
}
