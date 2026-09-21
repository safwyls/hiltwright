// The demo room: pick a look, grab the saber, swing it. Everything the blade shows comes from the LED simulator,
// driven by the motion of the saber on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SIMULATED_LOOKS, STARTER_LOOKS, argInfo, hexToColorWord, type LockupType } from '@hiltwright/core';
import { DemoScene, type Motion } from './demoScene';
import { Icon } from './Icon';

const LOOKS = STARTER_LOOKS.filter((l) => SIMULATED_LOOKS.includes(l.id) && (l.roles.includes('main') || l.roles.includes('side')));
const HOLDS: { type: LockupType; label: string; key: string }[] = [{ type: 'normal', label: 'Lockup', key: 'l' }, { type: 'drag', label: 'Drag', key: 'd' }, { type: 'lb', label: 'Lightning', key: 'n' }];

export function Demo({ initialLook }: { initialLook?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<DemoScene | null>(null);
  const [lookId, setLookId] = useState(() => (initialLook && LOOKS.some((l) => l.id === initialLook) ? initialLook : LOOKS[0].id));
  const [tried, setTried] = useState<Record<number, string>>({});
  const [hold, setHold] = useState<LockupType | null>(null);
  const [motion, setMotion] = useState<Motion>({ swing: 0, tilt: 0, twist: 0, on: false });
  const [failed, setFailed] = useState<string | null>(null);
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
        {[['Drag', 'move your hand; the blade follows it'], ['Hand high or low', 'points the blade up or down'], ['Scroll', 'twist the hilt'], ['Double-click or Space', 'ignite, retract'], ['Click the blade', 'blaster bolt there'], ['C  B  S', 'clash, blast, stab'], ['L  D  N', 'hold lockup, drag, lightning'], ['Right-drag', 'look around'], ['Middle-drag', 'pan the view'], ['Ctrl+scroll or + −', 'zoom'], ['R', 'reset the pose and the view']].map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><span className="mono" style={{ color: 'var(--text)', fontSize: 11.5 }}>{k}</span><span>{v}</span></div>
        ))}
      </div>
    </div>
  );
}
