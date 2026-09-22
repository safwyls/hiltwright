import { describe, expect, it } from 'vitest';
import { decodeMesh, encodeMesh, guessFinish, objToMesh, readItem, readManifest, writePack } from '../src/main/hwpack';

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
});
