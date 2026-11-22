// What makes wiring invalid, decided once (wiring-validation): the Wiring page lists these problems and the build refuses
// them, in the same words. Also the pins each board has, and what a blade is built from.

import type { BoardModel, ModelBlade } from './generate';
import { bladePowerPins, chainRoots } from './blades';

export type BladeKind = 'pixel' | 'single' | 'star' | 'motor';
export interface PowerOption { pin: string; label: string; kind: 'fet' | 'pwm' }

const FETS: PowerOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ pin: `bladePowerPin${n}`, label: `LED ${n}`, kind: 'fet' as const }));

/** The pins each Proffieboard has. V3 adds Free 1–3 (`blade5Pin`–`blade7Pin`): data lines, or low-current PWM for a small LED. */
export const BOARD_PINS: Record<BoardModel, { data: string[]; power: PowerOption[]; freeData: string[] }> = {
  V2: { data: ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'], power: FETS, freeData: [] },
  V3: {
    data: ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin', 'blade5Pin', 'blade6Pin', 'blade7Pin'],
    power: [...FETS, { pin: 'blade5Pin', label: 'Free 1', kind: 'pwm' }, { pin: 'blade6Pin', label: 'Free 2', kind: 'pwm' }, { pin: 'blade7Pin', label: 'Free 3', kind: 'pwm' }],
    freeData: ['blade5Pin', 'blade6Pin', 'blade7Pin'],
  },
};

/** What a blade is built from. */
export function bladeKind(b: ModelBlade): BladeKind {
  if (b.type === 'pixel') return 'pixel';
  if (b.role === 'motor') return 'motor';
  return b.leds.filter((l) => l !== 'NoLED').length >= 3 ? 'star' : 'single';
}

/** A wiring problem, in owner words, with the pins and blades it concerns (for marking the pin table). */
export interface WiringProblem { message: string; pins: string[]; blades: string[] }

const powerLabel = (board: BoardModel, pin: string) => BOARD_PINS[board].power.find((o) => o.pin === pin)?.label ?? pin;

/** Every problem with this wiring on this board. Empty when the wiring is valid. */
export function wiringProblems(blades: ModelBlade[], board: BoardModel): WiringProblem[] {
  const out: WiringProblem[] = [];
  const pins = BOARD_PINS[board];
  const index = (id: string) => blades.findIndex((b) => b.id === id);
  const name = (id: string) => `Blade ${index(id) + 1}`;
  const add = (message: string, pinList: string[], bladeList: string[]) => out.push({ message, pins: pinList, blades: bladeList });

  if (!blades.some((b) => b.role === 'main')) add('One blade must be the main blade.', [], []);
  const dataUsers = new Map<string, string[]>();
  const pwmUsers = new Map<string, string[]>();
  const roots = chainRoots(blades);
  for (const b of blades) {
    const w = b.wiring;
    if (b.type === 'pixel' && b.pixels < 1) add(`${name(b.id)} needs a pixel count.`, [], [b.id]);
    if (w.kind === 'own') {
      dataUsers.set(w.dataPin, [...(dataUsers.get(w.dataPin) ?? []), b.id]);
      if (!w.powerPins.length) add(`${name(b.id)} needs at least one power pin.`, [], [b.id]);
      if (!pins.data.includes(w.dataPin)) add(`${name(b.id)} uses ${w.dataPin}, which the Proffieboard ${board} does not have.`, [w.dataPin], [b.id]);
    } else if (w.kind === 'chain') {
      const parent = blades.find((x) => x.id === w.after);
      // The strip that owns the data line, found the same way as strip length and LED ranges are (issue #17).
      if (!parent || !roots.has(b.id)) add(`${name(b.id)} continues a blade that is not a pixel strip on its own data line.`, [], [b.id]);
      else if (index(parent.id) > index(b.id)) add(`${name(b.id)} continues ${name(parent.id)}, which comes after it. Move it below ${name(parent.id)}.`, [], [b.id, parent.id]);
    }
    // A simple blade's `-1` placeholders keep its pins in their LED slots (issue #15); they are not pins.
    const power = bladePowerPins(b);
    if (w.kind === 'power' && !power.length) add(`${name(b.id)} needs a power pin.`, [], [b.id]);
    for (const p of power) {
      const opt = pins.power.find((o) => o.pin === p);
      if (!opt) { add(`${name(b.id)} uses ${p}, which the Proffieboard ${board} does not have.`, [p], [b.id]); continue; }
      if (opt.kind === 'pwm') {
        pwmUsers.set(p, [...(pwmUsers.get(p) ?? []), b.id]);
        const kind = bladeKind(b);
        if (kind !== 'single') add(`${opt.label} is a low-current PWM pin: it cannot drive a ${kind === 'motor' ? 'motor' : kind === 'star' ? 'star LED' : 'pixel strip'}.`, [p], [b.id]);
      }
    }
    const repeated = [...new Set(power.filter((p, i) => power.indexOf(p) !== i))];
    for (const p of repeated) add(`${name(b.id)} uses ${powerLabel(board, p)} more than once.`, [p], [b.id]);
  }
  for (const [pin, users] of dataUsers) {
    if (users.length > 1) add(`${pin} has ${users.length} separate strips on it (${users.map(name).join(', ')}). Chain them, or use different data pins.`, [pin], users);
    const pwm = pwmUsers.get(pin);
    if (pwm) add(`${pin} is used as a data line by ${users.map(name).join(', ')} and as a low-current power pin by ${pwm.map(name).join(', ')}.`, [pin], [...users, ...pwm]);
  }
  return out;
}
