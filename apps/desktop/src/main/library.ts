// Saber library: one JSON file in userData, kept by the safe store (jsonStore.ts): writes queued, a backup copy, and
// a file that cannot be read is set aside rather than overwritten.

import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { LookDef, PresetRecord, SaberConfigModel } from '@hiltwright/core';
import type { SaberIdentity, SaberPatch, SaberRecord } from '../shared/api';
import { JsonStore } from './jsonStore';

interface LibraryFile { version: 1; sabers: SaberRecord[] }

/** The saber that was just installed, expected back after its reboot: the config the install wrote. */
export interface ReinstallExpectation { id: string; configName: string }

const isStr = (v: unknown): v is string => typeof v === 'string';
const isRecord = (v: unknown): v is SaberRecord => {
  const r = v as Partial<SaberRecord> | null;
  return !!r && isStr(r.id) && isStr(r.name) && isStr(r.firstSeen) && isStr(r.lastSeen)
    && !!r.identity && typeof r.identity === 'object' && Array.isArray(r.identity.pixelBlades)
    && Array.isArray(r.presets) && Array.isArray(r.fonts) && Array.isArray(r.tracks);
};

/** The saber records that have the expected shape, and how many did not. Null when the file is not a saber list. */
export function cleanLibrary(raw: unknown): { value: LibraryFile; dropped: number } | null {
  const f = raw as Partial<LibraryFile> | null;
  if (!f || f.version !== 1 || !Array.isArray(f.sabers)) return null;
  const sabers = f.sabers.filter(isRecord);
  return { value: { version: 1, sabers }, dropped: f.sabers.length - sabers.length };
}

export class Library {
  private store: JsonStore<LibraryFile>;
  constructor(file: string) {
    this.store = new JsonStore(file, { name: 'saber list', place: 'data', empty: () => ({ version: 1, sabers: [] }), clean: cleanLibrary });
  }

  async list(): Promise<SaberRecord[]> {
    return [...(await this.store.read()).sabers].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  /** A board is the same saber when the USB serial matches; failing that, when config, install stamp and blade layout all match. */
  static matches(a: SaberIdentity, b: SaberIdentity): boolean {
    // A planned saber has no identity at all; it is only ever matched by the owner adopting it.
    if (!a.usbSerial && !a.configName && !a.pixelBlades.length) return false;
    if (!b.usbSerial && !b.configName && !b.pixelBlades.length) return false;
    if (a.usbSerial && b.usbSerial) return a.usbSerial === b.usbSerial;
    return a.configName === b.configName && a.installed === b.installed && a.pixelBlades.join(',') === b.pixelBlades.join(',');
  }

  /** A saber set up before its hilt: no identity, no presets read, just a name and a build model. */
  plan(name: string, model: SaberConfigModel): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const now = new Date().toISOString();
      const rec: SaberRecord = {
        id: randomBytes(6).toString('hex'), name, planned: true,
        identity: { usbSerial: null, configName: null, version: null, prop: null, buttons: null, installed: null, pixelBlades: [], bladeConfig: null },
        firstSeen: now, lastSeen: now, presets: [], fonts: [], tracks: [], model,
      };
      lib.sabers.push(rec);
      return rec;
    });
  }

  /** The real saber takes the plan's model (wiring, prop, presets, looks); the plan itself goes. */
  adopt(plannedId: string, targetId: string): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const plan = lib.sabers.find((s) => s.id === plannedId && s.planned);
      const target = lib.sabers.find((s) => s.id === targetId && !s.planned);
      if (!plan || !target) throw new Error('No such plan or saber');
      if (plan.model) target.model = { ...plan.model, name: target.model?.name ?? plan.model.name };
      if (!/^(hiltwright_)?saber/i.test(plan.name) && target.name === defaultName(target.identity)) target.name = plan.name;
      lib.sabers = lib.sabers.filter((s) => s.id !== plannedId);
      return target;
    });
  }

  /**
   * Match the board to its record, or make one. Order: USB serial; then, with no serial, the saber just installed
   * when the board reports the config that install wrote (`expect`); then config, install stamp and blade layout.
   */
  upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string }, expect?: ReinstallExpectation | null): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const now = new Date().toISOString();
      const id = input.identity;
      let rec = id.usbSerial ? lib.sabers.find((s) => !s.planned && s.identity.usbSerial === id.usbSerial) : undefined;
      if (!rec && !id.usbSerial && expect && id.configName === expect.configName) rec = lib.sabers.find((s) => s.id === expect.id && !s.planned);
      rec ??= lib.sabers.find((s) => Library.matches(s.identity, id));
      if (rec) {
        rec.identity = { ...rec.identity, ...id, usbSerial: id.usbSerial ?? rec.identity.usbSerial };
        rec.presets = input.presets;
        rec.fonts = input.fonts;
        rec.tracks = input.tracks;
        rec.lastSeen = now;
        if (input.name) rec.name = input.name;
      } else {
        rec = { id: randomBytes(6).toString('hex'), name: input.name ?? defaultName(id), identity: id, firstSeen: now, lastSeen: now, presets: input.presets, fonts: input.fonts, tracks: input.tracks };
        lib.sabers.push(rec);
      }
      return rec;
    });
  }

  rename(id: string, name: string): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const rec = lib.sabers.find((s) => s.id === id);
      if (!rec) throw new Error(`Unknown saber ${id}`);
      rec.name = name.trim() || rec.name;
      return rec;
    });
  }

  update(id: string, patch: SaberPatch): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const rec = lib.sabers.find((s) => s.id === id);
      if (!rec) throw new Error(`Unknown saber ${id}`);
      if (patch.model !== undefined) { if (patch.model) rec.model = patch.model; else delete rec.model; }
      if (patch.firmware !== undefined) { if (patch.firmware) rec.firmware = patch.firmware; else delete rec.firmware; }
      if (patch.presets !== undefined) rec.presets = patch.presets;
      return rec;
    });
  }

  /**
   * What the saber's bootloader showed at an install: its serial and flash size, and so the board type. A serial is one
   * board, so any other record holding it loses it. Refuses what no Proffieboard bootloader reports.
   */
  noteBootloader(id: string, seen: { serial: string | null; flashBytes: number }): Promise<SaberRecord> {
    const board = seen.flashBytes === 262144 ? 'V2' : seen.flashBytes === 524288 ? 'V3' : null;
    if (!board) return Promise.reject(new Error(`Not a Proffieboard flash size: ${seen.flashBytes}`));
    if (seen.serial !== null && !/^[A-Za-z0-9]{1,40}$/.test(seen.serial)) return Promise.reject(new Error('Not a USB serial'));
    return this.store.update((lib) => {
      const rec = lib.sabers.find((s) => s.id === id);
      if (!rec) throw new Error(`Unknown saber ${id}`);
      if (seen.serial) for (const s of lib.sabers) if (s !== rec && s.bootloader?.serial === seen.serial) delete s.bootloader;
      rec.bootloader = { serial: seen.serial, flashBytes: seen.flashBytes, board, at: new Date().toISOString() };
      return rec;
    });
  }

  /**
   * This SD card is the saber's own: it is known by its volume serial number when it is in a card reader. A card
   * belongs to one saber, so any other saber holding it lets it go.
   */
  linkCard(id: string, card: { serial: string; label: string | null }): Promise<SaberRecord> {
    const serial = card.serial.toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(serial) && !/^[0-9A-Z]{1,16}$/.test(serial)) return Promise.reject(new Error('Not a volume serial number'));
    return this.store.update((lib) => {
      const rec = lib.sabers.find((s) => s.id === id);
      if (!rec) throw new Error(`Unknown saber ${id}`);
      for (const s of lib.sabers) if (s !== rec && s.cards?.some((c) => c.serial === serial)) s.cards = s.cards.filter((c) => c.serial !== serial);
      const rest = (rec.cards ?? []).filter((c) => c.serial !== serial);
      rec.cards = [...rest, { serial, label: card.label ? card.label.slice(0, 64) : null, at: new Date().toISOString() }].slice(-8);
      return rec;
    });
  }

  unlinkCard(id: string, serial: string): Promise<SaberRecord> {
    return this.store.update((lib) => {
      const rec = lib.sabers.find((s) => s.id === id);
      if (!rec) throw new Error(`Unknown saber ${id}`);
      rec.cards = (rec.cards ?? []).filter((c) => c.serial !== serial.toUpperCase());
      return rec;
    });
  }

  /**
   * A style was saved again: every saber whose plan holds a copy of it (planned or not) gets the new version for its
   * next build. Returns how many records changed.
   */
  replaceLook(look: LookDef): Promise<number> {
    return this.store.update((lib) => {
      let n = 0;
      for (const s of lib.sabers) {
        const looks = s.model?.looks;
        const i = looks ? looks.findIndex((l) => l.id === look.id) : -1;
        if (s.model && looks && i >= 0) { s.model = { ...s.model, looks: looks.map((l, k) => (k === i ? look : l)) }; n++; }
      }
      return n;
    });
  }

  remove(id: string): Promise<void> {
    return this.store.update((lib) => { lib.sabers = lib.sabers.filter((s) => s.id !== id); });
  }
}

/** "hote2" from config/hote2.h; falls back to the prop or a generic name. */
export function defaultName(identity: SaberIdentity): string {
  const cfg = identity.configName?.replace(/^config\//, '').replace(/\.h$/, '');
  // A saber already on Hiltwright firmware reports config/hiltwright_<name>.h; the name is the part after the prefix.
  if (cfg && !/^(default|proffieboard)/i.test(cfg)) return cfg.replace(/^hiltwright_/, '') || cfg;
  return identity.prop ? `${identity.prop} saber` : 'Proffie saber';
}

export function libraryPath(userData: string): string {
  return join(userData, 'library.json');
}
