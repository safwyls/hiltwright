// Mapping between BladeConfig rows (as written in config.h) and the product's blade model.
// The model asks "own data line or continues Blade N's wire"; ProffieOS wants SubBlade ranges. This converts both ways.

import type { BladeConfiguration, BladeSpec } from '../model';
import type { BladeConfigRow, BladeExpr } from './document';

function unwrap(e: BladeExpr): { expr: BladeExpr; dim?: string } {
  if (e.kind === 'dim') return { expr: e.inner, dim: e.factor };
  return { expr: e };
}

/**
 * The percentage a `DimBlade(...)` factor gives, when it is a plain number above 0 and at most 100 (`20`, `20.0`,
 * `12.5f`); null for anything else, such as a macro, which the wiring reader then lists as not readable.
 */
export function dimPercent(factor: string): number | null {
  const m = /^\s*(\d+(?:\.\d*)?|\.\d+)f?\s*$/i.exec(factor);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/** Flatten a BladeConfig row into BladeSpecs. SubBlade chains become `chain` wiring back to the strip's first blade. */
export function rowToBlades(row: BladeConfigRow, idPrefix = 'b'): BladeSpec[] {
  const all: BladeSpec[] = [];
  let currentRoot: string | null = null; // id of the blade that owns the strip for following NULL sub-blades
  row.blades.forEach((raw, i) => {
    const { expr, dim } = unwrap(raw);
    // A DimBlade's limit stays with the blade inside it (issue #16), whatever that blade is.
    const pct = dim !== undefined ? dimPercent(dim) : null;
    const push = (b: BladeSpec) => all.push(pct !== null ? { ...b, dim: pct } : b);
    const id = `${idPrefix}${i + 1}`;
    if (expr.kind === 'ws281x') {
      push({ id, type: 'pixel', pixels: expr.leds, order: expr.order, extra: expr.extra, leds: [], parallel: 1, wiring: { kind: 'own', dataPin: expr.dataPin, powerPins: expr.powerPins } });
      // A strip on its own data line does not end the chain: in ProffieOS only a SubBlade given a strip starts a new
      // one, so a NULL SubBlade after this still joins the earlier strip (blades/sub_blade.h, issue #35).
      return;
    }
    if (expr.kind === 'subblade') {
      const pixels = expr.last - expr.first + 1;
      const reverse = expr.variant === 'SubBladeReverse';
      if (expr.inner && expr.inner.kind === 'ws281x') {
        push({ id, type: 'pixel', pixels, order: expr.inner.order, extra: expr.inner.extra, leds: [], parallel: 1, wiring: { kind: 'own', dataPin: expr.inner.dataPin, powerPins: expr.inner.powerPins } });
        currentRoot = id;
        return;
      }
      if (!expr.inner && currentRoot) {
        const w: BladeSpec['wiring'] = { kind: 'chain', after: currentRoot };
        if (reverse) w.reverse = true;
        if (expr.stride) w.stride = expr.stride;
        push({ id, type: 'pixel', pixels, order: '', extra: [], leds: [], parallel: 1, wiring: w });
        return;
      }
    }
    if (expr.kind === 'simple') {
      // ProffieOS pairs each LED with the pin in the same slot, so a `-1` between two pins stays where it is (issue
      // #15). Only trailing ones go: the editor's own layouts keep their pins first and their NoLED slots last.
      const pins = [...expr.pins];
      while (pins.length && pins[pins.length - 1] === '-1') pins.pop();
      push({ id, type: 'simple', pixels: expr.leds.filter((l) => l !== 'NoLED').length, order: '', extra: [], leds: expr.leds, parallel: 1, wiring: { kind: 'power', pins } });
      currentRoot = null;
      return;
    }
    // Anything else: keep as an opaque simple blade so the count stays right. Its text keeps any DimBlade around it.
    all.push({ id, type: 'simple', pixels: 0, order: '', extra: [raw.raw], leds: [], parallel: 1, wiring: { kind: 'power', pins: [] } });
    currentRoot = null;
  });
  return all;
}

/**
 * The strip each chained blade is physically on: the pixel blade with its own data line that its chain of
 * `after` links ends at. A blade can continue a blade that itself continues another (issue #17), so every link is
 * followed, once, for every chained blade. Missing: the chain is broken (a missing blade, a loop, or a root that is not
 * a pixel strip on its own line), which wiringProblems reports.
 */
export function chainRoots(blades: Pick<BladeSpec, 'id' | 'type' | 'wiring'>[]): Map<string, string> {
  const byId = new Map(blades.map((b) => [b.id, b]));
  const roots = new Map<string, string>();
  for (const b of blades) {
    if (b.wiring.kind !== 'chain') continue;
    const seen = new Set<string>([b.id]);
    let cur = byId.get(b.wiring.after);
    while (cur && cur.wiring.kind === 'chain' && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.wiring.after); }
    if (cur && cur.wiring.kind === 'own' && cur.type === 'pixel') roots.set(b.id, cur.id);
  }
  return roots;
}

/** Pixel range of each blade on a chained strip, in blade order: the root first, then each blade on it in turn. */
export function chainRanges(blades: BladeSpec[]): Map<string, { root: string; first: number; last: number }> {
  const ranges = new Map<string, { root: string; first: number; last: number }>();
  const offsets = new Map<string, number>();
  // Ranges are laid out on the physical strip, so a chain of a chain follows on after the rest (issue #17).
  const roots = chainRoots(blades);
  const onStrip = new Set(roots.values());
  for (const b of blades) {
    if (b.type !== 'pixel') continue;
    if (b.wiring.kind === 'own') {
      if (onStrip.has(b.id)) { ranges.set(b.id, { root: b.id, first: 0, last: b.pixels - 1 }); offsets.set(b.id, b.pixels); }
    } else if (b.wiring.kind === 'chain') {
      const root = roots.get(b.id);
      if (!root) continue;
      const start = offsets.get(root) ?? 0;
      ranges.set(b.id, { root, first: start, last: start + b.pixels - 1 });
      offsets.set(root, start + b.pixels);
    }
  }
  return ranges;
}

/** Total pixels on a strip owned by `rootId`, counting the root and every blade on it, however it is chained (issue #17). */
export function stripLength(blades: BladeSpec[], rootId: string): number {
  const roots = chainRoots(blades);
  return blades.filter((b) => b.id === rootId || roots.get(b.id) === rootId).reduce((a, b) => a + b.pixels, 0);
}

/** Turn BladeSpecs into BladeConfig expressions. The first blade on a chained strip carries the WS281XBladePtr, later ones get NULL. */
export function bladesToExprs(blades: BladeSpec[]): BladeExpr[] {
  const ranges = chainRanges(blades);
  // A brightness limit wraps the blade in DimBlade, as the installer wrote it (issue #16). Raw text is left as it is.
  return blades.map((b): BladeExpr => {
    const e = plainExpr(b);
    return b.dim !== undefined && e.kind !== 'raw' ? { kind: 'dim', factor: String(b.dim), inner: e, raw: '' } : e;
  });

  function plainExpr(b: BladeSpec): BladeExpr {
    if (b.type === 'simple') {
      if (b.leds.length === 4 || b.leds.length === 0) {
        const leds = b.leds.length ? b.leds : ['NoLED', 'NoLED', 'NoLED', 'NoLED'];
        // Pins stay in their slots, each beside its LED (issue #15); only the slots after the last pin are filled.
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
  }
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

/**
 * The power pins a blade really uses. A simple blade keeps its pins in LED slot order, with `-1` holding the place of a
 * slot that has none (issue #15); those placeholders are no pin at all, so every wiring rule leaves them out.
 */
export function bladePowerPins(b: Pick<BladeSpec, 'wiring'>): string[] {
  const pins = b.wiring.kind === 'own' ? b.wiring.powerPins : b.wiring.kind === 'power' ? b.wiring.pins : [];
  return pins.filter((p) => p !== '-1');
}

/** Power pins that more than one independent strip or LED uses. Legal in ProffieOS with SHARED_POWER_PINS. */
export function sharedPowerPins(blades: BladeSpec[]): string[] {
  const users = new Map<string, Set<string>>();
  for (const b of blades) {
    for (const p of bladePowerPins(b)) {
      if (!users.has(p)) users.set(p, new Set());
      users.get(p)!.add(b.id);
    }
  }
  return [...users.entries()].filter(([, s]) => s.size > 1).map(([p]) => p);
}
