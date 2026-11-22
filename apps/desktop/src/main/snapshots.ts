// presets.ini snapshots on disk: <userData>/sabers/<id>/snapshots/<timestamp>-<label>.ini
// Written in the board's own file format so a snapshot can be copied straight onto an SD card by hand.
//
// Kept cheap as they pile up (issue #23): one is saved on every connect and before every live edit, and listing used to
// read and parse every file before each edit was sent. Now the header carries the preset count, so a list reads only a
// file's first lines, once per run; a routine snapshot that matches the newest one is not saved again; and routine
// snapshots beyond the newest KEEP_ROUTINE are thinned to one a day. Install, restore and card snapshots are never removed.

import { mkdir, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emitPresetsIni, parsePresetsIni, type PresetRecord } from '@hiltwright/core';
import type { SnapshotMeta } from '../shared/api';

/** Routine snapshots kept in full per saber; older ones are thinned to the newest of each day. */
export const KEEP_ROUTINE = 200;
/** Enough of a file to hold its header lines (a label is at most 120 characters). */
const HEAD_BYTES = 1024;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'snapshot';
}

/**
 * Taken on its own, with no one choosing to keep it: the one on every connect, and the one before each live edit.
 * A snapshot before a restore, an install or a card's preparation marks a moment the owner may look for, so it stays.
 */
export function routineSnapshot(label: string): boolean {
  return label === 'Connected' || (label.startsWith('Before: ') && !label.startsWith('Before: Restore'));
}

/** The presets as compared text: two lists that write the same presets.ini are the same. */
const sameKey = (text: string) => JSON.stringify(parsePresetsIni(text).presets);

async function readHead(path: string): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    // Only whole lines: the last one may be cut part-way.
    return bytesRead < HEAD_BYTES ? text : text.slice(0, text.lastIndexOf('\n') + 1);
  } finally {
    await fh.close();
  }
}

export class Snapshots {
  /** What each file holds, per saber and file name. A snapshot is written once and never changed, so it is read once per run. */
  private metas = new Map<string, Map<string, SnapshotMeta>>();
  /** Each saber's newest snapshot and its presets, so a save can tell nothing changed without reading it back. */
  private newest = new Map<string, { meta: SnapshotMeta; key: string }>();
  /** One save or list at a time per saber, so a list never sees a file half-pruned. */
  private turns = new Map<string, Promise<unknown>>();

  constructor(private root: string, private keep = KEEP_ROUTINE) {}

  private dir(saberId: string): string {
    if (!/^[a-z0-9]+$/i.test(saberId)) throw new Error('Bad saber id');
    return join(this.root, 'sabers', saberId, 'snapshots');
  }

  private inTurn<R>(saberId: string, fn: () => Promise<R>): Promise<R> {
    const next = (this.turns.get(saberId) ?? Promise.resolve()).then(fn, fn);
    this.turns.set(saberId, next.then(() => undefined, () => undefined));
    return next;
  }

  list(saberId: string): Promise<SnapshotMeta[]> {
    const dir = this.dir(saberId);
    return this.inTurn(saberId, () => this.listNow(saberId, dir));
  }

  /** Newest first. */
  private async listNow(saberId: string, dir: string): Promise<SnapshotMeta[]> {
    let files: string[];
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.ini')); } catch { return []; }
    let known = this.metas.get(saberId);
    if (!known) this.metas.set(saberId, (known = new Map()));
    const present = new Set(files);
    for (const file of [...known.keys()]) if (!present.has(file)) known.delete(file);
    for (const file of files) {
      if (known.has(file)) continue;
      const meta = await this.readMeta(dir, file);
      if (meta) known.set(file, meta);
    }
    return [...known.values()].map((m) => ({ ...m })).sort((a, b) => b.file.localeCompare(a.file));
  }

  private async readMeta(dir: string, file: string): Promise<SnapshotMeta | null> {
    let head: string;
    try { head = await readHead(join(dir, file)); } catch { return null; }
    const label = /^# label=(.*)$/m.exec(head)?.[1] ?? file;
    const at = /^# at=(.*)$/m.exec(head)?.[1] ?? '';
    const count = /^# presets=(\d+)$/m.exec(head)?.[1];
    if (count !== undefined) return { file, at, label, presets: Number(count) };
    // Saved before the count was in the header: read the whole file, this once.
    try { return { file, at, label, presets: parsePresetsIni(await readFile(join(dir, file), 'utf8')).presets.length }; } catch { return null; }
  }

  /**
   * Keep the saber's presets as a snapshot. A routine one whose presets match the newest snapshot is not saved again:
   * the newest one's details come back instead.
   */
  save(saberId: string, label: string, presets: PresetRecord[]): Promise<SnapshotMeta> {
    const dir = this.dir(saberId);
    return this.inTurn(saberId, async () => {
      await mkdir(dir, { recursive: true });
      const ini = emitPresetsIni({ installed: null, presets, terminated: true });
      const key = sameKey(ini);
      const name = label.replace(/\n/g, ' ');
      if (routineSnapshot(name)) {
        const last = await this.newestOf(saberId, dir);
        if (last && last.key === key) return { ...last.meta };
      }
      const at = new Date().toISOString();
      const file = `${at.replace(/[:.]/g, '-')}-${slug(name)}.ini`;
      const body = `# hiltwright snapshot\n# label=${name}\n# at=${at}\n# presets=${presets.length}\n${ini}`;
      await writeFile(join(dir, file), body, 'utf8');
      const meta: SnapshotMeta = { file, at, label: name, presets: presets.length };
      this.metas.get(saberId)?.set(file, meta);
      this.newest.set(saberId, { meta, key });
      try { await this.prune(saberId, dir); } catch (err) { console.warn(`[snapshots] could not remove old snapshots: ${String(err)}`); }
      return { ...meta };
    });
  }

  private async newestOf(saberId: string, dir: string): Promise<{ meta: SnapshotMeta; key: string } | null> {
    const top = (await this.listNow(saberId, dir))[0];
    if (!top) return null;
    const known = this.newest.get(saberId);
    if (known && known.meta.file === top.file) return known;
    try {
      const found = { meta: top, key: sameKey(await readFile(join(dir, top.file), 'utf8')) };
      this.newest.set(saberId, found);
      return found;
    } catch { return null; }
  }

  /** Routine snapshots: the newest `keep` stay, and of the older ones, the newest of each day. */
  private async prune(saberId: string, dir: string): Promise<void> {
    const routine = (await this.listNow(saberId, dir)).filter((m) => routineSnapshot(m.label));
    const days = new Set<string>();
    const drop: SnapshotMeta[] = [];
    routine.forEach((m, i) => {
      const day = (m.at || m.file).slice(0, 10);
      if (i < this.keep || !days.has(day)) days.add(day);
      else drop.push(m);
    });
    for (const m of drop) {
      try { await rm(join(dir, m.file), { force: true }); this.metas.get(saberId)?.delete(m.file); } catch { /* in use; the next save tries again */ }
    }
    if (drop.length) console.log(`[snapshots] removed ${drop.length} old routine snapshot(s) for ${saberId}`);
  }

  async read(saberId: string, file: string): Promise<PresetRecord[]> {
    if (!/^[A-Za-z0-9._-]+\.ini$/.test(file)) throw new Error('Bad snapshot name');
    return parsePresetsIni(await readFile(join(this.dir(saberId), file), 'utf8')).presets;
  }
}
