// A number on a layer card: fixed, or reacting to the saber (Scale<Sensor, Int<a>, Int<b>>). Reacting reads left to
// right as "Position ⚡ reacts to [blade angle]", then says what it does at each end of the sensor's range in plain
// terms ("Pointing down: 79% up the blade"). For blade angle a half-circle gauge marks the stretch of tilt it changes
// over, which is BladeAngle<MIN,MAX>; outside that stretch the number holds its end value.

import { createContext, useContext, useRef } from 'react';
import { SENSORS, waveSize, waveWidth, curveAt, curvePoints, defaultWindow, numNode, numView, pairEnds, parseStyle, setCurvePoints, setPairEnds, type Node, type NumView, type NumberUnit, type Pair, type Pose, type SensorKey, type SensorWindow } from '@hiltwright/core';
import { Icon } from './Icon';
import { NodeCard } from './NodeCard';
import { Select } from './Select';

/**
 * Called as a Where control is dragged: the card holds its effect on in the preview and poses the saber to match the end
 * being set (the tilt of a blade-angle end, the speed of a swing end). No pose just keeps the effect showing.
 */
export const PreviewPose = createContext<(p?: Pose) => void>(() => undefined);

/** How to hold the saber to show one end of a sensor's range. */
function poseFor(sensor: SensorKey, w: SensorWindow | null, end: 'lo' | 'hi'): Pose | undefined {
  if (sensor === 'angle') { const [lo, hi] = w ?? [0, FULL]; return { tilt: toDeg(end === 'lo' ? lo : hi) }; }
  if (sensor === 'swing') return { swing: end === 'lo' ? 0 : (w?.[1] ?? 400) };
  if (sensor === 'twist') return { twist: end === 'lo' ? 0 : 90 };
  return undefined;
}

/** What a blade number measures: a point along it, a length of it, how solid it is, or a plain number. */
export type Unit = 'pos' | 'size' | 'strength' | 'raw';

const FULL = 32768;
const pct = (v: number): number => Math.round((v / FULL) * 100);
const parse = (s: string | null | undefined): Node | undefined => { if (!s) return undefined; try { return parseStyle(s); } catch { return undefined; } };

/** Blade angle in the sensor's units (0 pointing down, 32768 pointing up) as degrees from level, and back. */
const toDeg = (raw: number): number => Math.round(-90 + (raw / FULL) * 180);
const fromDeg = (deg: number): number => Math.round(((deg + 90) / 180) * FULL);
/** Tilt in words, rounded to 5°; within a few degrees of level is level (ProffieOS's 16000 is 2° short of it). */
const degWords = (deg: number): string => { const d = Math.abs(deg) <= 3 ? 0 : Math.round(deg / 5) * 5; return d === 0 ? 'level' : d <= -90 ? 'pointing down' : d >= 90 ? 'pointing up' : `${Math.abs(d)}° ${d < 0 ? 'down' : 'up'}`; };

function valueWords(v: number, unit: Unit): string {
  if (unit === 'raw') return String(v);
  const p = pct(v);
  if (unit === 'pos') return p <= 0 ? 'at the hilt' : p >= 100 ? 'at the tip' : `${p}% up`;
  if (unit === 'size') return `${p}% of the blade`;
  return `${p}%`;
}

/** The two ends of a sensor's range, as the rows of a reacting number call them. */
function endWords(sensor: SensorKey, w: SensorWindow | null): [string, string] {
  if (sensor === 'angle' && w) {
    const [lo, hi] = [toDeg(w[0]), toDeg(w[1])];
    return [lo <= -90 ? 'Pointing down' : `At ${degWords(lo)} or lower`, hi >= 90 ? 'Pointing up' : `At ${degWords(hi)} or higher`];
  }
  if (sensor === 'swing' && w) return ['Held still', `Swinging ${w[1]}°/s or faster`];
  return [SENSORS[sensor].lo, SENSORS[sensor].hi];
}

/** A value along the blade (or any number, as a plain input when it cannot be one). */
function BladeValue({ value, unit, label, onChange, onTouch, meaning }: { value: number; unit: Unit; label: string; onChange: (v: number) => void; onTouch?: () => void; meaning?: NumberUnit | null }) {
  if (unit === 'raw' && meaning) return <span onFocus={onTouch} onPointerDown={onTouch}><NumberBox value={value} unit={meaning} label={label} friendly onChange={(v) => { onTouch?.(); onChange(v); }} /></span>;
  if (unit === 'raw' || value < 0 || value > FULL) return <input type="number" className="num" value={value} aria-label={label} onFocus={onTouch} onChange={(e) => { onTouch?.(); onChange(Math.trunc(Number(e.target.value) || 0)); }} />;
  return (
    <>
      <span className={`slider bslider ${unit}`}>
        <span className="track" />{unit !== 'pos' && <span className="fill" style={{ width: `${pct(value)}%` }} />}
        <input type="range" min={0} max={FULL} step={328} value={value} aria-label={label} aria-valuetext={valueWords(value, unit)} onPointerDown={onTouch} onChange={(e) => { onTouch?.(); onChange(Number(e.target.value)); }} />
      </span>
      <span className="val">{valueWords(value, unit)}</span>
    </>
  );
}

/** A half circle of blade tilt, pointing down at the bottom and up at the top, with the stretch it reacts over marked. */
export function AngleGauge({ window, onChange, onTouch }: { window: SensorWindow; onChange: (w: SensorWindow) => void; onTouch?: (deg: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<0 | 1 | null>(null);
  const [lo, hi] = [toDeg(window[0]), toDeg(window[1])];
  const cx = 30, cy = 64, r = 50;
  const pt = (deg: number, rr = r): [number, number] => [cx + rr * Math.cos((deg * Math.PI) / 180), cy - rr * Math.sin((deg * Math.PI) / 180)];
  const arc = (a: number, b: number): string => { const [x1, y1] = pt(a); const [x2, y2] = pt(b); return `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`; };
  const set = (end: 0 | 1, deg: number) => {
    const d = Math.max(-90, Math.min(90, Math.round(deg / 5) * 5));
    const next: [number, number] = end === 0 ? [Math.min(d, hi - 5), hi] : [lo, Math.max(d, lo + 5)];
    onTouch?.(next[end]);
    onChange([fromDeg(next[0]), fromDeg(next[1])]);
  };
  const degAt = (e: React.PointerEvent): number => {
    const box = svg.current!.getBoundingClientRect(); const k = 140 / box.height;
    return (Math.atan2(cy - ((e.clientY - box.top) * k - 6), (e.clientX - box.left) * k - cx) * 180) / Math.PI;
  };
  const handle = (end: 0 | 1, deg: number) => {
    const [x, y] = pt(deg);
    return (
      <circle cx={x} cy={y} r={6.5} className="ghandle" tabIndex={0} role="slider" aria-label={end === 0 ? 'Starts changing at' : 'Stops changing at'}
        aria-valuemin={-90} aria-valuemax={90} aria-valuenow={deg} aria-valuetext={degWords(deg)}
        onKeyDown={(e) => { const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0; if (step) { e.preventDefault(); set(end, deg + step); } }} />
    );
  };
  return (
    <svg ref={svg} viewBox="0 -6 100 140" className="gauge" aria-label="The stretch of blade tilt it changes over"
      onPointerDown={(e) => { const d = degAt(e); drag.current = Math.abs(d - lo) <= Math.abs(d - hi) ? 0 : 1; (e.target as Element).setPointerCapture?.(e.pointerId); set(drag.current, d); }}
      onPointerMove={(e) => { if (drag.current != null) set(drag.current, degAt(e)); }}
      onPointerUp={() => { drag.current = null; }}>
      <path d={arc(-90, 90)} className="garc" />
      <path d={arc(lo, hi)} className="garc on" />
      {[-90, -45, 0, 45, 90].map((d) => { const [x1, y1] = pt(d, r - 4); const [x2, y2] = pt(d, r + 4); return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} className="gtick" />; })}
      <rect x={cx - 14} y={cy - 3} width={14} height={6} className="ghilt" />
      <text x={cx} y={cy - r - 9} className="glabel" textAnchor="middle">up</text>
      <text x={cx + r + 6} y={cy + 3} className="glabel">level</text>
      <text x={cx} y={cy + r + 15} className="glabel" textAnchor="middle">down</text>
      {handle(0, lo)}{handle(1, hi)}
    </svg>
  );
}

/** A number on a layer card. `unit` says how a blade number reads; `bare` numbers (INTEGER slots) cannot react. */
export function NumControl({ node, def, unit, bare, label, hint, onChange, meaning }: { node: Node | undefined; def?: string | null; unit: Unit; bare?: boolean; label: string; hint?: string; onChange: (n: Node) => void; /** For a plain number: its unit and bounds (ms, ‰). */ meaning?: NumberUnit | null }) {
  const pose = useContext(PreviewPose);
  const cur = node ?? parse(def);
  const v = numView(cur);
  if (v.mode === 'other') return cur ? <NodeCard node={cur} kind="FUNCTION" label={label} hint={hint} depth={1} onChange={onChange} /> : null;
  const set = (next: NumView) => onChange(numNode(next, cur, bare));
  const start = (sensor: SensorKey, from: number, to: number) => set({ mode: 'follow', sensor, from, to, window: defaultWindow(sensor) });

  if (v.mode === 'fixed') {
    const other = unit === 'raw' ? v.value * 2 || 1000 : Math.max(0, Math.min(FULL, v.value > FULL / 2 ? v.value - 12000 : v.value + 12000));
    return (
      <div className="lnum">
        <div className="lhead">
          <span className="small lnl" title={hint}>{label}</span>
          {!bare && <button type="button" className="zap" title="Make it change with the saber's motion or sound" onClick={() => start(unit === 'pos' ? 'angle' : 'swing', v.value, other)}><Icon name="bolt" />Reacts to…</button>}
        </div>
        <div className="lval"><BladeValue value={v.value} unit={unit} label={label} meaning={meaning} onTouch={() => pose()} onChange={(x) => set({ mode: 'fixed', value: x })} /></div>
      </div>
    );
  }

  const [loWords, hiWords] = endWords(v.sensor, v.window);
  const gauge = v.sensor === 'angle' && v.window;
  return (
    <div className="lnum react">
      <div className="lhead">
        <span className="small lnl" title={hint}>{label}</span>
        <span className="zap on">
          <Icon name="bolt" />Reacts to
          <Select className="bare" value={v.sensor} aria-label={`What ${label.toLowerCase()} reacts to`} onChange={(e) => set({ ...v, sensor: e.target.value as SensorKey, window: defaultWindow(e.target.value as SensorKey) })}>
            {(Object.keys(SENSORS) as SensorKey[]).map((k) => <option key={k} value={k}>{SENSORS[k].name.toLowerCase()}</option>)}
          </Select>
          <button type="button" className="unzap" aria-label="Stop reacting: use one fixed value" title="Stop reacting: use one fixed value" onClick={() => set({ mode: 'fixed', value: v.from })}><Icon name="x" /></button>
        </span>
      </div>
      <div className={gauge ? 'reactbody gauged' : 'reactbody'}>
        {gauge && <AngleGauge window={v.window!} onTouch={(deg) => pose({ tilt: deg })} onChange={(w) => set({ ...v, window: w })} />}
        <div className="ends">
          <div className="end"><span className="endl">{loWords}</span><div className="lval"><BladeValue value={v.from} unit={unit} meaning={meaning} label={`${label}, ${loWords.toLowerCase()}`} onTouch={() => pose(poseFor(v.sensor, v.window, 'lo'))} onChange={(x) => set({ ...v, from: x })} /></div></div>
          <div className="end"><span className="endl">{hiWords}</span><div className="lval"><BladeValue value={v.to} unit={unit} meaning={meaning} label={`${label}, ${hiWords.toLowerCase()}`} onTouch={() => pose(poseFor(v.sensor, v.window, 'hi'))} onChange={(x) => set({ ...v, to: x })} /></div></div>
          {v.sensor === 'swing' && v.window && (
            <div className="end"><span className="endl">Full effect at</span><div className="lval"><input type="number" className="num" min={10} step={10} value={v.window[1]} aria-label="Swing speed for the full effect, degrees a second" onChange={(e) => { const w: SensorWindow = [0, Math.max(1, Math.trunc(Number(e.target.value) || 0))]; pose({ swing: w[1] }); set({ ...v, window: w }); }} /><span className="hint">°/s, changing smoothly in between</span></div></div>
          )}
          {gauge && <span className="hint">Drag the marks on the half circle to set the tilt it changes over. Tilted past them, it holds its end value.</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * What a pair reacts to. The template's definition fixes it; picking something else unpacks the template into the same
 * layer written out in full (see unlockPair), where it can follow anything.
 */
function PairPill({ sensor, label, onUnlock }: { sensor: SensorKey; label: string; onUnlock?: (s: SensorKey) => void }) {
  if (!onUnlock) return <span className="zap on locked" title="The template decides what this reacts to"><Icon name="bolt" />Reacts to {SENSORS[sensor].name.toLowerCase()}</span>;
  return (
    <span className="zap on" title="Pick something else and the layer is written out in full so it can react to it. The layer looks and runs the same.">
      <Icon name="bolt" />Reacts to
      <Select className="bare" value={sensor} aria-label={`What ${label.toLowerCase()} reacts to`} onChange={(e) => onUnlock(e.target.value as SensorKey)}>
        {(Object.keys(SENSORS) as SensorKey[]).map((k) => <option key={k} value={k}>{SENSORS[k].name.toLowerCase()}</option>)}
      </Select>
    </span>
  );
}

/** Two template parameters shown as one reacting number: ResponsiveDragL's SIZE1 and SIZE2 are its size untwisted and twisted. */
export function PairControl({ layer, pair, unit, hint, onChange, onUnlock }: { layer: Node; pair: Pair; unit: Unit; hint?: string; onChange: (n: Node) => void; onUnlock?: (s: SensorKey) => void }) {
  const pose = useContext(PreviewPose);
  const { from, to } = pairEnds(layer, pair);
  const [loWords, hiWords] = endWords(pair.sensor, pair.window);
  return (
    <div className="lnum react">
      <div className="lhead"><span className="small lnl" title={hint}>{pair.label}</span><PairPill sensor={pair.sensor} label={pair.label} onUnlock={onUnlock} /></div>
      <div className="ends">
        <div className="end"><span className="endl">{loWords}</span><div className="lval"><BladeValue value={from} unit={unit} label={`${pair.label}, ${loWords.toLowerCase()}`} onTouch={() => pose(poseFor(pair.sensor, pair.window, 'lo'))} onChange={(x) => onChange(setPairEnds(layer, pair, x, to))} /></div></div>
        <div className="end"><span className="endl">{hiWords}</span><div className="lval"><BladeValue value={to} unit={unit} label={`${pair.label}, ${hiWords.toLowerCase()}`} onTouch={() => pose(poseFor(pair.sensor, pair.window, 'hi'))} onChange={(x) => onChange(setPairEnds(layer, pair, from, x))} /></div></div>
      </div>
    </div>
  );
}

const CHECKPOINTS: ['down' | 'level' | 'up', string, number][] = [['down', 'Pointing down', 0], ['level', 'Level', 0.5], ['up', 'Pointing up', 1]];

/**
 * Where an effect lands as the blade tilts, for the effect layers whose position follows the angle twice over
 * (ResponsiveClashL, ResponsiveLockupL). Three checkpoints, and a curve of everything in between; drag a point on the
 * curve or use its slider.
 */
export function CurveControl({ layer, pair, hint, onChange, onUnlock }: { layer: Node; pair: Pair; hint?: string; onChange: (n: Node) => void; onUnlock?: (s: SensorKey) => void }) {
  const pts = curvePoints(layer, pair);
  const pose = useContext(PreviewPose);
  const TILT = { down: -90, level: 0, up: 90 } as const;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<'down' | 'level' | 'up' | null>(null);
  const W = 170, H = 112, L = 30, T = 8, PW = 128, PH = 84; // plot area: tilt across, hilt (bottom) to tip (top) up
  const x = (a: number) => L + a * PW;
  const y = (v: number) => T + (1 - Math.max(0, Math.min(FULL, v)) / FULL) * PH;
  const put = (k: 'down' | 'level' | 'up', v: number) => { pose({ tilt: TILT[k] }); onChange(setCurvePoints(layer, pair, { ...pts, [k]: Math.max(0, Math.min(FULL, Math.round(v / 328) * 328)) })); };
  const valueAt = (e: React.PointerEvent): number => { const box = svg.current!.getBoundingClientRect(); const py = ((e.clientY - box.top) / box.height) * H; return (1 - (py - T) / PH) * FULL; };
  const path = Array.from({ length: 33 }, (_, i) => { const a = i / 32; return `${i ? 'L' : 'M'} ${x(a).toFixed(1)} ${y(curveAt(layer, pair, a)).toFixed(1)}`; }).join(' ');
  return (
    <div className="lnum react">
      <div className="lhead"><span className="small lnl" title={hint}>{pair.label}</span><PairPill sensor="angle" label={pair.label} onUnlock={onUnlock} /></div>
      <div className="reactbody curved">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="curve" role="img" aria-label={`Where it lands: ${CHECKPOINTS.map(([k, w]) => `${w.toLowerCase()} ${valueWords(pts[k], 'pos')}`).join(', ')}`}
          onPointerDown={(e) => { const box = svg.current!.getBoundingClientRect(); const a = (((e.clientX - box.left) / box.width) * W - L) / PW; drag.current = a < 0.25 ? 'down' : a > 0.75 ? 'up' : 'level'; (e.target as Element).setPointerCapture?.(e.pointerId); put(drag.current, valueAt(e)); }}
          onPointerMove={(e) => { if (drag.current) put(drag.current, valueAt(e)); }}
          onPointerUp={() => { drag.current = null; }}>
          <rect x={L} y={T} width={PW} height={PH} className="cplot" />
          <line x1={x(0.5)} y1={T} x2={x(0.5)} y2={T + PH} className="cgrid" />
          <path d={path} className="cline" />
          {CHECKPOINTS.map(([k, , a]) => <circle key={k} cx={x(a)} cy={y(pts[k])} r={5} className="cdot" />)}
          <text x={L - 4} y={T + 7} className="glabel" textAnchor="end">tip</text>
          <text x={L - 4} y={T + PH} className="glabel" textAnchor="end">hilt</text>
          <text x={x(0)} y={H - 2} className="glabel" textAnchor="start">down</text>
          <text x={x(0.5)} y={H - 2} className="glabel" textAnchor="middle">level</text>
          <text x={x(1)} y={H - 2} className="glabel" textAnchor="end">up</text>
        </svg>
        <div className="ends">
          {CHECKPOINTS.map(([k, words]) => (
            <div key={k} className="end"><span className="endl">{words}</span><div className="lval"><BladeValue value={pts[k]} unit="pos" label={`Where it lands, ${words.toLowerCase()}`} onTouch={() => pose({ tilt: TILT[k] })} onChange={(v) => put(k, v)} /></div></div>
          ))}
          <span className="hint">In between, it moves along the curve. Drag a point, or use the sliders.</span>
        </div>
      </div>
    </div>
  );
}

const SUFFIX: Partial<Record<NumberUnit['kind'], string>> = { ms: 'ms', mhz: 'mHz (thousandths of a hertz)', promille: '‰ (out of 1000)', percent: '%', rpm: 'rpm', degps: '°/s', degps2: '°/s²', impact: 'clash strength' };

/**
 * A number the tree shows as it is written, with what it means beside it: a share of the blade for the 0 to 32768
 * scale (with a slider), a tilt for a blade angle, a unit for times and rates. Bounded units stop at their ends.
 */
export function NumberBox({ value, unit, label, onChange, friendly }: { value: number; unit?: NumberUnit | null; label: string; onChange: (v: number) => void; /** On a card: show what the number does, not the number (a wave's width). */ friendly?: boolean }) {
  const clamp = (v: number) => Math.max(unit?.min ?? -Infinity, Math.min(unit?.max ?? Infinity, v));
  const box = <input type="number" className="num mono" value={value} min={unit?.min} max={unit?.max} aria-label={label} style={{ width: unit?.kind === 'fraction' ? 78 : 90 }} onChange={(e) => onChange(clamp(Math.trunc(Number(e.target.value) || 0)))} />;
  if (unit?.kind === 'wavewidth') {
    // ProffieOS's wave "size" is a sharpness. A card shows and sets the width it gives; the tree keeps the real number.
    const w = waveWidth(value);
    if (friendly) {
      return (
        <span className="row numbox" style={{ gap: 8 }} title={`ProffieOS writes this as ${value}: a bigger number there is a narrower wave`}>
          <span className="slider bslider size" style={{ width: 140, flex: 'none' }}><span className="track" /><span className="fill" style={{ width: `${Math.min(100, w)}%` }} />
            <input type="range" min={2} max={100} step={1} value={Math.max(2, Math.min(100, w))} aria-label={`${label}, share of the blade either side`} onChange={(e) => onChange(waveSize(Number(e.target.value)))} /></span>
          <span className="hint nowrap">{w}% of the blade either side</span>
        </span>
      );
    }
    return <span className="row numbox" style={{ gap: 8 }}>{box}<span className="hint nowrap" title="The wave shows while distance × this stays under 32 of 32768">about {w}% of the blade either side; bigger is narrower</span></span>;
  }
  if (unit?.kind === 'fraction') {
    return (
      <span className="row numbox" style={{ gap: 8 }}>
        <span className="slider bslider size" style={{ width: 90, flex: 'none' }}><span className="track" /><span className="fill" style={{ width: `${Math.max(0, Math.min(100, pct(value)))}%` }} />
          <input type="range" min={0} max={FULL} step={328} value={Math.max(0, Math.min(FULL, value))} aria-label={`${label}, share of full`} onChange={(e) => onChange(Number(e.target.value))} /></span>
        {box}<span className="hint nowrap" title="ProffieOS counts from 0 to 32768 for all the way: this is that share of full">{value < 0 || value > FULL ? 'past full' : `${pct(value)}%`}</span>
      </span>
    );
  }
  if (unit?.kind === 'angle') return <span className="row numbox" style={{ gap: 8 }}>{box}<span className="hint nowrap" title="0 is pointing straight down, 32768 straight up">{degWords(toDeg(value))}</span></span>;
  const suffix = unit ? SUFFIX[unit.kind] : undefined;
  return <span className="row numbox" style={{ gap: 8 }}>{box}{suffix && <span className="hint nowrap">{suffix}</span>}{unit?.max != null && unit.kind !== 'promille' && unit.kind !== 'percent' && <span className="hint nowrap">{unit.min ?? 0} to {unit.max}</span>}</span>;
}
