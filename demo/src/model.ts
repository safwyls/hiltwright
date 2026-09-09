// Domain model for the demo. Mirrors what @hiltwright/core would own, simplified.

export type Role = 'main' | 'crystal' | 'accent' | 'side' | 'motor';
export type BladeType = 'pixel' | 'star' | 'single' | 'motor';
export type Board = 'V2.2' | 'V3.9';

export type Wiring =
  | { kind: 'own'; dataPin: string; powerPins: number[] }
  | { kind: 'chain'; after: string }
  | { kind: 'power'; pin: number };

export interface Blade {
  id: string;
  role: Role;
  type: BladeType;
  pixels: number;
  chip: string;
  order: string;
  ledColor: string;
  /** Strips soldered to the same data wire. They mirror each other and count as one blade. */
  parallel: number;
  wiring: Wiring;
}

export interface Variant {
  id: string;
  name: string;
  pixels: number;
  ohms: number | null;
}

export type ColorKey = 'base' | 'alt' | 'clash' | 'lockup' | 'blast';
export const COLOR_LABELS: Record<ColorKey, { label: string; arg: number }> = {
  base: { label: 'Base colour', arg: 1 },
  alt: { label: 'Second phase', arg: 2 },
  clash: { label: 'Clash flash', arg: 4 },
  lockup: { label: 'Lockup', arg: 5 },
  blast: { label: 'Blast', arg: 8 },
};

export interface Look {
  id: string;
  name: string;
  by: string;
  os: string;
  kb: number;
  c: string;
  c2?: string;
  tags: string[];
  args: ColorKey[];
  desc: string;
  needs?: string;
}

export interface Preset {
  id: string;
  name: string;
  font: string;
  track: string;
  variation: number;
  looks: Record<string, string>; // bladeId -> look id (library look for main/side, builtin look id for others)
  colors: Record<ColorKey, string>;
  crystalLinked: boolean;
  crystalColor: string;
  ignition: number;
  retraction: number;
  swing: string;
}

export interface Saber {
  id: string;
  name: string;
  board: Board;
  flashKB: 256 | 512;
  fw: string;
  blades: Blade[];
  variants: Variant[] | null;
  activeVariant: string | null;
  presets: Preset[];
  compiled: string[]; // library look ids in the firmware
  pending: string[]; // library look ids waiting for a build
  lastBackup: string;
  lastSeen: string;
}

export interface Font {
  id: string;
  name: string;
  type: 'Polyphonic' | 'Monophonic' | 'Mixed' | 'Shared sounds';
  rate: string;
  size: string;
  issue: null | { kind: 'rate' | 'mix'; text: string; fix: string };
}

// ---------- Role and type metadata ----------

export const ROLE_META: Record<Role, { label: string; defaultType: BladeType; hint: string }> = {
  main: { label: 'Main blade', defaultType: 'pixel', hint: 'The blade in the emitter' },
  crystal: { label: 'Crystal chamber', defaultType: 'pixel', hint: 'Pixels or an LED around the crystal' },
  accent: { label: 'Accent', defaultType: 'single', hint: 'A lit switch, ring or window' },
  side: { label: 'Side blade', defaultType: 'pixel', hint: 'A quillon or second emitter' },
  motor: { label: 'Motor', defaultType: 'motor', hint: 'Spins a crystal chamber component' },
};

export const TYPE_META: Record<BladeType, { label: string }> = {
  pixel: { label: 'Pixel strip' },
  star: { label: 'Star LED' },
  single: { label: 'Single LED' },
  motor: { label: 'Motor' },
};

/** Looks offered to non-main blades. These are small built-in styles, cheap in flash. */
export const SMALL_LOOKS: Record<'light' | 'motor', { id: string; label: string }[]> = {
  light: [
    { id: 'off', label: 'Off' },
    { id: 'follow', label: 'Follow main blade' },
    { id: 'solid', label: 'Solid colour' },
    { id: 'pulse', label: 'Slow pulse' },
    { id: 'flicker', label: 'Flicker' },
    { id: 'battery', label: 'Battery level' },
    { id: 'pulseClash', label: 'Pulse on clash and lockup' },
  ],
  motor: [
    { id: 'off', label: 'Off' },
    { id: 'spinOn', label: 'Spin while ignited' },
    { id: 'spinClash', label: 'Spin on clash' },
  ],
};

export function smallLookLabel(id: string): string {
  return [...SMALL_LOOKS.light, ...SMALL_LOOKS.motor].find((l) => l.id === id)?.label ?? id;
}

export const DATA_PINS: Record<Board, string[]> = {
  'V2.2': ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'],
  'V3.9': ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin', 'blade5Pin · Free 1', 'blade6Pin · Free 2', 'blade7Pin · Free 3'],
};
export const POWER_PINS = [1, 2, 3, 4, 5, 6];

export interface PowerOption { pin: number; label: string; kind: 'fet' | 'pwm'; hint?: string }
/** What a single LED or motor can be driven from. LED 1–6 are FETs; on V3.9 the Free pins can PWM a small LED through its own resistor. */
export function powerOptions(board: Board): PowerOption[] {
  const fets = POWER_PINS.map((p) => ({ pin: p, label: `LED ${p}`, kind: 'fet' as const }));
  if (board === 'V3.9') return [...fets, ...[7, 8, 9].map((p) => ({ pin: p, label: `Free ${p - 6}`, kind: 'pwm' as const, hint: 'PWM from the chip, a few mA: small indicator LED with its own resistor, no motors' }))];
  return fets;
}
export function powerLabel(board: Board, pin: number): string {
  return powerOptions(board).find((o) => o.pin === pin)?.label ?? `LED ${pin}`;
}

// ---------- Derived facts ----------

export function isMainLike(role: Role) {
  return role === 'main' || role === 'side';
}

/** Root strip of a chained blade, and its pixel range on that strip. */
export function bladeRange(blades: Blade[], id: string): { root: Blade; start: number; end: number } | null {
  const b = blades.find((x) => x.id === id);
  if (!b || b.type !== 'pixel') return null;
  // Walk up the chain to the root.
  const chain: Blade[] = [b];
  let cur = b;
  while (cur.wiring.kind === 'chain') {
    const parent = blades.find((x) => x.id === (cur.wiring as { after: string }).after);
    if (!parent || chain.includes(parent)) break;
    chain.unshift(parent);
    cur = parent;
  }
  const root = chain[0];
  // Everything chained on the root, in blade order, determines ranges.
  const onWire = blades.filter((x) => x.type === 'pixel' && rootOf(blades, x)?.id === root.id);
  let pos = 0;
  for (const x of onWire) {
    if (x.id === id) return { root, start: pos, end: pos + x.pixels - 1 };
    pos += x.pixels;
  }
  return { root, start: 0, end: b.pixels - 1 };
}

export function rootOf(blades: Blade[], b: Blade): Blade | null {
  let cur = b;
  const seen = new Set<string>();
  while (cur.wiring.kind === 'chain') {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    const parent = blades.find((x) => x.id === (cur.wiring as { after: string }).after);
    if (!parent) return null;
    cur = parent;
  }
  return cur;
}

export interface PinRow {
  pin: string;
  users: string[]; // blade ids
  conflict: boolean;
  shared?: boolean; // power pin driven by more than one independent blade: legal with SHARED_POWER_PINS
  kind?: 'fet' | 'pwm';
}

export function pinTable(blades: Blade[], board: Board): { data: PinRow[]; power: PinRow[]; conflicts: string[]; sharedPower: string[] } {
  const data: PinRow[] = DATA_PINS[board].map((p) => ({ pin: p, users: [], conflict: false }));
  const power: PinRow[] = powerOptions(board).map((o) => ({ pin: o.label, users: [], conflict: false, kind: o.kind }));
  const conflicts: string[] = [];
  const sharedPower: string[] = [];
  const powerRow = (pin: number) => power[powerOptions(board).findIndex((o) => o.pin === pin)];
  for (const b of blades) {
    if (b.wiring.kind === 'own') {
      const dp = b.wiring.dataPin;
      const row = data.find((r) => r.pin === dp);
      if (row) row.users.push(b.id);
      for (const p of b.wiring.powerPins) powerRow(p)?.users.push(b.id);
    } else if (b.wiring.kind === 'chain') {
      const root = rootOf(blades, b);
      if (root && root.wiring.kind === 'own') {
        const row = data.find((r) => r.pin === (root.wiring as { dataPin: string }).dataPin);
        if (row) row.users.push(b.id);
      }
    } else if (b.wiring.kind === 'power') {
      const row = powerRow(b.wiring.pin);
      if (row) {
        row.users.push(b.id);
        if (row.kind === 'pwm' && (b.type === 'motor' || b.type === 'star')) {
          row.conflict = true;
          conflicts.push(`${row.pin} is a low-current PWM pin: it cannot drive a ${b.type === 'motor' ? 'motor' : 'star LED'}`);
        }
      }
    }
  }
  // A data pin with more than one own-line root is a conflict; chained blades share legitimately.
  for (const r of data) {
    const roots = r.users.filter((id) => blades.find((b) => b.id === id)?.wiring.kind === 'own');
    if (roots.length > 1) {
      r.conflict = true;
      conflicts.push(`${r.pin} is used by ${roots.length} separate blades`);
    }
  }
  // A power pin shared between independent blades is legal: ProffieOS needs SHARED_POWER_PINS, which the build adds.
  for (const r of power) {
    const roots = new Set(r.users.map((id) => rootOf(blades, blades.find((b) => b.id === id)!)?.id ?? id));
    if (roots.size > 1) {
      r.shared = true;
      sharedPower.push(r.pin);
    }
  }
  return { data, power, conflicts, sharedPower };
}

export function freeDataPin(blades: Blade[], board: Board): string {
  const used = new Set(blades.filter((b) => b.wiring.kind === 'own').map((b) => (b.wiring as { dataPin: string }).dataPin));
  return DATA_PINS[board].find((p) => !used.has(p)) ?? DATA_PINS[board][0];
}

export function freePowerPin(blades: Blade[]): number {
  const used = new Set<number>();
  for (const b of blades) {
    if (b.wiring.kind === 'own') b.wiring.powerPins.forEach((p) => used.add(p));
    if (b.wiring.kind === 'power') used.add(b.wiring.pin);
  }
  return POWER_PINS.find((p) => !used.has(p)) ?? 6;
}

export const OS_BASE_KB = 197.0;
export const SMALL_LOOK_KB = 0.8;

export function flashEstimate(saber: Saber, looks: Look[], extraPending: string[] = []) {
  const libIds = new Set([...saber.compiled, ...saber.pending, ...extraPending]);
  let lib = 0;
  for (const id of libIds) lib += looks.find((l) => l.id === id)?.kb ?? 0;
  const smalls = new Set<string>();
  for (const p of saber.presets) for (const [bid, lid] of Object.entries(p.looks)) {
    const b = saber.blades.find((x) => x.id === bid);
    if (b && !isMainLike(b.role) && lid !== 'off') smalls.add(lid);
  }
  const small = smalls.size * SMALL_LOOK_KB;
  const used = OS_BASE_KB + lib + small;
  return { base: OS_BASE_KB, lib, small, used, pct: Math.round((used / saber.flashKB) * 100), free: saber.flashKB - used, libCount: libIds.size };
}

export interface Check { label: string; detail: string; ok: boolean }

export function preflight(saber: Saber): Check[] {
  const missing = saber.presets.filter((p) => saber.blades.some((b) => !p.looks[b.id]));
  const pins = pinTable(saber.blades, saber.board);
  return [
    {
      label: 'Every preset has a look for every blade',
      detail: missing.length ? `${missing.map((p) => `“${p.name}”`).join(', ')} still need one` : `${saber.presets.length} presets × ${saber.blades.length} blades`,
      ok: missing.length === 0,
    },
    { label: 'Button options work together', detail: 'Fett263 · edit mode · gestures', ok: true },
    {
      label: `Wiring matches the ${saber.board} profile`,
      detail: pins.conflicts.length ? pins.conflicts.join('; ') : pins.sharedPower.length ? `${pins.sharedPower.join(', ')} shared · adds SHARED_POWER_PINS` : saber.blades.map((b) => ROLE_META[b.role].label.toLowerCase()).join(', '),
      ok: pins.conflicts.length === 0,
    },
    { label: 'Bootloader driver installed', detail: 'Windows · WinUSB · checked just now', ok: true },
    { label: 'Full backup taken', detail: `${saber.flashKB} KB flash + presets.ini · ${saber.lastBackup}`, ok: true },
  ];
}

export function bladeSummary(blades: Blade[], b: Blade): string {
  const parts: string[] = [];
  if (b.type === 'pixel') parts.push(`${b.pixels} px pixel strip${b.parallel > 1 ? ` × ${b.parallel} in parallel` : ''}`, b.chip);
  if (b.type === 'star') parts.push('Star LED (RGB)');
  if (b.type === 'single') parts.push('Single LED');
  if (b.type === 'motor') parts.push(b.role === 'motor' ? 'Crystal chamber spinner' : 'Motor');
  if (b.wiring.kind === 'own') parts.push(`own data line on ${b.wiring.dataPin}`, `power LED ${b.wiring.powerPins.join(' + ')}`);
  if (b.wiring.kind === 'chain') {
    const after = b.wiring.after;
    const parent = blades.find((x) => x.id === after);
    const idx = parent ? blades.indexOf(parent) + 1 : 0;
    const r = bladeRange(blades, b.id);
    parts.push(`continues Blade ${idx}'s wire${r ? ` · pixels ${r.start}–${r.end}` : ''}`);
  }
  if (b.wiring.kind === 'power') parts.push(b.wiring.pin > 6 ? `PWM on Free ${b.wiring.pin - 6}` : `power LED ${b.wiring.pin}`);
  return parts.join(' · ');
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
