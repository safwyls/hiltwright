import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_FIT, fitHilt, formatOf, guessLength, parseHilt } from '../src/renderer/src/hiltModel';

const boxOf = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

/** A lopsided bar, so it has a recognisable end: long along `axis`, in whatever units `long` implies, off-centre. */
function bar(axis: 'x' | 'y' | 'z', long: number, thick: number): THREE.Mesh {
  const dims = { x: [long, thick, thick], y: [thick, long, thick], z: [thick, thick, long] }[axis] as [number, number, number];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dims), new THREE.MeshBasicMaterial());
  mesh.position.set(long * 3, -long, long * 0.5); // modelled nowhere near the origin, as real files often are
  return mesh;
}

describe('fitting a custom hilt', () => {
  it('guesses the units from how long the model is', () => {
    expect(guessLength(0.28)).toBeCloseTo(0.28); // metres
    expect(guessLength(28)).toBeCloseTo(0.28); // centimetres
    expect(guessLength(280)).toBeCloseTo(0.28); // millimetres
    expect(guessLength(11)).toBeCloseTo(11 / 39.37); // inches
    expect(guessLength(7000)).toBeCloseTo(0.28); // no idea: a typical hilt
  });

  it('stands the model up along the blade whichever way it was drawn, with the blade end where the blade starts', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const { group, length } = fitHilt(bar(axis, 280, 36), DEFAULT_FIT, 0.135);
      const b = boxOf(group);
      expect(length, axis).toBeCloseTo(0.28);
      expect(b.max.y, axis).toBeCloseTo(0.135, 5);
      expect(b.min.y, axis).toBeCloseTo(0.135 - 0.28, 5);
      expect((b.min.x + b.max.x) / 2, axis).toBeCloseTo(0, 5);
      expect((b.min.z + b.max.z) / 2, axis).toBeCloseTo(0, 5);
      expect(b.max.x - b.min.x, axis).toBeCloseTo(0.036, 5);
    }
  });

  it('can be flipped end for end, resized and turned, and re-seated with the same model', () => {
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(30, 250, 30), new THREE.MeshBasicMaterial());
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(44, 30, 44), new THREE.MeshBasicMaterial());
    emitter.position.y = 140; emitter.name = 'emitter';
    model.add(body, emitter);
    const where = (g: THREE.Object3D) => { g.updateMatrixWorld(true); return model.getObjectByName('emitter')!.getWorldPosition(new THREE.Vector3()).y; };

    const upright = fitHilt(model, DEFAULT_FIT, 0.135).group;
    expect(where(upright)).toBeGreaterThan(0.1); // the wide end is by the blade
    const flipped = fitHilt(model, { ...DEFAULT_FIT, flip: true }, 0.135).group;
    expect(where(flipped)).toBeLessThan(-0.1); // now it is the pommel
    expect(boxOf(flipped).max.y).toBeCloseTo(0.135, 5);

    const sized = fitHilt(model, { flip: false, rollDeg: 90, lengthCm: 35 }, 0.135);
    expect(sized.length).toBeCloseTo(0.35);
    expect(boxOf(sized.group).min.y).toBeCloseTo(0.135 - 0.35, 5);
    expect(sized.group.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('a hilt drawn around its bore keeps the bore on the blade whichever way it is turned, box or no box', () => {
    // A round body on the file's axis with a control box off to one side: the bounding box centre is off the bore.
    const make = () => {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 280, 24), new THREE.MeshBasicMaterial()));
      const box = new THREE.Mesh(new THREE.BoxGeometry(16, 60, 20), new THREE.MeshBasicMaterial()); box.position.set(0, 40, 26); box.name = 'switch';
      m.add(box);
      return m;
    };
    const bodyAxisAfter = (roll: number, axis: 'auto' | 'origin' | 'box') => {
      const model = make();
      const g = fitHilt(model, { ...DEFAULT_FIT, rollDeg: roll, axis }, 0.135).group;
      g.updateMatrixWorld(true);
      return model.children[0].getWorldPosition(new THREE.Vector3());
    };
    for (const roll of [0, 90, 180, 270]) {
      const p = bodyAxisAfter(roll, 'auto');
      expect(Math.hypot(p.x, p.z), `auto, turned ${roll}`).toBeLessThan(1e-6); // the body's axis is the blade's
    }
    const wobble = bodyAxisAfter(90, 'box');
    expect(Math.hypot(wobble.x, wobble.z)).toBeGreaterThan(0.003); // box-centring is what put it off, by half the switch
  });

  it('falls back to the box centre for a file modelled off in space', () => {
    const b = bar('y', 280, 36); // bar() places the model far from the origin
    const g = fitHilt(b, DEFAULT_FIT, 0.135).group;
    const box = boxOf(g);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5);
  });

  it('seats the blade deeper in the hilt by finished millimetres, whatever the file\'s units', () => {
    for (const [long, thick] of [[280, 36], [0.28, 0.036]]) {
      const plain = boxOf(fitHilt(bar('y', long, thick), DEFAULT_FIT, 0.135).group);
      const seated = boxOf(fitHilt(bar('y', long, thick), { ...DEFAULT_FIT, seatMm: 25 }, 0.135).group);
      expect(seated.max.y - plain.max.y).toBeCloseTo(0.025, 5); // the hilt rises: its top is now 25 mm past where the blade starts
      expect(seated.min.x).toBeCloseTo(plain.min.x, 6);
    }
  });

  it('shifts the model sideways by finished millimetres, in the hilt\'s own frame, whatever the file\'s units', () => {
    for (const [long, thick] of [[280, 36], [0.28, 0.036]]) { // millimetres and metres
      const plain = boxOf(fitHilt(bar('y', long, thick), DEFAULT_FIT, 0.135).group);
      const shifted = boxOf(fitHilt(bar('y', long, thick), { ...DEFAULT_FIT, offsetXmm: 8, offsetZmm: -4.5 }, 0.135).group);
      expect(shifted.min.x - plain.min.x).toBeCloseTo(0.008, 5);
      expect(shifted.min.z - plain.min.z).toBeCloseTo(-0.0045, 5);
      expect(shifted.max.y).toBeCloseTo(plain.max.y, 6);
    }
    // Turned a quarter, the same shift follows the hilt round: +X in its frame is now -Z in the room.
    const turned = boxOf(fitHilt(bar('y', 280, 36), { ...DEFAULT_FIT, offsetXmm: 8, rollDeg: 90 }, 0.135).group);
    const turnedPlain = boxOf(fitHilt(bar('y', 280, 36), { ...DEFAULT_FIT, rollDeg: 90 }, 0.135).group);
    expect(turned.min.z - turnedPlain.min.z).toBeCloseTo(-0.008, 5);
    expect(turned.min.x - turnedPlain.min.x).toBeCloseTo(0, 5);
  });

  it('an OBJ with its .mtl gets its colours, as metal or not by their specular, and steel without one', async () => {
    const enc = (t: string) => new TextEncoder().encode(t).buffer as ArrayBuffer;
    const obj = 'mtllib hilt.mtl\nv 0 0 0\nv 0 280 0\nv 30 0 0\nv 30 280 0\nusemtl Brass\nf 1 2 3\nusemtl Rubber\nf 2 4 3\n';
    const mtl = 'newmtl Brass\nKd 0.8 0.6 0.2\nKs 0.9 0.9 0.9\nNs 600\nnewmtl Rubber\nKd 0.05 0.05 0.05\nKs 0.02 0.02 0.02\nNs 10\n';
    const withMtl = await parseHilt('obj', enc(obj), [{ name: 'hilt.mtl', data: enc(mtl) }]);
    const mats: THREE.MeshStandardMaterial[] = [];
    withMtl.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) mats.push(...(Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]); });
    const brass = mats.find((m) => m.name === 'Brass')!; const rubber = mats.find((m) => m.name === 'Rubber')!;
    expect(brass.isMeshStandardMaterial).toBe(true);
    expect(brass.color.g).toBeGreaterThan(brass.color.b); // its Kd came through
    expect(brass.metalness).toBeGreaterThan(0.8);
    expect(rubber.metalness).toBeLessThan(0.2);
    expect(rubber.roughness).toBeGreaterThan(brass.roughness);

    const plain = await parseHilt('obj', enc(obj));
    const m0 = (plain.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
    expect((Array.isArray(m0) ? m0[0] : m0).metalness).toBeCloseTo(0.85);
  });

  it('reads STL and OBJ files and knows which formats it takes', async () => {
    expect([formatOf('Graflex.GLB'), formatOf('hilt.gltf'), formatOf('a.obj'), formatOf('b.stl'), formatOf('c.fbx')]).toEqual(['glb', 'glb', 'obj', 'stl', null]);
    const stl = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 280 0 0\nvertex 0 30 0\nendloop\nendfacet\nendsolid t\n';
    const fromStl = await parseHilt('stl', new TextEncoder().encode(stl).buffer as ArrayBuffer);
    expect(boxOf(fromStl).max.x).toBeCloseTo(280);
    const obj = 'v 0 0 0\nv 0 280 0\nv 30 0 0\nf 1 2 3\n';
    const fromObj = await parseHilt('obj', new TextEncoder().encode(obj).buffer as ArrayBuffer);
    expect(boxOf(fromObj).max.y).toBeCloseTo(280);
  });
});
