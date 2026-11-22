// presets.ini snapshots on disk: <userData>/sabers/<id>/snapshots/<timestamp>-<label>.ini
// The presets are written as presets.ini writes them (new_preset blocks, then `end`), after `#` header lines. That is
// not a file ProffieOS would load if copied onto a card: it takes a plain presets.ini only when `installed=<the
// firmware's build time>` comes first, and a snapshot has no such line (issue #28).
//
// Each snapshot is written to a temporary file and renamed into place, so a crash mid-write leaves no short file
// behind. One cut short anyway (saved by an older version, or damaged since) is listed as incomplete and is never
// restored: it would read as a shorter list, and a restore would delete the presets it lost (issue #28).
//
// Kept cheap as they pile up (issue #23): one is saved on every connect and before every live edit, and listing used to
// read and parse every file before each edit was sent. Now the header carries the preset count, so a list reads only a
// file's first lines, once per run; a routine snapshot that matches the newest one is not saved again; and routine
// snapshots beyond the newest KEEP_ROUTINE are thinned to one a day. Install, restore and card snapshots are never removed.

import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emitPresetsIni, parsePresetsIni, type PresetRecord } from '@hiltwright/core';
import type { SnapshotMeta } from '../shared/api';

/** Routine snapshots kept in full per saber; older ones are thinned to the newest of each day. */
export const KEEP_ROUTINE = 200;
/** Enough of a file to hold its header lines (a label is at most 120 characters). */
const HEAD_BYTES = 1024;
/** Added to a snapshot's name while it is being written. */
const PART = '.part';

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

/** Enough of a file's end to hold its last line. */
const TAIL_BYTES = 64;
/** Whether text ends with the `end` line a whole snapshot finishes with (the parser's `terminated`, read from the tail). */
const endsWhole = (tail: string) => /(^|\n)end[ \t\r\n]*$/i.test(tail);

/** A file's header lines, and whether it ends with its `end` line, reading only its first and last bytes. */
async function readEdges(path: string): Promise<{ head: string; complete: boolean }> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    if (bytesRead < HEAD_BYTES) return { head: text, complete: endsWhole(text) };
    const size = (await fh.stat()).size;
    const tail = Buffer.alloc(TAIL_BYTES);
    const t = await fh.read(tail, 0, TAIL_BYTES, Math.max(0, size - TAIL_BYTES));
    // Only whole lines of the head: the last one may be cut part-way.
    return { head: text.slice(0, text.lastIndexOf('\n') + 1), complete: endsWhole(tail.subarray(0, t.bytesRead).toString('utf8')) };
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
    let all: string[];
    try { all = await readdir(dir); } catch { return []; }
    // A save that never got to its rename (the app stopped mid-write) leaves its temporary file: never listed, removed here.
    for (const f of all.filter((x) => x.endsWith(PART))) await rm(join(dir, f), { force: true }).catch(() => undefined);
    const files = all.filter((f) => f.endsWith('.ini'));
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
    let edges: { head: string; complete: boolean };
    try { edges = await readEdges(join(dir, file)); } catch { return null; }
    const { head, complete } = edges;
    const label = /^# label=(.*)$/m.exec(head)?.[1] ?? file;
    const at = /^# at=(.*)$/m.exec(head)?.[1] ?? '';
    const count = /^# presets=(\d+)$/m.exec(head)?.[1];
    if (count !== undefined) return { file, at, label, presets: Number(count), complete };
    // Saved before the count was in the header: read the whole file, this once.
    try {
      const parsed = parsePresetsIni(await readFile(join(dir, file), 'utf8'));
      return { file, at, label, presets: parsed.presets.length, complete: parsed.terminated };
    } catch { return null; }
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
      // Written beside it first, then renamed: the .ini is there whole or not at all (issue #28).
      const part = join(dir, file + PART);
      try {
        await writeFile(part, body, 'utf8');
        await rename(part, join(dir, file));
      } catch (err) {
        await rm(part, { force: true }).catch(() => undefined);
        throw err;
      }
      const meta: SnapshotMeta = { file, at, label: name, presets: presets.length, complete: true };
      this.metas.get(saberId)?.set(file, meta);
      this.newest.set(saberId, { meta, key });
      try { await this.prune(saberId, dir); } catch (err) { console.warn(`[snapshots] could not remove old snapshots: ${String(err)}`); }
      return { ...meta };
    });
  }

  private async newestOf(saberId: string, dir: string): Promise<{ meta: SnapshotMeta; key: string } | null> {
    const top = (await this.listNow(saberId, dir))[0];
    // An incomplete newest snapshot cannot stand in for the saber's presets: the new one is saved.
    if (!top || !top.complete) return null;
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

  /** A snapshot's presets, to restore from. An incomplete one is refused: a restore would delete what it lost (issue #28). */
  async read(saberId: string, file: string): Promise<PresetRecord[]> {
    if (!/^[A-Za-z0-9._-]+\.ini$/.test(file)) throw new Error('Bad snapshot name');
    const parsed = parsePresetsIni(await readFile(join(this.dir(saberId), file), 'utf8'));
    if (!parsed.terminated) throw new Error(INCOMPLETE);
    return parsed.presets;
  }
}

/** What a restore from a snapshot cut short says. */
const INCOMPLETE = 'This snapshot is incomplete: it was cut short when it was saved, so it cannot be restored.';
