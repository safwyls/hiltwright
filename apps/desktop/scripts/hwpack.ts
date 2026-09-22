// Make .hwpack files. Run with Node 24 (it strips the types itself):
//
//   node scripts/hwpack.ts hilt <file.obj> --name "Exar Kun" --creator "Name" --licence "All rights reserved" [--id exar-kun] [--fit '{"rollDeg":90}'] [--finish 'Opaque(196,197,196)=chrome;Opaque(75,75,75)=anodised'] --out ../../packs
//   finishes: chrome, polished, brushed, satin, anodised, brass, paint, plastic
//   node scripts/hwpack.ts font <folder>   --creator "ProffieOS" --licence "CC BY-SA 4.0" [--copy] --out ../../packs
//   node scripts/hwpack.ts show <file.hwpack>
//   node scripts/hwpack.ts credit <file.hwpack> --creator "Name" [--licence "..."]   (rewrites the plain manifest in place)
//
// A hilt takes the .mtl beside the .obj. --copy allows copying a font to a card; without it the app only plays it.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { writePack, readManifest, objToMesh, encodeMesh, type PackManifest } from '../src/main/hwpack.ts';

const [, , mode, target, ...rest] = process.argv;
const opts: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); opts[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true'; }

const slug = (s: string) => s.toLowerCase().replace(/_hiltwright$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const need = (k: string) => { if (!opts[k]) { console.error(`--${k} is required`); process.exit(2); } return opts[k]; };

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line); if (m) out[m[1]] = m[2]; }
  return out;
}

if (mode === 'credit') {
  // The manifest is plain JSON ahead of the encrypted items, so a credit can change without rebuilding the pack.
  const file = readFileSync(target);
  const { manifest } = readManifest(file);
  const len = file.readUInt32LE(5);
  if (opts.creator) manifest.creator = opts.creator;
  if (opts.licence) manifest.licence = opts.licence;
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  const head = Buffer.alloc(9); file.copy(head, 0, 0, 5); head.writeUInt32LE(json.length, 5);
  writeFileSync(target, Buffer.concat([head, json, file.subarray(9 + len)]));
  console.log(`${target}: ${manifest.name} by ${manifest.creator}, ${manifest.licence}`);
  process.exit(0);
}

if (mode === 'show') {
  const { manifest } = readManifest(readFileSync(target));
  const { items, ...rest } = manifest;
  console.log(JSON.stringify(rest, null, 2));
  console.log(`${items.length} items, ${(items.reduce((a, i) => a + i.bytes, 0) / 1048576).toFixed(1)} MB unpacked`);
  process.exit(0);
}

const outDir = opts.out ?? '.';
mkdirSync(outDir, { recursive: true });

if (mode === 'hilt') {
  const objPath = target;
  const mtlPath = opts.mtl ?? objPath.replace(/\.obj$/i, '.mtl');
  const name = opts.name ?? basename(objPath, extname(objPath)).replace(/_Hiltwright$/i, '');
  const id = opts.id ?? slug(name);
  console.log(`reading ${objPath}`);
  const finishes: Record<string, string> = {};
  for (const pair of (opts.finish ?? '').split(';').filter(Boolean)) { const at = pair.lastIndexOf('='); if (at > 0) finishes[pair.slice(0, at).trim()] = pair.slice(at + 1).trim(); }
  const mesh = objToMesh(readFileSync(objPath, 'utf8'), (() => { try { return readFileSync(mtlPath, 'utf8'); } catch { return ''; } })(), finishes);
  console.log(`  ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles, ${mesh.groups.length} materials`);
  for (const g of mesh.groups) console.log(`  ${g.name.padEnd(24)} ${g.count / 3} tris  rgb(${g.color.map((c) => Math.round(c * 255)).join(',')})  metal ${g.metalness} rough ${g.roughness}${finishes[g.name] ? `  (${finishes[g.name]})` : ''}`);
  const manifest: Omit<PackManifest, 'items' | 'packed'> = {
    id, kind: 'hilt', name, creator: need('creator'), licence: need('licence'),
    allow: { copyToCard: false, demoPlayback: true },
    fit: opts.fit ? JSON.parse(opts.fit) : {},
  };
  const out = join(outDir, `${id}.hwpack`);
  writeFileSync(out, writePack(manifest, [{ name: 'mesh', kind: 'mesh', data: encodeMesh(mesh) }]));
  console.log(`wrote ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB)`);
} else if (mode === 'font') {
  const dir = target;
  const name = opts.name ?? basename(dir);
  const id = opts.id ?? `font-${slug(name)}`;
  const PLAYABLE = /^(hum|humm|out|poweron|in|poweroff|clsh|clash|blst|blaster|stab|force|font|boot|lock|lockup|bgnlock|endlock|drag|bgndrag|enddrag|lb|bgnlb|endlb|swingl|swingh|lswing|hswing|swng|swing)$/i;
  const items: { name: string; kind: 'wav' | 'ini'; data: Buffer }[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isFile() && /\.wav$/i.test(f) && PLAYABLE.test(f.replace(/\d*\.wav$/i, ''))) items.push({ name: f, kind: 'wav', data: readFileSync(p) });
    else if (st.isDirectory() && PLAYABLE.test(f)) for (const g of readdirSync(p)) if (/\.wav$/i.test(g)) items.push({ name: `${f}/${g}`, kind: 'wav', data: readFileSync(join(p, g)) });
  }
  const read = (f: string) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } };
  const manifest: Omit<PackManifest, 'items' | 'packed'> = {
    id, kind: 'font', name, creator: need('creator'), licence: need('licence'),
    allow: { copyToCard: opts.copy === 'true', demoPlayback: true },
    ini: parseIni(read('config.ini')), smoothsw: parseIni(read('smoothsw.ini')),
  };
  const out = join(outDir, `${id}.hwpack`);
  writeFileSync(out, writePack(manifest, items));
  console.log(`wrote ${out}: ${items.length} sounds, ${(statSync(out).size / 1048576).toFixed(1)} MB`);
} else {
  console.error('usage: hwpack.ts hilt <file.obj> | font <folder> | show <file.hwpack>');
  process.exit(2);
}
