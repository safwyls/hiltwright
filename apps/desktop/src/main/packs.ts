// Packs on this computer: those shipped beside the app, and those the owner dropped into their packs folder.

import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { decodeMesh, readItem, readManifest, type PackManifest, type PackedMesh } from './hwpack';

export interface PackInfo extends Omit<PackManifest, 'items'> { file: string; sounds: number }

function packDirs(): string[] {
  const dirs = [join(app.getPath('userData'), 'packs')];
  // Shipped with the app (resources/packs in a build), or the repo's packs folder in development.
  dirs.push(app.isPackaged ? join(process.resourcesPath, 'packs') : join(app.getAppPath(), '..', '..', 'packs'));
  if (process.env.HILTWRIGHT_PACKS) dirs.push(process.env.HILTWRIGHT_PACKS);
  return dirs;
}

export async function userPacksDir(): Promise<string> { const d = join(app.getPath('userData'), 'packs'); await mkdir(d, { recursive: true }); return d; }

const cache = new Map<string, { file: Buffer; manifest: PackManifest; itemsStart: number }>();
async function load(file: string) {
  const hit = cache.get(file);
  if (hit) return hit;
  const buf = await readFile(file);
  const { manifest, itemsStart } = readManifest(buf);
  const entry = { file: buf, manifest, itemsStart };
  cache.set(file, entry);
  return entry;
}

export async function listPacks(): Promise<PackInfo[]> {
  const out: PackInfo[] = [];
  const seen = new Set<string>();
  for (const dir of packDirs()) {
    let names: string[] = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const n of names) {
      if (!/\.hwpack$/i.test(n)) continue;
      try {
        const { manifest } = await load(join(dir, n));
        if (seen.has(manifest.id)) continue;
        seen.add(manifest.id);
        const { items, ...rest } = manifest;
        out.push({ ...rest, file: join(dir, n), sounds: items.filter((i) => i.kind === 'wav').length });
      } catch (err) { console.log(`[packs] ${n}: ${String(err)}`); }
    }
  }
  return out;
}

async function find(id: string) {
  for (const p of await listPacks()) if (p.id === id) return load(p.file);
  throw new Error(`No pack ${id}`);
}

export async function packMesh(id: string): Promise<PackedMesh & { fit: PackManifest['fit']; name: string; creator: string }> {
  const { file, manifest, itemsStart } = await find(id);
  const item = manifest.items.find((i) => i.kind === 'mesh');
  if (!item) throw new Error('That pack has no mesh');
  return { ...decodeMesh(readItem(file, manifest, itemsStart, item)), fit: manifest.fit, name: manifest.name, creator: manifest.creator };
}

export async function packFont(id: string): Promise<{ name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string>; bytes: number; skipped: number }> {
  const { file, manifest, itemsStart } = await find(id);
  if (!manifest.allow.demoPlayback) throw new Error('The creator has not allowed this font to be played here');
  const files: Record<string, ArrayBuffer> = {};
  let bytes = 0;
  for (const item of manifest.items) {
    if (item.kind !== 'wav') continue;
    const b = readItem(file, manifest, itemsStart, item);
    const copy = new ArrayBuffer(b.byteLength); new Uint8Array(copy).set(b);
    files[item.name] = copy;
    bytes += b.length;
  }
  return { name: manifest.name, files, ini: manifest.ini ?? {}, smoothsw: manifest.smoothsw ?? {}, bytes, skipped: 0 };
}
