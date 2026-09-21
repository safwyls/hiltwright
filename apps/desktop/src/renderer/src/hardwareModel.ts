// Pure model behind the hardware editor: pins per board, blade kinds, the pin table and its conflicts.
// No React and no DOM here, so it is unit-tested directly (apps/desktop/test/hardware.test.ts).

import { chainRanges, sharedPowerPins, type BladeRole, type BoardModel, type ModelBlade } from '@hiltwright/core';

export type Kind = 'pixel' | 'single' | 'star' | 'motor';

export const ROLE_META: Record<BladeRole, { label: string; hint: string; kind: Kind }> = {
  main: { label: 'Main blade', hint: 'The blade in the emitter', kind: 'pixel' },
  crystal: { label: 'Crystal chamber', hint: 'Pixels or an LED around the crystal', kind: 'pixel' },
  accent: { label: 'Accent', hint: 'A lit switch, ring or window', kind: 'single' },
  side: { label: 'Side blade', hint: 'A quillon or second emitter', kind: 'pixel' },
  motor: { label: 'Motor', hint: 'Spins a crystal chamber component', kind: 'motor' },
};
export const ROLES: BladeRole[] = ['main', 'crystal', 'accent', 'side', 'motor'];
export const KIND_LABEL: Record<Kind, string> = { pixel: 'Pixel strip', single: 'Single LED', star: 'Star LED', motor: 'Motor' };

/** Data pins per board. V3 adds Free 1–3, which can also drive small LEDs by PWM. */
export function dataPins(board: BoardModel): string[] {
  return board === 'V3' ? ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin', 'blade5Pin', 'blade6Pin', 'blade7Pin'] : ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'];
}
export interface PowerOption { pin: string; label: string; kind: 'fet' | 'pwm' }
export function powerOptions(board: BoardModel): PowerOption[] {
  const fets: PowerOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ pin: `bladePowerPin${n}`, label: `LED ${n}`, kind: 'fet' }));
  if (board === 'V3') fets.push({ pin: 'blade5Pin', label: 'Free 1', kind: 'pwm' }, { pin: 'blade6Pin', label: 'Free 2', kind: 'pwm' }, { pin: 'blade7Pin', label: 'Free 3', kind: 'pwm' });
  return fets;
}
export const pinLabel = (board: BoardModel, pin: string) => powerOptions(board).find((o) => o.pin === pin)?.label ?? pin;

/** LED templates for simple blades: what ProffieOS's own configs use. Resistor values are the stock examples. */
const SINGLE_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];
const STAR_LEDS = ['CreeXPE2RedTemplate<1000>', 'CreeXPE2GreenTemplate<0>', 'CreeXPE2BlueTemplate<240>', 'NoLED'];
const MOTOR_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];

export function kindOf(b: ModelBlade): Kind {
  if (b.type === 'pixel') return 'pixel';
  if (b.role === 'motor') return 'motor';
  return b.leds.filter((l) => l !== 'NoLED').length >= 3 ? 'star' : 'single';
}

export function powerPinsOf(b: ModelBlade): string[] {
  return b.wiring.kind === 'own' ? b.wiring.powerPins : b.wiring.kind === 'power' ? b.wiring.pins : [];
}

/** A fresh blade of a role, on the first free-looking pins. */
export function newBlade(id: string, role: BladeRole, board: BoardModel, taken: { data: string[]; power: string[] }): ModelBlade {
  const kind = ROLE_META[role].kind;
  const freeData = dataPins(board).find((p) => !taken.data.includes(p)) ?? dataPins(board)[0];
  const freePower = powerOptions(board).filter((o) => o.kind === 'fet').map((o) => o.pin).find((p) => !taken.power.includes(p)) ?? 'bladePowerPin1';
  return withKind({ id, role, type: 'pixel', pixels: role === 'main' ? 132 : role === 'side' ? 40 : 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: freeData, powerPins: [freePower] } }, kind, board);
}

/** Change what a blade is built from, keeping whatever wiring still makes sense. */
export function withKind(b: ModelBlade, kind: Kind, board: BoardModel): ModelBlade {
  const power = powerPinsOf(b);
  const firstFet = powerOptions(board).filter((o) => o.kind === 'fet')[0].pin;
  if (kind === 'pixel') {
    return { ...b, type: 'pixel', leds: [], pixels: b.type === 'pixel' ? b.pixels : 1, order: b.order || 'GRB', wiring: b.wiring.kind === 'chain' || b.wiring.kind === 'own' ? b.wiring : { kind: 'own', dataPin: dataPins(board)[0], powerPins: power.length ? power : [firstFet] } };
  }
  const leds = kind === 'star' ? STAR_LEDS : kind === 'motor' ? MOTOR_LEDS : SINGLE_LEDS;
  const need = kind === 'star' ? 3 : 1;
  const pins = power.slice(0, need);
  while (pins.length < need) pins.push(firstFet);
  return { ...b, type: 'simple', leds, pixels: need, order: '', wiring: { kind: 'power', pins } };
}

export interface PinRow { pin: string; label: string; users: string[]; conflict: boolean; shared?: boolean; kind?: 'fet' | 'pwm' }
export interface PinReport { data: PinRow[]; power: PinRow[]; problems: string[]; shared: string[] }

/** Who uses which pin, what conflicts, and what is merely shared. Mirrors validateModel's rules with owner wording. */
export function pinTable(blades: ModelBlade[], board: BoardModel): PinReport {
  const data: PinRow[] = dataPins(board).map((p) => ({ pin: p, label: p, users: [], conflict: false }));
  const power: PinRow[] = powerOptions(board).map((o) => ({ pin: o.pin, label: o.label, users: [], conflict: false, kind: o.kind }));
  const problems: string[] = [];
  const name = (id: string) => `Blade ${blades.findIndex((b) => b.id === id) + 1}`;
  const rootOf = (b: ModelBlade): ModelBlade | null => { let cur = b; const seen = new Set<string>(); while (cur.wiring.kind === 'chain') { if (seen.has(cur.id)) return null; seen.add(cur.id); const p = blades.find((x) => x.id === (cur.wiring as { after: string }).after); if (!p) return null; cur = p; } return cur; };
  for (const b of blades) {
    if (b.type === 'pixel' && b.pixels < 1) problems.push(`${name(b.id)} needs a pixel count.`);
    if (b.wiring.kind === 'own') {
      const d = data.find((r) => r.pin === (b.wiring as { dataPin: string }).dataPin);
      if (d) d.users.push(b.id);
      for (const p of b.wiring.powerPins) power.find((r) => r.pin === p)?.users.push(b.id);
      if (!b.wiring.powerPins.length) problems.push(`${name(b.id)} needs at least one power pin.`);
    } else if (b.wiring.kind === 'chain') {
      const root = rootOf(b);
      if (!root || root.wiring.kind !== 'own' || root.type !== 'pixel') problems.push(`${name(b.id)} continues a blade that is not a pixel strip on its own data line.`);
      else data.find((r) => r.pin === (root.wiring as { dataPin: string }).dataPin)?.users.push(b.id);
    } else {
      for (const p of b.wiring.pins) {
        const row = power.find((r) => r.pin === p);
        if (!row) continue;
        row.users.push(b.id);
        if (row.kind === 'pwm' && kindOf(b) !== 'single') { row.conflict = true; problems.push(`${row.label} is a low-current PWM pin: it cannot drive a ${kindOf(b) === 'motor' ? 'motor' : 'star LED'}.`); }
      }
      if (!b.wiring.pins.length) problems.push(`${name(b.id)} needs a power pin.`);
    }
  }
  for (const r of data) {
    const own = r.users.filter((id) => blades.find((b) => b.id === id)?.wiring.kind === 'own');
    if (own.length > 1) { r.conflict = true; problems.push(`${r.pin} has ${own.length} separate strips on it (${own.map(name).join(', ')}). Chain them, or use different data pins.`); }
  }
  const shared = sharedPowerPins(blades);
  for (const r of power) if (shared.includes(r.pin)) r.shared = true;
  if (!blades.some((b) => b.role === 'main')) problems.push('One blade must be the main blade.');
  return { data, power, problems, shared: shared.map((p) => pinLabel(board, p)) };
}

export function bladeSummary(blades: ModelBlade[], b: ModelBlade, board: BoardModel): string {
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
  const pins = (b.wiring as { pins: string[] }).pins.map((p) => pinLabel(board, p)).join(' + ');
  return `${KIND_LABEL[kind]} · ${pins}`;
}
