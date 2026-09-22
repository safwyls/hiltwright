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
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

export type HiltFormat = 'glb' | 'obj' | 'stl';
export interface HiltFit {
  flip: boolean;
  rollDeg: number;
  /** Overall length in centimetres; null keeps the guess from the file. */
  lengthCm: number | null;
  /** Sideways shift of the model so the blade sits in its bore, in millimetres of finished hilt, in the hilt's own frame (before the turn). */
  offsetXmm?: number;
  offsetZmm?: number;
  /**
   * How much deeper the blade sits in the hilt than the model's top, in millimetres. An emitter with a long shroud,
   * a curved one, or a flared one that extends past the socket needs the blade to start below the model's highest point.
   */
  seatMm?: number;
  /**
   * Tilt of the hilt relative to the blade, in degrees, about the point where the blade enters it: for a curved hilt
   * whose longest dimension does not run along the bore, so standing it up by that dimension leans the emitter.
   * tiltX leans it toward or away from the front (the control side after the turn), tiltZ to the sides.
   */
  tiltXDeg?: number;
  tiltZDeg?: number;
  /**
   * Where the blade's axis is in the file. 'origin': the model was drawn around the bore, so the file's own axis is
   * the blade's. 'box': the middle of the model's bounding box. 'auto' (the default) uses the origin when it runs
   * through the model, and the box otherwise (a file modelled off in space).
   */
  axis?: 'auto' | 'origin' | 'box';
}
/** A file that came with the model: an OBJ's .mtl, and any textures the .mtl names. */
export interface SideFile { name: string; data: ArrayBuffer }
export interface StoredHilt { name: string; format: HiltFormat; data: ArrayBuffer; fit: HiltFit; sideFiles?: SideFile[] }
export const DEFAULT_FIT: HiltFit = { flip: false, rollDeg: 0, lengthCm: null, offsetXmm: 0, offsetZmm: 0, seatMm: 0, tiltXDeg: 0, tiltZDeg: 0, axis: 'auto' };

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
const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop()!.toLowerCase();

/**
 * An .mtl describes a Phong material (diffuse, specular colour, shininess), which is what Fusion and most CAD tools
 * write. Turned into the metal/roughness material the room lights with: a bright specular colour means metal, and
 * the shininess sets the roughness. A guess, but a fair one for a hilt.
 */
function fromPhong(m: THREE.MeshPhongMaterial): THREE.MeshStandardMaterial {
  const spec = m.specular; const specLevel = Math.max(spec.r, spec.g, spec.b);
  const out = new THREE.MeshStandardMaterial({
    color: m.color, map: m.map, normalMap: m.normalMap, alphaMap: m.alphaMap, emissive: m.emissive, emissiveMap: m.emissiveMap,
    transparent: m.transparent, opacity: m.opacity, side: m.side,
    metalness: specLevel > 0.5 ? 0.9 : specLevel > 0.2 ? 0.5 : 0.1,
    roughness: Math.max(0.08, Math.min(0.95, 1 - Math.sqrt(Math.max(0, m.shininess) / 1000))),
  });
  out.name = m.name;
  return out;
}

export async function parseHilt(format: HiltFormat, data: ArrayBuffer, sideFiles: SideFile[] = []): Promise<THREE.Object3D> {
  if (format === 'glb') {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    return gltf.scene;
  }
  if (format === 'stl') {
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, steel());
  }
  const text = new TextDecoder().decode(data);
  // An OBJ's materials live in a separate .mtl, which may name texture images: both come as side files. Anything the
  // .mtl asks for by name is served from those, as blob URLs; anything missing is left out rather than fetched.
  const wanted = /^\s*mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
  const mtl = sideFiles.find((f) => wanted && baseName(f.name) === baseName(wanted)) ?? sideFiles.find((f) => baseName(f.name).endsWith('.mtl'));
  const loader = new OBJLoader();
  const urls: string[] = [];
  if (mtl) {
    const byName = new Map(sideFiles.map((f) => [baseName(f.name), f]));
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const f = byName.get(baseName(url));
      if (!f) return url;
      const u = URL.createObjectURL(new Blob([f.data])); urls.push(u); return u;
    });
    const materials = new MTLLoader(manager).parse(new TextDecoder().decode(mtl.data), '');
    materials.preload();
    loader.setMaterials(materials);
  }
  const obj = loader.parse(text);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const converted = mats.map((x) => (mtl && (x as THREE.MeshPhongMaterial).isMeshPhongMaterial && x.name ? fromPhong(x as THREE.MeshPhongMaterial) : steel()));
    m.material = Array.isArray(m.material) ? converted : converted[0];
  });
  // The blob URLs are only needed while the textures load; give them a moment, then let them go.
  if (urls.length) setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 10000);
  return obj;
}

/**
 * Stand `model` up along +Y with the blade end at `emitterY`, at hilt size, with the blade's axis where the file
 * says it is (see HiltFit.axis) and then shifted by the fit's offset. Centring by the bounding box is wrong for any
 * hilt with a control box or a clamp card on one side: the box centre is off the bore, and turning the hilt about
 * it makes the body wobble around the blade. A file drawn around the bore has its axis at the origin.
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
  const boxCentre = box.getCenter(new THREE.Vector3());
  // The file's own axis, after standing up and flipping, is wherever its origin went.
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(oriented.matrixWorld);
  const originInside = origin.x >= box.min.x && origin.x <= box.max.x && origin.z >= box.min.z && origin.z <= box.max.z;
  const useOrigin = fit.axis === 'origin' || (fit.axis !== 'box' && originInside);
  const centre = useOrigin ? origin : boxCentre;

  const group = new THREE.Group();
  group.add(oriented);
  // Blade end at the origin, the rest hanging below it. The offset is in finished millimetres, so it is applied in
  // model units here (before the scale) as offset / k.
  // Seating raises the hilt along the blade, so the blade starts that far below the model's top.
  oriented.position.set(-centre.x + ((fit.offsetXmm ?? 0) / 1000) / k, -box.max.y + ((fit.seatMm ?? 0) / 1000) / k, -centre.z + ((fit.offsetZmm ?? 0) / 1000) / k);
  // Tilt about the blade's entry point (the group origin, after seating), inside the turn so it turns with the hilt.
  const tilted = new THREE.Group();
  tilted.add(oriented);
  tilted.rotation.set(((fit.tiltXDeg ?? 0) * Math.PI) / 180, 0, ((fit.tiltZDeg ?? 0) * Math.PI) / 180);
  group.remove(oriented);
  group.add(tilted);
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
