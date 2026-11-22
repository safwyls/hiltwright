// The font library: sound fonts the owner has bought or downloaded, kept in one folder on this computer so every
// part of the app can use them (Presets, the demo room, copying onto a card). Each font is a plain ProffieOS font
// folder, untouched; what the owner says about it (display name, maker, notes) lives in one index file beside them,
// kept by the safe store (jsonStore.ts), so a font folder copied onto a card carries nothing extra.

import { cp, mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CORE_SOUNDS_TEXT, OTHER_FILES, checkFontListing, classifyFontFile, type FontReport } from '@hiltwright/core';
export { classifyFontFile };
import { copyFont, inBatches, looksLikeFont, readFontListing, readFontSounds, type CopyOptions, type FontEntry, type FontSounds } from './sd';
import { extractZip, listZip } from './unzip';
import { sortPackage, surveyPackage } from './fontBoards';
import type { CarriedContributor } from './contributors';
import { NOT_A_PACK, openLibraryPack, writeLibraryPack, type PackedFont } from './fontLibraryPack';
import { JsonStore } from './jsonStore';

export const INDEX_FILE = 'hiltwright-fonts.json';
/** Where makers' logos were kept before the shared contributors list; moved with the library, never listed as a font. */
export const MAKERS_DIR = 'hiltwright-makers';


export interface FontMeta {
  /** What the owner calls the font. The folder name is what the saber uses and does not change. */
  name: string;
  maker: string;
  notes: string;
  added: string;
  /** The package or folder it came from. */
  from?: string;
  /** A set the maker released together. Filled in when one package brings several fonts. */
  bundle?: string;
}

/** What older versions kept about a maker: their logo, a file name in MAKERS_DIR. */
export interface MakerMeta { logo?: string }

export interface FontSound {
  /** Path inside the font folder, with forward slashes. */
  path: string;
  /** The effect it plays for: hum, clash, lockup, smoothswing, ... */
  effect: string;
  kind: 'mono' | 'poly' | 'shared' | 'other';
  seconds: number | null;
  size: number;
}

export interface FontSupport {
  type: FontReport['type'];
  smoothSwing: boolean;
  /** Every effect the font has sounds for. */
  effects: string[];
  /** Effects beyond the basics every font has (hum, ignition, retraction, swing, clash). */
  special: string[];
  tracks: number;
}

export interface LibraryFont {
  folder: string;
  meta: FontMeta;
  report: FontReport;
  support: FontSupport;
  bytes: number;
}

export interface LibraryFontDetail extends LibraryFont {
  sounds: FontSound[];
  tracks: FontSound[];
}

/** `reason` and `from` are set when a folder was left out on purpose, so the page can say each kind once. */
export interface ImportResult { /** Makers whose logo or link came in with an export file. */ makers?: string[]; added: string[]; skipped: { name: string; why: string; reason?: 'other-board' | 'extra' | 'have'; from?: string }[] }

const BASIC = new Set(['hum', 'ignition', 'retraction', 'swing', 'clash', 'font name', 'boot', 'smoothswing']);

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** Look over one font folder: every sound and track, what the font supports, and the usual checks (the same ones the card gets). */
export async function scanFont(dir: string): Promise<{ sounds: FontSound[]; tracks: FontSound[]; report: FontReport; support: FontSupport; bytes: number; hasSmoothswIni: boolean }> {
  const { sounds, tracks, report, bytes } = checkFontListing(await readFontListing(dir));
  let hasSmoothswIni = false;
  try { hasSmoothswIni = (await readdir(dir)).some((n) => n.toLowerCase() === 'smoothsw.ini'); } catch { /* unreadable */ }
  const effects = [...new Set(sounds.map((s) => s.effect).filter((e) => e !== OTHER_FILES))].sort();
  const smoothSwing = effects.includes('smoothswing');
  return {
    sounds, tracks, report, bytes, hasSmoothswIni,
    support: { type: report.type, smoothSwing, effects, special: effects.filter((e) => !BASIC.has(e) && e !== 'menu voice'), tracks: tracks.length },
  };
}

/** System clutter that never comes into the library: hidden files, macOS resource forks, Windows thumbnails. */
export function isJunk(rel: string): boolean {
  return rel.split(/[\\/]+/).some((p) => p.startsWith('.') || p === '__MACOSX' || /^(thumbs\.db|desktop\.ini)$/i.test(p));
}

const GENERIC = /^(proffie(os|board)?|proffie[ _-]?(os|board)[ _-]?v?\d*|sound[ _-]?fonts?|fonts?|sounds?|\d+|v\d+(\.\d+)*)$/i;

/** A folder name the saber can use: no path characters, no ';' (ProffieOS splits font paths on it). */
export function safeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|;]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60) || 'font';
}

/**
 * What to call a font found at `dir` inside the package at `top` (named `topName`): its own folder's name, or the
 * nearest folder above it whose name says something, or the package's.
 */
export function nameFor(dir: string, top: string, topName: string): string {
  let d = resolve(dir);
  const t = resolve(top);
  while (d !== t && GENERIC.test(basename(d))) d = dirname(d);
  return d === t ? topName : basename(d);
}

interface IndexFile { version: 1; fonts: Record<string, FontMeta>; makers: Record<string, MakerMeta> }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The readable part of a details file, and how many font entries were not. Null when it is not a details file. */
export function cleanIndex(raw: unknown): { value: IndexFile; dropped: number } | null {
  if (!isObj(raw) || !isObj(raw.fonts)) return null;
  const fonts: Record<string, FontMeta> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(raw.fonts)) {
    if (isObj(v) && typeof v.name === 'string') {
      const m = v as Partial<FontMeta>;
      fonts[k] = { ...m, name: v.name, maker: m.maker ?? '', notes: m.notes ?? '', added: m.added ?? '' };
    }
    else dropped++;
  }
  const makers: Record<string, MakerMeta> = {};
  if (isObj(raw.makers)) for (const [k, v] of Object.entries(raw.makers)) if (isObj(v)) makers[k] = v as MakerMeta;
  return { value: { version: 1, fonts, makers }, dropped };
}

const same = (a: string, b: string) => relative(resolve(a), resolve(b)) === '';
/** Anything at all at that path, file or folder: a move never replaces it (on Windows a rename would). */
const taken = (p: string) => stat(p).then(() => true, () => false);
const inside = (outer: string, inner: string) => { const r = relative(resolve(outer), resolve(inner)); return !!r && !r.startsWith('..') && !isAbsolute(r); };

export class FontLibrary {
  private store!: JsonStore<IndexFile>;
  private cache = new Map<string, LibraryFontDetail>();

  /** `defaultRoot`: the app's own folder, the only one created when missing. */
  constructor(public root: string, private trash: (p: string) => Promise<void>, private defaultRoot: string | null = null) {
    this.makeStore();
  }

  private makeStore(): void {
    this.store = new JsonStore<IndexFile>(join(this.root, INDEX_FILE), { name: 'font details', place: 'fonts', empty: () => ({ version: 1, fonts: {}, makers: {} }), clean: cleanIndex });
  }

  private async readIndex(): Promise<Record<string, FontMeta>> {
    return (await this.store.read()).fonts;
  }

  /** A library folder the owner chose that is not there (its drive unplugged, say). The default is simply made. */
  async missing(): Promise<boolean> {
    if (this.defaultRoot && same(this.root, this.defaultRoot)) return false;
    return !(await isDir(this.root));
  }

  private async ready(): Promise<void> {
    if (await this.missing()) throw new Error(`The font library folder cannot be found (${this.root}). Plug its drive in, or choose where it is now.`);
    await mkdir(this.root, { recursive: true });
  }

  /** A folder name that must already be a font in the library: never a path. */
  private folderPath(folder: string): string {
    if (!folder || folder !== basename(folder) || /[\\/]/.test(folder) || folder === '.' || folder === '..') throw new Error('Not a font in the library');
    return join(this.root, folder);
  }

  async list(): Promise<LibraryFont[]> {
    if (await this.missing()) return [];
    await mkdir(this.root, { recursive: true });
    const index = await this.readIndex();
    const names = (await readdir(this.root)).filter((n) => !n.startsWith('.') && n !== MAKERS_DIR).sort((a, b) => a.localeCompare(b));
    const found = await inBatches(names, 4, async (n) => {
      const p = join(this.root, n);
      if (!(await isDir(p)) || !(await looksLikeFont(p))) return null;
      const { sounds: _s, tracks: _t, ...rest } = await this.detail(n);
      return { ...rest, meta: index[n] ?? rest.meta };
    });
    const out = found.filter((f): f is LibraryFont => !!f);
    const seen = new Set(out.map((f) => f.folder));
    for (const k of [...this.cache.keys()]) if (!seen.has(k)) this.cache.delete(k);
    return out;
  }

  async detail(folder: string): Promise<LibraryFontDetail> {
    const index = await this.readIndex();
    const hit = this.cache.get(folder);
    if (hit) return { ...hit, meta: index[folder] ?? hit.meta };
    const dir = this.folderPath(folder);
    if (!(await isDir(dir))) throw new Error(`${folder} is not in the font library`);
    const s = await scanFont(dir);
    const meta = index[folder] ?? { name: folder.replace(/_/g, ' '), maker: '', notes: '', added: (await stat(dir)).mtime.toISOString() };
    const d: LibraryFontDetail = { folder, meta, report: s.report, support: s.support, bytes: s.bytes, sounds: s.sounds, tracks: s.tracks };
    this.cache.set(folder, d);
    return d;
  }

  async setMeta(folder: string, patch: Partial<Pick<FontMeta, 'name' | 'maker' | 'notes' | 'bundle'>>): Promise<LibraryFont> {
    const d = await this.detail(folder);
    const next: FontMeta = { ...d.meta, ...patch };
    if (!next.bundle) delete next.bundle;
    await this.store.update((f) => { f.fonts[folder] = next; });
    const { sounds: _s, tracks: _t, ...rest } = d;
    return { ...rest, meta: next };
  }

  /** Move a font to the recycle bin (never deleted outright) and forget what was said about it. */
  async remove(folder: string): Promise<void> {
    const dir = this.folderPath(folder);
    await this.trash(dir);
    this.cache.delete(folder);
    await this.store.update((f) => { delete f.fonts[folder]; });
  }

  /**
   * Makers' logos kept in the library before logos moved to the shared contributors list: the name and the image
   * file, so they can be handed over once.
   */
  async legacyLogos(): Promise<{ name: string; file: string }[]> {
    const { makers } = await this.store.read();
    const out: { name: string; file: string }[] = [];
    for (const [name, m] of Object.entries(makers)) if (m.logo && m.logo === basename(m.logo)) out.push({ name, file: join(this.root, MAKERS_DIR, m.logo) });
    return out;
  }

  /** Bytes of one sound or track, for playing in the app. */
  async readSound(folder: string, rel: string): Promise<ArrayBuffer> {
    const dir = resolve(this.folderPath(folder));
    const p = resolve(dir, ...rel.split('/'));
    if (!p.startsWith(dir + sep) || !/\.wav$/i.test(p)) throw new Error('Not a sound in that font');
    const buf = await readFile(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  readFont(folder: string, onFile?: (name: string, done: number, total: number) => void): Promise<FontSounds> {
    return readFontSounds(this.folderPath(folder), onFile);
  }

  async copyToCard(folder: string, cardRoot: string, options: CopyOptions | boolean): Promise<FontEntry> {
    await this.ready();
    return copyFont(this.folderPath(folder), cardRoot, options);
  }

  private async freeName(want: string): Promise<string> {
    const base = safeFolderName(want);
    let name = base;
    for (let i = 2; await isDir(join(this.root, name)) || (await this.readIndex())[name]; i++) name = `${base}-${i}`;
    return name;
  }

  /**
   * Add what the owner downloaded: a .zip package, a font folder, or a folder holding several fonts. Every file of a
   * font is copied in (not system clutter); the original stays where it was.
   */
  async importFrom(src: string, onLine?: (line: string) => void): Promise<ImportResult> {
    await this.ready();
    const result: ImportResult = { added: [], skipped: [] };
    const label = basename(src).replace(/\.zip$/i, '');
    let top = src;
    // Every font is put together here first, tracks included, and renamed to its own name only once it is whole: a
    // copy that fails part way (a stick pulled, a disk full) leaves nothing the library would list as a font (issue
    // #22). The folder is hidden from list() and on the library's own drive, so the last rename is one step.
    const staging = join(this.root, `.incoming-${Date.now().toString(36)}`);
    const zipped = /\.zip$/i.test(src);
    try {
      if (zipped) {
        const entries = await listZip(src);
        const wavs = entries.filter((e) => /\.wav$/i.test(e.name) && !isJunk(e.name)).length;
        if (!wavs) throw new Error(`${basename(src)} has no sounds in it. Is it a sound font package?`);
        onLine?.(`Unpacking ${basename(src)} (${wavs} sounds)…`);
        top = join(staging, 'package');
        await extractZip(src, top, (n) => !isJunk(n), (_n, done, total) => { if (done % 100 === 0 || done === total) onLine?.(`Unpacked ${done} of ${total} files`); });
      } else if (!(await isDir(src))) throw new Error('Choose a font folder or a .zip package');
      const found = await surveyPackage(top);
      if (!found.some((f) => f.font)) throw new Error(`No sound font found in ${basename(src)}. A font folder holds at least one of the core sounds (${CORE_SOUNDS_TEXT}), as files like hum.wav or hum01.wav, or in folders like hum/.`);
      const { keep: dirs, left } = sortPackage(top, found);
      for (const x of left) {
        result.skipped.push(x.reason === 'other-board'
          ? { name: basename(x.dir), why: `the copy in "${x.from}" is for another board, not Proffie`, reason: x.reason, from: x.from }
          : { name: basename(x.dir), why: 'extra sounds, not a whole font', reason: x.reason, from: x.from });
      }
      for (const d of dirs) {
        const want = nameFor(d, top, label);
        const folder = await this.freeName(want);
        onLine?.(`Adding ${folder}…`);
        const dest = join(this.root, folder);
        const tmp = join(staging, 'fonts', folder);
        await mkdir(dirname(tmp), { recursive: true });
        if (zipped) {
          try { await rename(d, tmp); } catch { await cp(d, tmp, { recursive: true }); }
        } else {
          await cp(d, tmp, { recursive: true, filter: (x) => !isJunk(relative(d, x)) });
        }
        // A single font with its tracks beside it rather than inside: the tracks go into the font, where ProffieOS
        // finds them as <font>/tracks/<name>.wav. Only from inside what the owner picked.
        const candidates = [...(inside(top, dirname(d)) ? [join(dirname(d), 'tracks')] : []), join(top, 'tracks')].filter((x) => !same(x, join(d, 'tracks')));
        let beside: string | undefined;
        for (const c of candidates) if (await isDir(c)) { beside = c; break; }
        if (dirs.length === 1 && beside && !(await isDir(join(tmp, 'tracks')))) {
          const from = beside;
          await cp(from, join(tmp, 'tracks'), { recursive: true, filter: (x) => !isJunk(relative(from, x)) && (/\.wav$/i.test(x) || statSync(x).isDirectory()) });
        }
        await rename(tmp, dest);
        const meta: FontMeta = { name: want.replace(/_/g, ' '), maker: '', notes: '', added: new Date().toISOString(), from: basename(src), ...(dirs.length > 1 ? { bundle: label.replace(/_/g, ' ') } : {}) };
        await this.store.update((f) => { f.fonts[folder] = meta; });
        result.added.push(folder);
      }
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
    return result;
  }

  /** Every file of a font folder, system clutter left out, as paths with forward slashes in name order. */
  private async filesOf(dir: string, rel = ''): Promise<{ path: string; bytes: number }[]> {
    const out: { path: string; bytes: number }[] = [];
    for (const n of (await readdir(join(dir, ...rel.split('/').filter(Boolean)))).sort()) {
      const path = rel ? `${rel}/${n}` : n;
      if (isJunk(path)) continue;
      const s = await stat(join(dir, ...path.split('/')));
      if (s.isDirectory()) out.push(...(await this.filesOf(dir, path)));
      else if (s.isFile()) out.push({ path, bytes: s.size });
    }
    return out;
  }

  /**
   * Every font in the library, with what the owner said about each, in one compressed and encrypted file
   * (fontLibraryPack.ts) to carry to another computer. The library itself is only read.
   */
  async exportTo(file: string, onLine?: (line: string) => void, opts: { folders?: string[]; passphrase?: string; /** The logos and links kept for these makers, to travel with their fonts. */ makersFor?: (names: string[]) => Promise<CarriedContributor[]> } = {}): Promise<{ fonts: number; files: number; bytes: number }> {
    await this.ready();
    if (inside(this.root, file)) throw new Error('Save the export outside the font library folder.');
    // `folders`: only these fonts. One that is not in the library stops the export rather than being left out quietly.
    const all = await this.list();
    const want = opts.folders ? new Set(opts.folders) : null;
    if (want) for (const w of want) if (!all.some((f) => f.folder === w)) throw new Error(`${w} is not in the font library.`);
    const fonts: PackedFont[] = [];
    for (const f of all) if (!want || want.has(f.folder)) fonts.push({ folder: f.folder, meta: f.meta, files: await this.filesOf(this.folderPath(f.folder)) });
    if (!fonts.length) throw new Error('There are no fonts in the library to export.');
    const makers = opts.makersFor ? await opts.makersFor([...new Set(fonts.map((f) => f.meta.maker.trim()).filter(Boolean))]) : [];
    return writeLibraryPack(file, fonts, (font, path) => readFile(join(this.folderPath(font.folder), ...path.split('/'))), { passphrase: opts.passphrase, makers, onFont: (font, done, total) => onLine?.(`Packing ${done} of ${total}: ${font.meta.name}…`) });
  }

  /**
   * Add the fonts of a library export. Each keeps its folder name, because presets find fonts by it; a font whose
   * folder name is already here is left out and nothing of it is replaced. A font arrives whole or not at all.
   */
  async importPack(file: string, onLine?: (line: string) => void, passphrase?: string, adoptMakers?: (carried: CarriedContributor[]) => Promise<string[]>): Promise<ImportResult> {
    await this.ready();
    const result: ImportResult = { added: [], skipped: [] };
    const pack = await openLibraryPack(file, passphrase);
    const staging = join(this.root, `.incoming-${Date.now().toString(36)}`);
    try {
      const index = await this.readIndex();
      for (const [i, font] of pack.list.fonts.entries()) {
        // Names from the file are never trusted as paths: one plain name per folder level, nothing that climbs out.
        const plain = (p: string) => !!p && p !== '.' && p !== '..' && !/[\\/:*?"<>|\0]/.test(p);
        const okName = plain(font.folder) && !font.folder.startsWith('.') && font.folder !== INDEX_FILE && font.folder !== MAKERS_DIR;
        const okFiles = font.files.every((f) => !isJunk(f.path) && f.path.split('/').every(plain));
        if (!okName || !okFiles) throw new Error(NOT_A_PACK);
        const dest = join(this.root, font.folder);
        const have = (await taken(dest)) || !!index[font.folder];
        onLine?.(have ? `Already here: ${font.folder}` : `Adding ${i + 1} of ${pack.list.fonts.length}: ${font.meta.name}…`);
        const tmp = join(staging, font.folder);
        for (const f of font.files) {
          // Read even when the font is left out: the file is read in order.
          const data = await pack.next();
          if (have) continue;
          const to = join(tmp, ...f.path.split('/'));
          await mkdir(dirname(to), { recursive: true });
          await writeFile(to, data);
        }
        if (have) { result.skipped.push({ name: font.folder, why: 'a font with this folder name is already in the library', reason: 'have' }); continue; }
        await mkdir(tmp, { recursive: true });
        await rename(tmp, dest);
        await this.store.update((s) => { s.fonts[font.folder] = font.meta; });
        result.added.push(font.folder);
      }
      // The makers' logos and links come last and are an extra: if they cannot be read or kept, the fonts still count.
      if (adoptMakers && pack.list.makers?.length) {
        try {
          const carried: CarriedContributor[] = [];
          for (const m of pack.list.makers) carried.push({ name: m.name, ...(m.url ? { url: m.url } : {}), ...(m.logo ? { logo: { ext: m.logo.ext, data: await pack.next() } } : {}) });
          const gained = await adoptMakers(carried);
          if (gained.length) result.makers = gained;
        } catch (err) { console.warn(`[fonts] the makers' logos and links in ${basename(file)} were not brought in: ${String(err)}`); }
      }
    } finally {
      await pack.close().catch(() => undefined);
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
    return result;
  }

  /**
   * Whether the library can move to `next`: refused when `next` is the library folder, inside it, or holds it; and
   * which fonts' folder names are already taken there (on disk or in its details file).
   */
  async planMove(next: string): Promise<{ refused: string | null; clashes: string[] }> {
    if (same(next, this.root)) return { refused: 'That folder is already the font library.', clashes: [] };
    if (inside(this.root, next)) return { refused: 'That folder is inside the font library, so the library cannot move into it. Choose a folder outside it.', clashes: [] };
    if (inside(next, this.root)) return { refused: 'That folder holds the font library, so its fonts would be mixed with other files. Choose an empty folder or one that is only for fonts.', clashes: [] };
    let theirs: Record<string, unknown> = {};
    try { theirs = cleanIndex(JSON.parse(await readFile(join(next, INDEX_FILE), 'utf8')))?.value.fonts ?? {}; } catch { /* none, or unreadable: the disk decides */ }
    const clashes: string[] = [];
    for (const n of await this.fontFolders()) if ((await taken(join(next, n))) || theirs[n]) clashes.push(n);
    return { refused: null, clashes };
  }

  /** Folders a move carries: everything but hidden folders and the old logos folder. */
  private async fontFolders(): Promise<string[]> {
    if (!(await isDir(this.root))) return [];
    const out: string[] = [];
    for (const n of (await readdir(this.root)).sort()) if (!n.startsWith('.') && n !== MAKERS_DIR && (await isDir(join(this.root, n)))) out.push(n);
    return out;
  }

  /**
   * Point the library at another folder. With `move`, the fonts here go with it one by one, each with its details (a
   * rename on the same drive, a copy then delete otherwise); `keepBack` fonts stay where they are. Nothing is renamed
   * or overwritten. If a font cannot be moved, this stops, says which fonts moved, and the library stays here.
   */
  async moveTo(next: string, move: boolean, onLine?: (line: string) => void, opts: { keepBack?: string[] } = {}): Promise<void> {
    if (move && !same(next, this.root)) {
      const plan = await this.planMove(next);
      if (plan.refused) throw new Error(plan.refused);
      await mkdir(next, { recursive: true });
      const keep = new Set(opts.keepBack ?? []);
      const target = new FontLibrary(next, this.trash);
      const todo = (await this.fontFolders()).filter((n) => !keep.has(n));
      const moved: string[] = [];
      for (const n of todo) {
        try {
          if (await taken(join(next, n))) throw new Error(`something named ${n} is already there`);
          onLine?.(`Moving ${n}…`);
          const from = join(this.root, n);
          try { await rename(from, join(next, n)); } catch { await this.copyAcross(from, next, n); }
        } catch (err) {
          throw new Error(`Moved ${moved.length} of ${todo.length} fonts to ${next}${moved.length ? ` (${moved.join(', ')})` : ''}; ${n} could not be moved: ${err instanceof Error ? err.message : String(err)}. The library is still at ${this.root}.`);
        }
        const meta = (await this.readIndex())[n];
        if (meta) {
          await target.store.update((f) => { f.fonts[n] = meta; });
          await this.store.update((f) => { delete f.fonts[n]; });
        }
        this.cache.delete(n);
        moved.push(n);
      }
      await this.moveLogos(next, target);
      if (!keep.size) await rm(join(this.root, INDEX_FILE), { force: true });
    } else {
      await mkdir(next, { recursive: true });
    }
    this.setRoot(next);
  }

  /**
   * Copy one font to another drive under a hidden name, rename it to its own name once whole, then remove the
   * original. A copy that fails part way is removed, so a retry finds no clash and nothing half there is kept as the
   * font (issue #22).
   */
  private async copyAcross(from: string, next: string, n: string): Promise<void> {
    const tmp = join(next, `.moving-${n}`);
    try {
      await rm(tmp, { recursive: true, force: true });
      await cp(from, tmp, { recursive: true, errorOnExist: true, force: false });
      await rename(tmp, join(next, n));
    } catch (err) {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
    await rm(from, { recursive: true, force: true });
  }

  /** Old logos go to the new folder's own logos folder; one already there is kept, and ours stays where it was. */
  private async moveLogos(next: string, target: FontLibrary): Promise<void> {
    const from = join(this.root, MAKERS_DIR);
    const { makers } = await this.store.read();
    if (await isDir(from)) {
      const to = join(next, MAKERS_DIR);
      await mkdir(to, { recursive: true });
      for (const f of await readdir(from)) {
        if (await stat(join(to, f)).then(() => true, () => false)) continue;
        await cp(join(from, f), join(to, f), { recursive: true, force: false, errorOnExist: false });
        await rm(join(from, f), { recursive: true, force: true });
      }
      await rmdir(from).catch(() => undefined);
    }
    await target.store.update((t) => { for (const [k, v] of Object.entries(makers)) if (!Object.keys(t.makers).some((x) => x.toLowerCase() === k.toLowerCase())) t.makers[k] = v; });
  }

  /** Use another folder as the library as it is (no move), e.g. once the owner has found where it went. */
  setRoot(root: string): void {
    this.root = root;
    this.makeStore();
    this.cache.clear();
  }

  forget(): void { this.makeStore(); this.cache.clear(); }
}
