// One safe way to keep a JSON file in userData (roadmap design D8): writes are queued and each goes through its own
// temporary file, the previous good file is kept as <base>.bak.json, and a file that cannot be read (or holds records
// of the wrong shape) is set aside as <base>.damaged-<stamp>.json and never overwritten. Every set-aside is reported
// through storeProblems() so the Armory can tell the owner.
//
// A file held open by another program (a virus scanner, a sync client) is not damage (issue #11): reads and the
// final rename are tried again for a moment, and a read that still fails says "try again" without setting anything
// aside. Each write is flushed to the disk before it replaces the main file, so a power cut cannot leave it empty.

import { copyFile, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The file calls a store makes. Tests replace them to act out a file another program holds open. */
export interface StoreFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  open(path: string, flags: 'w'): Promise<{ writeFile(data: string, encoding: 'utf8'): Promise<void>; sync(): Promise<void>; close(): Promise<void> }>;
}

const nodeFs: StoreFs = {
  readFile: (path, encoding) => readFile(path, encoding),
  rename: (from, to) => rename(from, to),
  open: (path, flags) => open(path, flags),
};

/** Errors Windows gives for a file another program has open: worth waiting out, never a sign of damage. */
const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES']);
const isBusy = (err: unknown) => BUSY.has((err as NodeJS.ErrnoException)?.code ?? '');
/** About a second and a half in all: long enough for a scanner to let go, short enough not to hang a save. */
export const BUSY_WAITS_MS = [100, 200, 300, 400, 400];

export interface StoreProblem {
  /** What the owner calls it: "saber list", "preset sets". */
  store: string;
  /** File name the damaged store was kept as, in the same folder. */
  keptAs: string;
  startedFrom: 'backup' | 'readable records' | 'nothing';
  /** Which folder it is in: the app's data folder, or the font library's own folder. */
  place: StorePlace;
}

export type StorePlace = 'data' | 'fonts';

const problems: StoreProblem[] = [];

/** Every store set aside in this run, oldest first. */
export function storeProblems(): StoreProblem[] {
  return [...problems];
}

/** Tests only: start a clean report. */
export function resetStoreProblems(): void {
  problems.length = 0;
}

export interface StoreOptions<T> {
  /** What the owner calls this store, used in the report. */
  name: string;
  empty: () => T;
  /** The readable part of what was on disk and how many records were left out, or null if it is not recognisable. */
  clean: (raw: unknown) => { value: T; dropped: number } | null;
  /** Where the file lives, for telling the owner (default: the app's data folder). */
  place?: StorePlace;
  now?: () => Date;
  /** Tests only: stand-ins for the file calls. */
  fs?: Partial<StoreFs>;
  /** Tests only: the waits between tries at a busy file, in milliseconds (default BUSY_WAITS_MS). */
  busyWaits?: number[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export class JsonStore<T> {
  private value: T | null = null;
  private loading: Promise<T> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private writes = 0;
  /** The file on disk is a good copy worth keeping as the backup before it is replaced. */
  private fileGood = false;
  /** The damaged file could not be moved aside: writing would destroy it, so this run does not write. */
  private blocked: string | null = null;
  private readonly base: string;
  private readonly bak: string;
  private readonly fs: StoreFs;

  constructor(private readonly file: string, private readonly opts: StoreOptions<T>) {
    this.base = join(dirname(file), basename(file).replace(/\.json$/i, ''));
    this.bak = `${this.base}.bak.json`;
    this.fs = { ...nodeFs, ...opts.fs };
  }

  read(): Promise<T> {
    // A read that failed because the file was busy is not remembered: the next read tries the disk again.
    this.loading ??= this.load().catch((err: unknown) => { this.loading = null; throw err; });
    return this.loading;
  }

  /** Run a file call, trying again for a moment while another program holds the file (issue #11). */
  private async whileBusy<R>(call: () => Promise<R>): Promise<R> {
    const waits = this.opts.busyWaits ?? BUSY_WAITS_MS;
    for (let i = 0; ; i++) {
      try { return await call(); } catch (err) {
        if (!isBusy(err) || i >= waits.length) throw err;
        await new Promise((r) => setTimeout(r, waits[i]));
      }
    }
  }

  /** Change the value and write it. Updates run one at a time, each with its own write, in the order asked. */
  update<R>(fn: (value: T) => R | Promise<R>): Promise<R> {
    const run = async () => {
      const v = await this.read();
      // A change that cannot be written is undone in memory too, so what the app shows never runs ahead of the disk.
      const before = JSON.stringify(v);
      const undo = () => { const back = JSON.parse(before) as T; for (const k of Object.keys(v as object)) delete (v as Record<string, unknown>)[k]; Object.assign(v as object, back); };
      let r: R;
      try { r = await fn(v); } catch (err) { undo(); throw err; }
      try { await this.persist(v); } catch (err) { undo(); throw err; }
      return r;
    };
    const next = this.tail.then(run);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }

  private async load(): Promise<T> {
    let text: string;
    try {
      text = await this.whileBusy(() => this.fs.readFile(this.file, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return (this.value = await this.fromBackupIfAny());
      // Still held by another program: the file may be perfectly good, so it is left where it is and nothing is
      // reported as damaged. Setting it aside here started the store from a backup one write behind and stopped every
      // save for the rest of the run (issue #11).
      if (isBusy(err)) {
        console.warn(`[store] the ${this.opts.name} file is in use by another program: ${String(err)}`);
        throw new Error(`Could not read the ${this.opts.name}: another program is using its file. Try again in a moment.`);
      }
      return (this.value = await this.setAside(String(err)));
    }
    let raw: unknown;
    // A file saved by Notepad or PowerShell can start with a byte-order mark; that is not damage.
    try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (err) { return (this.value = await this.setAside(String(err))); }
    const cleaned = this.opts.clean(raw);
    if (!cleaned) return (this.value = await this.setAside('not in the expected shape'));
    if (cleaned.dropped > 0) {
      // Keep the original as it was; the readable records carry on, and the next write replaces the main file.
      const keptAs = this.asideName();
      try { await copyFile(this.file, join(dirname(this.file), keptAs)); } catch (err) { this.blocked = `could not keep a copy: ${String(err)}`; }
      this.report(keptAs, 'readable records', `${cleaned.dropped} record(s) not in the expected shape`);
      return (this.value = cleaned.value);
    }
    this.fileGood = true;
    return (this.value = cleaned.value);
  }

  /** Move an unusable file aside, then start from the backup when it reads, otherwise from nothing. */
  private async setAside(why: string): Promise<T> {
    const keptAs = this.asideName();
    try { await this.whileBusy(() => this.fs.rename(this.file, join(dirname(this.file), keptAs))); } catch (err) { this.blocked = `could not move it aside: ${String(err)}`; }
    let from: StoreProblem['startedFrom'] = 'nothing';
    let value = this.opts.empty();
    const b = await this.readBackup();
    if (b) { value = b; from = 'backup'; }
    this.report(keptAs, from, why);
    // The recovered copy goes back on disk at once: kept only in memory, it was lost when the app closed before the next
    // change, as the next start found no file and began empty (issue #8).
    if (from === 'backup') await this.restoreToDisk(value);
    return value;
  }

  private async readBackup(): Promise<T | null> {
    try { return this.opts.clean(JSON.parse((await this.fs.readFile(this.bak, 'utf8')).replace(/^﻿/, '')))?.value ?? null; } catch { return null; }
  }

  /** No main file. A first start has no backup either; a backup with no main file is a store that lost its file. */
  private async fromBackupIfAny(): Promise<T> {
    const b = await this.readBackup();
    if (!b) return this.opts.empty();
    console.warn(`[store] the ${this.opts.name} file was missing; started from its backup copy`);
    await this.restoreToDisk(b);
    return b;
  }

  private async restoreToDisk(value: T): Promise<void> {
    if (this.blocked) return;
    try { await this.persist(value); } catch (err) { console.warn(`[store] could not write the recovered ${this.opts.name} back: ${String(err)}`); }
  }

  private asideName(): string {
    const at = stamp((this.opts.now ?? (() => new Date()))());
    let name = `${basename(this.base)}.damaged-${at}.json`;
    for (let i = 2; existsSync(join(dirname(this.file), name)); i++) name = `${basename(this.base)}.damaged-${at}-${i}.json`;
    return name;
  }

  private report(keptAs: string, startedFrom: StoreProblem['startedFrom'], why: string): void {
    problems.push({ store: this.opts.name, keptAs, startedFrom, place: this.opts.place ?? 'data' });
    console.warn(`[store] the ${this.opts.name} could not be read (${why}); kept as ${keptAs}, started from ${startedFrom}${this.blocked ? `; not saving this run: ${this.blocked}` : ''}`);
  }

  private async persist(value: T): Promise<void> {
    if (this.blocked) throw new Error(`The ${this.opts.name} is not being saved in this run, to protect the damaged file (${this.blocked}).`);
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${++this.writes}.tmp`;
    try {
      // Flushed before the rename: an unflushed file renamed into place can be empty after a power cut (issue #11).
      const fh = await this.fs.open(tmp, 'w');
      try {
        await fh.writeFile(JSON.stringify(value, null, 2), 'utf8');
        await fh.sync();
      } finally {
        await fh.close();
      }
      if (this.fileGood) { try { await copyFile(this.file, this.bak); } catch { /* the backup is a courtesy */ } }
      await this.whileBusy(() => this.fs.rename(tmp, this.file));
    } catch (err) {
      // A write that did not land leaves no temporary file behind.
      await rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
    this.fileGood = true;
  }
}
