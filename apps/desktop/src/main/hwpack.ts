// The .hwpack format: assets for Hiltwright (hilt meshes, sound fonts) that stay unreadable on disk.
//
//   "HWPK" | u8 version | u32 manifest length | manifest JSON (plain) | items...
//   item: u32 length | 12-byte nonce | 16-byte tag | ciphertext (deflated bytes, AES-256-GCM)
//
// The manifest is readable so the app can list packs, show credits and terms, and honour "no copying to a card"
// without touching the payload. Each item is encrypted with a key derived from the app key and the pack id, so
// items are decrypted one at a time into memory and never written out. This stops files being lifted from the
// install folder or a card; it does not stop a debugger, and Hiltwright says so to creators.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const HWPACK_VERSION = 1;
const MAGIC = Buffer.from('HWPK');
// Known to anyone who reads this file; that is the nature of a key an app carries. It stops casual copying, no more.
const APP_KEY = Buffer.from('hiltwright-pack-key-v1:4f0a9c3e6b1d2a7c8e5f0b9a3d6c1e4f', 'utf8');

export interface HiltFitDefaults { flip?: boolean; rollDeg?: number; lengthCm?: number | null; offsetXmm?: number; offsetZmm?: number; seatMm?: number; tiltXDeg?: number; tiltZDeg?: number; staffSeatMm?: number; axis?: 'auto' | 'origin' | 'box' }

export interface PackItem { name: string; kind: 'mesh' | 'wav' | 'ini'; bytes: number; offset: number; length: number }
export interface PackManifest {
  id: string;
  kind: 'hilt' | 'font';
  name: string;
  creator: string;
  licence: string;
  /** What the app may do with it beyond showing it. */
  allow: { copyToCard: boolean; demoPlayback: boolean };
  /** For a hilt: how it sits on the blade, worked out once so every owner sees it right. */
  fit?: HiltFitDefaults;
  /** For a font: config.ini and smoothsw.ini as parsed maps. */
  ini?: Record<string, string>;
  smoothsw?: Record<string, string>;
  items: PackItem[];
  packed: string;
}

const itemKey = (packId: string) => Buffer.from(hkdfSync('sha256', APP_KEY, packId, 'hwpack-item', 32));

export function writePack(manifest: Omit<PackManifest, 'items' | 'packed'>, items: { name: string; kind: PackItem['kind']; data: Buffer }[]): Buffer {
  const key = itemKey(manifest.id);
  const blobs: Buffer[] = [];
  const entries: PackItem[] = [];
  let offset = 0;
  for (const it of items) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const packed = Buffer.concat([cipher.update(deflateSync(it.data, { level: 6 })), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([Buffer.alloc(4), nonce, tag, packed]);
    blob.writeUInt32LE(blob.length - 4, 0);
    entries.push({ name: it.name, kind: it.kind, bytes: it.data.length, offset, length: blob.length });
    offset += blob.length;
    blobs.push(blob);
  }
  const full: PackManifest = { ...manifest, items: entries, packed: new Date().toISOString() };
  const json = Buffer.from(JSON.stringify(full), 'utf8');
  const head = Buffer.alloc(4 + 1 + 4);
  MAGIC.copy(head, 0); head.writeUInt8(HWPACK_VERSION, 4); head.writeUInt32LE(json.length, 5);
  return Buffer.concat([head, json, ...blobs]);
}

export function readManifest(file: Buffer): { manifest: PackManifest; itemsStart: number } {
  if (file.length < 9 || !file.subarray(0, 4).equals(MAGIC)) throw new Error('Not a Hiltwright pack');
  const version = file.readUInt8(4);
  if (version !== HWPACK_VERSION) throw new Error(`Pack version ${version} is newer than this Hiltwright`);
  const len = file.readUInt32LE(5);
  const manifest = JSON.parse(file.subarray(9, 9 + len).toString('utf8')) as PackManifest;
  return { manifest, itemsStart: 9 + len };
}

export function readItem(file: Buffer, manifest: PackManifest, itemsStart: number, item: PackItem): Buffer {
  const at = itemsStart + item.offset;
  const len = file.readUInt32LE(at);
  const nonce = file.subarray(at + 4, at + 16);
  const tag = file.subarray(at + 16, at + 32);
  const body = file.subarray(at + 32, at + 4 + len);
  const decipher = createDecipheriv('aes-256-gcm', itemKey(manifest.id), nonce);
  decipher.setAuthTag(tag);
  return inflateSync(Buffer.concat([decipher.update(body), decipher.final()]));
}

// ---- the mesh an OBJ becomes ----
//
// Positions and normals as Float32, indices as Uint32, and one group per material with its colour and a metal /
// roughness guess. Parsed once at pack time so the app never has to read OBJ text, and so what ships is a display
// mesh rather than the CAD export.
//
//   "HWM1" | u32 vertexCount | u32 indexCount | u32 groupCount | positions f32*3 | normals f32*3 | indices u32
//   | groups: u32 start, u32 count, f32 r, f32 g, f32 b, f32 metalness, f32 roughness, u16 nameLen, name utf8

export interface MeshGroup { start: number; count: number; color: [number, number, number]; metalness: number; roughness: number; name: string }
export interface PackedMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array; groups: MeshGroup[] }

export function encodeMesh(m: PackedMesh): Buffer {
  const names = m.groups.map((g) => Buffer.from(g.name, 'utf8'));
  const groupsBytes = m.groups.reduce((a, _g, i) => a + 4 + 4 + 5 * 4 + 2 + names[i].length, 0);
  const out = Buffer.alloc(4 + 12 + m.positions.byteLength + m.normals.byteLength + m.indices.byteLength + groupsBytes);
  let o = 0;
  out.write('HWM1', o); o += 4;
  out.writeUInt32LE(m.positions.length / 3, o); o += 4; out.writeUInt32LE(m.indices.length, o); o += 4; out.writeUInt32LE(m.groups.length, o); o += 4;
  Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength).copy(out, o); o += m.positions.byteLength;
  Buffer.from(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength).copy(out, o); o += m.normals.byteLength;
  Buffer.from(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength).copy(out, o); o += m.indices.byteLength;
  m.groups.forEach((g, i) => {
    out.writeUInt32LE(g.start, o); o += 4; out.writeUInt32LE(g.count, o); o += 4;
    for (const v of [g.color[0], g.color[1], g.color[2], g.metalness, g.roughness]) { out.writeFloatLE(v, o); o += 4; }
    out.writeUInt16LE(names[i].length, o); o += 2; names[i].copy(out, o); o += names[i].length;
  });
  return out;
}

export function decodeMesh(buf: Buffer): PackedMesh {
  if (buf.subarray(0, 4).toString() !== 'HWM1') throw new Error('Not a packed mesh');
  let o = 4;
  const nv = buf.readUInt32LE(o); o += 4; const ni = buf.readUInt32LE(o); o += 4; const ng = buf.readUInt32LE(o); o += 4;
  const take = (bytes: number) => { const s = buf.subarray(o, o + bytes); o += bytes; const copy = new ArrayBuffer(bytes); new Uint8Array(copy).set(s); return copy; };
  const positions = new Float32Array(take(nv * 12)); const normals = new Float32Array(take(nv * 12)); const indices = new Uint32Array(take(ni * 4));
  const groups: MeshGroup[] = [];
  for (let i = 0; i < ng; i++) {
    const start = buf.readUInt32LE(o); o += 4; const count = buf.readUInt32LE(o); o += 4;
    const f = [0, 1, 2, 3, 4].map((k) => buf.readFloatLE(o + k * 4)); o += 20;
    const nl = buf.readUInt16LE(o); o += 2; const name = buf.subarray(o, o + nl).toString('utf8'); o += nl;
    groups.push({ start, count, color: [f[0], f[1], f[2]], metalness: f[3], roughness: f[4], name });
  }
  return { positions, normals, indices, groups };
}

/**
 * Named finishes a packer can assign to a material by hand, when the guess from colour is not what the part is.
 * Chrome is a mirror; brushed aluminium is metal with a matte grain; satin sits between; anodised is dark metal;
 * paint and plastic are not metal.
 */
export const FINISHES: Record<string, { metalness: number; roughness: number; tint?: [number, number, number] }> = {
  chrome: { metalness: 1, roughness: 0.06, tint: [0.93, 0.94, 0.95] },
  polished: { metalness: 0.95, roughness: 0.15 },
  brushed: { metalness: 0.9, roughness: 0.5, tint: [0.86, 0.87, 0.88] },
  satin: { metalness: 0.9, roughness: 0.35 },
  anodised: { metalness: 0.75, roughness: 0.42 },
  brass: { metalness: 0.95, roughness: 0.25, tint: [0.95, 0.8, 0.49] },
  paint: { metalness: 0.05, roughness: 0.45 },
  plastic: { metalness: 0, roughness: 0.55 },
};

/** Metal or paint, from a CAD export that gives only a diffuse colour: neutral greys are metal, colours are finishes. */
export function guessFinish(name: string, color: [number, number, number]): { metalness: number; roughness: number } {
  const [r, g, b] = color;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const sat = max > 0 ? (max - min) / max : 0;
  if (/alumin|steel|chrome|brass|copper|nickel|titan|metal|gold|silver/i.test(name)) return { metalness: 0.9, roughness: /flat|brush|satin|bead/i.test(name) ? 0.45 : 0.25 };
  if (sat < 0.12) return max < 0.12 ? { metalness: 0.75, roughness: 0.45 } : { metalness: 0.85, roughness: 0.32 }; // black anodised, or bare metal
  if (r > 0.85 && g > 0.7 && b < 0.6 && sat > 0.3) return { metalness: 0.9, roughness: 0.3 }; // brass and gold
  return { metalness: 0.1, roughness: 0.5 }; // a coloured finish: paint, powder coat, plastic
}

/** Parse Wavefront OBJ text with its MTL into a packed mesh. Faces are triangulated; vertices are deduplicated per v/vn pair. */
export function objToMesh(objText: string, mtlText: string, finishes: Record<string, string> = {}): PackedMesh {
  const kd = new Map<string, [number, number, number]>();
  let cur = '';
  for (const line of mtlText.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('newmtl ')) cur = t.slice(7).trim();
    else if (t.startsWith('Kd ') && cur) { const p = t.split(/\s+/).slice(1, 4).map(Number) as [number, number, number]; kd.set(cur, p); }
  }
  const v: number[] = []; const vn: number[] = [];
  const positions: number[] = []; const normals: number[] = []; const indices: number[] = [];
  const key = new Map<string, number>();
  const groups: MeshGroup[] = [];
  let mat = 'default'; let groupStart = 0;
  const finishOf = (name: string, color: [number, number, number]) => {
    const f = FINISHES[finishes[name]?.toLowerCase() ?? ''];
    if (!f) return { color, ...guessFinish(name, color) };
    return { color: f.tint ?? color, metalness: f.metalness, roughness: f.roughness };
  };
  const closeGroup = () => { if (indices.length > groupStart) { const color = kd.get(mat) ?? [0.6, 0.63, 0.66]; groups.push({ start: groupStart, count: indices.length - groupStart, ...finishOf(mat, color), name: mat }); } groupStart = indices.length; };
  const vertex = (ref: string): number => {
    let idx = key.get(ref);
    if (idx != null) return idx;
    const [vi, , ni] = ref.split('/');
    const p = (Number(vi) - 1) * 3; const n = ni ? (Number(ni) - 1) * 3 : -1;
    idx = positions.length / 3;
    positions.push(v[p], v[p + 1], v[p + 2]);
    if (n >= 0) normals.push(vn[n], vn[n + 1], vn[n + 2]); else normals.push(0, 0, 0);
    key.set(ref, idx);
    return idx;
  };
  for (const line of objText.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('vn ')) { const p = line.split(/\s+/); vn.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('f ')) {
      const refs = line.trim().split(/\s+/).slice(1);
      const a = vertex(refs[0]);
      for (let i = 1; i + 1 < refs.length; i++) indices.push(a, vertex(refs[i]), vertex(refs[i + 1]));
    } else if (line.startsWith('usemtl ')) { closeGroup(); mat = line.slice(7).trim(); }
  }
  closeGroup();
  // Merge groups that share a material: Fusion writes one usemtl per body.
  const merged = new Map<string, MeshGroup>();
  const order: string[] = [];
  const reindexed: number[] = [];
  for (const g of groups) { if (!merged.has(g.name)) { merged.set(g.name, { ...g, start: 0, count: 0 }); order.push(g.name); } }
  for (const name of order) {
    const m = merged.get(name)!; m.start = reindexed.length;
    for (const g of groups) if (g.name === name) for (let i = g.start; i < g.start + g.count; i++) reindexed.push(indices[i]);
    m.count = reindexed.length - m.start;
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(reindexed), groups: order.map((n) => merged.get(n)!) };
}
