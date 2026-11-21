// The live blade on the website. The colours come from the app's own simulator (packages/core/src/sim.ts), which
// computes what ProffieOS would put on each LED; only the drawing here is simpler than the app's (2D canvas, a
// blurred copy for the glow), so the site needs no WebGL.

import { BladeSim, CLASH_G, canSimulateLook, type LockupType } from '../../packages/core/src/sim';
import { LIBRARY_LOOKS } from '../../packages/core/src/lookLibrary';

const LEDS = 132;
const STYLES = LIBRARY_LOOKS.filter((l) => l.roles.includes('main') && canSimulateLook(l.id));
const COLOURS: { name: string; rgb: [number, number, number] | null }[] = [
  { name: 'Its own', rgb: null },
  { name: 'Blue', rgb: [0, 60, 255] },
  { name: 'Green', rgb: [0, 255, 30] },
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Purple', rgb: [150, 0, 255] },
  { name: 'Amber', rgb: [255, 120, 0] },
  { name: 'Cyan', rgb: [0, 230, 255] },
  { name: 'White', rgb: [255, 255, 255] },
];
// What each style reads from the saber's motion sensors. Most styles read none of it.
const MOTION: Record<string, 'swing' | 'tilt' | 'twist'> = { hw_swing: 'swing', hw_current: 'swing', hw_split: 'swing', hw_comet: 'swing', hw_horizon: 'tilt', hw_liquid: 'tilt', hw_gravity: 'tilt', hw_twist: 'twist' };
const RANGE = { swing: { min: 0, max: 600, step: 10, start: 0, label: 'Swing speed' }, tilt: { min: -90, max: 90, step: 1, start: 10, label: 'Tilt' }, twist: { min: -90, max: 90, step: 1, start: 0, label: 'Twist' } };
const word = (rgb: [number, number, number]) => rgb.map((v) => v * 257).join(',');
const tone = (v: number) => Math.round(255 * Math.pow(1 - Math.exp(-v * 1.6 * 2.4), 1 / 2.2));

function mount(root: HTMLElement): void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const stage = q<HTMLElement>('.bd-stage');
  const glow = q<HTMLCanvasElement>('.bd-glow');
  const core = q<HTMLCanvasElement>('.bd-core');
  const select = q<HTMLSelectElement>('.bd-style');
  const about = q<HTMLElement>('.bd-about');
  const power = q<HTMLButtonElement>('.bd-power');
  const swing = q<HTMLInputElement>('.bd-swing');
  const swatches = q<HTMLElement>('.bd-colours');
  const motionLabel = q<HTMLElement>('.bd-motion');
  const motionNote = q<HTMLElement>('.bd-motion-note');
  let motion: 'swing' | 'tilt' | 'twist' | null = null;
  const applyMotion = () => { const v = Number(swing.value); sim.setSwing(motion === 'swing' ? v : 0); sim.setAngle(motion === 'tilt' ? v : 10); sim.setTwist(motion === 'twist' ? v : 0); };

  const strip = document.createElement('canvas');
  strip.width = LEDS; strip.height = 1;
  const sctx = strip.getContext('2d')!;
  const img = sctx.createImageData(LEDS, 1);

  let sim: BladeSim;
  let on = false;
  let colour: [number, number, number] | null = null;
  let hit = 0.6;

  function load(id: string, ignite: boolean): void {
    const look = STYLES.find((l) => l.id === id) ?? STYLES[0];
    sim = new BladeSim(look.id, LEDS, 1 + Math.floor(Math.random() * 1e6));
    sim.setArgs(new Map(colour ? [[1, word(colour)]] : []));
    motion = MOTION[look.id] ?? null;
    const r = RANGE[motion ?? 'swing'];
    swing.min = String(r.min); swing.max = String(r.max); swing.step = String(r.step); swing.value = String(r.start);
    swing.disabled = !motion;
    motionLabel.textContent = r.label;
    motionNote.textContent = motion ? (motion === 'swing' ? 'This style reacts to how fast the saber swings. Move the slider.' : motion === 'tilt' ? 'This style reacts to where the blade points, from straight down to straight up. Move the slider.' : 'This style reacts to twisting the hilt. Move the slider.') : 'This style does not read the motion sensors. Try Swing flare, Current, Horizon, Downhill or Twist dial.';
    applyMotion();
    about.textContent = look.description;
    on = false;
    releaseHolds();
    if (ignite) setOn(true);
  }
  // A held or toggled lockup never outlives what it was holding: a new style, a retracted blade, a lost pointer.
  const holds = [...root.querySelectorAll<HTMLButtonElement>('[data-hold]')];
  function releaseHolds(): void {
    for (const b of holds) if (b.getAttribute('aria-pressed') === 'true') { b.setAttribute('aria-pressed', 'false'); sim.setLockup(null, 0.55); }
  }
  function setOn(v: boolean): void {
    if (!v) releaseHolds();
    on = v; sim.setOn(v);
    power.textContent = v ? 'Retract' : 'Ignite';
    power.setAttribute('aria-pressed', String(v));
  }

  for (const l of STYLES) select.add(new Option(l.name, l.id));
  select.value = 'hw_stripes';
  if (select.selectedIndex < 0) select.selectedIndex = 0;
  select.addEventListener('change', () => load(select.value, true));

  COLOURS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bd-swatch'; b.title = c.name;
    b.setAttribute('aria-label', `Base color: ${c.name}`);
    b.setAttribute('aria-pressed', String(i === 0));
    if (c.rgb) b.style.setProperty('--c', `rgb(${c.rgb.join(',')})`); else b.classList.add('own');
    b.addEventListener('click', () => {
      colour = c.rgb;
      sim.setArgs(new Map(colour ? [[1, word(colour)]] : []));
      swatches.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    swatches.appendChild(b);
  });

  power.addEventListener('click', () => setOn(!on));
  swing.addEventListener('input', applyMotion);
  root.querySelectorAll<HTMLButtonElement>('[data-hit]').forEach((b) => b.addEventListener('click', () => {
    if (!on) setOn(true);
    const kind = b.dataset.hit!;
    hit = 0.35 + Math.random() * 0.5;
    if (kind === 'hard') sim.trigger('clash', hit, CLASH_G.hard);
    else sim.trigger(kind as 'clash' | 'blast' | 'stab', kind === 'stab' ? 1 : hit);
  }));
  // Lockups hold while the button is down (or toggle from the keyboard).
  holds.forEach((b) => {
    const kind = b.dataset.hold as LockupType;
    const set = (v: boolean) => { if (v && !on) setOn(true); if (v) releaseHolds(); sim.setLockup(v ? kind : null, kind === 'drag' || kind === 'melt' ? 0.97 : 0.55); b.setAttribute('aria-pressed', String(v)); };
    // Only the pointer that started a hold can end it, so a second finger does not cut it short.
    let holder: number | null = null;
    b.addEventListener('pointerdown', (e) => { if (holder !== null) return; holder = e.pointerId; set(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) b.addEventListener(ev, (e) => { if (e.pointerId !== holder) return; holder = null; if (b.getAttribute('aria-pressed') === 'true') set(false); });
    // Switching windows mid-hold loses the release, so the hold ends there.
    window.addEventListener('blur', () => { if (holder === null) return; holder = null; if (b.getAttribute('aria-pressed') === 'true') set(false); });
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); set(b.getAttribute('aria-pressed') !== 'true'); } });
  });
  // A click on the blade lands a blast there, as in the app.
  core.addEventListener('click', (e) => {
    const r = core.getBoundingClientRect();
    if (!on) { setOn(true); return; }
    sim.trigger('blast', Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  });

  // A visitor who asked for less motion gets the blade already lit and held still: one frame, drawn as it is two
  // seconds after ignition. It starts moving only when they use a control.
  let still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false;
  let w = 0, h = 0, dpr = 1;
  function size(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = stage.clientWidth; h = stage.clientHeight;
    for (const c of [glow, core]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    // Sizing a canvas clears it, and a still blade has no next frame to bring it back.
    if (ready && still) draw(performance.now());
  }
  new ResizeObserver(size).observe(stage);
  size();

  const gctx = glow.getContext('2d')!;
  const cctx = core.getContext('2d')!;
  function draw(now: number): void {
    const leds = sim.frame(now);
    for (let i = 0; i < LEDS; i++) {
      const r = leds[i * 3], g = leds[i * 3 + 1], b = leds[i * 3 + 2];
      const peak = Math.max(r, g, b);
      // A paler core where channels saturate, as on a real blade.
      img.data[i * 4] = tone(r + peak * 0.12); img.data[i * 4 + 1] = tone(g + peak * 0.12); img.data[i * 4 + 2] = tone(b + peak * 0.12);
      img.data[i * 4 + 3] = Math.min(255, Math.round(tone(peak) * 1.4));
    }
    sctx.putImageData(img, 0, 0);
    const W = w * dpr, H = h * dpr, rad = Math.min(11, h * 0.09) * dpr, cy = H / 2;
    gctx.clearRect(0, 0, W, H);
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(strip, 0, cy - rad * 2.2, W - rad, rad * 4.4);
    cctx.clearRect(0, 0, W, H);
    cctx.save();
    cctx.beginPath();
    cctx.roundRect(0, cy - rad, W - rad * 0.5, rad * 2, [0, rad, rad, 0]);
    cctx.clip();
    cctx.fillStyle = 'rgba(40,48,56,.75)';
    cctx.fillRect(0, 0, W, H);
    cctx.drawImage(strip, 0, cy - rad, W - rad * 0.5, rad * 2);
    // Brighter along the middle of the tube.
    cctx.globalCompositeOperation = 'lighter';
    cctx.globalAlpha = 0.45;
    cctx.drawImage(strip, 0, cy - rad * 0.45, W - rad * 0.5, rad * 0.9);
    cctx.restore();
  }

  load(select.value, false);
  let visible = false, raf = 0, started = false;
  const loop = (t: number) => { draw(t); raf = visible && !still ? requestAnimationFrame(loop) : 0; };
  const wake = () => { if (!still) return; still = false; if (visible && !raf) raf = requestAnimationFrame(loop); };
  for (const ev of ['pointerdown', 'keydown', 'input', 'change']) root.addEventListener(ev, wake, true);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !raf && !still) raf = requestAnimationFrame(loop);
    // The first time it comes into view, light it.
    if (visible && !started) { started = true; if (!still) setTimeout(() => setOn(true), 500); }
  }, { threshold: 0 }).observe(stage); // any of the blade on screen keeps it moving
  if (still) {
    const t = performance.now();
    setOn(true);
    sim.frame(t - 2000);
    draw(t);
  } else draw(performance.now());
  ready = true;
}

document.querySelectorAll<HTMLElement>('[data-blade-demo]').forEach(mount);
