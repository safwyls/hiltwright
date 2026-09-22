// Preset banks, shared across sabers: one JSON file in userData, written atomically like the library.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isBank, type PresetBank } from '@hiltwright/core';

interface BanksFile { version: 1; banks: PresetBank[] }

export class BanksStore {
  private cache: BanksFile | null = null;
  constructor(private file: string) {}
  private async load(): Promise<BanksFile> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as BanksFile;
      this.cache = { version: 1, banks: Array.isArray(parsed.banks) ? parsed.banks.filter(isBank) : [] };
    } catch {
      this.cache = { version: 1, banks: [] };
    }
    return this.cache;
  }
  private async persist(): Promise<void> {
    const data = this.cache ?? { version: 1, banks: [] };
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, this.file);
  }
  async list(): Promise<PresetBank[]> { return [...(await this.load()).banks]; }
  /** Add or replace by id, keeping the list's order for a replacement. */
  async save(bank: PresetBank): Promise<PresetBank[]> {
    const f = await this.load();
    const i = f.banks.findIndex((b) => b.id === bank.id);
    if (i >= 0) f.banks[i] = bank; else f.banks.push(bank);
    await this.persist();
    return [...f.banks];
  }
  async remove(id: string): Promise<PresetBank[]> {
    const f = await this.load();
    f.banks = f.banks.filter((b) => b.id !== id);
    await this.persist();
    return [...f.banks];
  }
}

export function banksPath(userData: string): string { return join(userData, 'banks.json'); }
