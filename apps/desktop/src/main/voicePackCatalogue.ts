// The voice packs Hiltwright offers (resources/voicepack/catalogue.json, made by scripts/voicepacks.ts): NoSloppy's
// packs, credited to him. One ships beside the app; the rest are fetched from the catalogue's GitHub release when the
// owner picks one, and kept in the data folder for next time. Every zip must have the size and SHA-256 the catalogue
// gives, whether it came with the app or was downloaded, or it is not used.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VoicePackCatalogue, VoicePackCataloguePack, VoicePackChoice } from '../shared/api';

const ASSET = /^[a-z0-9-]{1,80}\.zip$/;

/** The catalogue beside the app, checked for shape; null when this build has none. */
export async function readCatalogue(dir: string): Promise<VoicePackCatalogue | null> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(join(dir, 'catalogue.json'), 'utf8')); } catch { return null; }
  const c = raw as Partial<VoicePackCatalogue>;
  if (!c || typeof c.baseUrl !== 'string' || !/^https:\/\//.test(c.baseUrl) || !Array.isArray(c.packs)) return null;
  const packs = c.packs.filter((p): p is VoicePackCataloguePack => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.asset === 'string' && ASSET.test(p.asset)
    && typeof p.sha256 === 'string' && /^[0-9a-f]{64}$/.test(p.sha256) && Number.isFinite(p.assetBytes) && Number.isFinite(p.version));
  return { release: String(c.release ?? ''), baseUrl: c.baseUrl, bundled: String(c.bundled ?? ''), credit: String(c.credit ?? ''), support: String(c.support ?? ''), source: String(c.source ?? ''), packs };
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** The pack's zip if it is at `file` with the catalogue's size and hash. */
async function matching(file: string, p: VoicePackCataloguePack): Promise<boolean> {
  try { const b = await readFile(file); return b.length === p.assetBytes && sha256(b) === p.sha256; } catch { return false; }
}

/** Every pack, and whether it came with the app or was downloaded before. Only the size is checked here; the hash is checked before use. */
export async function listChoices(cat: VoicePackCatalogue, resDir: string, cacheDir: string): Promise<VoicePackChoice[]> {
  const sized = async (f: string, n: number) => { try { return (await stat(f)).size === n; } catch { return false; } };
  return Promise.all(cat.packs.map(async (p) => ({
    ...p,
    have: p.id === cat.bundled && await sized(join(resDir, p.asset), p.assetBytes) ? 'bundled' as const : await sized(join(cacheDir, p.asset), p.assetBytes) ? 'downloaded' as const : null,
  })));
}

export type Fetcher = (url: string, onBytes: (got: number, total: number) => void) => Promise<Buffer>;

/** A download held in memory (packs are under 40 MB), with progress, that gives up after five quiet minutes. */
export const fetchBytes: Fetcher = async (url, onBytes) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}). Check the internet connection, then try again.`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const parts: Buffer[] = []; let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value)); got += value.length;
    onBytes(got, total);
  }
  return Buffer.concat(parts);
};

/**
 * The zip for pack `id` on this computer: the one beside the app, one downloaded before, or a fresh download from the
 * release. A file that does not match the catalogue is removed and never used.
 */
export async function voicePackFile(cat: VoicePackCatalogue, id: string, o: { resDir: string; cacheDir: string; onBytes?: (got: number, total: number) => void; fetcher?: Fetcher }): Promise<{ file: string; pack: VoicePackCataloguePack }> {
  const p = cat.packs.find((x) => x.id === id);
  if (!p) throw new Error('Hiltwright does not know that voice pack');
  if (p.id === cat.bundled && await matching(join(o.resDir, p.asset), p)) return { file: join(o.resDir, p.asset), pack: p };
  const cached = join(o.cacheDir, p.asset);
  if (await matching(cached, p)) return { file: cached, pack: p };
  await rm(cached, { force: true });
  const data = await (o.fetcher ?? fetchBytes)(cat.baseUrl + p.asset, (got, total) => o.onBytes?.(got, total || p.assetBytes));
  if (data.length !== p.assetBytes || sha256(data) !== p.sha256) throw new Error(`The downloaded ${p.name} voice pack is not the file Hiltwright expects, so it was not used. Try again later.`);
  await mkdir(o.cacheDir, { recursive: true });
  await writeFile(`${cached}.part`, data);
  await rename(`${cached}.part`, cached);
  return { file: cached, pack: p };
}
