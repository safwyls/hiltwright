// Draws simulated LED values as a blade: a diffused polycarbonate tube with a glow around it.
//
// One PixiJS renderer (one WebGL context) serves every preview on screen. Each preview is a plain 2D canvas; per
// frame the shared renderer draws that preview's blade and the result is copied across. Browsers cap WebGL
// contexts at about sixteen, and the Looks gallery alone shows fourteen blades.
//
// What the shader models, because these are what make a real blade look unlike its RGB numbers:
//  - LED values are linear PWM duty and ProffieOS applies no gamma, so a channel at 30% looks far brighter than
//    "30%" on a monitor. The output is gamma-encoded from linear light.
//  - The diffuser smears each LED across its neighbours (done on the CPU, in linear light, before upload).
//  - Bright channels saturate and spill, which is where the pale core of a lit blade comes from.
//  - Light leaves the tube: a tight glow and a wide one, coloured by the nearby stretch of blade, not one LED.

import 'pixi.js/unsafe-eval'; // Hiltwright's CSP forbids eval; this must load before any renderer is created.
import { Application, BufferImageSource, Mesh, MeshGeometry, Shader } from 'pixi.js';

const VERT = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uLeds;
uniform vec2 uSize;   // quad size in px
uniform vec4 uBlade;  // x0, x1, centre y, radius
uniform float uCount; // LEDs in use, and the texture's width
uniform float uTexW;
uniform float uDot;   // 1: round at both ends (a crystal or accent LED), 0: square at the hilt

vec3 tone(vec3 linear) {
  vec3 c = 1.0 - exp(-linear * 2.4);
  return pow(c, vec3(1.0 / 2.2));
}

void main() {
  vec2 p = vUV * uSize;
  float x0 = uBlade.x, x1 = uBlade.y, cy = uBlade.z, r = uBlade.w;
  float u = clamp((p.x - x0) / max(1.0, x1 - x0), 0.0, 1.0);
  float cx = clamp(p.x, x0 + r * uDot, x1 - r);
  float d = length(p - vec2(cx, cy)) - r;
  if (uDot < 0.5 && p.x < x0) d = max(d, x0 - p.x);

  float tu = clamp(u * uCount, 0.5, uCount - 0.5) / uTexW; // LED i sits at texel i + 0.5; stay off the unused texels
  vec3 led = texture(uLeds, vec2(tu, 0.25)).rgb; led *= led;    // stored as sqrt to keep dark values off the 8-bit floor
  vec3 wide = texture(uLeds, vec2(tu, 0.75)).rgb; wide *= wide;

  // Inside the tube: nearly even across, a little darker at the limb, a slightly paler core where channels saturate.
  float t = clamp(-d / r, 0.0, 1.0);
  float limb = mix(0.55, 1.0, sqrt(t));
  float peak = max(led.r, max(led.g, led.b));
  vec3 lit = tone(led * limb * 1.6 + vec3(peak) * 0.035 * t * t);
  vec3 tube = vec3(0.085, 0.095, 0.105) * (0.55 + 0.45 * t);
  float litAmt = max(lit.r, max(lit.g, lit.b));
  vec4 inside = vec4(lit + tube * (1.0 - litAmt), max(litAmt, 0.6));
  inside.rgb = min(inside.rgb, vec3(inside.a));

  // Outside: a tight glow and a faint wide one, fading out before the canvas ends so no edge shows.
  float o = max(d, 0.0);
  float fall = 0.55 * exp(-o / (r * 0.6)) + 0.2 * exp(-o / (r * 2.2));
  float edge = min(min(p.y, uSize.y - p.y), uSize.x - p.x);
  if (uDot > 0.5) edge = min(edge, p.x);
  vec3 glow = tone(wide * 1.6) * fall * smoothstep(0.0, r * 2.2, edge);
  vec4 outside = vec4(glow, max(glow.r, max(glow.g, glow.b)));

  float w = smoothstep(0.6, -0.6, d);
  finalColor = mix(outside, inside, w);
}`;

export interface BladeDraw {
  /** Linear 0..1 RGB triples, hilt first. */
  leds: Float32Array;
  /** CSS pixel size of the target canvas. */
  width: number;
  height: number;
  /** Tube radius in CSS pixels. */
  radius: number;
  /** Space kept clear around the blade for its glow, in CSS pixels. */
  pad: number;
  dot?: boolean;
}

const MAX_LEDS = 288;

class BladeRenderer {
  private app: Application | null = null;
  private starting: Promise<void> | null = null;
  private failed = false;
  private mesh!: Mesh<MeshGeometry, Shader>;
  private shader!: Shader;
  private source!: BufferImageSource;
  private pixels = new Uint8Array(MAX_LEDS * 2 * 4);
  private near = new Float32Array(MAX_LEDS * 3);
  private far = new Float32Array(MAX_LEDS * 3);

  get ready(): boolean { return !!this.app; }
  get unavailable(): boolean { return this.failed; }

  start(): Promise<void> {
    this.starting ??= this.init().catch((e) => { this.failed = true; console.error('[preview] WebGL blade renderer unavailable', e); });
    return this.starting;
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({ preference: 'webgl', width: 1024, height: 128, backgroundAlpha: 0, antialias: false, autoStart: false, resolution: window.devicePixelRatio || 1, autoDensity: false, preserveDrawingBuffer: true });
    this.source = new BufferImageSource({ resource: this.pixels, width: MAX_LEDS, height: 2, scaleMode: 'linear', addressMode: 'clamp-to-edge', alphaMode: 'no-premultiply-alpha' });
    const geometry = new MeshGeometry({ positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    this.shader = Shader.from({
      gl: { vertex: VERT, fragment: FRAG },
      resources: {
        uLeds: this.source, uLedsSampler: this.source.style,
        bladeUniforms: { uSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' }, uBlade: { value: new Float32Array([0, 1, 0, 1]), type: 'vec4<f32>' }, uDot: { value: 0, type: 'f32' }, uCount: { value: 1, type: 'f32' }, uTexW: { value: MAX_LEDS, type: 'f32' } },
      },
    });
    this.mesh = new Mesh({ geometry, shader: this.shader });
    app.stage.addChild(this.mesh);
    this.app = app;
  }

  /** Gaussian smear along the blade in linear light. */
  private blur(src: Float32Array, dst: Float32Array, n: number, sigma: number): void {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    for (let i = 0; i < n; i++) {
      let r = 0; let g = 0; let b = 0; let wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue; // light does not come from beyond the ends
        const w = Math.exp(-(k * k) / (2 * sigma * sigma));
        r += src[j * 3] * w; g += src[j * 3 + 1] * w; b += src[j * 3 + 2] * w; wsum += w;
      }
      const norm = wsum; // the tip is capped and reflective: it does not dim toward the end
      dst[i * 3] = r / norm; dst[i * 3 + 1] = g / norm; dst[i * 3 + 2] = b / norm;
    }
  }

  /** Draw one blade and copy it onto `target`. Returns false until the renderer is up. */
  draw(target: HTMLCanvasElement, ctx: CanvasRenderingContext2D, d: BladeDraw): boolean {
    const app = this.app;
    if (!app) return false;
    const n = Math.min(MAX_LEDS, Math.floor(d.leds.length / 3));
    if (n < 1) return false;
    const res = app.renderer.resolution;
    const screen = app.renderer.screen;
    if (d.width > screen.width || d.height > screen.height) app.renderer.resize(Math.max(d.width, screen.width), Math.max(d.height, screen.height));

    this.blur(d.leds, this.near, n, d.dot ? 0.01 : 1.15);
    this.blur(d.leds, this.far, n, d.dot ? 0.01 : Math.max(2, n * 0.035));
    const px = this.pixels;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        px[i * 4 + c] = Math.round(Math.sqrt(Math.min(1, this.near[i * 3 + c])) * 255);
        px[(MAX_LEDS + i) * 4 + c] = Math.round(Math.sqrt(Math.min(1, this.far[i * 3 + c])) * 255);
      }
      px[i * 4 + 3] = 255; px[(MAX_LEDS + i) * 4 + 3] = 255;
    }
    this.source.update();

    const u = this.shader.resources.bladeUniforms.uniforms as { uSize: Float32Array; uBlade: Float32Array; uDot: number; uCount: number };
    u.uCount = n;
    u.uSize[0] = d.width; u.uSize[1] = d.height;
    u.uBlade[0] = d.dot ? d.width / 2 - d.radius * 1.6 : 0; u.uBlade[1] = d.dot ? d.width / 2 + d.radius * 1.6 : d.width - d.pad;
    u.uBlade[2] = d.height / 2; u.uBlade[3] = d.radius;
    u.uDot = d.dot ? 1 : 0;
    this.mesh.scale.set(d.width, d.height);
    app.renderer.render(app.stage);

    const w = Math.round(d.width * res); const h = Math.round(d.height * res);
    if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(app.canvas, 0, 0, w, h, 0, 0, w, h);
    return true;
  }
}

export const bladeRenderer = new BladeRenderer();

// ---- one animation loop for every preview on screen ----

export interface PreviewClient { visible(): boolean; tick(now: number): void }
const clients = new Set<PreviewClient>();
let raf = 0;
function loop(now: number): void {
  raf = 0;
  for (const c of clients) if (c.visible()) c.tick(now);
  if (clients.size) raf = requestAnimationFrame(loop);
}
export function addPreview(c: PreviewClient): () => void {
  clients.add(c);
  void bladeRenderer.start();
  if (!raf) raf = requestAnimationFrame(loop);
  return () => { clients.delete(c); };
}

// Dev aid: with the display asleep requestAnimationFrame never fires, so probes drive a frame by hand.
(window as unknown as { hiltwrightPreviewTick?: () => unknown }).hiltwrightPreviewTick = () => {
  const now = performance.now();
  for (const c of clients) if (c.visible()) c.tick(now);
  return { ready: bladeRenderer.ready, failed: bladeRenderer.unavailable, clients: clients.size };
};
