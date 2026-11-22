// Generate a complete config.h from the product model. This is the file Hiltwright compiles: golden baseline
// defines, the blade table from the wizard model, starter looks with runtime-editable colours, and one preset per
// existing preset so an adopted saber keeps its fonts, tracks and names.

import type { BladeSpec, PresetSource } from '../model';
import { emitBladeExpr, emitPresetArray } from './emit';
import { bladesToExprs, sharedPowerPins, stripLength } from './blades';
import { quote } from './cpp';
import { STARTER_LOOKS, starterLookFor, type FirmwareManifest, type LookDef } from '../looks';
import { wiringProblems } from './pinRules';
import { LIBRARY_LOOKS, LOOK_FX } from '../lookLibrary';

export type Prop = 'fett263' | 'sa22c' | 'bc' | 'default' | 'custom';
/** The props that come with ProffieOS, which Hiltwright knows the options and checks of. */
export type StockProp = Exclude<Prop, 'custom'>;

/**
 * A prop file the owner loaded (`prop: 'custom'`). The app keeps its text under its SHA-256, and the build puts it in
 * the saber's own ProffieOS copy beside the stock props, under a name of its own, so a stock prop is never replaced.
 */
export interface CustomProp {
  /** The file name the owner chose, e.g. `saber_fett263_buttons.h`. */
  file: string;
  /** SHA-256 of its text (hex). The config names it, so loading a new version of the file makes the build stale. */
  sha256: string;
  /** The class its `#define PROP_TYPE` names, e.g. `SaberFett263Buttons`. */
  propType: string | null;
  /** The stock prop it is a version of, by its PROP_TYPE: that prop's options and checks then apply to it. */
  like: StockProp | null;
}

/** Each stock prop's class, as its `#define PROP_TYPE` names it. */
export const STOCK_PROP_TYPES: Record<string, StockProp> = { SaberFett263Buttons: 'fett263', SaberSA22CButtons: 'sa22c', SaberBCButtons: 'bc', Saber: 'default' };

/** What a prop file's text says about itself: the class it defines as PROP_TYPE, and the stock prop that class is. */
export function inspectPropText(text: string): { propType: string | null; like: StockProp | null } {
  const m = /^[ \t]*#define[ \t]+PROP_TYPE[ \t]+([A-Za-z_][A-Za-z0-9_]*(?:<[^>\r\n]*>)?)/m.exec(text);
  const propType = m ? m[1].trim() : null;
  return { propType, like: propType ? STOCK_PROP_TYPES[propType] ?? null : null };
}

/** The stock prop whose options and checks apply: the chosen one, or the one a custom prop file is a version of. */
export function propFamily(m: Pick<SaberConfigModel, 'prop' | 'customProp'>): StockProp | null {
  return m.prop === 'custom' ? m.customProp?.like ?? null : m.prop;
}

/** The name a custom prop file gets in the saber's ProffieOS props folder: its own name, marked as Hiltwright's. */
export function customPropFileName(cp: Pick<CustomProp, 'file'>): string {
  const stem = cp.file.replace(/\.h$/i, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'prop';
  return `hiltwright_custom_${stem}.h`;
}
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
  /**
   * How the board is known: from the saber's bootloader (its flash size), from the firmware Hiltwright installed on it,
   * or chosen by the owner. Absent: nobody knows yet, `board` only keeps the pin lists showing, and nothing is built.
   */
  boardFrom?: 'bootloader' | 'firmware' | 'owner';
  buttons: 1 | 2 | 3;
  prop: Prop;
  /** The prop file loaded by the owner, when `prop` is 'custom'. */
  customProp?: CustomProp;
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
  /** Set when the presets came from a bank rather than the saber: the draft keeps them, and the install replaces the saber's own. */
  presetsFrom?: {
    bank?: string; name: string; at: string;
    /** The saber's own presets (name and font) when this list was started, to tell later whether the saber changed since. */
    base?: { name: string; font: string }[];
  };
  /**
   * The owner's "I checked the wiring": when, and for which board and blade layout (a fingerprint). It counts only
   * while the layout still matches; see `wiringConfirmed` in ./wiring.
   */
  wiringConfirmation?: { at: string; layout: string };
  /** @deprecated Timestamp-only confirmation from before 2026-09-24. It never said what it confirmed and no longer counts. */
  wiringConfirmedAt?: string;
  /** Looks beyond the starters that presets may reference (pasted library styles). */
  looks?: LookDef[];
  /**
   * The sound fonts (folder names) chosen for this saber on Install › Fonts, copied onto its card at install. Every
   * font a preset names counts as chosen too. The generator ignores it: fonts live on the card, not in firmware.
   */
  fonts?: string[];
  /**
   * The voice pack (a catalogue id, voicePackCatalogue.ts) chosen on Install › Fonts for the Fett263 controls to speak
   * their menus in, put in the card's common folder at install. Absent: the one that comes with Hiltwright, put on only
   * when the card lacks a working pack. The generator ignores it.
   */
  voicePack?: string;
  /** Swappable main blades told apart by their ID resistor. Absent or empty: one blade, no Blade ID. */
  bladeId?: { variants: BladeVariant[] };
  /**
   * The installer's config file this saber's wiring is checked against (configWiring.ts): what it said about the
   * board, buttons and blades when the owner imported or compared it. Build & Flash warns when the wiring differs.
   * The generator ignores it.
   */
  wiringReference?: { file: string; from: 'card' | 'file'; at: string; board: BoardModel | null; buttons: number | null; blades: BladeSpec[]; unreadable: { blade: number; text: string }[] };
  /** Extra `#define` lines the caller wants, verbatim without the `#define`. */
  extraDefines?: string[];
  /** Hiltwright version, written into the header. */
  generator?: string;
}

const BOARD_INCLUDE: Record<BoardModel, string> = { V2: 'proffieboard_v2_config.h', V3: 'proffieboard_v3_config.h' };
const PROP_INCLUDE: Record<StockProp, string> = {
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

/**
 * What a look compiles to, as a short hash: its code and its alias define. Kept per look in the firmware record, so a
 * look edited since the install shows as needing a build. Names, authors and previews do not change it.
 */
export function lookFingerprint(look: Pick<LookDef, 'code' | 'define'>): string {
  return contentHash(`${look.code}\n${look.define ?? ''}`);
}

/**
 * A name made safe for a comment in the config (build-correctness FW15): no line break, no trailing backslash (which
 * would carry a line comment onto the next line), and in a block comment no `*` + `/` that would end it early.
 */
export function commentSafe(s: string, kind: 'line' | 'block'): string {
  let out = s.replace(/[\r\n]+/g, ' ').replace(/\\+\s*$/, '');
  if (kind === 'block') out = out.replace(/\*\//g, '* /');
  return out;
}

const ROLE_WORD: Record<BladeRole, string> = { main: 'main blade', crystal: 'crystal', accent: 'accent', side: 'side blade', motor: 'motor' };

/**
 * Each preset slot's style against its blade (wiring-validation FW27). A motor only takes a motor style: anything else
 * is an error. Any other mismatch, and a slot with no style chosen (filled with the role's default), is a warning.
 * Unchosen slots are grouped per blade, since presets read from a saber often choose nothing for the crystal or accent.
 */
export function slotChecks(m: SaberConfigModel): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const looks = modelLooks(m);
  const presetName = (pi: number) => (m.presets[pi]?.name ?? `${pi + 1}`).replace(/[\r\n]+/g, ' ');
  m.blades.forEach((b, bi) => {
    const unchosen: number[] = [];
    m.presets.forEach((p, pi) => {
      const id = p.looks?.[bi];
      if (!id) { unchosen.push(pi); return; }
      const look = looks.find((l) => l.id === id);
      if (!look || look.roles.includes(b.role)) return;
      if (b.role === 'motor') errors.push(`Preset ${presetName(pi)}: the motor needs a motor style, not "${look.name}".`);
      else warnings.push(`Preset ${presetName(pi)}, ${ROLE_WORD[b.role]}: "${look.name}" is not made for this blade.`);
    });
    if (unchosen.length) {
      const names = unchosen.slice(0, 4).map(presetName).join(', ') + (unchosen.length > 4 ? ` and ${unchosen.length - 4} more` : '');
      const which = unchosen.length === 1 ? `Preset ${names}` : `${unchosen.length} presets (${names})`;
      warnings.push(`${which}, ${ROLE_WORD[b.role]} (blade ${bi + 1}): no style chosen, using "${starterLookFor(b.role).name}".`);
    }
  });
  return { errors, warnings };
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

/** Said when nobody has told Hiltwright which board a saber has (the running firmware never says). */
export const BOARD_NOT_CHOSEN = 'Choose the board (Proffieboard V2 or V3) on the Wiring page.';

/**
 * The board a config file name mentions (`proffieboard_v3_config.h`, `my_v2_saber.h`), as a suggestion only: a name is
 * whatever the installer called the file. Null when it names neither, or both.
 */
export function boardHint(configName: string | null | undefined): BoardModel | null {
  const found = new Set([...(configName ?? '').matchAll(/(?:^|[^a-z0-9])v([23])(?![0-9])/gi)].map((m) => `V${m[1]}` as BoardModel));
  return found.size === 1 ? [...found][0] : null;
}

export function validateModel(m: SaberConfigModel): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m.name)) errors.push('Config name must be letters, digits and underscores.');
  if (!m.boardFrom) errors.push(BOARD_NOT_CHOSEN);
  if (!m.blades.length) errors.push('At least one blade is needed.');
  if (!m.presets.length) errors.push('At least one preset is needed.');
  if (m.prop === 'custom') {
    const cp = m.customProp;
    if (!cp) errors.push('Choose the custom prop file on the Wiring page.');
    else if (!/^[0-9a-f]{64}$/.test(cp.sha256) || !/\.h$/i.test(cp.file) || /[\\/]/.test(cp.file)) errors.push('The custom prop file is not recorded properly. Choose it again on the Wiring page.');
  }
  // The same wiring rules, and words, as the Wiring page (pinRules.ts).
  for (const p of wiringProblems(m.blades, m.board)) errors.push(p.message);
  const known = new Set(modelLooks(m).map((l) => l.id));
  m.presets.forEach((p, pi) => (p.looks ?? []).forEach((id, bi) => { if (id && !known.has(id)) errors.push(`Preset ${pi + 1}, blade ${bi + 1}: unknown style "${id}".`); }));
  for (const l of m.looks ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(l.id)) errors.push(`Style id "${l.id}" must be letters, digits and underscores.`);
    if (!l.code.trim()) errors.push(`Style "${l.name}" has no style code.`);
  }
  errors.push(...slotChecks(m).errors);
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

/** The config lines (1-based, inclusive) holding one preset slot's style, and which look it is. */
export interface SlotLines { line: number; endLine: number; preset: number; blade: number; lookId: string; lookName: string }
export interface GeneratedConfig { text: string; hash: string; sharedPower: string[]; warnings: string[]; manifest: Omit<FirmwareManifest, 'os' | 'at'>; slotLines: SlotLines[] }

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
  // A custom prop file gets the options of the stock prop it is a version of, and none when it is none of them.
  const family = propFamily(m);
  const propName = m.prop === 'custom' ? `custom ${m.customProp?.file ?? ''}`.trim() : m.prop;
  if (family === 'fett263') defines.push('FETT263_EDIT_MODE_MENU', 'FETT263_SAY_BATTERY_PERCENT', 'FETT263_SAY_COLOR_LIST', 'FETT263_SAY_COLOR_LIST_CC');
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
    styles: slotLooks[pi].map((l) => ({ kind: 'raw', code: l.source === 'starter' ? l.code : `/* ${commentSafe(l.name, 'block')} */ ${l.code}` })),
  }));
  const usedLooks = modelLooks(m).filter((l) => slotLooks.some((row) => row.some((x) => x.id === l.id)));
  const pastedHeaders = usedLooks.filter((l) => l.source !== 'starter' && l.header).map((l) => `// Look "${commentSafe(l.name, 'line')}" (${commentSafe(l.by, 'line')}):\n${l.header}`);
  // Special abilities (EFFECT_USER1..4) are gestures the prop raises: Fett263 needs a define for them, sa22c has none.
  const abilityLooks = usedLooks.filter((l) => /EFFECT_USER[1-8]\b/.test(`${l.define ?? ''} ${l.code}`));
  if (abilityLooks.length) {
    const names = abilityLooks.map((l) => `"${l.name}"`).join(', ');
    if (family === 'fett263') { defines.push('FETT263_SPECIAL_ABILITIES'); warnings.push(`${names} use${abilityLooks.length > 1 ? '' : 's'} special abilities: FETT263_SPECIAL_ABILITIES added, so hold Power and turn the hilt to use them.`); }
    else if (family === null) warnings.push(`${names} use${abilityLooks.length > 1 ? '' : 's'} special abilities. Whether the ${propName} prop has a gesture for them depends on the prop; if it has none, that part of the style will not trigger.`);
    else if (family !== 'bc') warnings.push(`${names} use${abilityLooks.length > 1 ? '' : 's'} special abilities, which the ${propName} prop has no gesture for; that part of the style will not trigger on this saber.`);
  }
  const manifest: GeneratedConfig['manifest'] = {
    hash: '',
    bladeId: swapping,
    looks: usedLooks.map((l) => ({ id: l.id, name: l.name, args: l.args, ...(l.defaults ? { defaults: l.defaults } : {}), hash: lookFingerprint(l) })),
    presets: slotLooks.map((row, pi) => ({ name: m.presets[pi].name, looks: row.map((l) => l.id) })),
    wiring: { board: m.board, blades: m.blades },
  };

  const presetText = emitPresetArray({ name: 'presets', presets }).trimEnd();
  const rowText = rows.map((r) => `  { ${r.id}, ${bladesToExprs(r.blades).map(emitBladeExpr).join(',\n    ')},\n    CONFIGARRAY(presets) },${swapping ? ` // ${commentSafe(r.name, 'line')}` : ''}`);
  const summary = {
    generator: m.generator ?? 'hiltwright',
    name: m.name, board: m.board, buttons: m.buttons, prop: m.prop,
    ...(m.prop === 'custom' && m.customProp ? { customProp: { file: m.customProp.file, sha256: m.customProp.sha256 } } : {}),
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
    ...(m.prop === 'custom' && m.customProp
      // The text's hash is in the config, so a new version of the file makes a new build.
      ? [`#include "../props/${customPropFileName(m.customProp)}"`, `// Custom prop file ${commentSafe(m.customProp.file, 'line')}, sha256 ${m.customProp.sha256}`]
      : [`#include "${PROP_INCLUDE[m.prop === 'custom' ? 'fett263' : m.prop]}"`]),
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
    presetText,
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
    // JSON does not escape '/': a comment end inside a value is written with an escaped slash, which JSON reads the same.
    ` * hiltwright: ${JSON.stringify({ ...summary, hash }).replace(/\*\//g, '*\\/')}`,
    ' */',
    '',
  ].join('\n');
  if (shared.length) warnings.push(`Power ${shared.length > 1 ? 'pins' : 'pin'} ${shared.join(', ')} shared between blades: SHARED_POWER_PINS added.`);
  warnings.push(...slotChecks(m).warnings);
  manifest.hash = hash;
  // Which config lines hold which preset slot's style, so a compiler error can name the preset, blade and style.
  // Counted from the emitted text: the array opens on one line, then each preset is `{ font, track,`, one entry per
  // style (as many lines as its code), and the name.
  const slotLines: SlotLines[] = [];
  let line = (header.match(/\n/g) ?? []).length + (body.slice(0, body.indexOf(presetText)).match(/\n/g) ?? []).length + 2;
  presets.forEach((p, pi) => {
    line++; // `  { font, track,`
    p.styles.forEach((st, bi) => {
      const n = (st.kind === 'raw' ? st.code : '').split('\n').length;
      const look = slotLooks[pi][bi];
      slotLines.push({ line, endLine: line + n - 1, preset: pi, blade: bi, lookId: look.id, lookName: look.name });
      line += n;
    });
    line++; // the name
  });
  return { text: header + body, hash, sharedPower: shared, warnings, manifest, slotLines };
}

/** Recover the summary a generated config carries in its header. */
export function readGeneratedHeader(text: string): Record<string, unknown> | null {
  const m = /\* hiltwright: (\{.*\})$/m.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]) as Record<string, unknown>; } catch { return null; }
}
