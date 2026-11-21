// The kyber crystal the small loading indicator spins (Loader.tsx): `npm run crystal` (runs under Electron, whose
// Chromium draws the mesh with three.js). Reads design/brand/kyber-crystal.stl and writes
// src/renderer/src/assets/kyber-spin.png: one full turn as a strip of frames, grey on transparent.
//
// The page shows the strip twice (styles.css, "Loader"): as a mask filled with the theme's accent, and as shading
// blended over it, so the real facets and light show in every theme's colour. Nothing is drawn while the app runs: CSS
// steps through the frames. Rerun after changing the mesh, the lighting or the frame count.

import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');
const STL = resolve(DESKTOP, '..', '..', 'design', 'brand', 'kyber-crystal.stl');
const OUT = join(DESKTOP, 'src', 'renderer', 'src', 'assets', 'kyber-spin.png');
const THREE = createRequire(import.meta.url).resolve('three'); // build/three.cjs

/** Frames in one turn, and each frame's size in pixels (the loader shows it at most 26px tall). */
export const FRAMES = 36;
const W = 36; const H = 96;

app.disableHardwareAcceleration(); // the software renderer draws the same on every machine
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

/** Runs in the page: the mesh, lit, turned through one revolution; every frame drawn into one strip. */
function drawStrip(threePath, stl, frames, w, h) {
  const THREE = require(threePath);
  const buf = new Uint8Array(stl);
  const dv = new DataView(buf.buffer);
  const n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.rotateX(-Math.PI / 2); // the crystal's long axis (z) stands up
  geo.center();
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const size = new THREE.Vector3(); geo.boundingBox.getSize(size);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w * 4, h * 4); // drawn large, then shrunk into the strip for smooth edges
  renderer.setClearColor(0x000000, 0);
  // The shader writes the grey it means; nothing converts it on the way out.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  // Lit from within, not from outside: no gloss and no dark side. The page colours it, so only brightness is drawn
  // here, and in hard light mid grey is the accent itself. Every facet is at least that; facets turned away from the
  // eye burn brighter, toward white, the way a blade's core does; and one soft light fixed in place lifts each facet
  // as it turns past, so the turning shows. The STL's triangles each carry their own normal, so facets stay flat.
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ vec3 n = normalize(vN); float rim = pow(1.0 - abs(n.z), 1.6); float key = max(dot(n, normalize(vec3(-0.55, 0.5, 0.65))), 0.0); float g = 0.55 + 0.38 * rim + 0.14 * key; gl_FragColor = vec4(vec3(min(g, 1.0)), 1.0); }',
  });
  const mesh = new THREE.Mesh(geo, mat);
  const pivot = new THREE.Group(); pivot.add(mesh); pivot.rotation.x = 0.22; // tipped toward the eye: the point shows
  scene.add(pivot);
  const half = (size.y * 1.08) / 2;
  const cam = new THREE.OrthographicCamera(-half * (w / h), half * (w / h), half, -half, -100, 100);
  cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0);

  const strip = document.createElement('canvas');
  strip.width = w * frames; strip.height = h;
  const ctx = strip.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  for (let f = 0; f < frames; f++) {
    mesh.rotation.y = (f / frames) * Math.PI * 2;
    renderer.render(scene, cam);
    ctx.drawImage(renderer.domElement, f * w, 0, w, h);
  }
  return strip.toDataURL('image/png');
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await win.loadURL('data:text/html,<html><body></body></html>');
    const stl = [...readFileSync(STL)];
    const url = await win.webContents.executeJavaScript(`(${drawStrip.toString()})(${JSON.stringify(THREE)}, ${JSON.stringify(stl)}, ${FRAMES}, ${W}, ${H})`);
    const png = Buffer.from(String(url).replace(/^data:image\/png;base64,/, ''), 'base64');
    writeFileSync(OUT, png);
    win.destroy();
    console.log(`crystal: ${OUT} (${FRAMES} frames of ${W}x${H}, ${png.length} bytes)`);
  } catch (err) { console.error(err); process.exitCode = 1; }
  app.quit();
});
