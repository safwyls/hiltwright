// A saber you can grab. Dragging it sets the tilt the firmware would read from gravity (BladeAngle) and, from how
// fast it is moved, the swing speed it would read from the gyro (SwingSpeed). The sliders beside it set the same
// values precisely and are the keyboard route; the pad is the quick, physical one.

import { useEffect, useRef } from 'react';

const SIZE = 124;
const PIVOT = { x: 22, y: SIZE / 2 };
const REACH = 88;

export function MotionPad({ tilt, color, onTilt, onSwing }: { tilt: number; color: string; onTilt: (deg: number) => void; onSwing: (degPerSec: number) => void }) {
  const drag = useRef<{ at: number; deg: number; speed: number } | null>(null);
  const decay = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (decay.current) clearInterval(decay.current); }, []);

  const degAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE - PIVOT.x;
    const y = ((e.clientY - r.top) / r.height) * SIZE - PIVOT.y;
    return Math.max(-90, Math.min(90, (Math.atan2(-y, Math.max(1, x)) * 180) / Math.PI));
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (decay.current) { clearInterval(decay.current); decay.current = null; }
    const deg = degAt(e);
    drag.current = { at: performance.now(), deg, speed: 0 };
    onTilt(Math.round(deg));
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now(); const deg = degAt(e);
    const dt = Math.max(1, now - d.at);
    // Smoothed, so one jittery sample does not read as a swing.
    d.speed = d.speed * 0.6 + (Math.abs(deg - d.deg) / dt) * 1000 * 0.4;
    d.at = now; d.deg = deg;
    onTilt(Math.round(deg));
    onSwing(Math.min(600, Math.round(d.speed / 10) * 10));
  };
  const up = () => {
    let speed = drag.current?.speed ?? 0;
    drag.current = null;
    // A hand slows down; it does not stop dead.
    decay.current = setInterval(() => {
      speed *= 0.72;
      if (speed < 8) { speed = 0; if (decay.current) { clearInterval(decay.current); decay.current = null; } }
      onSwing(Math.min(600, Math.round(speed / 10) * 10));
    }, 50);
  };

  const rad = (tilt * Math.PI) / 180;
  const tip = { x: PIVOT.x + Math.cos(rad) * REACH, y: PIVOT.y - Math.sin(rad) * REACH };
  const grip = { x: PIVOT.x + Math.cos(rad) * 18, y: PIVOT.y - Math.sin(rad) * 18 };
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} style={{ flex: 'none', border: '1px solid var(--line2)', background: '#0b1016', cursor: 'grab', touchAction: 'none' }}
      role="img" aria-label={`Motion pad. The blade is tilted ${tilt} degrees. Drag to tilt and swing it; the sliders do the same.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <path d={`M ${PIVOT.x} ${PIVOT.y - REACH} A ${REACH} ${REACH} 0 0 1 ${PIVOT.x} ${PIVOT.y + REACH}`} fill="none" stroke="var(--line2)" strokeDasharray="2 4" />
      <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x + REACH} y2={PIVOT.y} stroke="var(--line)" />
      <text x={SIZE - 4} y={12} textAnchor="end" fontSize="9" fill="var(--mute)" fontFamily="var(--mono)">up</text>
      <text x={SIZE - 4} y={SIZE - 5} textAnchor="end" fontSize="9" fill="var(--mute)" fontFamily="var(--mono)">down</text>
      <line x1={grip.x} y1={grip.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth="7" strokeLinecap="round" opacity="0.35" />
      <line x1={grip.x} y1={grip.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1={PIVOT.x - Math.cos(rad) * 8} y1={PIVOT.y + Math.sin(rad) * 8} x2={grip.x} y2={grip.y} stroke="#9aa9b8" strokeWidth="6" strokeLinecap="butt" />
    </svg>
  );
}
