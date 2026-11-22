// Pure model behind the hardware editor: pins per board, blade kinds, the pin table and its conflicts.
// No React and no DOM here, so it is unit-tested directly (apps/desktop/test/hardware.test.ts).

import { BOARD_PINS, bladeKind, bladePowerPins, chainRanges, sharedPowerPins, wiringProblems, type BladeKind, type BladeRole, type BoardModel, type ModelBlade, type PowerOption } from '@hiltwright/core';

export type Kind = BladeKind;

export const ROLE_META: Record<BladeRole, { label: string; hint: string; kind: Kind }> = {
  main: { label: 'Main blade', hint: 'The blade in the emitter', kind: 'pixel' },
  crystal: { label: 'Crystal chamber', hint: 'Pixels or an LED around the crystal', kind: 'pixel' },
  accent: { label: 'Accent', hint: 'A lit switch, ring or window', kind: 'single' },
  side: { label: 'Side blade', hint: 'A quillon or second emitter', kind: 'pixel' },
  motor: { label: 'Motor', hint: 'Spins a crystal chamber component', kind: 'motor' },
};
export const ROLES: BladeRole[] = ['main', 'crystal', 'accent', 'side', 'motor'];
export const KIND_LABEL: Record<Kind, string> = { pixel: 'Pixel strip', single: 'Single LED', star: 'Star LED', motor: 'Motor' };

/** Data pins per board (core's BOARD_PINS). V3 adds Free 1–3, which can also drive small LEDs by PWM. */
export function dataPins(board: BoardModel): string[] {
  return BOARD_PINS[board].data;
}
export type { PowerOption };
export function powerOptions(board: BoardModel): PowerOption[] {
  return BOARD_PINS[board].power;
}
/** The V3-only data pins, labelled "(Free)" in the data pin list. */
export const freeDataPins = (board: BoardModel): string[] => BOARD_PINS[board].freeData;
export const pinLabel = (board: BoardModel, pin: string) => powerOptions(board).find((o) => o.pin === pin)?.label ?? pin;

/** LED templates for simple blades: what ProffieOS's own configs use. Resistor values are the stock examples. */
const SINGLE_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];
const STAR_LEDS = ['CreeXPE2RedTemplate<1000>', 'CreeXPE2GreenTemplate<0>', 'CreeXPE2BlueTemplate<240>', 'NoLED'];
const MOTOR_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];

export const kindOf = (b: ModelBlade): Kind => bladeKind(b);

/** The pins a blade uses, without the `-1` placeholders that keep a simple blade's pins in their LED slots (issue #15). */
export function powerPinsOf(b: ModelBlade): string[] {
  return bladePowerPins(b);
}

/** A fresh blade of a role, on the first free-looking pins. */
export function newBlade(id: string, role: BladeRole, board: BoardModel, taken: { data: string[]; power: string[] }): ModelBlade {
  const kind = ROLE_META[role].kind;
  const freeData = dataPins(board).find((p) => !taken.data.includes(p)) ?? dataPins(board)[0];
  const freePower = powerOptions(board).filter((o) => o.kind === 'fet').map((o) => o.pin).find((p) => !taken.power.includes(p)) ?? 'bladePowerPin1';
  return withKind({ id, role, type: 'pixel', pixels: role === 'main' ? 132 : role === 'side' ? 40 : 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: freeData, powerPins: [freePower] } }, kind, board);
}

/**
 * The blades after the owner sets the count to `n` (1 to 8), or null when `n` is out of range. Fewer drops blades from
 * the end; more adds each with the next role (main, then crystal, then accents) on the first free data and power pins.
 */
export function withBladeCount(blades: ModelBlade[], n: number, board: BoardModel): ModelBlade[] | null {
  if (n < 1 || n > 8) return null;
  if (n < blades.length) return blades.slice(0, n);
  const next = [...blades];
  while (next.length < n) {
    const taken = { data: next.flatMap((b) => (b.wiring.kind === 'own' ? [b.wiring.dataPin] : [])), power: next.flatMap(powerPinsOf) };
    const role: BladeRole = next.some((b) => b.role === 'main') ? (next.some((b) => b.role === 'crystal') ? 'accent' : 'crystal') : 'main';
    next.push(newBlade(`b${next.length + 1}`, role, board, taken));
  }
  return next;
}

/**
 * Change what a blade is built from, keeping whatever wiring still makes sense. Pins it needs beyond those go on FETs
 * no other blade (`taken`) and no other channel of it uses, while any are free (FST-3).
 */
export function withKind(b: ModelBlade, kind: Kind, board: BoardModel, taken: string[] = []): ModelBlade {
  const power = powerPinsOf(b);
  const fets = powerOptions(board).filter((o) => o.kind === 'fet').map((o) => o.pin);
  const firstFet = fets[0];
  if (kind === 'pixel') {
    return { ...b, type: 'pixel', leds: [], pixels: b.type === 'pixel' ? b.pixels : 1, order: b.order || 'GRB', wiring: b.wiring.kind === 'chain' || b.wiring.kind === 'own' ? b.wiring : { kind: 'own', dataPin: dataPins(board)[0], powerPins: power.length ? power : [firstFet] } };
  }
  const leds = kind === 'star' ? STAR_LEDS : kind === 'motor' ? MOTOR_LEDS : SINGLE_LEDS;
  const need = kind === 'star' ? 3 : 1;
  const pins = power.slice(0, need);
  while (pins.length < need) pins.push(fets.find((p) => !pins.includes(p) && !taken.includes(p)) ?? fets.find((p) => !pins.includes(p)) ?? firstFet);
  return { ...b, type: 'simple', leds, pixels: need, order: '', wiring: { kind: 'power', pins } };
}

export interface PinRow { pin: string; label: string; users: string[]; conflict: boolean; shared?: boolean; kind?: 'fet' | 'pwm' }
export interface PinReport { data: PinRow[]; power: PinRow[]; problems: string[]; shared: string[] }

/** Who uses which pin, what conflicts, and what is merely shared. The problems are core's wiringProblems: the build's own. */
export function pinTable(blades: ModelBlade[], board: BoardModel): PinReport {
  const data: PinRow[] = dataPins(board).map((p) => ({ pin: p, label: p, users: [], conflict: false }));
  const power: PinRow[] = powerOptions(board).map((o) => ({ pin: o.pin, label: o.label, users: [], conflict: false, kind: o.kind }));
  const rootOf = (b: ModelBlade): ModelBlade | null => { let cur = b; const seen = new Set<string>(); while (cur.wiring.kind === 'chain') { if (seen.has(cur.id)) return null; seen.add(cur.id); const p = blades.find((x) => x.id === (cur.wiring as { after: string }).after); if (!p) return null; cur = p; } return cur; };
  for (const b of blades) {
    if (b.wiring.kind === 'own') {
      data.find((r) => r.pin === (b.wiring as { dataPin: string }).dataPin)?.users.push(b.id);
      for (const p of b.wiring.powerPins) power.find((r) => r.pin === p)?.users.push(b.id);
    } else if (b.wiring.kind === 'chain') {
      const root = rootOf(b);
      if (root && root.wiring.kind === 'own' && root.type === 'pixel') data.find((r) => r.pin === (root.wiring as { dataPin: string }).dataPin)?.users.push(b.id);
    } else {
      for (const p of powerPinsOf(b)) power.find((r) => r.pin === p)?.users.push(b.id);
    }
  }
  // The problems are exactly the ones the build refuses, in the same words; their pins are marked in the table.
  const found = wiringProblems(blades, board);
  const bad = new Set(found.flatMap((f) => f.pins));
  for (const r of [...data, ...power]) if (bad.has(r.pin)) r.conflict = true;
  const problems = found.map((f) => f.message);
  const shared = sharedPowerPins(blades);
  for (const r of power) if (shared.includes(r.pin)) r.shared = true;
  return { data, power, problems, shared: shared.map((p) => pinLabel(board, p)) };
}

export function bladeSummary(blades: ModelBlade[], b: ModelBlade, board: BoardModel): string {
  // A brightness limit from the installer's config (issue #16) is part of what the blade is.
  return b.dim !== undefined ? `${plainSummary(blades, b, board)} · ${b.dim}% brightness` : plainSummary(blades, b, board);
}

function plainSummary(blades: ModelBlade[], b: ModelBlade, board: BoardModel): string {
  const kind = kindOf(b);
  if (kind === 'pixel') {
    if (b.wiring.kind === 'chain') {
      const r = chainRanges(blades).get(b.id);
      const after = blades.findIndex((x) => x.id === (b.wiring as { after: string }).after) + 1;
      return `${b.pixels} px · continues Blade ${after}'s wire${r ? ` · pixels ${r.first}–${r.last}` : ''}`;
    }
    const w = b.wiring as { dataPin: string; powerPins: string[] };
    return `${b.pixels} px${b.parallel > 1 ? ` × ${b.parallel} strips` : ''} · ${w.dataPin} · ${w.powerPins.map((p) => pinLabel(board, p)).join(' + ')}`;
  }
  const pins = powerPinsOf(b).map((p) => pinLabel(board, p)).join(' + ');
  return `${KIND_LABEL[kind]} · ${pins}`;
}
