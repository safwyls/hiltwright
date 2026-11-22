// The installer's board settings that Hiltwright's builds carry over from their config (issue #14).
//
// Hiltwright writes its own CONFIG_TOP, so every other define in the installer's config is left out of a build. Most
// of them are choices Hiltwright makes itself, but a few describe the hilt: how the board is mounted (motion axes, so
// gestures, twist and stab work), a blade-detect switch, a display, and the installer's volume and clash threshold.
// Those few are carried into the model (`boardDefines`) and built; Build & Flash warns about each one still left out.
// Names and values are ProffieOS v8.10's: motion/motion_util.h, common/vec3.h, ProffieOS.ino, display/ssd1306.h.

import { parseConfig } from './parse';

const ORIENTATIONS = [
  'ORIENTATION_NORMAL', 'ORIENTATION_FETS_TOWARDS_BLADE', 'ORIENTATION_USB_TOWARDS_BLADE', 'ORIENTATION_SDA_TOWARDS_BLADE',
  'ORIENTATION_USB_CCW_FROM_BLADE', 'ORIENTATION_SERIAL_TOWARDS_BLADE', 'ORIENTATION_USB_CW_FROM_BLADE',
  'ORIENTATION_TOP_TOWARDS_BLADE', 'ORIENTATION_BOTTOM_TOWARDS_BLADE',
];
const NUMBER = /^\d+(\.\d+)?$/;
const inRange = (v: string, min: number, max: number) => NUMBER.test(v) && Number(v) >= min && Number(v) <= max;

/** Each carried define and the values it may have: null for a define with no value. */
const CARRIED: Record<string, ((v: string) => boolean) | null> = {
  ORIENTATION: (v) => ORIENTATIONS.includes(v),
  // Degrees about x, y and z, written `x,y,z`.
  ORIENTATION_ROTATION: (v) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(v) && v.split(',').every((n) => Math.abs(Number(n)) <= 360),
  INVERT_ORIENTATION: null,
  // A pin name (`blade4Pin`, `aux2Pin`) or number: it is read as a button, so a wrong one cannot put power anywhere.
  BLADE_DETECT_PIN: (v) => /^[A-Za-z][A-Za-z0-9_]{0,30}$|^\d{1,3}$/.test(v),
  ENABLE_SSD1306: null,
  INCLUDE_SSD1306: null,
  OLED_FLIP_180: null,
  OLED_MIRRORED: null,
  ENABLE_SERIAL: null,
  VOLUME: (v) => /^\d+$/.test(v) && inRange(v, 1, 5000),
  BOOT_VOLUME: (v) => /^\d+$/.test(v) && inRange(v, 0, 5000),
  CLASH_THRESHOLD_G: (v) => inRange(v, 0.1, 20),
};

/**
 * Defines every Hiltwright build has (generateConfig), so an installer's config having them loses nothing; with the
 * blade and button counts, which the Wiring page compares on their own, they are not listed as the config's own.
 */
export const EVERY_BUILD_HAS = ['NUM_BLADES', 'NUM_BUTTONS', 'ENABLE_AUDIO', 'ENABLE_MOTION', 'ENABLE_WS2811', 'ENABLE_SD', 'SAVE_STATE', 'COLOR_CHANGE_DIRECT', 'ENABLE_ALL_EDIT_OPTIONS'];

/** The define names Hiltwright's builds can carry over from an installer's config. */
export const CARRIED_DEFINE_NAMES = Object.keys(CARRIED);

/**
 * A define as Hiltwright keeps it: `NAME` or `NAME value`, comments taken out, spaces collapsed and none beside a comma,
 * so `0, 20, 0` and `0,20,0` read the same.
 */
export function defineText(name: string, value: string | null): string {
  const v = (value ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
  return v ? `${name} ${v}` : name;
}

const split = (d: string): [string, string] => { const at = d.indexOf(' '); return at < 0 ? [d, ''] : [d.slice(0, at), d.slice(at + 1)]; };
/** A define's name. */
export const defineName = (d: string): string => split(d)[0];

/** True when a define is one Hiltwright carries over, with a value it accepts. modelCheck holds `boardDefines` to it. */
export function isCarriedDefine(d: unknown): boolean {
  if (typeof d !== 'string' || d.length > 80) return false;
  const [name, value] = split(d);
  if (!Object.prototype.hasOwnProperty.call(CARRIED, name)) return false;
  const rule = CARRIED[name];
  return rule === null ? value === '' : value !== '' && rule(value);
}

/** The defines from an installer's config that builds carry over, one per name (the last one written wins, as in C++). */
export function carriedDefines(defines: string[]): string[] {
  const byName = new Map<string, string>();
  for (const d of defines) if (isCarriedDefine(d)) byName.set(defineName(d), d);
  return [...byName.values()];
}

/** A define in the installer's config that a build leaves out, and what the build has under that name instead. */
export interface DroppedDefine { define: string; build: string | null }

/** Every `#define` in a config's CONFIG_TOP, as `defineText` writes them, in order. */
export function topDefines(text: string): string[] {
  return (parseConfig(text).top?.lines ?? []).flatMap((l) => (l.kind === 'define' ? [defineText(l.name, l.value)] : []));
}

/**
 * Each define in the installer's config (`reference`, as `defineText` writes them) that a generated config does not
 * have, word for word. `build` is the generated config's own define of that name, when it has a different one.
 */
export function droppedDefines(generatedText: string, reference: string[]): DroppedDefine[] {
  const built = topDefines(generatedText);
  const have = new Set(built);
  return reference.filter((d) => !have.has(d)).map((d) => ({ define: d, build: built.find((b) => defineName(b) === defineName(d)) ?? null }));
}

/** One dropped define in the words Build & Flash uses. */
export function droppedDefineText(d: DroppedDefine): string {
  return d.build ? `${d.define} (the build has ${d.build})` : d.define;
}
