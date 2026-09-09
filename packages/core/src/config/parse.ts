// config.h parser. Structured parse of the sections we understand, opaque preservation of the rest.

import type { PresetArray, PresetSource, StyleRef } from '../model';
import { findInitializer, isDirective, mask, matchBracket, parseString, splitArgs, splitTopLevel } from './cpp';
import type { BladeConfigRow, BladeConfigTable, BladeExpr, ButtonsSection, ConfigDocument, PresetsItem, PresetsSection, Segment, TopLine, TopSection } from './document';

const SECTION_RE = /^[ \t]*#ifdef[ \t]+(CONFIG_TOP|CONFIG_STYLES|CONFIG_PRESETS|CONFIG_PROP|CONFIG_BUTTONS|PROP_BOTTOM|CONFIG_BOTTOM)[ \t]*(?:\/\/.*)?$/;

/** Split the file into text and `#ifdef SECTION ... #endif` segments. Nested #if blocks stay inside their section body. */
export function splitSegments(src: string): Segment[] {
  const lines = src.split('\n');
  const segments: Segment[] = [];
  let text: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = SECTION_RE.exec(lines[i]);
    if (!m) { text.push(lines[i]); i++; continue; }
    // Find the matching #endif at depth 0.
    let depth = 0;
    let j = i;
    let found = -1;
    for (; j < lines.length; j++) {
      const l = lines[j].trim();
      if (/^#\s*(if|ifdef|ifndef)\b/.test(l)) depth++;
      else if (/^#\s*endif\b/.test(l)) { depth--; if (depth === 0) { found = j; break; } }
    }
    if (found < 0) { text.push(lines[i]); i++; continue; }
    if (text.length) { segments.push({ kind: 'text', text: text.join('\n') + '\n' }); text = []; }
    segments.push({ kind: 'section', macro: m[1], open: lines[i], close: lines[found], body: lines.slice(i + 1, found).join('\n') + (found > i + 1 ? '\n' : '') });
    i = found + 1;
  }
  if (text.length) segments.push({ kind: 'text', text: text.join('\n') });
  return segments;
}

export function parseTop(body: string): TopSection {
  const lines = body.replace(/\n$/, '').split('\n');
  const out: TopLine[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^#\s*define\s+([A-Za-z_]\w*)(?:\s+(.*?))?\s*(?:\/\/.*)?$/.exec(t))) {
      const value = m[2] !== undefined && m[2] !== '' ? m[2].trim() : null;
      out.push({ kind: 'define', name: m[1], value, raw });
    } else if ((m = /^#\s*undef\s+([A-Za-z_]\w*)/.exec(t))) {
      out.push({ kind: 'undef', name: m[1], raw });
    } else if ((m = /^#\s*include\s+["<]([^">]+)[">]/.exec(t))) {
      out.push({ kind: 'include', path: m[1], raw });
    } else if ((m = /^const\s+unsigned\s+int\s+maxLedsPerStrip\s*=\s*(\d+)\s*;/.exec(t))) {
      out.push({ kind: 'maxLeds', value: Number(m[1]), raw });
    } else {
      out.push({ kind: 'opaque', raw });
    }
  }
  return { lines: out };
}

function parseStyleRef(code: string): StyleRef {
  const c = code.trim();
  const m = /^(StylePtr|StyleNormalPtr|StyleFirePtr|StyleRainbowPtr|StyleStrobePtr|StyleCharging|[A-Za-z_]\w*Ptr)\s*<([\s\S]*)>\s*\(\s*([\s\S]*?)\s*\)$/.exec(c);
  if (m) {
    const argsLit = m[3].trim();
    const args = argsLit ? parseString(argsLit) : null;
    if (argsLit && args === null) return { kind: 'raw', code: c };
    return { kind: 'styleptr', factory: m[1], style: m[2].trim(), ...(args !== null && argsLit ? { args } : {}) };
  }
  return { kind: 'raw', code: c };
}

/** Parse the inside of a `Preset name[] = { ... }` initializer into entries. */
function parsePresetEntries(inside: string): { presets: PresetSource[]; ok: boolean } {
  const m = mask(inside);
  const presets: PresetSource[] = [];
  let pos = 0;
  let ok = true;
  // Preprocessor conditionals inside a preset array cannot be represented entry by entry; keep the array verbatim.
  if (m.split('\n').some(isDirective)) return { presets, ok: false };
  while (pos < m.length) {
    const open = m.indexOf('{', pos);
    if (open < 0) break;
    const close = matchBracket(m, open);
    if (close < 0) { ok = false; break; }
    const leading = inside.slice(pos, open);
    const fields = splitTopLevel(inside.slice(open + 1, close)).map((f) => f.text).filter((f) => f.length);
    if (fields.length < 3) { ok = false; break; }
    const font = parseString(fields[0]);
    const track = parseString(fields[1]);
    const name = parseString(fields[fields.length - 1]);
    if (font === null || track === null) { ok = false; break; }
    const styleFields = name === null ? fields.slice(2) : fields.slice(2, -1);
    const entry: PresetSource = { font, track, styles: styleFields.map(parseStyleRef), name: name ?? '' };
    const lead = leading.replace(/^[\s,]+/, '');
    if (lead.trim()) entry.leading = lead.trim();
    presets.push(entry);
    pos = close + 1;
  }
  return { presets, ok };
}

const PIN_ORDER_RE = /^Color8::(\w+)$/;

/** Strip leading and trailing blank lines; the emitter adds its own separation. */
function trimNewlines(text: string): string {
  let s = 0;
  let e = text.length;
  while (s < e && text[s] === '\n') s++;
  while (e > s && text[e - 1] === '\n') e--;
  return text.slice(s, e);
}

export function parseBladeExpr(code: string): BladeExpr {
  const raw = code.trim();
  const m = mask(raw);
  let mm: RegExpExecArray | null;
  if ((mm = /^(WS281XBladePtr|WS2811BladePtr)\s*</.exec(raw))) {
    const lt = m.indexOf('<');
    const gt = matchBracket(m, lt);
    if (gt < 0) return { kind: 'raw', raw };
    const args = splitArgs(raw.slice(lt + 1, gt));
    if (mm[1] === 'WS281XBladePtr' && args.length >= 4) {
      const power = /^PowerPINS\s*<([\s\S]*)>$/.exec(args[3]);
      const order = PIN_ORDER_RE.exec(args[2]);
      if (power && order && /^\d+$/.test(args[0])) {
        return { kind: 'ws281x', leds: Number(args[0]), dataPin: args[1], order: order[1], powerPins: splitArgs(power[1]), extra: args.slice(4), raw };
      }
    }
    return { kind: 'raw', raw };
  }
  if ((mm = /^(SubBlade|SubBladeReverse|SubBladeWithStride)\s*\(/.exec(raw))) {
    const lp = m.indexOf('(');
    const rp = matchBracket(m, lp);
    if (rp < 0) return { kind: 'raw', raw };
    const args = splitArgs(raw.slice(lp + 1, rp));
    const variant = mm[1] as 'SubBlade' | 'SubBladeReverse' | 'SubBladeWithStride';
    const need = variant === 'SubBladeWithStride' ? 4 : 3;
    if (args.length !== need || !/^\d+$/.test(args[0]) || !/^\d+$/.test(args[1])) return { kind: 'raw', raw };
    const innerText = args[need - 1];
    const inner = /^NULL$|^nullptr$/.test(innerText) ? null : parseBladeExpr(innerText);
    const out: BladeExpr = { kind: 'subblade', variant, first: Number(args[0]), last: Number(args[1]), inner, raw };
    if (variant === 'SubBladeWithStride') out.stride = Number(args[2]);
    return out;
  }
  if (/^SimpleBladePtr\s*</.test(raw)) {
    const lt = m.indexOf('<');
    const gt = matchBracket(m, lt);
    if (gt < 0) return { kind: 'raw', raw };
    const args = splitArgs(raw.slice(lt + 1, gt));
    if (args.length === 8) return { kind: 'simple', leds: args.slice(0, 4), pins: args.slice(4), raw };
    return { kind: 'raw', raw };
  }
  if ((mm = /^DimBlade\s*\(/.exec(raw))) {
    const lp = m.indexOf('(');
    const rp = matchBracket(m, lp);
    if (rp < 0) return { kind: 'raw', raw };
    const args = splitArgs(raw.slice(lp + 1, rp));
    if (args.length === 2) return { kind: 'dim', factor: args[0], inner: parseBladeExpr(args[1]), raw };
  }
  return { kind: 'raw', raw };
}

function parseBladeRows(inside: string): { rows: BladeConfigRow[]; trailing?: string } {
  const m = mask(inside);
  const rows: BladeConfigRow[] = [];
  let pos = 0;
  while (pos < m.length) {
    const open = m.indexOf('{', pos);
    if (open < 0) break;
    const close = matchBracket(m, open);
    if (close < 0) break;
    const rowText = inside.slice(open, close + 1);
    const leading = inside.slice(pos, open).replace(/^[\s,]+/, '').trim();
    const body = inside.slice(open + 1, close);
    const row: BladeConfigRow = { id: '', blades: [], presetArray: null };
    if (leading) row.leading = leading;
    if (body.split('\n').some(isDirective)) {
      row.raw = rowText;
      const first = splitTopLevel(mask(body))[0]?.text ?? '';
      row.id = first.trim();
      rows.push(row);
      pos = close + 1;
      continue;
    }
    const fields = splitTopLevel(body).map((f) => f.text).filter((f) => f.length);
    row.id = fields[0] ?? '';
    for (const f of fields.slice(1)) {
      const arr = /^CONFIGARRAY\s*\(\s*(\w+)\s*\)$/.exec(f);
      if (arr) { row.presetArray = arr[1]; continue; }
      const str = parseString(f);
      if (str !== null) { row.saveName = str; continue; }
      row.blades.push(parseBladeExpr(f));
    }
    rows.push(row);
    pos = close + 1;
  }
  const trailing = inside.slice(pos).replace(/^[\s,]+/, '').trim();
  return trailing ? { rows, trailing } : { rows };
}

export function parsePresets(body: string): PresetsSection {
  const masked = mask(body);
  const items: PresetsItem[] = [];
  const re = /\b(Preset|BladeConfig)\s+(\w+)\s*\[\s*\]\s*=\s*/g;
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(masked))) {
    const init = findInitializer(masked, mm.index + mm[0].length);
    if (!init || init.open !== mm.index + mm[0].length) continue;
    const before = body.slice(last, mm.index);
    if (before.trim()) items.push({ kind: 'opaque', text: trimNewlines(before) });
    const inside = body.slice(init.open + 1, init.close);
    if (mm[1] === 'Preset') {
      const parsed = parsePresetEntries(inside);
      if (parsed.ok) items.push({ kind: 'presets', array: { name: mm[2], presets: parsed.presets } });
      else items.push({ kind: 'opaque', text: body.slice(mm.index, init.semi + 1) });
    } else {
      const parsed = parseBladeRows(inside);
      const table: BladeConfigTable = { name: mm[2], rows: parsed.rows };
      if (parsed.trailing) table.trailing = parsed.trailing;
      items.push({ kind: 'blades', table });
    }
    last = init.semi + 1;
    re.lastIndex = last;
  }
  const tail = body.slice(last);
  if (tail.trim()) items.push({ kind: 'opaque', text: trimNewlines(tail) });
  return { items };
}

export function parseButtons(body: string): ButtonsSection {
  const lines = body.replace(/\n$/, '').split('\n');
  return {
    lines: lines.map((raw) => {
      const m = /^\s*(\w+)\s+(\w+)\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*"([^"]*)"\s*\)\s*;/.exec(raw);
      if (m) return { kind: 'button', className: m[1], variable: m[2], type: m[3], pin: m[4], name: m[5], raw };
      return { kind: 'opaque', raw };
    }),
  };
}

export function parseConfig(src: string): ConfigDocument {
  const segments = splitSegments(src.replace(/\r\n/g, '\n'));
  const doc: ConfigDocument = { segments, top: null, presets: null, buttons: null };
  for (const s of segments) {
    if (s.kind !== 'section') continue;
    if (s.macro === 'CONFIG_TOP' && !doc.top) doc.top = parseTop(s.body);
    if (s.macro === 'CONFIG_PRESETS' && !doc.presets) doc.presets = parsePresets(s.body);
    if (s.macro === 'CONFIG_BUTTONS' && !doc.buttons) doc.buttons = parseButtons(s.body);
  }
  return doc;
}

// ---------- Convenience readers ----------

export function getDefine(doc: ConfigDocument, name: string): string | null | undefined {
  const line = doc.top?.lines.find((l) => l.kind === 'define' && l.name === name);
  return line && line.kind === 'define' ? line.value : undefined;
}

export function hasDefine(doc: ConfigDocument, name: string): boolean {
  return getDefine(doc, name) !== undefined;
}

export function boardInclude(doc: ConfigDocument): string | null {
  const inc = doc.top?.lines.find((l) => l.kind === 'include' && /proffieboard|teensy|v[123]_config/.test(l.path));
  return inc && inc.kind === 'include' ? inc.path : null;
}

export function presetArrays(doc: ConfigDocument): PresetArray[] {
  return (doc.presets?.items ?? []).flatMap((i) => (i.kind === 'presets' ? [i.array] : []));
}

export function bladeTables(doc: ConfigDocument): BladeConfigTable[] {
  return (doc.presets?.items ?? []).flatMap((i) => (i.kind === 'blades' ? [i.table] : []));
}
