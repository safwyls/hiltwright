// What a saber model may hold before any of it is printed into a ProffieOS config (issue #5). generateConfig writes
// several fields as C++ text (the button count, a blade's colour order, its extra template arguments, its LED
// templates, its pins, a style's alias and header), so a model that did not come from this app's own pages (a
// shared .hwsaber file, a hand-edited data file) must be checked field by field first. Otherwise a value such as
// "2\n#define bladePowerPin2 bladePowerPin6" changes what compiles without changing what the Wiring page shows.
// The rules are about form, not about wiring: whether the wiring is right is wiringProblems' job.

import { BOARD_PINS } from './pinRules';
import { defineName, isCarriedDefine } from './boardDefines';

const BOARDS = ['V2', 'V3'];
const BOARD_FROM = ['bootloader', 'firmware', 'owner'];
const PROPS = ['fett263', 'sa22c', 'bc', 'default', 'custom'];
const ROLES = ['main', 'crystal', 'accent', 'side', 'motor'];
const TYPES = ['pixel', 'simple'];
const STOCK = ['fett263', 'sa22c', 'bc', 'default'];
/** Every pin either board has: the board-specific check is wiringProblems'. */
const PINS = new Set([...BOARD_PINS.V3.data, ...BOARD_PINS.V3.power.map((p) => p.pin), ...BOARD_PINS.V2.data, ...BOARD_PINS.V2.power.map((p) => p.pin)]);

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Brackets in order and closed: `<`/`>` and `(`/`)`. */
function balanced(s: string): boolean {
  const stack: string[] = [];
  for (const c of s) {
    if (c === '<' || c === '(') stack.push(c);
    else if (c === '>') { if (stack.pop() !== '<') return false; }
    else if (c === ')') { if (stack.pop() !== '(') return false; }
  }
  return stack.length === 0;
}

/** A comma outside every bracket: one argument would become two. */
function topLevelComma(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === '<' || c === '(') depth++;
    else if (c === '>' || c === ')') depth--;
    else if (c === ',' && depth === 0) return true;
  }
  return false;
}

/**
 * One C++ template argument as the config writes it: a name, a number, or a template with arguments, such as
 * `CreeXPE2WhiteTemplate<550>`, `NoLED`, `-1` or `Color8::GRB`. No line breaks, comments, `#`, `;` or a top-level comma.
 */
export function isTemplateToken(s: unknown): boolean {
  return isStr(s) && s.length > 0 && s.length <= 300 && /^[A-Za-z0-9_:<>, .()+\-]+$/.test(s) && balanced(s) && !topLevelComma(s) && !/^\s|\s$/.test(s);
}

/** The text with C and C++ comments taken out. */
const withoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** Problems with a style's code, alias and header, as a config would carry them. Empty when it may be compiled. */
export function lookProblems(l: unknown): string[] {
  if (!isObj(l)) return ['A style is not in the expected form.'];
  const name = isStr(l.name) ? l.name : String(l.id ?? 'A style');
  const out: string[] = [];
  if (!isStr(l.id) || !/^[A-Za-z0-9_]{1,80}$/.test(l.id)) out.push(`Style "${name}" has an id Hiltwright does not accept.`);
  const code = isStr(l.code) ? withoutComments(l.code) : null;
  if (code === null || !code.trim()) out.push(`Style "${name}" has no code.`);
  else if (/[#;]/.test(code) || !balanced(code)) out.push(`Style "${name}" holds more than a style: its code may only be one style expression.`);
  if (l.define !== undefined && l.define !== null) {
    const d = isStr(l.define) ? withoutComments(l.define).trim() : '';
    // One alias, or the template aliases Hiltwright's own styles are built from: `[template<...>] using Name = ...;`.
    const one = /^(template\s*<[^;#]*>\s*)?using\s+[A-Za-z_]\w*\s*=[^;#]+;$/;
    const parts = d.split(/(?<=;)\s*/).filter(Boolean);
    if (!parts.length || !parts.every((p) => one.test(p.trim())) || !balanced(d)) out.push(`Style "${name}" holds more than a style: its alias may only be "using Name = ...;".`);
  }
  if (l.header !== undefined && l.header !== null) {
    if (!isStr(l.header) || withoutComments(l.header).trim()) out.push(`Style "${name}" has a header that is not only comments.`);
  }
  return out;
}

/**
 * Every problem with the form of a saber model. Empty when each field holds what its page could have set. Run on any
 * model from outside this app's pages before it is kept or built.
 */
export function modelFormProblems(raw: unknown): string[] {
  if (!isObj(raw)) return ['The saber setup is not in the expected form.'];
  const m = raw;
  const out: string[] = [];
  if (!isStr(m.name) || !/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(m.name)) out.push('Config name must be letters, digits and underscores.');
  if (!BOARDS.includes(m.board as string)) out.push('The board must be a Proffieboard V2 or V3.');
  if (m.boardFrom !== undefined && !BOARD_FROM.includes(m.boardFrom as string)) out.push('Where the board is known from is not one Hiltwright knows.');
  if (!isInt(m.buttons, 1, 3)) out.push('The number of buttons must be 1, 2 or 3.');
  if (!PROPS.includes(m.prop as string)) out.push('The prop is not one Hiltwright knows.');
  if (m.customProp !== undefined) {
    const cp = m.customProp;
    if (!isObj(cp) || !isStr(cp.file) || !/^[^\\/:*?"<>|\r\n]{1,120}\.h$/i.test(cp.file) || !isStr(cp.sha256) || !/^[0-9a-f]{64}$/.test(cp.sha256)
      || !(cp.propType === null || (isStr(cp.propType) && /^[A-Za-z_]\w{0,80}$/.test(cp.propType))) || !(cp.like === null || STOCK.includes(cp.like as string))) out.push('The custom prop file is not recorded properly.');
  }
  // A define the app adds itself (prop options): `NAME` or `NAME value`, the name in capitals and the value one token.
  // Never a lower-case name, so a pin such as bladePin cannot be redefined, and never more than one line.
  if (m.extraDefines !== undefined && (!Array.isArray(m.extraDefines) || m.extraDefines.length > 40 || !m.extraDefines.every((d) => isStr(d) && /^[A-Z][A-Z0-9_]{0,60}( [A-Za-z0-9_.-]{1,60})?$/.test(d)))) out.push('An extra #define is not in the accepted form.');
  // Board settings carried from the installer's config (issue #14): only the defines and values boardDefines.ts lists,
  // each name once, so nothing else an imported or shared model holds is ever printed into CONFIG_TOP this way.
  if (m.boardDefines !== undefined && (!Array.isArray(m.boardDefines) || !m.boardDefines.every(isCarriedDefine)
    || new Set(m.boardDefines.map((d) => defineName(d as string))).size !== m.boardDefines.length)) out.push('A board setting from the installer\'s config is not one Hiltwright accepts.');
  if (!Array.isArray(m.blades) || m.blades.length > 16) out.push('The blades are not in the expected form.');
  else {
    const ids = new Set(m.blades.map((b) => (isObj(b) ? b.id : null)));
    m.blades.forEach((b, i) => {
      const n = `Blade ${i + 1}`;
      if (!isObj(b)) { out.push(`${n} is not in the expected form.`); return; }
      if (!isStr(b.id) || !/^[A-Za-z0-9_-]{1,40}$/.test(b.id)) out.push(`${n} has an id Hiltwright does not accept.`);
      if (!TYPES.includes(b.type as string)) out.push(`${n} has a type Hiltwright does not know.`);
      if (!ROLES.includes(b.role as string)) out.push(`${n} has a role Hiltwright does not know.`);
      if (!isInt(b.pixels, 1, 2048)) out.push(`${n}'s LED count must be a whole number from 1 to 2048.`);
      if (!isStr(b.order) || !/^([RGBWrgbw]{3,4})?$/.test(b.order)) out.push(`${n}'s colour order must be letters such as GRB or GRBW.`);
      if (b.parallel !== undefined && !isInt(b.parallel, 1, 16)) out.push(`${n}'s parallel strip count must be a whole number.`);
      // Printed as DimBlade's percentage (issue #16): a plain number, above 0 and at most 100.
      if (b.dim !== undefined && !(typeof b.dim === 'number' && Number.isFinite(b.dim) && b.dim > 0 && b.dim <= 100)) out.push(`${n}'s brightness limit must be a percentage above 0 and at most 100.`);
      if (!Array.isArray(b.extra) || !b.extra.every(isTemplateToken)) out.push(`${n} has extra strip settings Hiltwright does not accept.`);
      if (!Array.isArray(b.leds) || b.leds.length > 4 || !b.leds.every(isTemplateToken)) out.push(`${n} has LED types Hiltwright does not accept.`);
      const w = b.wiring;
      const pin = (p: unknown) => isStr(p) && (PINS.has(p) || p === '-1');
      if (!isObj(w)) out.push(`${n}'s wiring is not in the expected form.`);
      else if (w.kind === 'own') { if (!pin(w.dataPin) || !Array.isArray(w.powerPins) || !w.powerPins.every(pin)) out.push(`${n} names a pin Proffieboards do not have.`); }
      else if (w.kind === 'chain') { if (!isStr(w.after) || !ids.has(w.after) || (w.reverse !== undefined && typeof w.reverse !== 'boolean') || (w.stride !== undefined && !isInt(w.stride, 1, 16))) out.push(`${n} continues a blade that is not there, or in a way Hiltwright does not accept.`); }
      else if (w.kind === 'power') { if (!Array.isArray(w.pins) || w.pins.length > 4 || !w.pins.every(pin)) out.push(`${n} names a pin Proffieboards do not have.`); }
      else out.push(`${n}'s wiring is not in the expected form.`);
    });
  }
  if (!Array.isArray(m.presets) || m.presets.length > 200) out.push('The presets are not in the expected form.');
  else if (!m.presets.every((p) => isObj(p) && isStr(p.font) && isStr(p.track) && isStr(p.name)
    && (p.looks === undefined || (Array.isArray(p.looks) && p.looks.every((x) => x === null || isStr(x))))
    && (p.lookArgs === undefined || (Array.isArray(p.lookArgs) && p.lookArgs.every((x) => x === null || isStr(x)))))) out.push('A preset is not in the expected form.');
  if (m.looks !== undefined) {
    if (!Array.isArray(m.looks)) out.push('The styles are not in the expected form.');
    else for (const l of m.looks) out.push(...lookProblems(l));
  }
  return out;
}

/** Throw the first problem, in plain words, when the model's form is not acceptable. */
export function assertModelForm(raw: unknown, what = 'This saber setup'): void {
  const p = modelFormProblems(raw);
  if (p.length) throw new Error(`${what} cannot be used: ${p[0]}`);
}
