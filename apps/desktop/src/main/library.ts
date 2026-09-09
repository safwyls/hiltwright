// Saber library: one JSON file in userData. Small, human-readable, written atomically.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PresetRecord } from '@hiltwright/core';
import type { SaberIdentity, SaberRecord } from '../shared/api';

interface LibraryFile { version: 1; sabers: SaberRecord[] }

export class Library {
  private cache: LibraryFile | null = null;
  constructor(private file: string) {}

  private async load(): Promise<LibraryFile> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as LibraryFile;
      this.cache = parsed.version === 1 && Array.isArray(parsed.sabers) ? parsed : { version: 1, sabers: [] };
    } catch {
      this.cache = { version: 1, sabers: [] };
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const data = this.cache ?? { version: 1, sabers: [] };
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  async list(): Promise<SaberRecord[]> {
    return [...(await this.load()).sabers].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  /** A board is the same saber when the USB serial matches; failing that, when config, install stamp and blade layout all match. */
  static matches(a: SaberIdentity, b: SaberIdentity): boolean {
    if (a.usbSerial && b.usbSerial) return a.usbSerial === b.usbSerial;
    return a.configName === b.configName && a.installed === b.installed && a.pixelBlades.join(',') === b.pixelBlades.join(',');
  }

  async upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string }): Promise<SaberRecord> {
    const lib = await this.load();
    const now = new Date().toISOString();
    let rec = lib.sabers.find((s) => Library.matches(s.identity, input.identity));
    if (rec) {
      rec.identity = { ...rec.identity, ...input.identity, usbSerial: input.identity.usbSerial ?? rec.identity.usbSerial };
      rec.presets = input.presets;
      rec.fonts = input.fonts;
      rec.tracks = input.tracks;
      rec.lastSeen = now;
      if (input.name) rec.name = input.name;
    } else {
      rec = {
        id: randomBytes(6).toString('hex'),
        name: input.name ?? defaultName(input.identity),
        identity: input.identity,
        firstSeen: now,
        lastSeen: now,
        presets: input.presets,
        fonts: input.fonts,
        tracks: input.tracks,
      };
      lib.sabers.push(rec);
    }
    await this.persist();
    return rec;
  }

  async rename(id: string, name: string): Promise<SaberRecord> {
    const lib = await this.load();
    const rec = lib.sabers.find((s) => s.id === id);
    if (!rec) throw new Error(`Unknown saber ${id}`);
    rec.name = name.trim() || rec.name;
    await this.persist();
    return rec;
  }

  async remove(id: string): Promise<void> {
    const lib = await this.load();
    lib.sabers = lib.sabers.filter((s) => s.id !== id);
    await this.persist();
  }
}

/** "hote2" from config/hote2.h; falls back to the prop or a generic name. */
export function defaultName(identity: SaberIdentity): string {
  const cfg = identity.configName?.replace(/^config\//, '').replace(/\.h$/, '');
  if (cfg && !/^(default|proffieboard)/i.test(cfg)) return cfg;
  return identity.prop ? `${identity.prop} saber` : 'Proffie saber';
}

export function libraryPath(userData: string): string {
  return join(userData, 'library.json');
}
