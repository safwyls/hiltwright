// A live preview of a look: the core simulator computes what ProffieOS would put on each LED, and the shared
// PixiJS renderer draws it as a diffused blade. Only Hiltwright's own looks can be simulated; pasted C++ cannot,
// and falls back to a flat bar in its main colour.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BladeSim, canSimulateLook, type LockupType } from '@hiltwright/core';
import { addPreview, bladeRenderer } from './bladeRender';
import { BladeBar, Hilt } from './Saber';
import { MotionPad } from './MotionPad';

export const canSimulate = (lookId: string | null | undefined): lookId is string => !!lookId && canSimulateLook(lookId);

interface Props {
  lookId: string | null | undefined;
  /** The preset's style arguments for this blade (argument number to word). Compiled defaults apply where absent. */
  args?: ReadonlyMap<number, string> | null;
  /** Colour for the fallback bar when the look cannot be simulated. */
  fallbackColor?: string;
  leds?: number;
  /** A single LED (crystal chamber, accent) instead of a blade. */
  dot?: boolean;
  hilt?: boolean;
  /** 'compact' is one row of triggers with no swing slider or explanation, for use beside other controls. */
  controls?: boolean | 'compact';
  size?: 'sm' | 'md';
}

export function BladePreview({ lookId, args, fallbackColor = '#3d7bff', leds = 132, dot, hilt, controls, size = 'md' }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<BladeSim | null>(null);
  const [on, setOn] = useState(true);
  const [lockup, setLockup] = useState<LockupType | null>(null);
  const [swing, setSwing] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [twist, setTwist] = useState(0);
  const [broken, setBroken] = useState(bladeRenderer.unavailable);
  const ok = canSimulate(lookId) && !broken;
  const n = dot ? 1 : leds;
  const height = size === 'sm' ? 36 : 60;
  const radius = dot ? (size === 'sm' ? 6 : 9) : size === 'sm' ? 4.5 : 7;
  const argKey = useMemo(() => (args ? [...args].map(([k, v]) => `${k}=${v}`).join(' ') : ''), [args]);

  useEffect(() => {
    if (!ok || !lookId) { simRef.current = null; return; }
    const sim = new BladeSim(lookId, n, 1 + Math.floor(Math.random() * 1e6));
    sim.setOn(true);
    simRef.current = sim;
    setOn(true); setLockup(null); setSwing(0); setTilt(0); setTwist(0);
    const el = canvas.current; const box = wrap.current;
    const ctx = el?.getContext('2d') ?? null;
    if (!el || !box || !ctx) return;
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => { width = box.clientWidth; });
    ro.observe(box);
    const remove = addPreview({
      visible() {
        if (!el.isConnected || el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      },
      tick(now) {
        if (bladeRenderer.unavailable) { setBroken(true); return; }
        if (width < 8) return;
        bladeRenderer.draw(el, ctx, { leds: sim.frame(now), width, height, radius, pad: dot ? 0 : Math.min(28, height / 2), dot });
      },
    });
    return () => { remove(); ro.disconnect(); };
  }, [ok, lookId, n, height, radius, dot]);

  useEffect(() => { simRef.current?.setArgs(new Map(args ?? [])); }, [argKey, lookId, ok]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { simRef.current?.setOn(on); }, [on]);
  useEffect(() => { simRef.current?.setLockup(lockup, 0.55); }, [lockup]);
  useEffect(() => { simRef.current?.setSwing(swing); }, [swing]);
  useEffect(() => { simRef.current?.setAngle(tilt); }, [tilt]);
  useEffect(() => { simRef.current?.setTwist(twist); }, [twist]);

  if (!ok) {
    return (
      <div className="col" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 0, height, paddingRight: 28 }}>{hilt && <Hilt />}<BladeBar color={fallbackColor} thin={size === 'sm'} /></div>
        {controls && <span className="hint">{broken ? 'The live preview needs WebGL, which is not available here. This bar only shows the main colour.' : 'No live preview for this look: only Hiltwright’s own looks can be simulated. This bar only shows its main colour.'}</span>}
      </div>
    );
  }

  const hit = (type: 'clash' | 'blast' | 'stab', pos = 0.35 + Math.random() * 0.4) => { if (on) simRef.current?.trigger(type, pos); };
  const hold = (t: LockupType, label: string) => (
    <button type="button" className={`chip ${lockup === t ? 'sel' : ''}`} aria-pressed={lockup === t} disabled={!on} onClick={() => setLockup(lockup === t ? null : t)}>{label}</button>
  );

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 0 }}>
        {hilt && <Hilt />}
        <div ref={wrap} className="grow" style={{ minWidth: 0, height, marginLeft: hilt ? -1 : 0 }}>
          <canvas ref={canvas} style={{ width: '100%', height, display: 'block', cursor: controls && !dot ? 'crosshair' : undefined }} aria-label="Simulated blade"
            onClick={(e) => { if (!controls || dot) return; const r = e.currentTarget.getBoundingClientRect(); hit('blast', Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width - Math.min(28, height / 2))))); }} />
        </div>
      </div>
      {controls === 'compact' && (
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className="chip" onClick={() => { setOn(!on); setLockup(null); }}>{on ? 'Retract' : 'Ignite'}</button>
          <button type="button" className="chip" disabled={!on} onClick={() => hit('clash')}>Clash</button>
          <button type="button" className="chip" disabled={!on} onClick={() => hit('blast')}>Blast</button>
          {!dot && hold('normal', 'Lockup')}
          <span className="hint">preview only</span>
        </div>
      )}
      {controls === true && (
        <div className="col" style={{ gap: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn sm" onClick={() => { setOn(!on); setLockup(null); }}><span className="b"><span className="i">{on ? 'Retract' : 'Ignite'}</span></span></button>
            <button type="button" className="chip" disabled={!on} onClick={() => hit('clash')}>Clash</button>
            <button type="button" className="chip" disabled={!on} onClick={() => hit('blast')}>Blast</button>
            {!dot && <button type="button" className="chip" disabled={!on} onClick={() => hit('stab')}>Stab</button>}
            {!dot && hold('normal', 'Lockup')}
            {!dot && hold('drag', 'Drag')}
            {!dot && hold('lb', 'Lightning')}
          </div>
          {!dot && (
            <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
              <MotionPad tilt={tilt} color={fallbackColor} onTilt={setTilt} onSwing={setSwing} />
              <div className="col grow" style={{ gap: 4, fontSize: 12, justifyContent: 'center', minWidth: 0 }}>
                <span className="small" style={{ fontWeight: 600 }}>Move it</span>
                <span className="hint" style={{ fontSize: 11.5 }}>Drag the saber to tilt it; drag fast to swing. Tilt is what the saber reads from gravity, swing and twist from its gyro.</span>
                {([['Swing', swing, setSwing, 0, 600, 10, `${swing}°/s`, 'Swing speed'], ['Tilt', tilt, setTilt, -90, 90, 5, `${tilt > 0 ? 'up ' : tilt < 0 ? 'down ' : ''}${Math.abs(tilt)}°`, 'Blade tilt, from pointing down to pointing up'], ['Twist', twist, setTwist, -180, 180, 5, `${twist}°`, 'Hilt rolled about the blade']] as [string, number, (v: number) => void, number, number, number, string, string][]).map(([label, value, set, min, max, step, shown, aria]) => (
                  <label key={label} className="row" style={{ gap: 8 }}>
                    <span className="dim" style={{ width: 34, flex: 'none' }}>{label}</span>
                    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} aria-label={aria} />
                    <span className="mono mute nowrap" style={{ width: 62, textAlign: 'right' }}>{shown}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <span className="hint" title="The preview runs the same per-LED maths as the saber. Sound is a stand-in, so hum-driven flicker is typical rather than exact.">{dot ? 'Simulated LED by LED.' : 'Simulated LED by LED. Click the blade to land a blast; clashes and lockups land where the tilt puts them.'}</span>
        </div>
      )}
    </div>
  );
}
