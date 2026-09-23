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

// ---- the mesh a glTF becomes ----
//
// A .glb, or a .gltf with its buffers, read into the same packed mesh: every triangle primitive in the scene, moved
// by its node's transform, one group per material. glTF carries real metal and roughness where an MTL gives only a
// colour, so those are kept; a material that states neither falls back to the guess. Textures are left out, as they
// are for OBJ: a pack holds one colour per material. glTF is always in metres.

interface GltfNode { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface GltfPrimitive { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }
interface GltfAccessor { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown }
interface GltfMaterial { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: unknown } }
interface GltfJson {
  asset?: { version?: string };
  scene?: number; scenes?: { nodes?: number[] }[]; nodes?: GltfNode[]; meshes?: { primitives: GltfPrimitive[] }[];
  accessors?: GltfAccessor[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength: number }[]; materials?: GltfMaterial[]; extensionsRequired?: string[];
}

const COMPONENTS: Record<number, { bytes: number; read: (b: Buffer, at: number) => number }> = {
  5120: { bytes: 1, read: (b, at) => b.readInt8(at) }, 5121: { bytes: 1, read: (b, at) => b.readUInt8(at) },
  5122: { bytes: 2, read: (b, at) => b.readInt16LE(at) }, 5123: { bytes: 2, read: (b, at) => b.readUInt16LE(at) },
  5125: { bytes: 4, read: (b, at) => b.readUInt32LE(at) }, 5126: { bytes: 4, read: (b, at) => b.readFloatLE(at) },
};
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** A node's local transform as a column-major 4x4, from its matrix or its translation, rotation and scale. */
function nodeMatrix(n: GltfNode): number[] {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = n.scale ?? [1, 1, 1]; const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const mul4 = (a: number[], b: number[]) => { const o = new Array<number>(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export interface GltfOptions {
  /** Material name to a named finish, as for OBJ. */
  finishes?: Record<string, string>;
  /** A .gltf's buffers that live in files beside it, by the uri the file gives. */
  readUri?: (uri: string) => Buffer;
  /** What was left out, for the packer to tell whoever runs it. */
  warn?: (message: string) => void;
}

export function gltfToMesh(file: Buffer, { finishes = {}, readUri, warn = () => undefined }: GltfOptions = {}): PackedMesh {
  let json: GltfJson | undefined; let bin: Buffer | undefined;
  if (file.subarray(0, 4).toString('latin1') === 'glTF') {
    const version = file.readUInt32LE(4);
    if (version !== 2) throw new Error(`This is glTF ${version}; export glTF 2.0`);
    for (let o = 12; o + 8 <= file.length;) {
      const len = file.readUInt32LE(o); const type = file.readUInt32LE(o + 4); const body = file.subarray(o + 8, o + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8')) as GltfJson; else if (type === 0x004e4942) bin = body;
      o += 8 + len;
    }
  } else json = JSON.parse(file.toString('utf8')) as GltfJson;
  if (!json) throw new Error('No glTF JSON in that file');
  if (json.asset?.version && !json.asset.version.startsWith('2')) throw new Error(`This is glTF ${json.asset.version}; export glTF 2.0`);
  // Mesh compression (Draco, meshopt, quantisation) needs a decoder the packer does not carry. Material extensions
  // only change the look, and the pack keeps just colour, metal and roughness, so those are safe to pass over.
  const blocking = (json.extensionsRequired ?? []).filter((e) => !/^KHR_(materials_|texture_transform)/.test(e));
  if (blocking.length) throw new Error(`This file needs ${blocking.join(', ')}; export it again without mesh compression`);

  const buffers = new Map<number, Buffer>();
  const bufferOf = (i: number): Buffer => {
    let b = buffers.get(i);
    if (b) return b;
    const uri = json!.buffers?.[i]?.uri;
    if (uri == null) { if (!bin) throw new Error('The file has no binary chunk'); b = bin; }
    else if (uri.startsWith('data:')) b = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
    else { if (!readUri) throw new Error(`The .gltf keeps its data in ${uri}; pack the .glb instead`); b = readUri(decodeURIComponent(uri)); }
    buffers.set(i, b);
    return b;
  };
  const accessor = (i: number) => {
    const a = json!.accessors?.[i];
    if (!a || a.bufferView == null) throw new Error(`Accessor ${i} has no data`);
    if (a.sparse) throw new Error('Sparse accessors are not supported');
    const comp = COMPONENTS[a.componentType]; const size = WIDTH[a.type];
    if (!comp || !size) throw new Error(`Accessor ${i} has a type the packer does not read`);
    const view = json!.bufferViews![a.bufferView]; const buf = bufferOf(view.buffer);
    const stride = view.byteStride ?? size * comp.bytes; const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { count: a.count, at: (k: number, c: number) => comp.read(buf, base + k * stride + c * comp.bytes) };
  };

  const positions: number[] = []; const normals: number[] = [];
  const trisByMaterial = new Map<number, number[]>();
  let skipped = 0;
  const addMesh = (meshIndex: number, m: number[]) => {
    // Normals turn by the inverse transpose, which is the cofactor matrix up to the sign of the determinant. A
    // mirrored node (negative determinant) also turns its triangles inside out, so their winding is reversed.
    const [a00, a10, a20, , a01, a11, a21, , a02, a12, a22] = m;
    const c = [a11 * a22 - a12 * a21, a12 * a20 - a10 * a22, a10 * a21 - a11 * a20, a02 * a21 - a01 * a22, a00 * a22 - a02 * a20, a01 * a20 - a00 * a21, a01 * a12 - a02 * a11, a02 * a10 - a00 * a12, a00 * a11 - a01 * a10];
    const det = a00 * c[0] + a01 * c[1] + a02 * c[2];
    const sign = det < 0 ? -1 : 1;
    for (const p of json!.meshes?.[meshIndex]?.primitives ?? []) {
      const mode = p.mode ?? 4;
      if (mode < 4 || mode > 6 || p.attributes.POSITION == null) { skipped++; continue; } // points and lines: edges some exporters add
      const pos = accessor(p.attributes.POSITION); const nor = p.attributes.NORMAL != null ? accessor(p.attributes.NORMAL) : null;
      const first = positions.length / 3;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.at(k, 0), y = pos.at(k, 1), z = pos.at(k, 2);
        positions.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        if (!nor) { normals.push(0, 0, 0); continue; }
        const nx = nor.at(k, 0), ny = nor.at(k, 1), nz = nor.at(k, 2);
        const tx = sign * (c[0] * nx + c[1] * ny + c[2] * nz), ty = sign * (c[3] * nx + c[4] * ny + c[5] * nz), tz = sign * (c[6] * nx + c[7] * ny + c[8] * nz);
        const l = Math.hypot(tx, ty, tz) || 1;
        normals.push(tx / l, ty / l, tz / l);
      }
      const idx = p.indices != null ? accessor(p.indices) : null;
      const n = idx ? idx.count : pos.count; const at = (k: number) => first + (idx ? idx.at(k, 0) : k);
      const tris: number[] = [];
      if (mode === 4) for (let k = 0; k + 2 < n; k += 3) tris.push(at(k), at(k + 1), at(k + 2));
      else if (mode === 5) for (let k = 0; k + 2 < n; k++) tris.push(...(k % 2 ? [at(k + 1), at(k), at(k + 2)] : [at(k), at(k + 1), at(k + 2)]));
      else for (let k = 1; k + 1 < n; k++) tris.push(at(0), at(k), at(k + 1));
      if (det < 0) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
      if (!nor) { // no normals in the file: each vertex takes the sum of its faces'
        for (let t = 0; t < tris.length; t += 3) {
          const [i, j, q] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
          const ux = positions[j] - positions[i], uy = positions[j + 1] - positions[i + 1], uz = positions[j + 2] - positions[i + 2];
          const vx = positions[q] - positions[i], vy = positions[q + 1] - positions[i + 1], vz = positions[q + 2] - positions[i + 2];
          const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
          for (const v of [i, j, q]) { normals[v] += fx; normals[v + 1] += fy; normals[v + 2] += fz; }
        }
        for (let v = first * 3; v < normals.length; v += 3) { const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1; normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l; }
      }
      const key = p.material ?? -1;
      const list = trisByMaterial.get(key) ?? [];
      for (const t of tris) list.push(t);
      trisByMaterial.set(key, list);
    }
  };
  const visit = (i: number, parent: number[]) => {
    const node = json!.nodes?.[i];
    if (!node) return;
    const m = mul4(parent, nodeMatrix(node));
    if (node.mesh != null) addMesh(node.mesh, m);
    for (const child of node.children ?? []) visit(child, m);
  };
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const children = new Set((json.nodes ?? []).flatMap((n) => n.children ?? []));
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? (json.nodes ?? []).map((_n, i) => i).filter((i) => !children.has(i));
  for (const r of roots) visit(r, IDENTITY);
  if (!positions.length) throw new Error('No triangles in that file');
  if (skipped) warn(`${skipped} point or line primitive${skipped === 1 ? '' : 's'} left out`);

  const textured: string[] = [];
  const indices: number[] = [];
  const groups: MeshGroup[] = [];
  for (const [mi, tris] of trisByMaterial) {
    const mat = mi >= 0 ? json.materials?.[mi] : undefined;
    const name = mat?.name || (mi >= 0 ? `material-${mi}` : 'default');
    const pbr = mat?.pbrMetallicRoughness;
    if (pbr?.baseColorTexture) textured.push(name);
    // baseColorFactor is linear, as the room's colours are; the guess reads colours as a CAD tool shows them.
    const color = (pbr?.baseColorFactor?.slice(0, 3) ?? (mat ? [1, 1, 1] : [0.6, 0.63, 0.66])) as [number, number, number];
    const named = FINISHES[finishes[name]?.toLowerCase() ?? ''];
    const finish = named ? { metalness: named.metalness, roughness: named.roughness }
      : pbr && (pbr.metallicFactor != null || pbr.roughnessFactor != null) ? { metalness: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1 }
      : guessFinish(name, color.map(toSrgb) as [number, number, number]);
    groups.push({ start: indices.length, count: tris.length, color: named?.tint ?? color, ...finish, name });
    for (const t of tris) indices.push(t);
  }
  if (textured.length) warn(`textures left out (one colour per material): ${textured.join(', ')}`);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), groups };
}
