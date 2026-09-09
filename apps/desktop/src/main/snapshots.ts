// presets.ini snapshots on disk: <userData>/sabers/<id>/snapshots/<timestamp>-<label>.ini
// Written in the board's own file format so a snapshot can be copied straight onto an SD card by hand.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emitPresetsIni, parsePresetsIni, type PresetRecord } from '@hiltwright/core';
import type { SnapshotMeta } from '../shared/api';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'snapshot';
}

export class Snapshots {
  constructor(private root: string) {}

  private dir(saberId: string): string {
    if (!/^[a-z0-9]+$/i.test(saberId)) throw new Error('Bad saber id');
    return join(this.root, 'sabers', saberId, 'snapshots');
  }

  async list(saberId: string): Promise<SnapshotMeta[]> {
    const dir = this.dir(saberId);
    let files: string[];
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.ini')); } catch { return []; }
    const out: SnapshotMeta[] = [];
    for (const file of files) {
      const text = await readFile(join(dir, file), 'utf8');
      const label = /^# label=(.*)$/m.exec(text)?.[1] ?? file;
      const at = /^# at=(.*)$/m.exec(text)?.[1] ?? '';
      out.push({ file, at, label, presets: parsePresetsIni(text).presets.length });
    }
    return out.sort((a, b) => b.file.localeCompare(a.file));
  }

  async save(saberId: string, label: string, presets: PresetRecord[]): Promise<SnapshotMeta> {
    const dir = this.dir(saberId);
    await mkdir(dir, { recursive: true });
    const at = new Date().toISOString();
    const file = `${at.replace(/[:.]/g, '-')}-${slug(label)}.ini`;
    const body = `# hiltwright snapshot\n# label=${label.replace(/\n/g, ' ')}\n# at=${at}\n${emitPresetsIni({ installed: null, presets, terminated: true })}`;
    await writeFile(join(dir, file), body, 'utf8');
    return { file, at, label, presets: presets.length };
  }

  async read(saberId: string, file: string): Promise<PresetRecord[]> {
    if (!/^[A-Za-z0-9._-]+\.ini$/.test(file)) throw new Error('Bad snapshot name');
    return parsePresetsIni(await readFile(join(this.dir(saberId), file), 'utf8')).presets;
  }
}
