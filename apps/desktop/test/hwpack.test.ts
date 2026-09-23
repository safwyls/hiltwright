import { describe, expect, it } from 'vitest';
import { decodeMesh, encodeMesh, gltfToMesh, guessFinish, objToMesh, readItem, readManifest, writePack } from '../src/main/hwpack';

/** A GLB from a glTF JSON and its one binary buffer. */
function glb(json: object, bin: Buffer): Buffer {
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20); const b = pad(bin, 0);
  const head = Buffer.alloc(12); head.write('glTF', 0, 'latin1'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const chunk = (body: Buffer, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(body.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, body]); };
  return Buffer.concat([head, chunk(j, 0x4e4f534a), chunk(b, 0x004e4942)]);
}

/** One quad (two triangles) in the XY plane facing +Z, positions then u16 indices, and the glTF that describes it. */
function quad(extra: { nodes: object[]; materials?: object[]; normals?: boolean; extensionsRequired?: string[] }) {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]).buffer);
  const nor = Buffer.from(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer);
  const idx = Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
  const bin = Buffer.concat([pos, nor, idx]);
  const attributes: Record<string, number> = { POSITION: 0, ...(extra.normals === false ? {} : { NORMAL: 1 }) };
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: extra.nodes.map((_n, i) => i) }], nodes: extra.nodes,
    meshes: [{ primitives: [{ attributes, indices: 2, material: 0 }] }, { primitives: [{ attributes, indices: 2, material: 1 }, { attributes, mode: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }, { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 48 }, { buffer: 0, byteOffset: 96, byteLength: 12 }],
    buffers: [{ byteLength: bin.length }],
    materials: extra.materials ?? [{ name: 'Steel', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 1, roughnessFactor: 0.2 } }, { name: 'Red paint', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.05, 0.05, 1] } }],
    ...(extra.extensionsRequired ? { extensionsRequired: extra.extensionsRequired } : {}),
  };
  return { json, bin };
}

describe('hwpack', () => {
  it('round-trips items through the pack, and refuses a tampered one', () => {
    const items = [{ name: 'a.wav', kind: 'wav' as const, data: Buffer.from('RIFF....WAVEfmt ') }, { name: 'mesh', kind: 'mesh' as const, data: Buffer.alloc(5000, 7) }];
    const pack = writePack({ id: 't', kind: 'font', name: 'T', creator: 'me', licence: 'CC0', allow: { copyToCard: false, demoPlayback: true } }, items);
    const { manifest, itemsStart } = readManifest(pack);
    expect(manifest.items.map((i) => i.name)).toEqual(['a.wav', 'mesh']);
    expect(readItem(pack, manifest, itemsStart, manifest.items[0]).toString()).toBe('RIFF....WAVEfmt ');
    expect(readItem(pack, manifest, itemsStart, manifest.items[1]).equals(items[1].data)).toBe(true);
    // The payload is not the file: the wav header is nowhere in the pack.
    expect(pack.includes(Buffer.from('WAVEfmt'))).toBe(false);
    const bad = Buffer.from(pack); bad[itemsStart + 40] ^= 0xff;
    expect(() => readItem(bad, manifest, itemsStart, manifest.items[0])).toThrow();
  });

  it('turns an OBJ with its MTL into a packed mesh with a material per body, merged across bodies', () => {
    const obj = 'mtllib x.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nvn 0 0 1\nusemtl Opaque(200,200,200)\nf 1//1 2//1 3//1\nusemtl Opaque(218,89,89)\nf 2//1 4//1 3//1\nusemtl Opaque(200,200,200)\nf 1//1 3//1 4//1\n';
    const mtl = 'newmtl Opaque(200,200,200)\nKd 0.78 0.78 0.78\nnewmtl Opaque(218,89,89)\nKd 0.85 0.35 0.35\n';
    const m = objToMesh(obj, mtl);
    expect(m.positions.length / 3).toBe(4);
    expect(m.indices.length).toBe(9);
    expect(m.groups.map((g) => [g.name, g.count])).toEqual([['Opaque(200,200,200)', 6], ['Opaque(218,89,89)', 3]]);
    expect(m.groups[0].metalness).toBeGreaterThan(0.8); // grey is metal
    expect(m.groups[1].metalness).toBeLessThan(0.2); // red is paint
    const back = decodeMesh(encodeMesh(m));
    expect(Array.from(back.indices)).toEqual(Array.from(m.indices));
    expect(back.groups[1].color[0]).toBeCloseTo(0.85, 5);
  });

  it('guesses finishes from names and colours', () => {
    expect(guessFinish('Aluminum_-_Flat', [1, 1, 1]).metalness).toBe(0.9);
    expect(guessFinish('Opaque(243,203,124)', [0.95, 0.8, 0.49]).metalness).toBe(0.9); // brass
    expect(guessFinish('Opaque(122,38,195)', [0.48, 0.15, 0.76]).metalness).toBe(0.1); // purple paint
    expect(guessFinish('Opaque(140,131,128)', [0.55, 0.51, 0.5]).metalness).toBe(0.85); // warm grey: nickel
  });

  it('turns a GLB into a packed mesh: node transforms applied, a group per material, metal and roughness from the file', () => {
    const { json, bin } = quad({ nodes: [{ mesh: 0, translation: [0, 0, 0.1] }, { mesh: 1, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: [2, 2, 2] }] });
    const notes: string[] = [];
    const m = gltfToMesh(glb(json, bin), { warn: (n) => notes.push(n) });
    expect(m.positions.length / 3).toBe(8);
    expect(Array.from(m.positions.slice(0, 3))).toEqual([0, 0, expect.closeTo(0.1, 6)]); // translated
    // The second node turns the quad 90° about Z and doubles it: (1, 0, 0) lands on (0, 2, 0).
    expect(m.positions[4 * 3 + 3]).toBeCloseTo(0, 6); expect(m.positions[4 * 3 + 4]).toBeCloseTo(2, 6);
    expect(m.groups.map((g) => [g.name, g.count])).toEqual([['Steel', 6], ['Red paint', 6]]);
    expect(m.groups[0]).toMatchObject({ metalness: 1, roughness: 0.2 });
    expect(m.groups[1].metalness).toBeLessThan(0.2); // no factors in the file: guessed from colour, red is paint
    expect(Array.from(m.indices.slice(6, 9))).toEqual([4, 5, 6]); // indices offset by the first mesh's vertices
    expect(notes).toEqual(['1 point or line primitive left out']);
    expect(decodeMesh(encodeMesh(m)).groups[1].name).toBe('Red paint');
  });

  it('keeps a mirrored node facing out, and makes normals when the file has none', () => {
    const { json, bin } = quad({ nodes: [{ mesh: 0, scale: [1, 1, -1] }], normals: false });
    const m = gltfToMesh(glb(json, bin));
    // Mirrored in Z: the quad now faces -Z, so the winding is reversed and the made normals point -Z.
    expect(Array.from(m.indices.slice(0, 3))).toEqual([0, 2, 1]);
    expect(Array.from(m.normals.slice(0, 3))).toEqual([0, 0, -1]);
  });

  it('reads a .gltf with its buffer inline, applies named finishes, and refuses compressed meshes', () => {
    const { json, bin } = quad({ nodes: [{ mesh: 0 }] });
    const text = Buffer.from(JSON.stringify({ ...json, buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }] }));
    const m = gltfToMesh(text, { finishes: { Steel: 'chrome' } });
    expect(m.groups[0]).toMatchObject({ name: 'Steel', metalness: 1, roughness: 0.06 });
    const draco = quad({ nodes: [{ mesh: 0 }], extensionsRequired: ['KHR_draco_mesh_compression'] });
    expect(() => gltfToMesh(glb(draco.json, draco.bin))).toThrow(/without mesh compression/);
  });
});
