// The wiring a ProffieOS config file describes: board, buttons, and each blade's data pin, power pins, pixels and
// colour order. An installer often leaves the config on the saber's card; reading the pins from it beats guessing,
// since a wrong pin can damage a board. The firmware itself cannot tell us (pins are compiled into machine code).
//
// Also compares that wiring with a saber's model, so the Wiring page can import it and Build & Flash can warn
// before installing firmware whose pins differ from the installer's.

import type { BladeSpec } from '../model';
import type { BladeExpr } from './document';
import type { BoardModel, SaberConfigModel, StockProp } from './generate';
import { bladeTables, boardInclude, getDefine, parseConfig } from './parse';
import { splitArgs } from './cpp';
import { bladePowerPins, dimPercent, rowToBlades } from './blades';
import { EVERY_BUILD_HAS, defineText } from './boardDefines';

/** What a config file says about the hardware. */
export interface ConfigWiring {
  /** From `#include "proffieboard_v2_config.h"` / v3; null when it names neither. */
  board: BoardModel | null;
  buttons: number | null;
  /** NUM_BLADES as written. */
  numBlades: number | null;
  /** The blades of its first BladeConfig row, each with its pins; `unreadable` ones are listed apart. */
  blades: BladeSpec[];
  /** Blades written in a form this reader does not understand: their pins are not known. */
  unreadable: { blade: number; text: string }[];
  /** BladeConfig rows: more than one means Blade ID, with a row per blade; only the first is read. */
  rows: number;
  /** The prop it includes, and the stock prop that is when it is one. */
  prop: { include: string; stock: StockProp | null } | null;
  /**
   * Its CONFIG_TOP defines other than those every Hiltwright build has (issue #14), as `NAME` or `NAME value`: the
   * board's orientation, a display, the volume, prop options. A build carries a few over (boardDefines.ts) and drops
   * the rest, and Build & Flash names each one it drops.
   */
  defines: string[];
}

const ORDER_FLAGS: Record<string, number> = { WS2811_RGB: 0, WS2811_RBG: 1, WS2811_GRB: 2, WS2811_GBR: 3 };
const SPEED_FLAGS = new Set(['WS2811_800kHz', 'WS2811_400kHz', 'WS2813_800kHz', 'WS2811_580kHz', 'WS2811_ACTUALLY_800kHz']);
const DEFAULT_POWER = ['bladePowerPin1', 'bladePowerPin2', 'bladePowerPin3'];
const STOCK_PROP_FILES: Record<string, StockProp> = { 'saber_fett263_buttons.h': 'fett263', 'saber_sa22c_buttons.h': 'sa22c', 'saber_BC_buttons.h': 'bc', 'saber.h': 'default' };

/** The colour order a WS2811BladePtr CONFIG gives, as ProffieOS's ByteOrderFromFlags does; null when it cannot be told. */
function orderFromFlags(config: string): string | null {
  let order = 0;
  for (const raw of config.split('|')) {
    const f = raw.trim();
    if (f in ORDER_FLAGS) order += ORDER_FLAGS[f];
    else if (!SPEED_FLAGS.has(f) && f !== '0') return null;
  }
  return ['RGB', 'RBG', 'GRB', 'GBR'][order] ?? 'BGR';
}

/**
 * A pixel blade the parser keeps as raw text because it leaves arguments to their defaults: `WS2811BladePtr<LEDS,
 * CONFIG[, DATA_PIN[, POWER_PINS]]>` and `WS281XBladePtr<LEDS, DATA_PIN, ORDER>` with no power pins. ProffieOS fills
 * in bladePin and power pins 1 to 3.
 */
function defaultedPixel(raw: string): BladeExpr | null {
  const m = /^(WS2811BladePtr|WS281XBladePtr)\s*<([\s\S]*)>\s*\(\s*\)$/.exec(raw.trim());
  if (!m) return null;
  const args = splitArgs(m[2]);
  if (!/^\d+$/.test(args[0] ?? '')) return null;
  const power = (s: string | undefined): string[] | null => {
    if (s === undefined) return DEFAULT_POWER;
    const p = /^PowerPINS\s*<([\s\S]*)>$/.exec(s);
    return p ? splitArgs(p[1]).filter(Boolean) : null;
  };
  if (m[1] === 'WS2811BladePtr') {
    const order = args[1] !== undefined ? orderFromFlags(args[1]) : null;
    const pp = power(args[3]);
    if (!order || !pp) return null;
    return { kind: 'ws281x', leds: Number(args[0]), dataPin: args[2] ?? 'bladePin', order, powerPins: pp, extra: [], raw };
  }
  const order = /^Color8::(\w+)$/.exec(args[2] ?? '')?.[1];
  const pp = power(args[3]);
  if (args.length !== 3 || !order || !pp) return null;
  return { kind: 'ws281x', leds: Number(args[0]), dataPin: args[1], order, powerPins: pp, extra: [], raw };
}

/** Fill in what the parser left raw, wherever it is (inside SubBlade and DimBlade too). */
function withDefaults(e: BladeExpr): BladeExpr {
  if (e.kind === 'raw') return defaultedPixel(e.raw) ?? e;
  if (e.kind === 'subblade' && e.inner) return { ...e, inner: withDefaults(e.inner) };
  if (e.kind === 'dim') return { ...e, inner: withDefaults(e.inner) };
  return e;
}

/** The wiring a config file describes. Null when it has no BladeConfig table to read. */
export function wiringFromConfig(text: string): ConfigWiring | null {
  const doc = parseConfig(text);
  const table = bladeTables(doc).find((t) => t.rows.length);
  if (!table) return null;
  const row = table.rows.find((r) => !r.raw && r.blades.length) ?? null;
  const inc = boardInclude(doc) ?? '';
  const board: BoardModel | null = /v3/i.test(inc) ? 'V3' : /v2/i.test(inc) ? 'V2' : null;
  const num = (name: string) => { const v = getDefine(doc, name); return v && /^\d+$/.test(v.trim()) ? Number(v) : null; };
  const propInc = /#ifdef\s+CONFIG_PROP\s*\n\s*#include\s+"([^"]+)"/.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? null;
  const blades = row ? rowToBlades({ ...row, blades: row.blades.map(withDefaults) }, 'cfg') : [];
  const unreadable = (row?.blades ?? []).map((b, i) => ({ blade: i + 1, expr: withDefaults(b) }))
    // A DimBlade whose limit is not a plain percentage (a macro, say) is not readable either: importing the blade
    // without it would run it at full brightness (issue #16).
    .filter(({ expr }) => expr.kind === 'raw' || (expr.kind === 'dim' && (expr.inner.kind === 'raw' || dimPercent(expr.factor) === null)) || (expr.kind === 'subblade' && expr.inner?.kind === 'raw'))
    .map(({ blade, expr }) => ({ blade, text: expr.raw.replace(/\s+/g, ' ').slice(0, 160) }));
  const propFile = propInc?.split('/').pop() ?? null;
  const defines = (doc.top?.lines ?? []).flatMap((l) => (l.kind === 'define' && !EVERY_BUILD_HAS.includes(l.name) ? [defineText(l.name, l.value)] : []));
  return {
    board, buttons: num('NUM_BUTTONS'), numBlades: num('NUM_BLADES'), blades, unreadable, rows: table.rows.length,
    prop: propInc ? { include: propInc, stock: propFile ? STOCK_PROP_FILES[propFile] ?? null : null } : null,
    defines: [...new Set(defines)],
  };
}

/** One way a saber's wiring differs from a config's. `danger`: a pin or blade count, which can damage a board. */
export interface WiringDifference { blade: number | null; what: string; here: string; config: string; danger: boolean }

const pinsOf = (b: BladeSpec): string[] => bladePowerPins(b);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
/**
 * A simple blade's pins slot by slot, as ProffieOS pairs them with its LEDs: the same pins in other slots light other
 * LEDs (issue #15). Trailing empty slots say nothing, so they are left off.
 */
const slotPins = (b: BladeSpec): string[] => {
  const pins = b.wiring.kind === 'power' ? [...b.wiring.pins] : [];
  while (pins.length && pins[pins.length - 1] === '-1') pins.pop();
  return pins;
};
const dimWords = (dim: number | undefined) => (dim === undefined ? 'none' : `${dim}%`);
const slotWords = (pins: string[]) => pins.map((p) => (p === '-1' ? 'no pin' : p)).join(', ') || 'none';
const describe = (b: BladeSpec | undefined) => !b ? 'none' : b.type === 'simple' ? 'LED' : b.wiring.kind === 'chain' ? 'part of the strip before it' : 'pixel strip';

/** How a saber's model differs from what a config file describes, blade by blade. Empty when they agree. */
export function compareWiring(m: Pick<SaberConfigModel, 'board' | 'buttons' | 'blades'>, cfg: Pick<ConfigWiring, 'board' | 'buttons' | 'blades' | 'unreadable'>): WiringDifference[] {
  const out: WiringDifference[] = [];
  if (cfg.board && cfg.board !== m.board) out.push({ blade: null, what: 'board', here: `Proffieboard ${m.board}`, config: `Proffieboard ${cfg.board}`, danger: true });
  if (cfg.buttons != null && cfg.buttons !== m.buttons) out.push({ blade: null, what: 'buttons', here: String(m.buttons), config: String(cfg.buttons), danger: false });
  if (cfg.blades.length !== m.blades.length) out.push({ blade: null, what: 'number of blades', here: String(m.blades.length), config: String(cfg.blades.length), danger: true });
  const unread = new Set(cfg.unreadable.map((u) => u.blade));
  const n = Math.min(cfg.blades.length, m.blades.length);
  for (let i = 0; i < n; i++) {
    if (unread.has(i + 1)) continue;
    const a = m.blades[i]; const c = cfg.blades[i];
    if (describe(a) !== describe(c)) { out.push({ blade: i + 1, what: 'kind', here: describe(a), config: describe(c), danger: true }); continue; }
    if (a.wiring.kind === 'own' && c.wiring.kind === 'own' && a.wiring.dataPin !== c.wiring.dataPin) out.push({ blade: i + 1, what: 'data pin', here: a.wiring.dataPin, config: c.wiring.dataPin, danger: true });
    if (a.type === 'simple' && c.type === 'simple') {
      if (slotPins(a).join(',') !== slotPins(c).join(',')) out.push({ blade: i + 1, what: 'power pins', here: slotWords(slotPins(a)), config: slotWords(slotPins(c)), danger: true });
    } else if (!sameSet(pinsOf(a), pinsOf(c))) out.push({ blade: i + 1, what: 'power pins', here: pinsOf(a).join(', ') || 'none', config: pinsOf(c).join(', ') || 'none', danger: true });
    if (a.type === 'pixel' && a.pixels !== c.pixels) out.push({ blade: i + 1, what: 'pixels', here: String(a.pixels), config: String(c.pixels), danger: false });
    if (a.type === 'pixel' && a.wiring.kind === 'own' && c.order && (a.order || 'GRB') !== c.order) out.push({ blade: i + 1, what: 'colour order', here: a.order || 'GRB', config: c.order, danger: false });
    // The installer's DimBlade cap (issue #16): without it the blade runs at full brightness.
    if ((a.dim ?? null) !== (c.dim ?? null)) out.push({ blade: i + 1, what: 'brightness limit', here: dimWords(a.dim), config: dimWords(c.dim), danger: false });
  }
  return out;
}

/** One line per difference, in the words the pages use. */
export function differenceText(d: WiringDifference): string {
  return `${d.blade ? `Blade ${d.blade} ` : ''}${d.what}: ${d.here} here, ${d.config} in the config`;
}
