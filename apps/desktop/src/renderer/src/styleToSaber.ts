// Putting a style on the working saber from the Styles page ("Use it in <preset>", style-to-saber-fixes): what
// happens, decided here as pure functions so it can be tested under node. The page only shows the result and makes
// the one write or save it names, through the same board and model paths the Presets page uses.

import { argInfo, formatBuiltin, formatStyleArgs, lookAtSlot, lookSlots, parseBuiltin, parseStyleArgs, type FirmwareManifest, type LookDef, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import { installedVersion, withSlotChoice } from './slotModel';

export interface PutInInput {
  model: SaberConfigModel;
  firmware: FirmwareManifest | null | undefined;
  /** The saber's own presets: as it reports them when plugged in, or as last read. Ignored while presets are staged. */
  saberPresets: PresetRecord[];
  /** The saber is plugged in and answering. */
  live: boolean;
  /** Plugged in, but presets cannot be written: the card is out or shared with this computer. */
  locked: 'no-card' | 'card-shared' | null;
  look: LookDef;
  /** 0-based preset in the model's list (the list the picker shows). */
  preset: number;
  /** 1-based blade. */
  blade: number;
  /** Colours and timings tried on the Styles page, by argument number, as words the saber takes. */
  tried: Map<number, string>;
}

export type PutInPlan =
  /** Nothing can be written now (ST6). */
  | { kind: 'blocked'; reason: 'no-card' | 'card-shared' }
  /** The slot already has this style with these settings (HW-2026-09-26a). */
  | { kind: 'already'; where: 'installed' | 'queued' | 'staged' }
  /** Written to the saber now, `style` being the `builtin P B args` to write; recorded in the plan once confirmed (ST4). */
  | { kind: 'live'; style: string; args: string | null; kept: number[]; replaced: number[] }
  /** Saved in the plan for the next Build & Install: into the staged list (ST3), or the saber's own list. */
  | { kind: 'plan'; staged: boolean; installed: boolean; args: string | null; kept: number[]; replaced: number[] };

/** The settings a blade slot holds now: those still to be written from the plan, else those on the saber's preset. */
export function slotArgs(model: SaberConfigModel, saberPresets: PresetRecord[] | null, preset: number, blade: number): Map<number, string> {
  const queued = model.presets[preset]?.lookArgs?.[blade - 1];
  if (queued) return parseStyleArgs(queued);
  const style = saberPresets?.[preset]?.styles[blade - 1];
  const b = style ? parseBuiltin(style) : null;
  return parseStyleArgs(b?.args ?? null);
}

/**
 * The settings to put with the style (ST5): the blade's own, for each one the new style reads (ProffieOS numbers them
 * the same in every style), with the tried ones over them. `replaced` lists the blade's own that a tried one changes.
 */
export function mergeArgs(look: LookDef, existing: Map<number, string>, tried: Map<number, string>): { args: string | null; kept: number[]; replaced: number[] } {
  const reads = new Set(look.args);
  const out = new Map<number, string>();
  const kept: number[] = [];
  const replaced: number[] = [];
  for (const [n, v] of existing) if (reads.has(n)) out.set(n, v);
  for (const [n, v] of tried) {
    const own = out.get(n);
    if (own !== undefined && own !== v) replaced.push(n);
    out.set(n, v);
  }
  for (const n of out.keys()) if (!tried.has(n)) kept.push(n);
  kept.sort((a, b) => a - b); replaced.sort((a, b) => a - b);
  return { args: formatStyleArgs(out) || null, kept, replaced };
}

/** The `builtin P B` slot of the installed firmware that holds this look, preferring the same blade (as Presets does). */
function builtinSlot(firmware: FirmwareManifest, lookId: string, blade: number): { preset: number; blade: number } | null {
  const slots = lookSlots(firmware, lookId);
  return slots.find((s) => s.blade === blade) ?? slots[0] ?? null;
}

/** The saber's own preset `preset`, blade `blade`, runs this version of the look. */
function installedThere(input: PutInInput): boolean {
  const { firmware, saberPresets, look, preset, blade } = input;
  const style = saberPresets[preset]?.styles[blade - 1];
  const b = style ? parseBuiltin(style) : null;
  if (!firmware || !b) return false;
  return lookAtSlot(firmware, b.preset, b.blade)?.id === look.id && installedVersion(firmware, look.id, look);
}

export function planPutIn(input: PutInInput): PutInPlan {
  const { model, firmware, live, locked, look, preset, blade, tried } = input;
  if (live && locked) return { kind: 'blocked', reason: locked };
  // A staged list is the one shown and the one installed next: its positions are not the saber's (ST3).
  const staged = !!model.presetsFrom;
  const saberPresets = staged ? null : input.saberPresets;
  const existing = slotArgs(model, saberPresets, preset, blade);
  const merged = mergeArgs(look, existing, tried);
  // Nothing would change: the tried settings, if any, are the ones the slot has.
  const same = merged.args === mergeArgs(look, existing, new Map()).args;
  const installedVer = !!firmware && installedVersion(firmware, look.id, look);
  const onSaberThere = !staged && installedThere(input);
  const inPlan = model.presets[preset]?.looks?.[blade - 1] === look.id;
  if (same) {
    if (onSaberThere) return { kind: 'already', where: 'installed' };
    // Chosen in the plan; while live with the firmware carrying it, only when the saber shows it there too.
    if (inPlan && !(live && !staged && installedVer)) return { kind: 'already', where: staged ? 'staged' : 'queued' };
  }
  if (live && !staged && installedVer && firmware) {
    const slot = builtinSlot(firmware, look.id, blade);
    if (slot) return { kind: 'live', style: formatBuiltin({ preset: slot.preset, blade: slot.blade, args: merged.args }), ...merged };
  }
  return { kind: 'plan', staged, installed: installedVer, ...merged };
}

/**
 * The plan to save for this choice, through the one slot rule Presets uses (`withSlotChoice`, preset-editor-fixes D1).
 * `snapshot` is the model as it was when the owner acted. After a confirmed live write nothing is left to write.
 */
export function modelAfterPutIn(snapshot: SaberConfigModel, plan: PutInPlan, look: LookDef, preset: number, blade: number): SaberConfigModel | null {
  if (plan.kind === 'live') return withSlotChoice(snapshot, preset, blade, look, null);
  if (plan.kind === 'plan') return withSlotChoice(snapshot, preset, blade, look, plan.args);
  return null;
}

const argNames = (ns: number[]) => {
  const names = ns.map((n) => argInfo(n).name.toLowerCase());
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** What the colours will be (ST5), said before the owner acts. Empty when the blade had none of its own. */
export function coloursText(plan: { kept: number[]; replaced: number[] }, blade: number): string {
  const parts: string[] = [];
  if (plan.kept.length) parts.push(`Blade ${blade} keeps its own ${argNames(plan.kept)}.`);
  if (plan.replaced.length) parts.push(`Your ${argNames(plan.replaced)} ${plan.replaced.length === 1 ? 'replaces' : 'replace'} the one${plan.replaced.length === 1 ? '' : 's'} blade ${blade} has now.`);
  return parts.join(' ');
}

export interface PutInWords { button: string; hint: string; enabled: boolean }

/** The button and the line under it, for each situation (ST6). */
export function putInWords(plan: PutInPlan, names: { saber: string; preset: string; blade: number; queuedElsewhere: boolean; kb: number | null; tried: boolean }): PutInWords {
  const { saber, preset, blade } = names;
  switch (plan.kind) {
    case 'blocked':
      return {
        button: `Use it in ${preset}`, enabled: false,
        hint: plan.reason === 'no-card'
          ? `${saber} has no readable SD card, and presets are saved on the card, so nothing is sent. Put the card back, then reconnect.`
          : `${saber}'s card is shared with this computer, and presets are saved on the card, so nothing is sent. Give it back on Live › Card first.`,
      };
    case 'already':
      return {
        button: `Already in ${preset}`, enabled: false,
        hint: plan.where === 'installed'
          ? `${preset} already uses this style on blade ${blade}, on ${saber}. Choose another preset or blade, or try other colours.`
          : plan.where === 'staged'
            ? `The staged ${preset} already has this style on blade ${blade}. It goes on with the next install.`
            : `This style is already queued for ${preset}, blade ${blade}. It goes on with the next Build & Install.`,
      };
    case 'live': {
      const c = coloursText(plan, blade);
      return { button: `Use it in ${preset}`, enabled: true, hint: `This style is already on ${saber}, so it is written to ${preset} now${names.tried ? ', in the colours you chose' : ''}. No rebuild.${c ? ` ${c}` : ''}` };
    }
    case 'plan': {
      const c = coloursText(plan, blade);
      const after = plan.args ? ' The colours are written to the saber right after the install.' : '';
      if (plan.staged) return { button: `Use it in ${preset}`, enabled: true, hint: `${saber}'s presets are staged here, so this goes into the staged ${preset} and reaches the saber with the next install.${after}${c ? ` ${c}` : ''}` };
      if (plan.installed) return { button: `Use it in ${preset}`, enabled: true, hint: `${saber} already has this style, but is not plugged in, so ${preset} gets it with the next Build & Install. Or plug the saber in to put it on now.${c ? ` ${c}` : ''}` };
      return {
        button: names.queuedElsewhere ? `Also use it in ${preset}` : `Add to ${preset}`, enabled: true,
        hint: `New styles reach the saber with the next Build & Install${names.kb != null ? `, and cost about ${names.kb.toFixed(1)} KB of firmware space once` : ''}.${after}${c ? ` ${c}` : ''}`,
      };
    }
  }
}

/** What the page says once the owner acted. `ok` is whether the saber confirmed a live write. */
export function putInResult(plan: PutInPlan, names: { saber: string; preset: string; blade: number; look: string; tried: boolean }, ok: boolean): { tone: 'green' | 'red'; text: string } | null {
  const { saber, preset, blade, look } = names;
  const withColours = names.tried ? ' with the colours you chose' : '';
  if (plan.kind === 'live') {
    return ok
      ? { tone: 'green', text: `${preset} now uses "${look}" on blade ${blade}${withColours}. The saber confirmed it.` }
      : { tone: 'red', text: `${saber} did not confirm the change, so nothing was recorded for ${preset}. Check the connection on the Armory page, then try again.` };
  }
  if (plan.kind === 'plan') {
    const after = plan.args ? ' The colours are written to the saber right after the install.' : '';
    return { tone: 'green', text: plan.staged
      ? `"${look}" goes into the staged ${preset}, blade ${blade}${withColours}. It reaches ${saber} with the next install.${after}`
      : `"${look}" goes into ${preset}, blade ${blade}${withColours}, with the next Build & Install.${after}` };
  }
  return null;
}
