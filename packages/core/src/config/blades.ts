// Mapping between BladeConfig rows (as written in config.h) and the product's blade model.
// The model asks "own data line or continues Blade N's wire"; ProffieOS wants SubBlade ranges. This converts both ways.

import type { BladeConfiguration, BladeSpec } from '../model';
import type { BladeConfigRow, BladeExpr } from './document';

function unwrap(e: BladeExpr): { expr: BladeExpr; dim?: string } {
  if (e.kind === 'dim') return { expr: e.inner, dim: e.factor };
  return { expr: e };
}

/** Flatten a BladeConfig row into BladeSpecs. SubBlade chains become `chain` wiring back to the strip's first blade. */
export function rowToBlades(row: BladeConfigRow, idPrefix = 'b'): BladeSpec[] {
  const out: BladeSpec[] = [];
  let currentRoot: string | null = null; // id of the blade that owns the strip for following NULL sub-blades
  row.blades.forEach((raw, i) => {
    const { expr } = unwrap(raw);
    const id = `${idPrefix}${i + 1}`;
    if (expr.kind === 'ws281x') {
      out.push({ id, type: 'pixel', pixels: expr.leds, order: expr.order, extra: expr.extra, leds: [], parallel: 1, wiring: { kind: 'own', dataPin: expr.dataPin, powerPins: expr.powerPins } });
      currentRoot = null;
      return;
    }
    if (expr.kind === 'subblade') {
      const pixels = expr.last - expr.first + 1;
      const reverse = expr.variant === 'SubBladeReverse';
      if (expr.inner && expr.inner.kind === 'ws281x') {
        out.push({ id, type: 'pixel', pixels, order: expr.inner.order, extra: expr.inner.extra, leds: [], parallel: 1, wiring: { kind: 'own', dataPin: expr.inner.dataPin, powerPins: expr.inner.powerPins } });
        currentRoot = id;
        return;
      }
      if (!expr.inner && currentRoot) {
        const w: BladeSpec['wiring'] = { kind: 'chain', after: currentRoot };
        if (reverse) w.reverse = true;
        if (expr.stride) w.stride = expr.stride;
        out.push({ id, type: 'pixel', pixels, order: '', extra: [], leds: [], parallel: 1, wiring: w });
        return;
      }
    }
    if (expr.kind === 'simple') {
      const pins = expr.pins.filter((p) => p !== '-1');
      out.push({ id, type: 'simple', pixels: expr.leds.filter((l) => l !== 'NoLED').length, order: '', extra: [], leds: expr.leds, parallel: 1, wiring: { kind: 'power', pins } });
      currentRoot = null;
      return;
    }
    // Anything else: keep as an opaque simple blade so the count stays right.
    out.push({ id, type: 'simple', pixels: 0, order: '', extra: [raw.raw], leds: [], parallel: 1, wiring: { kind: 'power', pins: [] } });
    currentRoot = null;
  });
  return out;
}

/** Pixel range of each chained blade on its strip, in blade order. */
export function chainRanges(blades: BladeSpec[]): Map<string, { root: string; first: number; last: number }> {
  const ranges = new Map<string, { root: string; first: number; last: number }>();
  const offsets = new Map<string, number>();
  for (const b of blades) {
    if (b.type !== 'pixel') continue;
    if (b.wiring.kind === 'own') {
      const chained = blades.some((x) => x.wiring.kind === 'chain' && x.wiring.after === b.id);
      if (chained) { ranges.set(b.id, { root: b.id, first: 0, last: b.pixels - 1 }); offsets.set(b.id, b.pixels); }
    } else if (b.wiring.kind === 'chain') {
      const root = b.wiring.after;
      const start = offsets.get(root) ?? 0;
      ranges.set(b.id, { root, first: start, last: start + b.pixels - 1 });
      offsets.set(root, start + b.pixels);
    }
  }
  return ranges;
}

/** Total pixels on a strip owned by `rootId`, counting the root and every blade chained to it. */
export function stripLength(blades: BladeSpec[], rootId: string): number {
  return blades.filter((b) => b.id === rootId || (b.wiring.kind === 'chain' && b.wiring.after === rootId)).reduce((a, b) => a + b.pixels, 0);
}

/** Turn BladeSpecs into BladeConfig expressions. The first blade on a chained strip carries the WS281XBladePtr, later ones get NULL. */
export function bladesToExprs(blades: BladeSpec[]): BladeExpr[] {
  const ranges = chainRanges(blades);
  return blades.map((b): BladeExpr => {
    if (b.type === 'simple') {
      if (b.leds.length === 4 || b.leds.length === 0) {
        const leds = b.leds.length ? b.leds : ['NoLED', 'NoLED', 'NoLED', 'NoLED'];
        const pins = [...(b.wiring.kind === 'power' ? b.wiring.pins : []), '-1', '-1', '-1', '-1'].slice(0, 4);
        return { kind: 'simple', leds, pins, raw: '' };
      }
      return { kind: 'raw', raw: b.extra[0] ?? '' };
    }
    const r = ranges.get(b.id);
    if (b.wiring.kind === 'own') {
      const ptr: BladeExpr = { kind: 'ws281x', leds: r ? stripLength(blades, b.id) : b.pixels, dataPin: b.wiring.dataPin, order: b.order || 'GRB', powerPins: b.wiring.powerPins, extra: b.extra, raw: '' };
      if (!r) return ptr;
      return { kind: 'subblade', variant: 'SubBlade', first: r.first, last: r.last, inner: ptr, raw: '' };
    }
    if (b.wiring.kind === 'chain' && r) {
      const variant = b.wiring.stride ? 'SubBladeWithStride' : b.wiring.reverse ? 'SubBladeReverse' : 'SubBlade';
      const e: BladeExpr = { kind: 'subblade', variant, first: r.first, last: r.last, inner: null, raw: '' };
      if (b.wiring.stride) e.stride = b.wiring.stride;
      return e;
    }
    return { kind: 'raw', raw: '' };
  });
}

export function rowToConfiguration(row: BladeConfigRow, idPrefix = 'b'): BladeConfiguration {
  const cfg: BladeConfiguration = { id: row.id, blades: rowToBlades(row, idPrefix), presetArray: row.presetArray ?? 'presets' };
  if (row.saveName !== undefined) cfg.saveName = row.saveName;
  return cfg;
}

export function configurationToRow(cfg: BladeConfiguration): BladeConfigRow {
  const row: BladeConfigRow = { id: cfg.id, blades: bladesToExprs(cfg.blades), presetArray: cfg.presetArray };
  if (cfg.saveName !== undefined) row.saveName = cfg.saveName;
  return row;
}

/** Power pins that more than one independent strip or LED uses. Legal in ProffieOS with SHARED_POWER_PINS. */
export function sharedPowerPins(blades: BladeSpec[]): string[] {
  const users = new Map<string, Set<string>>();
  for (const b of blades) {
    const pins = b.wiring.kind === 'own' ? b.wiring.powerPins : b.wiring.kind === 'power' ? b.wiring.pins : [];
    for (const p of pins) {
      if (!users.has(p)) users.set(p, new Set());
      users.get(p)!.add(b.id);
    }
  }
  return [...users.entries()].filter(([, s]) => s.size > 1).map(([p]) => p);
}
