// Live saber settings and effect triggers for the Diagnostics page. Every value is read from the board first and
// read back after a change; controls the firmware rejects (older OS, options not compiled in) stay hidden.

import { useCallback, useEffect, useRef, useState } from 'react';
import { wasRejected } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';

interface Setting { key: string; label: string; get: string; set: (v: number) => string; min: number; max: number; step: number; unit: string; show: (v: number) => string; hint: string }

const SETTINGS: Setting[] = [
  { key: 'volume', label: 'Volume', get: 'get_volume', set: (v) => `set_volume ${Math.round(v)}`, min: 0, max: 3000, step: 50, unit: '', show: (v) => String(Math.round(v)), hint: '0 to 3000. The compiled default is usually 1800; above 2000 can distort small speakers.' },
  { key: 'dimming', label: 'Blade brightness', get: 'get_blade_dimming', set: (v) => `set_blade_dimming ${Math.round(v)}`, min: 1638, max: 16384, step: 819, unit: '%', show: (v) => String(Math.round((v / 16384) * 100)), hint: 'Dims every blade. Lower saves battery and runs cooler.' },
  { key: 'clash', label: 'Clash sensitivity', get: 'get_clash_threshold', set: (v) => `set_clash_threshold ${v.toFixed(1)}`, min: 1, max: 8, step: 0.1, unit: ' g', show: (v) => v.toFixed(1), hint: 'The hit needed to register a clash. Lower is more sensitive; too low and swings trigger clashes.' },
];

const EFFECTS: { cmd: string; label: string; needsOn?: boolean }[] = [
  { cmd: 'on', label: 'Ignite' }, { cmd: 'off', label: 'Retract' }, { cmd: 'clash', label: 'Clash', needsOn: true }, { cmd: 'blast', label: 'Blast', needsOn: true },
  { cmd: 'force', label: 'Force', needsOn: true }, { cmd: 'stab', label: 'Stab', needsOn: true },
];

export function SaberControls({ board, bare }: { board: Board; bare?: boolean }) {
  const connected = board.status === 'connected';
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [pending, setPending] = useState<Record<string, number>>({});
  const [on, setOn] = useState<boolean | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const read = useCallback(async () => {
    const next: Record<string, number | null> = {};
    for (const s of SETTINGS) {
      try {
        const r = await board.send(s.get, { idleMs: 400 });
        const line = r.lines.find((l) => /^-?\d+(\.\d+)?$/.test(l.trim()));
        next[s.key] = wasRejected(r.lines) || !line ? null : Number(line);
      } catch { next[s.key] = null; }
    }
    setValues(next);
    try { const r = await board.send('get_on', { idleMs: 400 }); setOn(wasRejected(r.lines) ? null : r.lines.some((l) => l.trim() === '1')); } catch { setOn(null); }
  }, [board]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (connected) void read(); else { setValues({}); setOn(null); } }, [connected]);
  useEffect(() => () => { for (const t of Object.values(timers.current)) clearTimeout(t); }, []);

  /** Sliders fire continuously; the saber gets the settled value, then is asked what it now has. */
  const change = (s: Setting, v: number) => {
    setPending((p) => ({ ...p, [s.key]: v }));
    clearTimeout(timers.current[s.key]);
    timers.current[s.key] = setTimeout(() => {
      void (async () => {
        await board.send(s.set(v), { idleMs: 400 });
        const r = await board.send(s.get, { idleMs: 400 });
        const line = r.lines.find((l) => /^-?\d+(\.\d+)?$/.test(l.trim()));
        setValues((cur) => ({ ...cur, [s.key]: line ? Number(line) : cur[s.key] ?? null }));
        setPending((p) => { const { [s.key]: _drop, ...rest } = p; return rest; });
      })();
    }, 350);
  };

  const effect = async (cmd: string) => {
    await board.send(cmd, { idleMs: 700 });
    if (cmd === 'on' || cmd === 'off') { const r = await board.send('get_on', { idleMs: 400 }); if (!wasRejected(r.lines)) setOn(r.lines.some((l) => l.trim() === '1')); }
  };

  const known = SETTINGS.filter((s) => values[s.key] != null);
  const state = (
    <div className="row" style={{ gap: 8 }}>{on != null && <span className={`chip ${on ? 'ok' : ''}`}><span className="dot" />{on ? 'Blade on' : 'Blade off'}</span>}<button type="button" className="chip" disabled={!connected} onClick={() => void read()}><Icon name="undo" />Read again</button></div>
  );
  const effects = connected && (
    <div className="col" style={{ gap: 6 }}>
      {!bare && <span className="label">Try an effect</span>}
      <div className="row wrap" style={{ gap: 6 }}>{EFFECTS.map((e) => <button key={e.cmd} type="button" className="btn sm" disabled={!!e.needsOn && on === false} onClick={() => void effect(e.cmd)}><span className="b"><span className="i">{e.label}</span></span></button>)}</div>
      <span className="hint">The same triggers the buttons and motion sensors send. Keep the blade clear of anything breakable before igniting.</span>
    </div>
  );
  const sliders = known.map((s) => {
    const v = pending[s.key] ?? values[s.key]!;
    return (
      <label key={s.key} className="col" style={{ gap: 4 }}>
        <span className="row between"><span className="label">{s.label}</span><span className="mono small">{s.show(v)}{s.unit}{pending[s.key] != null ? ' …' : ''}</span></span>
        <input type="range" min={s.min} max={s.max} step={s.step} value={v} aria-label={s.label} onChange={(e) => change(s, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--holo)' }} />
        {!bare && <span className="hint">{s.hint}</span>}
      </label>
    );
  });
  const body = (
    <div className="pb col scroll" style={{ gap: 14 }}>
      {bare && state}
      {!connected && <span className="hint">Connect a saber to change its settings.</span>}
      {bare && effects}
      {connected && known.length === 0 && <span className="hint">This firmware does not answer the settings commands. Hiltwright firmware does.</span>}
      {sliders}
      {!bare && effects}
      {known.length > 0 && <span className="hint">The saber saves these itself once its speaker goes quiet, so they survive a restart.</span>}
    </div>
  );
  if (bare) return body;
  return (
    <section className="panel fill" aria-label="Saber settings">
      <div className="ph"><h2>Saber settings</h2>{state}</div>
      {body}
    </section>
  );
}
