// config.h emitter. Parsed sections are regenerated from the model; unparsed segments are written verbatim.

import type { PresetArray, PresetSource, StyleRef } from '../model';
import { quote } from './cpp';
import type { BladeConfigRow, BladeConfigTable, BladeExpr, ButtonsSection, ConfigDocument, PresetsSection, TopSection } from './document';

export function emitTop(top: TopSection): string {
  return top.lines.map((l) => {
    if (l.raw !== undefined) return l.raw;
    switch (l.kind) {
      case 'define': return l.value === null ? `#define ${l.name}` : `#define ${l.name} ${l.value}`;
      case 'undef': return `#undef ${l.name}`;
      case 'include': return `#include "${l.path}"`;
      case 'maxLeds': return `const unsigned int maxLedsPerStrip = ${l.value};`;
      default: return '';
    }
  }).join('\n') + '\n';
}

export function emitStyleRef(s: StyleRef): string {
  if (s.kind === 'raw') return s.code;
  return `${s.factory}<${s.style}>(${s.args !== undefined ? quote(s.args) : ''})`;
}

export function emitPreset(p: PresetSource): string {
  const lines = [`  { ${quote(p.font)}, ${quote(p.track)},`];
  for (const s of p.styles) lines.push(`    ${emitStyleRef(s)},`);
  lines.push(`    ${quote(p.name)} }`);
  const body = lines.join('\n');
  return p.leading ? `  ${p.leading}\n${body}` : body;
}

export function emitPresetArray(a: PresetArray): string {
  return `Preset ${a.name}[] = {\n${a.presets.map(emitPreset).join(',\n')}${a.presets.length ? ',' : ''}\n};\n`;
}

export function emitBladeExpr(b: BladeExpr): string {
  switch (b.kind) {
    case 'ws281x': {
      const args = [String(b.leds), b.dataPin, `Color8::${b.order}`, `PowerPINS<${b.powerPins.join(', ')}>`, ...b.extra];
      return `WS281XBladePtr<${args.join(', ')} >()`;
    }
    case 'subblade': {
      const inner = b.inner ? emitBladeExpr(b.inner) : 'NULL';
      const args = b.variant === 'SubBladeWithStride' ? [b.first, b.last, b.stride ?? 1, inner] : [b.first, b.last, inner];
      return `${b.variant}(${args.join(', ')})`;
    }
    case 'simple': return `SimpleBladePtr<${[...b.leds, ...b.pins].join(', ')}>()`;
    case 'dim': return `DimBlade(${b.factor}, ${emitBladeExpr(b.inner)})`;
    default: return b.raw;
  }
}

export function emitBladeRow(r: BladeConfigRow): string {
  if (r.raw) return r.leading ? `  ${r.leading}\n  ${r.raw}` : `  ${r.raw}`;
  const parts = [r.id, ...r.blades.map(emitBladeExpr)];
  if (r.presetArray) parts.push(`CONFIGARRAY(${r.presetArray})`);
  if (r.saveName !== undefined) parts.push(quote(r.saveName));
  const body = `  { ${parts[0]}, ${parts.slice(1).join(',\n    ')} }`;
  return r.leading ? `  ${r.leading}\n${body}` : body;
}

export function emitBladeTable(t: BladeConfigTable): string {
  const trailing = t.trailing ? `  ${t.trailing}\n` : '';
  return `BladeConfig ${t.name}[] = {\n${t.rows.map(emitBladeRow).join(',\n')}${t.rows.length ? ',' : ''}\n${trailing}};\n`;
}

export function emitPresets(p: PresetsSection): string {
  return p.items.map((i) => {
    if (i.kind === 'opaque') return i.text.replace(/^\n+|\n+$/g, '') + '\n';
    if (i.kind === 'presets') return emitPresetArray(i.array);
    return emitBladeTable(i.table);
  }).join('\n');
}

export function emitButtons(b: ButtonsSection): string {
  return b.lines.map((l) => (l.kind === 'opaque' ? l.raw : l.raw ?? `${l.className} ${l.variable}(${l.type}, ${l.pin}, ${quote(l.name)});`)).join('\n') + '\n';
}

export function emitConfig(doc: ConfigDocument): string {
  return doc.segments.map((s) => {
    if (s.kind === 'text') return s.text;
    let body = s.body;
    if (s.macro === 'CONFIG_TOP' && doc.top) body = emitTop(doc.top);
    if (s.macro === 'CONFIG_PRESETS' && doc.presets) body = emitPresets(doc.presets);
    if (s.macro === 'CONFIG_BUTTONS' && doc.buttons) body = emitButtons(doc.buttons);
    return `${s.open}\n${body}${s.close}\n`;
  }).join('');
}
