// Pasted looks, shared across sabers: one JSON file in userData, written atomically like the library.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LookDef } from '@hiltwright/core';

interface LooksFile { version: 1; looks: LookDef[] }

export class LooksStore {
  private cache: LooksFile | null = null;
  constructor(private file: string) {}

  private async load(): Promise<LooksFile> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as LooksFile;
      this.cache = { version: 1, looks: Array.isArray(parsed.looks) ? parsed.looks : [] };
    } catch {
      this.cache = { version: 1, looks: [] };
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const data = this.cache ?? { version: 1, looks: [] };
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  async list(): Promise<LookDef[]> {
    return [...(await this.load()).looks];
  }

  /** Add or replace by id. */
  async add(look: LookDef): Promise<LookDef[]> {
    const f = await this.load();
    f.looks = [...f.looks.filter((l) => l.id !== look.id), look];
    await this.persist();
    return [...f.looks];
  }

  async remove(id: string): Promise<LookDef[]> {
    const f = await this.load();
    f.looks = f.looks.filter((l) => l.id !== id);
    await this.persist();
    return [...f.looks];
  }
}

export function looksPath(userData: string): string {
  return join(userData, 'looks.json');
}
