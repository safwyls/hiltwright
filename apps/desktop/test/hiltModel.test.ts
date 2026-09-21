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
