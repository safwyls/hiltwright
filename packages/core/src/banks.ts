// Preset banks: lists of presets built without a saber, then loaded onto one.
//
// A preset on the saber names a font, a track and a compiled style per blade slot. A bank keeps the same things, but
// by blade role (main, crystal, accent ...) rather than slot number, so one bank fits any saber: loading it maps each
// role onto that saber's blades. Loading replaces the saber's presets with the bank's at the next install.

import type { BladeRole, SaberConfigModel } from './config/generate';
import { STARTER_LOOKS, type FirmwareManifest, type LookDef } from './looks';
import { parseStyleArgs } from './looks';
import { parseBuiltin, type PresetRecord } from './protocol/presets';

export interface BankPreset {
  name: string;
  /** As the saber stores it: `folder` or `folder;common`. */
  font: string;
  track: string;
  /** Look id per blade role; a role left out gets the saber's default look for it. */
  looks: Partial<Record<BladeRole, string>>;
  /** Colour and timing arguments per role, the words a preset carries (`formatStyleArgs`). */
  lookArgs?: Partial<Record<BladeRole, string>>;
}

export interface PresetBank {
  id: string;
  name: string;
  presets: BankPreset[];
  /** ISO time of the last change. */
  updated: string;
}

export function isBank(v: unknown): v is PresetBank {
  const b = v as PresetBank;
  return !!b && typeof b.id === 'string' && typeof b.name === 'string' && Array.isArray(b.presets) && b.presets.every((p) => p && typeof p.name === 'string' && typeof p.font === 'string' && typeof p.track === 'string' && !!p.looks && typeof p.looks === 'object');
}

export const newBank = (name = 'New bank'): PresetBank => ({ id: `bank_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, presets: [], updated: new Date().toISOString() });
export const newBankPreset = (name = 'New preset'): BankPreset => ({ name, font: 'common', track: '', looks: {} });

/**
 * The saber's model with the bank's presets in place of its own. Each role maps onto every blade of that role; looks
 * the model does not carry yet are added from `allLooks`. `presetsFrom` marks the model so the draft keeps these
 * presets rather than re-reading the saber's, and so the install knows to clear the saber's presets.ini.
 */
export function bankToModel(bank: PresetBank, model: SaberConfigModel, allLooks: readonly LookDef[]): SaberConfigModel {
  const looks = [...(model.looks ?? [])];
  const known = new Set([...STARTER_LOOKS.map((l) => l.id), ...looks.map((l) => l.id)]);
  const presets = bank.presets.map((p) => {
    const row = model.blades.map((b) => p.looks[b.role] ?? null);
    const argRow = model.blades.map((b) => p.lookArgs?.[b.role] ?? null);
    for (const id of row) {
      if (!id || known.has(id)) continue;
      const def = allLooks.find((l) => l.id === id);
      if (def) { looks.push(def); known.add(id); }
    }
    return { font: p.font, track: p.track, name: p.name, ...(row.some(Boolean) ? { looks: row } : {}), ...(argRow.some(Boolean) ? { lookArgs: argRow } : {}) };
  });
  return { ...model, looks, presets, presetsFrom: { bank: bank.id, name: bank.name, at: new Date().toISOString() } };
}

/**
 * A bank made from a saber's presets as last read, with the looks its firmware manifest knows in each slot. On vendor
 * firmware the looks are unknown and only names, fonts and tracks carry over.
 */
export function bankFromSaber(name: string, presets: readonly PresetRecord[], blades: readonly { role: BladeRole }[], firmware: FirmwareManifest | null | undefined): PresetBank {
  const bank = newBank(name);
  bank.presets = presets.map((p, pi) => {
    const looks: BankPreset['looks'] = {}; const args: NonNullable<BankPreset['lookArgs']> = {};
    blades.forEach((b, k) => {
      if (looks[b.role]) return; // the first blade of a role speaks for it
      const id = firmware?.presets[pi]?.looks[k];
      if (id) looks[b.role] = id;
      const style = p.styles[k];
      const parsed = style ? parseBuiltin(style) : null;
      if (parsed?.args && parseStyleArgs(parsed.args).size) args[b.role] = parsed.args;
    });
    return { name: p.name, font: p.font, track: p.track, looks, ...(Object.keys(args).length ? { lookArgs: args } : {}) };
  });
  return bank;
}

/** Problems that would stop a bank loading cleanly onto a saber with these blades. */
export function bankProblems(bank: PresetBank, blades: readonly { role: BladeRole }[], allLooks: readonly LookDef[]): string[] {
  const out: string[] = [];
  if (!bank.presets.length) out.push('The bank has no presets.');
  const roles = new Set(blades.map((b) => b.role));
  const known = new Set([...STARTER_LOOKS.map((l) => l.id), ...allLooks.map((l) => l.id)]);
  bank.presets.forEach((p, i) => {
    if (!p.name.trim()) out.push(`Preset ${i + 1} has no name.`);
    if (!p.font.trim()) out.push(`"${p.name || i + 1}" has no font.`);
    for (const [role, id] of Object.entries(p.looks)) {
      if (id && !known.has(id)) out.push(`"${p.name || i + 1}": look "${id}" is not in the library any more.`);
      if (id && !roles.has(role as BladeRole)) out.push(`"${p.name || i + 1}" sets a look for a ${role} blade, which this saber does not have; it will be ignored.`);
    }
  });
  return out;
}
