// The demo room: pick a look, grab the saber, swing it. Everything the blade shows comes from the LED simulator,
// driven by the motion of the saber on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SIMULATED_LOOKS, STARTER_LOOKS, argInfo, hexToColorWord, type LockupType } from '@hiltwright/core';
import { BLADE_DIAMETERS, DEFAULT_SCENE, DemoScene, STRIP_DENSITIES, ledsFor, type BladeDiameter, type ControlMode, type Motion, type SceneSettings } from './demoScene';
import { Icon } from './Icon';
import { DEFAULT_FIT, formatOf, parseHilt, type HiltFit, type SideFile, type StoredHilt } from './hiltModel';
import { listHilts, removeHilt, saveHilt } from './hiltStore';
import type { Object3D } from 'three';

const LOOKS = STARTER_LOOKS.filter((l) => SIMULATED_LOOKS.includes(l.id) && (l.roles.includes('main') || l.roles.includes('side')));
const SLIDERS: { key: Exclude<keyof SceneSettings, 'grid' | 'bladeInches' | 'bladeDiameter' | 'ledsPerMetre'>; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'glow', label: 'Glow', min: 0, max: 3, step: 0.05, hint: 'Strength of the glow around the blade' },
  { key: 'glowSpread', label: 'Glow spread', min: 0, max: 1, step: 0.02, hint: 'How far the glow reaches' },
  { key: 'bladeBrightness', label: 'Blade heat', min: 0.7, max: 2.5, step: 0.05, hint: 'Higher is hotter and paler; lower keeps more colour in the core' },
  { key: 'bladeLight', label: 'Blade light', min: 0, max: 3, step: 0.05, hint: 'How strongly the blade lights the floor and the hilt' },
  { key: 'roomLight', label: 'Room light', min: 0, max: 2.5, step: 0.05, hint: 'The room\u2019s own lamps. At zero only the blade lights the scene' },
  { key: 'haze', label: 'Haze', min: 0, max: 0.3, step: 0.005, hint: 'How quickly the room fades with distance' },
];
function loadScene(): SceneSettings {
  try { const raw = localStorage.getItem('hiltwright.demo.scene'); return raw ? { ...DEFAULT_SCENE, ...(JSON.parse(raw) as Partial<SceneSettings>) } : { ...DEFAULT_SCENE }; } catch { return { ...DEFAULT_SCENE }; }
}

const HOLDS: { type: LockupType; label: string; key: string }[] = [{ type: 'normal', label: 'Lockup', key: 'l' }, { type: 'drag', label: 'Drag', key: 'd' }, { type: 'lb', label: 'Lightning', key: 'n' }];

export function Demo({ initialLook }: { initialLook?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<DemoScene | null>(null);
  const [lookId, setLookId] = useState(() => (initialLook && LOOKS.some((l) => l.id === initialLook) ? initialLook : LOOKS[0].id));
  const [tried, setTried] = useState<Record<number, string>>({});
  const [hold, setHold] = useState<LockupType | null>(null);
  const [motion, setMotion] = useState<Motion>({ swing: 0, tilt: 0, twist: 0, on: false });
  const [failed, setFailed] = useState<string | null>(null);
  const [control, setControl] = useState<ControlMode>(() => { try { return localStorage.getItem('hiltwright.demo.control') === 'steer' ? 'steer' : 'hold'; } catch { return 'hold'; } });
  const [look3d, setLook3d] = useState<SceneSettings>(loadScene);
  // Custom hilts: model files the owner loaded, kept in the browser's database, one of them (or none) in use.
  const [hilts, setHilts] = useState<StoredHilt[]>([]);
  const [hiltName, setHiltName] = useState<string>(() => { try { return localStorage.getItem('hiltwright.demo.hilt') ?? ''; } catch { return ''; } });
  const [hiltNote, setHiltNote] = useState<string | null>(null);
  const [hiltLength, setHiltLength] = useState<number | null>(null);
  const loaded = useRef<{ name: string; model: Object3D } | null>(null);
  const hilt = hilts.find((h) => h.name === hiltName) ?? null;
  useEffect(() => { void listHilts().then(setHilts).catch(() => setHilts([])); }, []);
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.hilt', hiltName); } catch { /* private mode */ } }, [hiltName]);
  useEffect(() => {
    const room = scene.current;
    if (!room) return;
    if (!hilt) { loaded.current = null; room.setHilt(null, DEFAULT_FIT); setHiltLength(null); return; }
    let live = true;
    void (async () => {
      try {
        // Parsing is the slow part: only when the file changes, not for every nudge of a slider.
        if (loaded.current?.name !== hilt.name) loaded.current = { name: hilt.name, model: await parseHilt(hilt.format, hilt.data.slice(0), hilt.sideFiles ?? []) };
        if (live) { setHiltLength(room.setHilt(loaded.current.model, hilt.fit)); setHiltNote(null); }
      } catch (err) { if (live) { room.setHilt(null, DEFAULT_FIT); setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); } }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hilt?.name, hilt?.fit.flip, hilt?.fit.rollDeg, hilt?.fit.lengthCm, hilt?.fit.offsetXmm, hilt?.fit.offsetZmm, hilts.length]);
  /** One model file, plus for an OBJ its .mtl and any textures, chosen together in the file picker. */
  const loadHiltFiles = async (files: FileList | null) => {
    const all = Array.from(files ?? []);
    const file = all.find((f) => formatOf(f.name));
    if (!file) { if (all.length) setHiltNote('Use a .glb, .obj or .stl file. For an OBJ with colours, select its .mtl (and any texture images) along with it.'); return; }
    const format = formatOf(file.name)!;
    const sideFiles: SideFile[] = await Promise.all(all.filter((f) => f !== file).map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const entry: StoredHilt = { name: file.name.replace(/\.[^.]+$/, ''), format, data: await file.arrayBuffer(), fit: { ...DEFAULT_FIT }, ...(sideFiles.length ? { sideFiles } : {}) };
    try { await parseHilt(format, entry.data.slice(0), sideFiles); } catch (err) { setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); return; }
    if (format === 'obj' && !sideFiles.some((f) => /\.mtl$/i.test(f.name))) setHiltNote('Loaded without colours. To keep them, pick the .obj and its .mtl together (Ctrl+click both in the file dialog).');
    await saveHilt(entry).catch(() => undefined);
    loaded.current = null;
    setHilts((all) => [...all.filter((h) => h.name !== entry.name), entry]);
    setHiltName(entry.name);
    if (format !== 'obj' || sideFiles.some((f) => /\.mtl$/i.test(f.name))) setHiltNote(null);
  };
  const setFit = (patch: Partial<HiltFit>) => {
    if (!hilt) return;
    const next = { ...hilt, fit: { ...hilt.fit, ...patch } };
    setHilts((all) => all.map((h) => (h.name === hilt.name ? next : h)));
    void saveHilt(next).catch(() => undefined);
  };
  const forgetHilt = () => { if (!hilt) return; void removeHilt(hilt.name).catch(() => undefined); setHilts((all) => all.filter((h) => h.name !== hilt.name)); setHiltName(''); };

  const [sceneOpen, setSceneOpen] = useState(() => { try { return localStorage.getItem('hiltwright.demo.sceneOpen') !== '0'; } catch { return true; } });
  useEffect(() => { scene.current?.applySettings(look3d); try { localStorage.setItem('hiltwright.demo.scene', JSON.stringify(look3d)); } catch { /* private mode */ } }, [look3d]);
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.sceneOpen', sceneOpen ? '1' : '0'); } catch { /* private mode */ } }, [sceneOpen]);
  useEffect(() => { scene.current?.setControlMode(control); try { localStorage.setItem('hiltwright.demo.control', control); } catch { /* private mode */ } }, [control]);
  const look = LOOKS.find((l) => l.id === lookId) ?? LOOKS[0];
  const args = useMemo(() => new Map(Object.entries(tried).map(([n, v]) => [Number(n), hexToColorWord(v)])), [tried]);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  // The room is built once; looks and colours are pushed into it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let room: DemoScene;
    try { room = new DemoScene(el, lookId); } catch (err) { setFailed(String(err)); return; }
    scene.current = room;
    room.setControlMode(control);
    room.applySettings(look3d);
    room.onMotion = setMotion;
    const ro = new ResizeObserver(() => room.resize());
    ro.observe(el);

    let grab: { x: number; y: number; at: number } | null = null;
    let orbit: { x: number; y: number } | null = null;
    let pan: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      if (e.button === 0) { grab = { x: e.clientX, y: e.clientY, at: performance.now() }; room.grab(e.clientX, e.clientY); } else if (e.button === 1) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY }; } else { orbit = { x: e.clientX, y: e.clientY }; }
    };
    const move = (e: PointerEvent) => {
      if (grab) room.moveHand(e.clientX, e.clientY);
      if (pan) { room.panBy(e.clientX - pan.x, e.clientY - pan.y); pan = { x: e.clientX, y: e.clientY }; }
      if (orbit) { room.orbitBy(e.clientX - orbit.x, e.clientY - orbit.y); orbit = { x: e.clientX, y: e.clientY }; }
      el.style.cursor = pan ? 'move' : grab ? 'grabbing' : room.bladeAt(e.clientX, e.clientY) != null ? 'crosshair' : 'grab';
    };
    const up = (e: PointerEvent) => {
      if (e.button === 0 && grab) {
        // A click that went nowhere is a blaster bolt, if it landed on the blade.
        const still = Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 5 && performance.now() - grab.at < 250;
        const at = still ? room.bladeAt(e.clientX, e.clientY) : null;
        if (at != null) room.trigger('blast', at);
        grab = null; room.release();
      } else if (e.button === 1) pan = null; else orbit = null;
    };
    // Plain scroll twists the hilt, which is what the hand would do; Ctrl+scroll (and a trackpad pinch, which
    // Chromium reports the same way) zooms.
    const wheel = (e: WheelEvent) => { e.preventDefault(); if (e.ctrlKey) room.zoomBy(Math.max(-3, Math.min(3, e.deltaY / 100))); else room.addTwist(e.deltaY * 0.12); };
    const dbl = () => room.setOn(!room.isOn);
    const menu = (e: Event) => e.preventDefault();
    // Chromium starts its own autoscroll on a middle press unless told not to.
    const noAutoscroll = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const k = e.key.toLowerCase();
      if (k === '+' || k === '=') { room.zoomBy(-1); return; }
      if (k === '-' || k === '_') { room.zoomBy(1); return; }
      if (k === ' ') { e.preventDefault(); room.setOn(!room.isOn); setHold(null); } else if (k === 'c') room.trigger('clash'); else if (k === 'b') room.trigger('blast'); else if (k === 's') room.trigger('stab'); else if (k === 'r') room.resetPose();
      else { const h = HOLDS.find((x) => x.key === k); if (h && !e.repeat) setHold(holdRef.current === h.type ? null : h.type); }
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('dblclick', dbl); el.addEventListener('contextmenu', menu); el.addEventListener('mousedown', noAutoscroll);
    window.addEventListener('keydown', key);
    const igniteSoon = setTimeout(() => room.setOn(true), 500);
    return () => {
      clearTimeout(igniteSoon); ro.disconnect(); window.removeEventListener('keydown', key);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl); el.removeEventListener('contextmenu', menu); el.removeEventListener('mousedown', noAutoscroll);
      room.dispose(); scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { scene.current?.setLook(lookId, args); setHold(null); }, [lookId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setArgs(args); }, [args]);
  useEffect(() => { scene.current?.setLockup(hold); }, [hold]);
  useEffect(() => { if (!motion.on && hold) setHold(null); }, [motion.on, hold]);

  const colours = look.args.filter((n) => argInfo(n).kind === 'color');
  const room = scene.current;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '-18px -24px', overflow: 'hidden' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} role="img" aria-label="A saber in a dark room. Drag to move the hand that holds it." />
      {failed && <div className="note red" style={{ position: 'absolute', left: 20, top: 20, maxWidth: 420 }}><Icon name="x" /><span>The demo room needs WebGL, which is not available here. {failed}</span></div>}

      <section className="panel" style={{ position: 'absolute', left: 20, top: 20, width: 300, background: 'rgba(12,17,23,.88)' }} aria-label="Demo controls">
        <div className="pb col" style={{ gap: 12, padding: 14 }}>
          <label className="field"><span className="label">Look</span>
            <span className="input sans"><span className="ellip">{look.name}</span><span className="caret"><Icon name="down" /></span>
              <select value={lookId} aria-label="Look" onChange={(e) => { setLookId(e.target.value); setTried({}); }}>{LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></span>
          </label>
          <span className="hint" style={{ fontSize: 12 }}>{look.description}</span>
          {colours.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {colours.map((n) => {
                const shown = tried[n] ?? look.defaults?.[n] ?? (n === 1 ? look.preview : '#ffffff');
                return (
                  <label key={n} className={`swatch ${tried[n] ? '' : 'linked'}`} style={{ width: 'auto', height: 28, padding: '0 8px', gap: 6 }} title={argInfo(n).name}>
                    <span className="sq" style={{ width: 12, height: 12, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                    <span className="small nowrap">{argInfo(n).name.replace(/ colour$/i, '')}</span>
                    <input type="color" value={shown} aria-label={argInfo(n).name} onChange={(e) => setTried((t) => ({ ...t, [n]: e.target.value }))} />
                  </label>
                );
              })}
            </div>
          )}
          <div className="col" style={{ gap: 4 }}>
            <span className="label">Mouse control</span>
            <div className="seg" role="radiogroup" aria-label="Mouse control">
              <button type="button" role="radio" aria-checked={control === 'hold'} className={control === 'hold' ? 'on' : ''} onClick={() => setControl('hold')}>Hold the hilt</button>
              <button type="button" role="radio" aria-checked={control === 'steer'} className={control === 'steer' ? 'on' : ''} onClick={() => setControl('steer')}>Tilt and swing</button>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn sm pri" onClick={() => { room?.setOn(!motion.on); setHold(null); }}><span className="b"><span className="i">{motion.on ? 'Retract' : 'Ignite'}</span></span></button>
            <button type="button" className="chip" disabled={!motion.on} onClick={() => room?.trigger('clash')}>Clash</button>
            <button type="button" className="chip" disabled={!motion.on} onClick={() => room?.trigger('blast')}>Blast</button>
            <button type="button" className="chip" disabled={!motion.on} onClick={() => room?.trigger('stab')}>Stab</button>
            {HOLDS.map((h) => <button key={h.type} type="button" className={`chip ${hold === h.type ? 'sel' : ''}`} aria-pressed={hold === h.type} disabled={!motion.on} onClick={() => setHold(hold === h.type ? null : h.type)}>{h.label}</button>)}
          </div>
        </div>
      </section>

      <div className="mono" style={{ position: 'absolute', right: 20, top: 20, fontSize: 11.5, color: 'var(--dim)', textAlign: 'right', lineHeight: 1.7, pointerEvents: 'none' }} aria-live="off">
        <div>swing <span style={{ color: 'var(--text)' }}>{motion.swing}°/s</span></div>
        <div>tilt <span style={{ color: 'var(--text)' }}>{motion.tilt > 0 ? 'up ' : motion.tilt < 0 ? 'down ' : ''}{Math.abs(motion.tilt)}°</span></div>
        <div>twist <span style={{ color: 'var(--text)' }}>{motion.twist}°</span></div>
        <div className="mute">what the saber's sensors would read</div>
      </div>

      <div style={{ position: 'absolute', left: 20, bottom: 18, display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px', fontSize: 12, color: 'var(--dim)', pointerEvents: 'none' }}>
        {[...(control === 'steer' ? [['Drag left, right', 'swing the blade level with the floor'], ['Drag up, down', 'tilt it up or down']] : [['Drag', 'move your hand; the blade follows it'], ['Hand high or low', 'points the blade up or down']]), ['Scroll', 'twist the hilt'], ['Double-click or Space', 'ignite, retract'], ['Click the blade', 'blaster bolt there'], ['C  B  S', 'clash, blast, stab'], ['L  D  N', 'hold lockup, drag, lightning'], ['Right-drag', 'look around'], ['Middle-drag', 'pan the view'], ['Ctrl+scroll or + −', 'zoom'], ['R', 'reset the pose and the view']].map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><span className="mono" style={{ color: 'var(--text)', fontSize: 11.5 }}>{k}</span><span>{v}</span></div>
        ))}
      </div>
      <section className="panel" style={{ position: 'absolute', right: 20, bottom: 18, width: 280, background: 'rgba(12,17,23,.88)' }} aria-label="Scene">
        <div className="row between" style={{ padding: '8px 12px' }}>
          <button type="button" className="row" style={{ gap: 8 }} aria-expanded={sceneOpen} onClick={() => setSceneOpen((o) => !o)}><Icon name={sceneOpen ? 'down' : 'up'} /><b style={{ fontWeight: 600, fontSize: 13 }}>Scene</b></button>
          {sceneOpen && <button type="button" className="holo small" onClick={() => setLook3d({ ...DEFAULT_SCENE })}>Reset</button>}
        </div>
        {sceneOpen && (
          <div className="col" style={{ gap: 7, padding: '2px 12px 12px', fontSize: 12 }}>
            {SLIDERS.map((sl) => (
              <label key={sl.key} className="row" style={{ gap: 8 }} title={sl.hint}>
                <span className="dim" style={{ width: 76, flex: 'none' }}>{sl.label}</span>
                <input type="range" min={sl.min} max={sl.max} step={sl.step} value={look3d[sl.key]} aria-label={sl.hint} style={{ flex: 1, minWidth: 0 }} onChange={(e) => setLook3d((v) => ({ ...v, [sl.key]: Number(e.target.value) }))} />
                <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{look3d[sl.key].toFixed(look3d[sl.key] < 1 && sl.max <= 1 ? 2 : 1)}</span>
              </label>
            ))}
            <div className="col" style={{ gap: 6, paddingTop: 6, marginTop: 2, borderTop: '1px solid var(--line)' }}>
              <label className="row" style={{ gap: 8 }} title="Blade length, in inches">
                <span className="dim" style={{ width: 76, flex: 'none' }}>Blade</span>
                <input type="range" min={20} max={40} step={1} value={look3d.bladeInches} aria-label="Blade length in inches" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setLook3d((v) => ({ ...v, bladeInches: Number(e.target.value) }))} />
                <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{look3d.bladeInches}"</span>
              </label>
              <div className="row" style={{ gap: 8 }} title="How densely the strip inside is populated. The count follows from the length: a shorter blade has fewer LEDs, and every look runs on that many.">
                <span className="dim" style={{ width: 76, flex: 'none' }}>Strip</span>
                <span className="input sans" style={{ height: 28, fontSize: 12, width: 92, flex: 'none' }}><span className="ellip">{look3d.ledsPerMetre}/m</span><span className="caret"><Icon name="down" /></span>
                  <select value={look3d.ledsPerMetre} aria-label="LEDs per metre of strip" onChange={(e) => setLook3d((v) => ({ ...v, ledsPerMetre: Number(e.target.value) }))}>{STRIP_DENSITIES.map((d) => <option key={d} value={d}>{d} per metre</option>)}</select></span>
                <span className="mono mute" style={{ flex: 1, textAlign: 'right' }}>{ledsFor(look3d.bladeInches * 0.0254, look3d.ledsPerMetre)} LEDs</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="dim" style={{ width: 76, flex: 'none' }}>Diameter</span>
                <div className="seg" role="radiogroup" aria-label="Blade diameter" style={{ height: 28 }}>
                  {(Object.keys(BLADE_DIAMETERS) as BladeDiameter[]).map((d) => <button key={d} type="button" role="radio" aria-checked={look3d.bladeDiameter === d} className={look3d.bladeDiameter === d ? 'on' : ''} style={{ height: 26, padding: '0 10px', fontSize: 12 }} onClick={() => setLook3d((v) => ({ ...v, bladeDiameter: d }))}>{d}"</button>)}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="dim" style={{ width: 76, flex: 'none' }}>Hilt</span>
                <span className="input sans" style={{ height: 28, fontSize: 12 }}><span className="ellip">{hilt?.name ?? 'Built-in'}</span><span className="caret"><Icon name="down" /></span>
                  <select value={hilt?.name ?? ''} aria-label="Hilt model" onChange={(e) => setHiltName(e.target.value)}><option value="">Built-in</option>{hilts.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}</select></span>
                <label className="chip" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }} title="Load a .glb, .obj or .stl file. For an OBJ, select its .mtl and textures with it."><Icon name="import" />Load
                  <input type="file" multiple accept=".glb,.gltf,.obj,.stl,.mtl,.png,.jpg,.jpeg,.webp,.tga" aria-label="Load a hilt model" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { void loadHiltFiles(e.target.files); e.target.value = ''; }} /></label>
              </div>
              {hilt && (
                <>
                  <label className="row" style={{ gap: 8 }} title="Overall length of the hilt">
                    <span className="dim" style={{ width: 76, flex: 'none' }}>Length</span>
                    <input type="range" min={15} max={45} step={0.5} value={hilt.fit.lengthCm ?? Math.round((hiltLength ?? 0.28) * 200) / 2} aria-label="Hilt length in centimetres" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ lengthCm: Number(e.target.value) })} />
                    <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit.lengthCm ?? (hiltLength ?? 0.28) * 100).toFixed(0)}cm</span>
                  </label>
                  <label className="row" style={{ gap: 8 }} title="Turn the hilt about the blade so its controls face where you want">
                    <span className="dim" style={{ width: 76, flex: 'none' }}>Turn</span>
                    <input type="range" min={-180} max={180} step={5} value={hilt.fit.rollDeg} aria-label="Turn the hilt about the blade" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ rollDeg: Number(e.target.value) })} />
                    <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{hilt.fit.rollDeg}°</span>
                  </label>
                  {([['Shift X', 'offsetXmm'], ['Shift Z', 'offsetZmm']] as ['Shift X' | 'Shift Z', 'offsetXmm' | 'offsetZmm'][]).map(([label, key]) => (
                    <label key={key} className="row" style={{ gap: 8 }} title="Slide the hilt sideways so the blade sits in its bore. In millimetres, in the hilt's own frame, so it stays put when you turn it.">
                      <span className="dim" style={{ width: 76, flex: 'none' }}>{label}</span>
                      <input type="range" min={-30} max={30} step={0.5} value={hilt.fit[key] ?? 0} aria-label={`${label}: sideways shift in millimetres`} style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ [key]: Number(e.target.value) })} />
                      <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit[key] ?? 0).toFixed(1)}</span>
                    </label>
                  ))}
                  <div className="row between">
                    <label className="row" style={{ gap: 10 }}><button type="button" className={`tog ${hilt.fit.flip ? 'on' : ''}`} role="switch" aria-checked={hilt.fit.flip} aria-label="Blade comes out of the other end" onClick={() => setFit({ flip: !hilt.fit.flip })}><i /></button><span className="dim">Blade at the other end</span></label>
                    <button type="button" className="holo small" onClick={forgetHilt}>Remove</button>
                  </div>
                </>
              )}
              {hiltNote && <span className="red small">{hiltNote}</span>}
            </div>
            <label className="row" style={{ gap: 10, paddingTop: 2 }}>
              <button type="button" className={`tog ${look3d.grid ? 'on' : ''}`} role="switch" aria-checked={look3d.grid} aria-label="Floor grid" onClick={() => setLook3d((v) => ({ ...v, grid: !v.grid }))}><i /></button>
              <span className="dim">Floor grid</span>
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
