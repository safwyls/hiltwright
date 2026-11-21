import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listChoices, readCatalogue, voicePackFile } from '../src/main/voicePackCatalogue';
import type { VoicePackCatalogue, VoicePackCataloguePack } from '../src/shared/api';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const tmp = (p: string) => mkdtemp(join(tmpdir(), p));

const bundledZip = Buffer.from('bundled pack bytes');
const otherZip = Buffer.from('a pack from the release');
const pack = (id: string, data: Buffer): VoicePackCataloguePack => ({ id, name: id, group: 'Characters', author: 'NoSloppy', year: 2024, about: '', version: 2, files: 200, bytes: 1, asset: `${id}.zip`, assetBytes: data.length, sha256: sha(data), picture: null });
const catalogue = (): VoicePackCatalogue => ({ release: 'voicepacks-1', baseUrl: 'https://example.test/rel/', bundled: 'english-a', credit: 'Voice packs by Somebody.', support: 'https://example.test/coffee', source: 'https://example.test/thread', packs: [pack('english-a', bundledZip), pack('yoda', otherZip)] });

describe('voice pack catalogue', () => {
  it('reads the catalogue beside the app, dropping entries that are not well formed', async () => {
    const dir = await tmp('hw-vpcat-');
    expect(await readCatalogue(dir)).toBeNull();
    const c = catalogue();
    await writeFile(join(dir, 'catalogue.json'), JSON.stringify({ ...c, packs: [...c.packs, { ...pack('bad', otherZip), asset: '../escape.zip' }, { ...pack('short', otherZip), sha256: 'abc' }] }));
    expect((await readCatalogue(dir))?.packs.map((p) => p.id)).toEqual(['english-a', 'yoda']);
    await writeFile(join(dir, 'catalogue.json'), JSON.stringify({ ...c, baseUrl: 'http://example.test/' }));
    expect(await readCatalogue(dir)).toBeNull();
  });

  it('says which packs this computer has: the bundled one, and ones downloaded before', async () => {
    const res = await tmp('hw-vpres-'); const cache = await tmp('hw-vpcache-');
    await writeFile(join(res, 'english-a.zip'), bundledZip);
    expect((await listChoices(catalogue(), res, cache)).map((p) => p.have)).toEqual(['bundled', null]);
    await writeFile(join(cache, 'yoda.zip'), otherZip);
    expect((await listChoices(catalogue(), res, cache)).map((p) => p.have)).toEqual(['bundled', 'downloaded']);
  });

  it('uses the bundled zip without a download, and downloads any other once, keeping it', async () => {
    const res = await tmp('hw-vpres-'); const cache = await tmp('hw-vpcache-');
    await writeFile(join(res, 'english-a.zip'), bundledZip);
    const fetched: string[] = [];
    const fetcher = async (url: string, onBytes: (g: number, t: number) => void) => { fetched.push(url); onBytes(otherZip.length, otherZip.length); return otherZip; };
    expect((await voicePackFile(catalogue(), 'english-a', { resDir: res, cacheDir: cache, fetcher })).file).toBe(join(res, 'english-a.zip'));
    const seen: number[] = [];
    const got = await voicePackFile(catalogue(), 'yoda', { resDir: res, cacheDir: cache, fetcher, onBytes: (g) => seen.push(g) });
    expect(got.file).toBe(join(cache, 'yoda.zip'));
    expect(await readFile(got.file)).toEqual(otherZip);
    expect(fetched).toEqual(['https://example.test/rel/yoda.zip']);
    expect(seen).toEqual([otherZip.length]);
    await voicePackFile(catalogue(), 'yoda', { resDir: res, cacheDir: cache, fetcher });
    expect(fetched).toHaveLength(1);
  });

  it('refuses a download that is not the file the catalogue names, and keeps nothing of it', async () => {
    const res = await tmp('hw-vpres-'); const cache = await tmp('hw-vpcache-');
    const fetcher = async () => Buffer.from('something else entirely');
    await expect(voicePackFile(catalogue(), 'yoda', { resDir: res, cacheDir: cache, fetcher })).rejects.toThrow(/not the file Hiltwright expects/);
    expect(await readdir(cache)).toEqual([]);
    // A cached file that was changed is fetched again, not used.
    await writeFile(join(cache, 'yoda.zip'), Buffer.from('tampered'));
    let calls = 0;
    await voicePackFile(catalogue(), 'yoda', { resDir: res, cacheDir: cache, fetcher: async () => { calls++; return otherZip; } });
    expect(calls).toBe(1);
    await expect(voicePackFile(catalogue(), 'nope', { resDir: res, cacheDir: cache, fetcher })).rejects.toThrow(/does not know/);
    expect(existsSync(join(cache, 'yoda.zip.part'))).toBe(false);
  });
});
