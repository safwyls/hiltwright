// Custom hilts for the demo room: load a model file, stand it up along the blade, size it like a hilt, and keep it
// for next time.
//
// A model file says nothing about which way is "along the saber", what its units are, or which end the blade comes
// out of. So: the longest dimension is taken as the saber's axis; the units are guessed from how long that makes it
// (a hilt is about 20 to 40 cm, whether the file is in metres, centimetres, millimetres or inches); and the owner
// can flip it end for end, roll it, and set the length.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type HiltFormat = 'glb' | 'obj' | 'stl';
export interface HiltFit {
  flip: boolean;
  rollDeg: number;
  /** Overall length in centimetres; null keeps the guess from the file. */
  lengthCm: number | null;
  /** Sideways shift of the model so the blade sits in its bore, in millimetres of finished hilt, in the hilt's own frame (before the turn). */
  offsetXmm?: number;
  offsetZmm?: number;
}
export interface StoredHilt { name: string; format: HiltFormat; data: ArrayBuffer; fit: HiltFit }
export const DEFAULT_FIT: HiltFit = { flip: false, rollDeg: 0, lengthCm: null, offsetXmm: 0, offsetZmm: 0 };

export function formatOf(fileName: string): HiltFormat | null {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'glb' || ext === 'gltf' ? 'glb' : ext === 'obj' ? 'obj' : ext === 'stl' ? 'stl' : null;
}

/** A hilt's length in metres, guessed from the model's longest dimension in whatever units it was saved in. */
export function guessLength(longest: number): number {
  for (const perMetre of [1, 100, 1000, 39.37]) { // metres, centimetres, millimetres, inches
    const m = longest / perMetre;
    if (m >= 0.15 && m <= 0.5) return m;
  }
  return 0.28;
}

const steel = () => new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.35, metalness: 0.85 });

export async function parseHilt(format: HiltFormat, data: ArrayBuffer): Promise<THREE.Object3D> {
  if (format === 'glb') {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    return gltf.scene;
  }
  if (format === 'stl') {
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, steel());
  }
  const obj = new OBJLoader().parse(new TextDecoder().decode(data));
  // OBJ materials live in a separate .mtl file that is not here: give it the plain steel finish.
  obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = steel(); });
  return obj;
}

/**
 * Stand `model` up along +Y with the blade end at `emitterY`, at hilt size, centred on the axis by its bounding box and
 * then shifted by the fit's offset, since a hilt's bore is rarely at the centre of its box (a clamp card or a
 * side-mounted emitter pulls the box off to one side).
 * Returns the group to add to the saber and the length it ended up, in metres.
 */
export function fitHilt(model: THREE.Object3D, fit: HiltFit, emitterY: number): { group: THREE.Group; length: number } {
  const stand = new THREE.Group();
  stand.add(model);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) stand.rotation.z = Math.PI / 2; // x is the long way: turn it up
  else if (size.z >= size.y && size.z >= size.x) stand.rotation.x = -Math.PI / 2; // z is the long way
  const oriented = new THREE.Group();
  oriented.add(stand);
  if (fit.flip) oriented.rotation.x = Math.PI;
  oriented.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(oriented);
  const raw = Math.max(1e-6, box.max.y - box.min.y);
  const length = fit.lengthCm != null ? fit.lengthCm / 100 : guessLength(raw);
  const k = length / raw;
  const centre = box.getCenter(new THREE.Vector3());

  const group = new THREE.Group();
  group.add(oriented);
  // Blade end at the origin, the rest hanging below it. The offset is in finished millimetres, so it is applied in
  // model units here (before the scale) as offset / k.
  oriented.position.set(-centre.x + ((fit.offsetXmm ?? 0) / 1000) / k, -box.max.y, -centre.z + ((fit.offsetZmm ?? 0) / 1000) / k);
  group.scale.setScalar(k);
  group.position.y = emitterY;
  group.rotation.y = (fit.rollDeg * Math.PI) / 180;
  return { group, length };
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const one of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      for (const v of Object.values(one)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
      one.dispose();
    }
  });
}
