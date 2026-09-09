// Small C++ text utilities: comment masking, balanced splitting, template argument splitting.
// Everything here works on plain strings and never throws on malformed input.

/** Replace comments and string contents with spaces, keeping length and newlines, so structure scans ignore them. */
export function mask(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++; }
    } else if (c === '/' && d === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++; }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
    } else if (c === '"') {
      i++;
      while (i < n && src[i] !== '"') { if (src[i] === '\\') { out[i] = ' '; i++; } if (i < n) { out[i] = src[i] === '\n' ? '\n' : ' '; } i++; }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Index of the bracket that closes the one at `open` (which must be one of ( [ { <), scanning masked text. */
export function matchBracket(masked: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const close = pairs[masked[open]];
  if (!close) return -1;
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === masked[open]) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
    // Other bracket kinds do not affect matching of this kind; template '>' vs '>>' is handled by counting.
  }
  return -1;
}

/** Split `text` on top-level commas (not inside any brackets or strings). Returns trimmed pieces with their offsets. */
export function splitTopLevel(text: string, sep = ','): { text: string; start: number; end: number }[] {
  const m = mask(text);
  const out: { text: string; start: number; end: number }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
    else if (c === sep && depth === 0) {
      out.push({ text: text.slice(start, i).trim(), start, end: i });
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last.length || out.length === 0) out.push({ text: last, start, end: text.length });
  return out;
}

/** Split the arguments of a template or call: `Foo<a, b<c,d>, e>` -> [a, b<c,d>, e]. `text` is the inside of the brackets. */
export function splitArgs(inside: string): string[] {
  return splitTopLevel(inside).map((p) => p.text).filter((p) => p.length > 0);
}

/** Parse a C string literal (with simple escapes). Returns null when `text` is not a string literal. */
export function parseString(text: string): string | null {
  const t = text.trim();
  if (t.length < 2 || t[0] !== '"' || t[t.length - 1] !== '"') return null;
  return t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

export function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** Find the extent of a top-level `{ ... };` initializer starting at or after `from` in masked text. */
export function findInitializer(masked: string, from: number): { open: number; close: number; semi: number } | null {
  const open = masked.indexOf('{', from);
  if (open < 0) return null;
  const close = matchBracket(masked, open);
  if (close < 0) return null;
  const semi = masked.indexOf(';', close);
  return { open, close, semi: semi < 0 ? close : semi };
}

/** True when the line is a preprocessor directive. */
export function isDirective(line: string): boolean {
  return /^\s*#/.test(line);
}
