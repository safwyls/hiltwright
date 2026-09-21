// The demo room: a saber in a dark 3D space, wielded with the mouse.
//
// three.js draws the room, the hilt and the blade; the blade's colours come from the same LED simulator as the 2D
// previews (packages/core/src/sim.ts), so what is seen here is what the firmware would compute. The saber's motion
// is fed back into the simulator the way the saber's own sensors would report it: tilt from where the blade points
// (gravity), swing speed from how fast it turns (gyro), twist from the roll of the hilt.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BladeSim, type EffectType, type LockupType } from '@hiltwright/core';

const BLADE_LENGTH = 0.92; // metres: a 36 inch blade
const BLADE_RADIUS = 0.0127; // a one inch tube
const HILT_LENGTH = 0.27;
const PIVOT = new THREE.Vector3(0, 1.05, 0); // the hand
const UP = new THREE.Vector3(0, 1, 0);
/** How far past white the blade is drawn. The excess is what the bloom pass turns into glow; too much and every colour reads as white. */
const BOOST = 1.2;

export interface Motion { swing: number; tilt: number; twist: number; on: boolean }

export class DemoScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly glowComposer: EffectComposer;
  private readonly glowing = new Set<THREE.Object3D>();
  private readonly black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  private readonly saber = new THREE.Group();
  private readonly roll = new THREE.Group();
  private readonly ledData: Uint8Array<ArrayBuffer>;
  private readonly ledTexture: THREE.DataTexture;
  private readonly tipMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  private readonly lights: THREE.PointLight[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private sim: BladeSim;
  private readonly leds: number;
  private raf = 0;
  private lastFrame = 0;
  private disposed = false;

  /** Where the blade is heading, and where it is: the blade follows its target with a little weight. */
  private readonly target = new THREE.Vector3(0.25, 0.9, 0.35).normalize();
  private readonly dir = this.target.clone();
  private swing = 0;
  private twistTarget = 0;
  private twist = 0;
  private orbit = { yaw: 0, pitch: 0.12 };
  onMotion: ((m: Motion) => void) | null = null;
  private lastReport = 0;

  constructor(private readonly host: HTMLElement, lookId: string, leds = 132) {
    this.leds = leds;
    this.sim = new BladeSim(lookId, leds, 1 + Math.floor(Math.random() * 1e6));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x05070a);
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.09);
    this.buildRoom();

    // The blade: a tube whose colour along its length is the LED strip, one texel per LED.
    this.ledData = new Uint8Array(new ArrayBuffer(leds * 4));
    this.ledTexture = new THREE.DataTexture(this.ledData, 1, leds, THREE.RGBAFormat);
    this.ledTexture.colorSpace = THREE.SRGBColorSpace;
    this.ledTexture.magFilter = THREE.LinearFilter;
    this.ledTexture.minFilter = THREE.LinearFilter;
    this.ledTexture.needsUpdate = true;
    // Brighter than white on purpose: the bloom pass turns the excess into the glow around the blade.
    const bladeMaterial = new THREE.MeshBasicMaterial({ map: this.ledTexture, color: new THREE.Color(BOOST, BOOST, BOOST), toneMapped: false });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(BLADE_RADIUS, BLADE_RADIUS, BLADE_LENGTH, 20, 1, true), bladeMaterial);
    tube.position.y = HILT_LENGTH / 2 + BLADE_LENGTH / 2;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(BLADE_RADIUS, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.tipMaterial);
    tip.position.y = HILT_LENGTH / 2 + BLADE_LENGTH;
    this.glowing.add(tube); this.glowing.add(tip);
    this.roll.add(tube, tip, this.buildHilt());
    this.saber.add(this.roll);
    this.saber.position.copy(PIVOT);
    this.scene.add(this.saber);

    // The blade lights the room: three lamps along it, coloured by that stretch of LEDs.
    for (let i = 0; i < 3; i++) {
      const lamp = new THREE.PointLight(0xffffff, 0, 7, 2);
      lamp.position.y = HILT_LENGTH / 2 + BLADE_LENGTH * (0.18 + i * 0.32);
      this.roll.add(lamp);
      this.lights.push(lamp);
    }

    // Only the blade glows. The room is drawn twice: once with everything but the blade blacked out, which is
    // blurred into the glow, and once as it is; the two are added. (Blooming the whole picture made the lit hilt
    // and floor glow too, and a brightness threshold would have cut blue blades out, since blue carries little luma.)
    this.glowComposer = new EffectComposer(this.renderer);
    this.glowComposer.renderToScreen = false;
    this.glowComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.15, 0.5, 0);
    this.glowComposer.addPass(this.bloom);
    const add = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { baseTexture: { value: null }, glowTexture: { value: this.glowComposer.renderTarget2.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D glowTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(glowTexture, vUv); }',
    }), 'baseTexture');
    add.needsSwap = true;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(add);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private buildRoom(): void {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.42, metalness: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(28, 56, 0x27465a, 0x16222c);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.scene.add(grid);
    this.scene.add(new THREE.AmbientLight(0x8fa4b8, 0.5));
    // A soft lamp by the viewer, so the hilt reads as metal even with the blade off.
    const fill = new THREE.PointLight(0xdfe9f2, 6, 8, 2);
    fill.position.set(0.6, 1.7, 2.0);
    this.scene.add(fill);
    const key = new THREE.DirectionalLight(0xbfd4e8, 0.9);
    key.position.set(-2, 4, 3);
    this.scene.add(key);
  }

  /** A plain hilt, deliberately not round all the way: the control box is what makes a twist visible. */
  private buildHilt(): THREE.Group {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.32, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f25, roughness: 0.6, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, HILT_LENGTH, 28), steel);
    g.add(body);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.019, 0.04, 28), steel);
    emitter.position.y = HILT_LENGTH / 2 - 0.02;
    g.add(emitter);
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.0215, 0.035, 28), dark);
    pommel.position.y = -HILT_LENGTH / 2 + 0.0175;
    g.add(pommel);
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.012, 28), dark);
      rib.position.y = -0.085 + i * 0.022;
      g.add(rib);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.02), dark);
    box.position.set(0, 0.07, 0.022);
    g.add(box);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 16), new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: 0x550a06, roughness: 0.4 }));
    button.rotation.x = Math.PI / 2;
    button.position.set(0, 0.08, 0.034);
    g.add(button);
    return g;
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth); const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.glowComposer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- what the page asks of the saber ----

  setLook(lookId: string, args: Map<number, string>): void {
    const wasOn = this.sim.isOn;
    this.sim = new BladeSim(lookId, this.leds, 1 + Math.floor(Math.random() * 1e6));
    this.sim.setArgs(args);
    this.sim.setOn(wasOn);
  }
  setArgs(args: Map<number, string>): void { this.sim.setArgs(args); }
  get isOn(): boolean { return this.sim.isOn; }
  setOn(on: boolean): void { this.sim.setOn(on); if (!on) this.sim.setLockup(null); }
  trigger(type: EffectType, pos = 0.35 + Math.random() * 0.45): void { if (this.sim.isOn) this.sim.trigger(type, pos); }
  setLockup(type: LockupType | null): void { if (this.sim.isOn || type === null) this.sim.setLockup(type); }
  addTwist(degrees: number): void { this.twistTarget = Math.max(-180, Math.min(180, this.twistTarget + degrees)); }
  resetPose(): void { this.target.set(0.25, 0.9, 0.35).normalize(); this.twistTarget = 0; this.orbit = { yaw: 0, pitch: 0.12 }; }
  orbitBy(dx: number, dy: number): void { this.orbit.yaw -= dx * 0.005; this.orbit.pitch = Math.max(-0.05, Math.min(0.9, this.orbit.pitch + dy * 0.004)); }

  /**
   * Point the blade at the cursor. The tip rides a sphere around the hand: inside the sphere's outline the blade
   * leans toward the viewer, at and beyond the outline it lies across the view.
   */
  aim(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const reach = HILT_LENGTH / 2 + BLADE_LENGTH;
    const hit = ray.intersectSphere(new THREE.Sphere(PIVOT, reach), new THREE.Vector3());
    const point = hit ?? ray.closestPointToPoint(PIVOT, new THREE.Vector3());
    const d = point.sub(PIVOT);
    if (d.lengthSq() > 1e-6) this.target.copy(d.normalize());
  }

  /** Where along the blade the cursor is (0 hilt, 1 tip), or null when it is not over the blade. */
  bladeAt(clientX: number, clientY: number): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3) => { const p = v.clone().project(this.camera); return new THREE.Vector2(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height); };
    const a = toScreen(PIVOT.clone().addScaledVector(this.dir, HILT_LENGTH / 2));
    const b = toScreen(PIVOT.clone().addScaledVector(this.dir, HILT_LENGTH / 2 + BLADE_LENGTH));
    const p = new THREE.Vector2(clientX - r.left, clientY - r.top);
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1, ab.lengthSq())));
    return a.clone().addScaledVector(ab, t).distanceTo(p) < 26 ? t : null;
  }

  // ---- one frame ----

  private readonly frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.lastFrame ? (now - this.lastFrame) / 1000 : 0.016);
    this.lastFrame = now;

    // The blade follows its target with some weight; swing speed is how fast it really turned.
    const before = this.dir.clone();
    const k = 1 - Math.exp(-dt * 14);
    this.dir.lerp(this.target, k).normalize();
    const turned = (before.angleTo(this.dir) * 180) / Math.PI;
    const speed = dt > 0 ? turned / dt : 0;
    this.swing += (speed - this.swing) * Math.min(1, dt * 12);
    this.twist += (this.twistTarget - this.twist) * Math.min(1, dt * 10);

    this.saber.quaternion.setFromUnitVectors(UP, this.dir);
    this.roll.rotation.y = (this.twist * Math.PI) / 180;
    const tilt = (Math.asin(Math.max(-1, Math.min(1, this.dir.y))) * 180) / Math.PI;
    this.sim.setSwing(Math.min(900, this.swing));
    this.sim.setAngle(tilt);
    this.sim.setTwist(this.twist);

    this.paintBlade(this.sim.frame(now));

    const cy = Math.cos(this.orbit.pitch); const dist = 2.25;
    this.camera.position.set(Math.sin(this.orbit.yaw) * cy * dist, 1.25 + Math.sin(this.orbit.pitch) * dist, Math.cos(this.orbit.yaw) * cy * dist);
    this.camera.lookAt(0, 1.3, 0);
    this.renderGlow();
    this.composer.render();

    if (this.onMotion && now - this.lastReport > 120) { this.lastReport = now; this.onMotion({ swing: Math.round(this.swing / 10) * 10, tilt: Math.round(tilt), twist: Math.round(this.twist), on: this.sim.isOn }); }
  };

  /** The blade alone, on black, blurred: everything else in the room is blacked out for this pass and then put back. */
  private renderGlow(): void {
    const kept = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (this.glowing.has(o)) return;
      const m = o as THREE.Mesh;
      if (m.isMesh) { kept.set(m, m.material); m.material = this.black; } else if ((o as THREE.LineSegments).isLineSegments && o.visible) { o.visible = false; hidden.push(o); }
    });
    const background = this.scene.background; const fog = this.scene.fog;
    this.scene.background = null; this.scene.fog = null;
    this.renderer.setClearColor(0x000000);
    this.glowComposer.render();
    this.renderer.setClearColor(0x05070a);
    this.scene.background = background; this.scene.fog = fog;
    for (const [m, mat] of kept) m.material = mat;
    for (const o of hidden) o.visible = true;
  }

  /** LED values to what an eye sees: diffuser smear in linear light, channel saturation, gamma. As in the 2D preview. */
  private paintBlade(leds: Float32Array): void {
    const n = this.leds; const out = this.ledData;
    const W = [0.07, 0.24, 0.38, 0.24, 0.07];
    const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) {
      let r = 0; let g = 0; let b = 0; let w = 0;
      for (let t = -2; t <= 2; t++) { const j = i + t; if (j < 0 || j >= n) continue; r += leds[j * 3] * W[t + 2]; g += leds[j * 3 + 1] * W[t + 2]; b += leds[j * 3 + 2] * W[t + 2]; w += W[t + 2]; }
      r /= w; g /= w; b /= w;
      const third = sums[Math.min(2, Math.floor((i * 3) / n))];
      third[0] += r; third[1] += g; third[2] += b;
      const peak = Math.max(r, g, b);
      const tone = (v: number) => Math.pow(1 - Math.exp(-(v * 1.6 + peak * 0.03) * 2.4), 1 / 2.2);
      const lit = [tone(r), tone(g), tone(b)];
      const dark = 1 - Math.max(lit[0], lit[1], lit[2]);
      // An unlit blade is still a grey polycarbonate tube.
      out[i * 4] = Math.round(Math.min(1, lit[0] + 0.1 * dark) * 255);
      out[i * 4 + 1] = Math.round(Math.min(1, lit[1] + 0.11 * dark) * 255);
      out[i * 4 + 2] = Math.round(Math.min(1, lit[2] + 0.12 * dark) * 255);
      out[i * 4 + 3] = 255;
    }
    this.ledTexture.needsUpdate = true;
    const last = (n - 1) * 4;
    this.tipMaterial.color.setRGB((out[last] / 255) * BOOST, (out[last + 1] / 255) * BOOST, (out[last + 2] / 255) * BOOST, THREE.SRGBColorSpace);
    const per = n / 3;
    this.lights.forEach((lamp, i) => {
      const [r, g, b] = sums[i].map((v) => v / per);
      const level = Math.max(r, g, b);
      lamp.intensity = level * 7;
      if (level > 0.001) lamp.color.setRGB(r / level, g / level, b / level);
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.ledTexture.dispose();
    this.composer.dispose();
    this.glowComposer.dispose();
    this.black.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
