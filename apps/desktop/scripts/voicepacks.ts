// The Fett263 voice packs Hiltwright offers: NoSloppy's (Brian Conner) packs from the Crucible thread "Additional
// Voicepacks", bundled with his permission (2026-11-21) and credited to him. Run with Node 24 (it strips the types):
//
//   node scripts/voicepacks.ts build <folder of downloaded zips> [--out ../../packs/voicepacks-release] [--bundle english-a]
//   node scripts/voicepacks.ts --check
//
// build: each downloaded zip (one Dropbox folder) can hold several packs (the defaults in 20 languages, TRON's three,
// 7th Sister masked and unmasked). Every folder with a voicepack.ini of version 2 or more becomes one pack: a zip of
// its common folder plus its readme and picture, written the same way every time so its SHA-256 is stable. Older
// packs are left out (the Fett263 controls need version 2). It writes the release assets to --out, the catalogue to
// resources/voicepack/catalogue.json (names, credits, sizes, hashes, a small picture each), and copies the bundled
// pack to resources/voicepack/. Upload the assets to the GitHub release named in the catalogue.
//
// --check (npm run dist): the bundled pack must be in resources/voicepack with the catalogue's hash; it is
// downloaded from the release when missing.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { extractZip, listZip, type ZipEntry } from '../src/main/unzip.ts';
import type { VoicePackCatalogue, VoicePackCataloguePack } from '../src/shared/api.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');
const RES = join(DESKTOP, 'resources', 'voicepack');
const CATALOGUE = join(RES, 'catalogue.json');
const RELEASE = 'voicepacks-1';
const BASE_URL = `https://github.com/safwyls/hiltwright/releases/download/${RELEASE}/`;
const NEED = 2;
/** Packs NoSloppy's permission does not cover alone, by id, with why. */
const LEAVE_OUT: Record<string, string> = {
  huyang: 'a package by KSith Saber Fonts with NoSloppy\'s V2 additions; needs KSith\'s permission too',
};

type CataloguePack = VoicePackCataloguePack;
type Catalogue = VoicePackCatalogue;
const CREDIT = 'Voice packs by Brian Conner (NoSloppy), included with his permission.';

const [, , mode, target, ...rest] = process.argv;
const opts: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); opts[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true'; }

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const skip = (n: string) => n.split('/').includes('__MACOSX');

/** A stored (uncompressed: wavs barely shrink) zip with fixed dates, entries sorted, so the same pack gives the same bytes. */
function storeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const f of sorted) {
    const n = Buffer.from(f.name, 'utf8'); const sum = crc32(f.data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); // 1980-01-01 00:00
    lh.writeUInt32LE(sum, 14); lh.writeUInt32LE(f.data.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(sum, 16); ch.writeUInt32LE(f.data.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, f.data); central.push(ch, n); offset += 30 + n.length + f.data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** "ProffieOS_V2_Voicepack_7th_Sister - NoSloppy 2024" and what follows, minus the support link and thanks. */
function readReadme(text: string): { title: string | null; author: string | null; year: number | null; about: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const first = lines.find(Boolean) ?? '';
  const m = /^(.*?)\s+-\s+(.*?)\s*(\d{4})?\s*$/.exec(first);
  const about = lines.slice(lines.indexOf(first) + 1)
    .filter((l) => l && !/https?:\/\//i.test(l) && !/contribute|buy ?me ?a ?coffee|^thanks!?$|feeling kind/i.test(l))
    .join(' ').replace(/\s+/g, ' ').slice(0, 280);
  return { title: m ? m[1].trim() : first || null, author: m ? m[2].trim() || null : null, year: m?.[3] ? Number(m[3]) : null, about };
}

/** "ProffieOS_V2_Voicepack_Qui-Gon_V2" → "Qui-Gon"; "ChineseA" → "Chinese A"; "Malgus2" → "Malgus". */
const cleanName = (s: string) => s.replace(/^ProffieOS_(V2_)?Voicepacks?_(V2_)?/i, '').replace(/^\d+_pack_/i, '').replace(/_/g, ' ').replace(/\s+V2$/i, '')
  .replace(/^(Chinese|Japanese|English|French|Spanish|Italian|Russian)([A-Z])$/, '$1 $2').replace(/^Malgus2$/, 'Malgus').replace(/\s+/g, ' ').trim();

function thumbnails(pairs: { src: string; dst: string }[]): void {
  if (!pairs.length) return;
  const list = join(mkdtempSync(join(tmpdir(), 'hw-thumbs-')), 'list.txt');
  writeFileSync(list, pairs.map((p) => `${p.src}\t${p.dst}`).join('\n'));
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'voicepack-thumb.ps1'), '-ListFile', list], { stdio: 'inherit' });
}

async function build(downloads: string): Promise<void> {
  const out = resolve(opts.out ?? join(DESKTOP, '..', '..', 'packs', 'voicepacks-release'));
  const bundle = opts.bundle ?? 'english-a';
  mkdirSync(out, { recursive: true }); mkdirSync(RES, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'hw-voicepacks-'));
  const packs: CataloguePack[] = []; const fingerprints = new Map<string, string>(); const left: string[] = [];
  const thumbJobs: { src: string; dst: string; id: string }[] = [];
  try {
    for (const zipName of readdirSync(downloads).filter((n) => /\.zip$/i.test(n)).sort()) {
      const zipFile = join(downloads, zipName);
      const entries = (await listZip(zipFile)).filter((e) => !skip(e.name));
      const files = entries.filter((e) => !e.name.endsWith('/'));
      const fromDefaults = /default/i.test(zipName);
      // Each folder holding a voicepack.ini is a pack; an outer folder holding another pack's is not.
      const iniDirs = files.filter((e) => /(^|\/)voicepack\.ini$/i.test(e.name)).map((e) => e.name.slice(0, e.name.length - 'voicepack.ini'.length));
      const mnumDirs = [...new Set(files.map((e) => { const p = e.name.split('/'); const i = p.findIndex((x) => /^mnum(\d*\.wav)?$/i.test(x)); return i >= 0 ? p.slice(0, i).map((x) => `${x}/`).join('') : null; }).filter((x): x is string => x != null))];
      for (const d of mnumDirs) if (!iniDirs.includes(d)) left.push(`${zipName}: ${d || '(top)'} has no voicepack.ini (version 1)`);
      const dir = join(work, slug(zipName));
      await extractZip(zipFile, dir, (n) => !skip(n));
      const zipTitle = cleanName(basename(zipName, '.zip'));
      for (const packDir of iniDirs) {
        const ini = readFileSync(join(dir, ...packDir.split('/').filter(Boolean), 'voicepack.ini'), 'utf8');
        const version = Number(/voice_pack_version\s*=\s*(\d+)/i.exec(ini)?.[1] ?? 1);
        if (version < NEED) { left.push(`${zipName}: ${packDir || '(top)'} is version ${version}`); continue; }
        const root = /(^|\/)common\/$/i.test(packDir) ? packDir.replace(/common\/$/i, '') : packDir;
        const near = (re: RegExp) => [root, packDir, ''].map((d) => files.find((e) => e.name.startsWith(d) && !e.name.slice(d.length).includes('/') && re.test(basename(e.name)))).find(Boolean) as ZipEntry | undefined;
        const readme = near(/readme.*\.txt$/i);
        const picture = near(/\.(jpe?g|png)$/i);
        const info = readme ? readReadme(readFileSync(join(dir, ...readme.name.split('/')), 'utf8')) : { title: null, author: null, year: null, about: '' };
        const rootName = root.split('/').filter(Boolean).pop() ?? '';
        // Named as the forum's index names it (the Dropbox folder): a pack in a folder named like a pack by that folder,
        // one in a folder like "Masked" as a variant of the zip's pack.
        const name = /voicepack/i.test(rootName) ? cleanName(rootName) : rootName ? `${zipTitle} (${rootName.replace(/_/g, ' ')})` : zipTitle;
        const id = slug(name);
        if (LEAVE_OUT[id]) { left.push(`${zipName}: ${name} left out: ${LEAVE_OUT[id]}`); continue; }
        // The plain defaults carry a licence file instead of a readme: "Edit Mode Menu Prompts Copyright (c) 2021 Brian Conner".
        if (!readme) {
          const lic = files.find((e) => e.name.startsWith(packDir) && /^licen[cs]e\.txt$/i.test(basename(e.name)));
          const text = lic ? readFileSync(join(dir, ...lic.name.split('/')), 'utf8') : '';
          const cr = /Copyright \(c\) (\d{4}) ([^\r\n]+)/i.exec(text);
          if (cr) { info.year = Number(cr[1]); info.author = cr[2].trim() === 'Brian Conner' ? 'NoSloppy' : cr[2].trim(); }
          if (/Creative Commons Attribution 4\.0/i.test(text)) info.about = 'Text-to-speech menu prompts, shared under Creative Commons Attribution 4.0.';
        }
        const packFiles = files.filter((e) => e.name.startsWith(packDir)).map((e) => ({ name: `common/${e.name.slice(packDir.length)}`, data: readFileSync(join(dir, ...e.name.split('/'))) }));
        if (readme) packFiles.push({ name: `a_ReadMe.txt`, data: readFileSync(join(dir, ...readme.name.split('/'))) });
        if (picture) packFiles.push({ name: `a_${basename(picture.name)}`, data: readFileSync(join(dir, ...picture.name.split('/'))) });
        const fingerprint = sha(Buffer.from(packFiles.filter((f) => f.name.startsWith('common/')).map((f) => `${f.name}:${sha(f.data)}`).sort().join('\n')));
        const twin = [...fingerprints].find(([, f]) => f === fingerprint)?.[0];
        if (twin) { left.push(`${zipName}: ${name} is the same pack as ${twin}`); continue; }
        if (fingerprints.has(id)) { left.push(`${zipName}: ${name} differs from the one already listed under that name; kept the first`); continue; }
        fingerprints.set(id, fingerprint);
        const asset = `${id}.zip`;
        const zip = storeZip(packFiles);
        writeFileSync(join(out, asset), zip);
        const common = packFiles.filter((f) => f.name.startsWith('common/'));
        packs.push({
          id, name, group: fromDefaults ? 'Proffie voices' : 'Characters', author: info.author ?? 'NoSloppy', year: info.year, about: info.about,
          version, files: common.length, bytes: common.reduce((a, f) => a + f.data.length, 0), asset, assetBytes: zip.length, sha256: sha(zip), picture: null,
        });
        if (picture) thumbJobs.push({ src: join(dir, ...picture.name.split('/')), dst: join(work, `${id}.thumb.jpg`), id });
        console.log(`${name.padEnd(34)} v${version} ${common.length} files ${(zip.length / 1e6).toFixed(1)} MB`);
      }
    }
    thumbnails(thumbJobs);
    for (const t of thumbJobs) { const p = packs.find((x) => x.id === t.id); if (p && existsSync(t.dst)) p.picture = `data:image/jpeg;base64,${readFileSync(t.dst).toString('base64')}`; }
  } finally { rmSync(work, { recursive: true, force: true }); }
  packs.sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group === 'Proffie voices' ? -1 : 1));
  if (!packs.some((p) => p.id === bundle)) throw new Error(`--bundle ${bundle} is not one of the packs`);
  const catalogue: Catalogue = { release: RELEASE, baseUrl: BASE_URL, bundled: bundle, credit: CREDIT, support: 'https://www.buymeacoffee.com/BrianConner', source: 'https://crucible.hubbe.net/t/additional-voicepacks/4227', packs };
  writeFileSync(CATALOGUE, `${JSON.stringify(catalogue, null, 1)}\n`);
  for (const n of readdirSync(RES)) if (/\.zip$/i.test(n)) rmSync(join(RES, n));
  copyFileSync(join(out, `${bundle}.zip`), join(RES, `${bundle}.zip`));
  console.log(`\n${packs.length} packs, ${(packs.reduce((a, p) => a + p.assetBytes, 0) / 1e9).toFixed(2)} GB, in ${out}`);
  console.log(`bundled: ${bundle}.zip; catalogue: ${CATALOGUE}`);
  if (left.length) console.log(`\nLeft out:\n  ${left.join('\n  ')}`);
}

async function check(): Promise<void> {
  const cat = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as Catalogue;
  const p = cat.packs.find((x) => x.id === cat.bundled);
  if (!p) throw new Error(`The catalogue's bundled pack ${cat.bundled} is not in it`);
  const file = join(RES, p.asset);
  if (!existsSync(file) || sha(readFileSync(file)) !== p.sha256) {
    console.log(`voicepacks: fetching ${p.asset} from ${cat.baseUrl}`);
    const res = await fetch(cat.baseUrl + p.asset);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${cat.baseUrl + p.asset}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (sha(data) !== p.sha256) throw new Error(`${p.asset} from the release does not match the catalogue's SHA-256`);
    writeFileSync(file, data);
  }
  for (const n of readdirSync(RES)) if (/\.zip$/i.test(n) && n !== p.asset) throw new Error(`resources/voicepack/${n} is not the bundled pack; remove it`);
  console.log(`voicepacks: ${p.asset} ok (${cat.packs.length} packs in the catalogue)`);
}

if (mode === 'build' && target) await build(resolve(target));
else if (mode === '--check') await check();
else { console.error('usage: node scripts/voicepacks.ts build <downloads> [--out dir] [--bundle id] | --check'); process.exit(2); }
