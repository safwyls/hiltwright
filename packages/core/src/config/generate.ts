// Generate a complete config.h from the product model. This is the file Hiltwright compiles: golden baseline
// defines, the blade table from the wizard model, starter looks with runtime-editable colours, and one preset per
// existing preset so an adopted saber keeps its fonts, tracks and names.

import type { BladeSpec, PresetSource } from '../model';
import { emitBladeExpr, emitPresetArray } from './emit';
import { bladesToExprs, sharedPowerPins, stripLength } from './blades';
import { quote } from './cpp';
import { STARTER_LOOKS, starterLookFor, type FirmwareManifest, type LookDef } from '../looks';
import { LIBRARY_LOOKS, LOOK_FX } from '../lookLibrary';

export type Prop = 'fett263' | 'sa22c' | 'bc' | 'default';
export type BoardModel = 'V2' | 'V3';
export type BladeRole = 'main' | 'crystal' | 'accent' | 'side' | 'motor';

export interface ModelBlade extends BladeSpec {
  role: BladeRole;
}

/**
 * One blade the owner plugs into the main emitter. `ohms` is what the saber measured for it (never typed by hand);
 * null means not measured yet, and such a variant is left out of the build. `noBlade` is the empty emitter.
 */
export interface BladeVariant { id: string; name: string; pixels: number; ohms: number | null; noBlade?: boolean }

/** Two ID readings closer than this (relative) cannot be told apart reliably. */
export const BLADE_ID_MIN_SEPARATION = 0.15;

export interface SaberConfigModel {
  /** Config file stem, e.g. `hiltwright_hote2`. Letters, digits and underscores. */
  name: string;
  board: BoardModel;
  buttons: 1 | 2 | 3;
  prop: Prop;
  blades: ModelBlade[];
  /**
   * Presets to carry over. `looks` names the look compiled into each blade slot (index 0 = blade 1); a missing or
   * null entry gets the starter look for that blade's role.
   */
  /**
   * `looks`: the look compiled into each blade slot of this preset. `lookArgs`: style arguments (colours, timings)
   * chosen with a look before it was installed, per blade; the app writes them to the saber after the install and
   * then drops them. The generator ignores them: arguments live in the saber's presets, not in firmware.
   */
  presets: { font: string; track: string; name: string; looks?: (string | null)[]; lookArgs?: (string | null)[] }[];
  /** Looks beyond the starters that presets may reference (pasted library styles). */
  looks?: LookDef[];
  /** Swappable main blades told apart by their ID resistor. Absent or empty: one blade, no Blade ID. */
  bladeId?: { variants: BladeVariant[] };
  /** Extra `#define` lines the caller wants, verbatim without the `#define`. */
  extraDefines?: string[];
  /** Hiltwright version, written into the header. */
  generator?: string;
}

const BOARD_INCLUDE: Record<BoardModel, string> = { V2: 'proffieboard_v2_config.h', V3: 'proffieboard_v3_config.h' };
const PROP_INCLUDE: Record<Prop, string> = {
  fett263: '../props/saber_fett263_buttons.h',
  sa22c: '../props/saber_sa22c_buttons.h',
  bc: '../props/saber_BC_buttons.h',
  default: '../props/saber.h',
};

/** Every Hiltwright look's C++, for reference and tests. A build only gets the ones it uses. */
export const STARTER_STYLES = [LOOK_FX, ...LIBRARY_LOOKS.map((l) => l.define)].join('\n');

/** Every look the model can reference, starters first. */
export function modelLooks(m: SaberConfigModel): LookDef[] {
  return [...STARTER_LOOKS, ...(m.looks ?? []).filter((l) => !STARTER_LOOKS.some((s) => s.id === l.id))];
}

/** The look compiled into preset `pi`, blade `bi` (0-based): the chosen one, else the starter for the role. */
export function lookForSlot(m: SaberConfigModel, pi: number, bi: number): LookDef {
  const id = m.presets[pi]?.looks?.[bi];
  const chosen = id ? modelLooks(m).find((l) => l.id === id) : null;
  return chosen ?? starterLookFor(m.blades[bi]?.role ?? 'main');
}

/** Small stable hash for identity headers. Not cryptographic. */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x9e3779b1) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
}

export function validateModel(m: SaberConfigModel): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m.name)) errors.push('Config name must be letters, digits and underscores.');
  if (!m.blades.length) errors.push('At least one blade is needed.');
  if (!m.blades.some((b) => b.role === 'main')) errors.push('One blade must be the main blade.');
  if (!m.presets.length) errors.push('At least one preset is needed.');
  const dataPins = new Map<string, number>();
  for (const b of m.blades) {
    if (b.type === 'pixel' && b.wiring.kind === 'own') {
      dataPins.set(b.wiring.dataPin, (dataPins.get(b.wiring.dataPin) ?? 0) + 1);
      if (!b.wiring.powerPins.length) errors.push(`${b.id}: a pixel strip needs at least one power pin.`);
    }
    if (b.type === 'pixel' && b.pixels < 1) errors.push(`${b.id}: pixel count must be at least 1.`);
    if (b.wiring.kind === 'power' && !b.wiring.pins.length) errors.push(`${b.id}: needs a power pin.`);
  }
  for (const [pin, n] of dataPins) if (n > 1) errors.push(`${pin} is used by ${n} separate strips. Chain them or use different data pins.`);
  const known = new Set(modelLooks(m).map((l) => l.id));
  m.presets.forEach((p, pi) => (p.looks ?? []).forEach((id, bi) => { if (id && !known.has(id)) errors.push(`Preset ${pi + 1}, blade ${bi + 1}: unknown look "${id}".`); }));
  for (const l of m.looks ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(l.id)) errors.push(`Look id "${l.id}" must be letters, digits and underscores.`);
    if (!l.code.trim()) errors.push(`Look "${l.name}" has no style code.`);
  }
  const variants = m.bladeId?.variants ?? [];
  if (variants.length) {
    const main = m.blades.find((b) => b.role === 'main');
    if (!main || main.type !== 'pixel') errors.push('Blade swapping needs a pixel strip as the main blade.');
    for (const v of variants) {
      if (!v.name.trim()) errors.push('Every swappable blade needs a name.');
      if (!v.noBlade && v.pixels < 1) errors.push(`${v.name || 'A blade'}: pixel count must be at least 1.`);
    }
    const measured = variants.filter((v) => !v.noBlade && v.ohms != null).sort((a, b) => a.ohms! - b.ohms!);
    for (let i = 1; i < measured.length; i++) {
      const lo = measured[i - 1]; const hi = measured[i];
      if ((hi.ohms! - lo.ohms!) / Math.max(hi.ohms!, 1) < BLADE_ID_MIN_SEPARATION) errors.push(`"${lo.name}" and "${hi.name}" measure too close together (${Math.round(lo.ohms!)} and ${Math.round(hi.ohms!)}) for the saber to tell them apart. One of them needs a different ID resistor.`);
    }
  }
  return errors;
}

/** The BladeConfig rows a model produces: one per measured variant, or a single row with ID 0. */
export function bladeRowsFor(m: SaberConfigModel): { id: string; name: string; blades: ModelBlade[] }[] {
  const usable = (m.bladeId?.variants ?? []).filter((v) => v.noBlade || v.ohms != null);
  if (!usable.length) return [{ id: '0', name: 'blade', blades: m.blades }];
  return usable.map((v) => ({
    id: v.noBlade ? 'NO_BLADE' : String(Math.round(v.ohms!)),
    name: v.name,
    blades: m.blades.map((b) => (b.role === 'main' && b.type === 'pixel' && !v.noBlade ? { ...b, pixels: v.pixels } : b)),
  }));
}

export interface GeneratedConfig { text: string; hash: string; sharedPower: string[]; warnings: string[]; manifest: Omit<FirmwareManifest, 'os' | 'at'> }

export function generateConfig(m: SaberConfigModel): GeneratedConfig {
  const warnings: string[] = [];
  const shared = sharedPowerPins(m.blades);
  const rows = bladeRowsFor(m);
  const swapping = (m.bladeId?.variants.length ?? 0) > 0;
  const maxLeds = Math.max(144, ...rows.flatMap((r) => r.blades.filter((b) => b.type === 'pixel').map((b) => (b.wiring.kind === 'own' ? stripLength(r.blades, b.id) : b.pixels))));
  const defines: string[] = [
    `NUM_BLADES ${m.blades.length}`,
    `NUM_BUTTONS ${m.buttons}`,
    'VOLUME 1800',
    'CLASH_THRESHOLD_G 3.5',
    'ENABLE_AUDIO',
    'ENABLE_MOTION',
    'ENABLE_WS2811',
    'ENABLE_SD',
    'SAVE_STATE',
    // MOUNT_SD_SETTING is not listed, but ENABLE_ALL_EDIT_OPTIONS (below) defines it inside ProffieOS.ino, and the
    // Fett263 edit menu refuses to compile without ENABLE_ALL_EDIT_OPTIONS. So a Fett263 build always uses the v2
    // sound library and needs the version 2 voice pack on the card; see the warning generateConfig returns.
    'COLOR_CHANGE_DIRECT',
    'ENABLE_ALL_EDIT_OPTIONS',
  ];
  if (m.prop === 'fett263') defines.push('FETT263_EDIT_MODE_MENU', 'FETT263_SAY_BATTERY_PERCENT', 'FETT263_SAY_COLOR_LIST', 'FETT263_SAY_COLOR_LIST_CC');
  if (swapping) {
    // Blade ID on a pixel blade only reads right with the blade powered, and rescanning makes a swap take effect
    // without a restart. These go in as soon as swapping is on, so readings taken before the rows exist still match.
    const main = m.blades.find((b) => b.role === 'main');
    if (main?.wiring.kind === 'own' && main.wiring.powerPins.length) defines.push(`ENABLE_POWER_FOR_ID PowerPINS<${main.wiring.powerPins.join(', ')}>`);
    defines.push('BLADE_ID_SCAN_MILLIS 1000', 'BLADE_ID_TIMES 15', 'BLADE_ID_STOP_SCAN_WHILE_IGNITED');
  }
  if (shared.length || swapping) defines.push('SHARED_POWER_PINS');
  if (m.extraDefines) defines.push(...m.extraDefines);

  const slotLooks = m.presets.map((_p, pi) => m.blades.map((_b, bi) => lookForSlot(m, pi, bi)));
  const presets = m.presets.map((p, pi): PresetSource => ({
    font: p.font, track: p.track, name: p.name,
    styles: slotLooks[pi].map((l) => ({ kind: 'raw', code: l.source === 'starter' ? l.code : `/* ${l.name} */ ${l.code}` })),
  }));
  const usedLooks = modelLooks(m).filter((l) => slotLooks.some((row) => row.some((x) => x.id === l.id)));
  const pastedHeaders = usedLooks.filter((l) => l.source !== 'starter' && l.header).map((l) => `// Look "${l.name}" (${l.by}):\n${l.header}`);
  const manifest: GeneratedConfig['manifest'] = {
    hash: '',
    bladeId: swapping,
    looks: usedLooks.map((l) => ({ id: l.id, name: l.name, args: l.args, ...(l.defaults ? { defaults: l.defaults } : {}) })),
    presets: slotLooks.map((row, pi) => ({ name: m.presets[pi].name, looks: row.map((l) => l.id) })),
  };

  const rowText = rows.map((r) => `  { ${r.id}, ${bladesToExprs(r.blades).map(emitBladeExpr).join(',\n    ')},\n    CONFIGARRAY(presets) },${swapping ? ` // ${r.name.replace(/[\r\n]+/g, ' ')}` : ''}`);
  const summary = {
    generator: m.generator ?? 'hiltwright',
    name: m.name, board: m.board, buttons: m.buttons, prop: m.prop,
    blades: m.blades.map((b) => ({ role: b.role, type: b.type, pixels: b.pixels, wiring: b.wiring })),
    presets: m.presets.length,
    looks: manifest.looks.map((l) => l.id),
  };
  const body = [
    '#ifdef CONFIG_TOP',
    `#include "${BOARD_INCLUDE[m.board]}"`,
    ...defines.map((d) => `#define ${d}`),
    `const unsigned int maxLedsPerStrip = ${maxLeds};`,
    '#endif',
    '',
    '#ifdef CONFIG_PROP',
    `#include "${PROP_INCLUDE[m.prop]}"`,
    '#endif',
    '',
    '#ifdef CONFIG_STYLES',
    '// Hiltwright looks used by this saber. Every colour is a runtime argument (edit it from the app, no rebuild).',
    ...(usedLooks.some((l) => l.usesFx) ? [LOOK_FX] : []),
    ...usedLooks.filter((l) => l.define).map((l) => l.define as string),
    ...(pastedHeaders.length ? ['', '// Library looks compiled into this saber. Their headers stay with them.', ...pastedHeaders] : []),
    '#endif',
    '',
    '#ifdef CONFIG_PRESETS',
    emitPresetArray({ name: 'presets', presets }).trimEnd(),
    '',
    'BladeConfig blades[] = {',
    ...rowText,
    '};',
    '#endif',
    '',
    '#ifdef CONFIG_BUTTONS',
    `Button PowerButton(BUTTON_POWER, powerButtonPin, ${quote('pow')});`,
    ...(m.buttons >= 2 ? [`Button AuxButton(BUTTON_AUX, auxPin, ${quote('aux')});`] : []),
    ...(m.buttons >= 3 ? [`Button Aux2Button(BUTTON_AUX2, aux2Pin, ${quote('aux2')});`] : []),
    '#endif',
    '',
  ].join('\n');
  const hash = contentHash(body);
  const header = [
    '/*',
    ` * ${m.name}.h · generated by Hiltwright. Do not edit by hand; edit the saber in Hiltwright and rebuild.`,
    ` * hiltwright: ${JSON.stringify({ ...summary, hash })}`,
    ' */',
    '',
  ].join('\n');
  if (shared.length) warnings.push(`Power ${shared.length > 1 ? 'pins' : 'pin'} ${shared.join(', ')} shared between blades: SHARED_POWER_PINS added.`);
  manifest.hash = hash;
  return { text: header + body, hash, sharedPower: shared, warnings, manifest };
}

/** Recover the summary a generated config carries in its header. */
export function readGeneratedHeader(text: string): Record<string, unknown> | null {
  const m = /\* hiltwright: (\{.*\})$/m.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]) as Record<string, unknown>; } catch { return null; }
}
