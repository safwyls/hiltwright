// The hardware description: count-first blade cards, wiring as two sentences, and a live pin table.
// Produces core ModelBlades directly, so what the owner confirms is exactly what generateConfig compiles.

import { useState, type CSSProperties } from 'react';
import { chainRanges, sharedPowerPins, type BladeRole, type BoardModel, type ModelBlade } from '@hiltwright/core';
import { Icon } from './Icon';
import { BladeBar, Crystal, Hilt } from './Saber';

export type Kind = 'pixel' | 'single' | 'star' | 'motor';

export const ROLE_META: Record<BladeRole, { label: string; hint: string; kind: Kind }> = {
  main: { label: 'Main blade', hint: 'The blade in the emitter', kind: 'pixel' },
  crystal: { label: 'Crystal chamber', hint: 'Pixels or an LED around the crystal', kind: 'pixel' },
  accent: { label: 'Accent', hint: 'A lit switch, ring or window', kind: 'single' },
  side: { label: 'Side blade', hint: 'A quillon or second emitter', kind: 'pixel' },
  motor: { label: 'Motor', hint: 'Spins a crystal chamber component', kind: 'motor' },
};
const ROLES: BladeRole[] = ['main', 'crystal', 'accent', 'side', 'motor'];
const KIND_LABEL: Record<Kind, string> = { pixel: 'Pixel strip', single: 'Single LED', star: 'Star LED', motor: 'Motor' };

/** Data pins per board. V3 adds Free 1–3, which can also drive small LEDs by PWM. */
export function dataPins(board: BoardModel): string[] {
  return board === 'V3' ? ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin', 'blade5Pin', 'blade6Pin', 'blade7Pin'] : ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'];
}
export interface PowerOption { pin: string; label: string; kind: 'fet' | 'pwm' }
export function powerOptions(board: BoardModel): PowerOption[] {
  const fets: PowerOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ pin: `bladePowerPin${n}`, label: `LED ${n}`, kind: 'fet' }));
  if (board === 'V3') fets.push({ pin: 'blade5Pin', label: 'Free 1', kind: 'pwm' }, { pin: 'blade6Pin', label: 'Free 2', kind: 'pwm' }, { pin: 'blade7Pin', label: 'Free 3', kind: 'pwm' });
  return fets;
}
const pinLabel = (board: BoardModel, pin: string) => powerOptions(board).find((o) => o.pin === pin)?.label ?? pin;

/** LED templates for simple blades: what ProffieOS's own configs use. Resistor values are the stock examples. */
const SINGLE_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];
const STAR_LEDS = ['CreeXPE2RedTemplate<1000>', 'CreeXPE2GreenTemplate<0>', 'CreeXPE2BlueTemplate<240>', 'NoLED'];
const MOTOR_LEDS = ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'];

export function kindOf(b: ModelBlade): Kind {
  if (b.type === 'pixel') return 'pixel';
  if (b.role === 'motor') return 'motor';
  return b.leds.filter((l) => l !== 'NoLED').length >= 3 ? 'star' : 'single';
}

function powerPinsOf(b: ModelBlade): string[] {
  return b.wiring.kind === 'own' ? b.wiring.powerPins : b.wiring.kind === 'power' ? b.wiring.pins : [];
}

/** A fresh blade of a role, on the first free-looking pins. */
export function newBlade(id: string, role: BladeRole, board: BoardModel, taken: { data: string[]; power: string[] }): ModelBlade {
  const kind = ROLE_META[role].kind;
  const freeData = dataPins(board).find((p) => !taken.data.includes(p)) ?? dataPins(board)[0];
  const freePower = powerOptions(board).filter((o) => o.kind === 'fet').map((o) => o.pin).find((p) => !taken.power.includes(p)) ?? 'bladePowerPin1';
  return withKind({ id, role, type: 'pixel', pixels: role === 'main' ? 132 : role === 'side' ? 40 : 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: freeData, powerPins: [freePower] } }, kind, board);
}

/** Change what a blade is built from, keeping whatever wiring still makes sense. */
export function withKind(b: ModelBlade, kind: Kind, board: BoardModel): ModelBlade {
  const power = powerPinsOf(b);
  const firstFet = powerOptions(board).filter((o) => o.kind === 'fet')[0].pin;
  if (kind === 'pixel') {
    return { ...b, type: 'pixel', leds: [], pixels: b.type === 'pixel' ? b.pixels : 1, order: b.order || 'GRB', wiring: b.wiring.kind === 'chain' || b.wiring.kind === 'own' ? b.wiring : { kind: 'own', dataPin: dataPins(board)[0], powerPins: power.length ? power : [firstFet] } };
  }
  const leds = kind === 'star' ? STAR_LEDS : kind === 'motor' ? MOTOR_LEDS : SINGLE_LEDS;
  const need = kind === 'star' ? 3 : 1;
  const pins = power.slice(0, need);
  while (pins.length < need) pins.push(firstFet);
  return { ...b, type: 'simple', leds, pixels: need, order: '', wiring: { kind: 'power', pins } };
}

export interface PinRow { pin: string; label: string; users: string[]; conflict: boolean; shared?: boolean; kind?: 'fet' | 'pwm' }
export interface PinReport { data: PinRow[]; power: PinRow[]; problems: string[]; shared: string[] }

/** Who uses which pin, what conflicts, and what is merely shared. Mirrors validateModel's rules with owner wording. */
export function pinTable(blades: ModelBlade[], board: BoardModel): PinReport {
  const data: PinRow[] = dataPins(board).map((p) => ({ pin: p, label: p, users: [], conflict: false }));
  const power: PinRow[] = powerOptions(board).map((o) => ({ pin: o.pin, label: o.label, users: [], conflict: false, kind: o.kind }));
  const problems: string[] = [];
  const name = (id: string) => `Blade ${blades.findIndex((b) => b.id === id) + 1}`;
  const rootOf = (b: ModelBlade): ModelBlade | null => { let cur = b; const seen = new Set<string>(); while (cur.wiring.kind === 'chain') { if (seen.has(cur.id)) return null; seen.add(cur.id); const p = blades.find((x) => x.id === (cur.wiring as { after: string }).after); if (!p) return null; cur = p; } return cur; };
  for (const b of blades) {
    if (b.type === 'pixel' && b.pixels < 1) problems.push(`${name(b.id)} needs a pixel count.`);
    if (b.wiring.kind === 'own') {
      const d = data.find((r) => r.pin === (b.wiring as { dataPin: string }).dataPin);
      if (d) d.users.push(b.id);
      for (const p of b.wiring.powerPins) power.find((r) => r.pin === p)?.users.push(b.id);
      if (!b.wiring.powerPins.length) problems.push(`${name(b.id)} needs at least one power pin.`);
    } else if (b.wiring.kind === 'chain') {
      const root = rootOf(b);
      if (!root || root.wiring.kind !== 'own' || root.type !== 'pixel') problems.push(`${name(b.id)} continues a blade that is not a pixel strip on its own data line.`);
      else data.find((r) => r.pin === (root.wiring as { dataPin: string }).dataPin)?.users.push(b.id);
    } else {
      for (const p of b.wiring.pins) {
        const row = power.find((r) => r.pin === p);
        if (!row) continue;
        row.users.push(b.id);
        if (row.kind === 'pwm' && kindOf(b) !== 'single') { row.conflict = true; problems.push(`${row.label} is a low-current PWM pin: it cannot drive a ${kindOf(b) === 'motor' ? 'motor' : 'star LED'}.`); }
      }
      if (!b.wiring.pins.length) problems.push(`${name(b.id)} needs a power pin.`);
    }
  }
  for (const r of data) {
    const own = r.users.filter((id) => blades.find((b) => b.id === id)?.wiring.kind === 'own');
    if (own.length > 1) { r.conflict = true; problems.push(`${r.pin} has ${own.length} separate strips on it (${own.map(name).join(', ')}). Chain them, or use different data pins.`); }
  }
  const shared = sharedPowerPins(blades);
  for (const r of power) if (shared.includes(r.pin)) r.shared = true;
  if (!blades.some((b) => b.role === 'main')) problems.push('One blade must be the main blade.');
  return { data, power, problems, shared: shared.map((p) => pinLabel(board, p)) };
}

export function bladeSummary(blades: ModelBlade[], b: ModelBlade, board: BoardModel): string {
  const kind = kindOf(b);
  if (kind === 'pixel') {
    if (b.wiring.kind === 'chain') {
      const r = chainRanges(blades).get(b.id);
      const after = blades.findIndex((x) => x.id === (b.wiring as { after: string }).after) + 1;
      return `${b.pixels} px · continues Blade ${after}'s wire${r ? ` · pixels ${r.first}–${r.last}` : ''}`;
    }
    const w = b.wiring as { dataPin: string; powerPins: string[] };
    return `${b.pixels} px${b.parallel > 1 ? ` × ${b.parallel} strips` : ''} · ${w.dataPin} · ${w.powerPins.map((p) => pinLabel(board, p)).join(' + ')}`;
  }
  const pins = (b.wiring as { pins: string[] }).pins.map((p) => pinLabel(board, p)).join(' + ');
  return `${KIND_LABEL[kind]} · ${pins}`;
}

export function HardwareEditor({ blades, board, detected, locked, onChange }: { blades: ModelBlade[]; board: BoardModel; detected: number[]; locked: boolean; onChange: (b: ModelBlade[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const pins = pinTable(blades, board);
  const ranges = chainRanges(blades);
  const crystal = blades.find((b) => b.role === 'crystal');
  const set = (id: string, patch: Partial<ModelBlade>) => onChange(blades.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const setCount = (n: number) => {
    if (n < 1 || n > 8 || locked) return;
    if (n < blades.length) { onChange(blades.slice(0, n)); return; }
    const next = [...blades];
    while (next.length < n) {
      const taken = { data: next.flatMap((b) => (b.wiring.kind === 'own' ? [b.wiring.dataPin] : [])), power: next.flatMap(powerPinsOf) };
      const role: BladeRole = next.some((b) => b.role === 'main') ? (next.some((b) => b.role === 'crystal') ? 'accent' : 'crystal') : 'main';
      next.push(newBlade(`b${next.length + 1}`, role, board, taken));
    }
    onChange(next);
    setOpen(next[next.length - 1].id);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16 }}>
      <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 0 }} role="group" aria-label="Number of blades">
            <button type="button" className="input" style={{ width: 38, justifyContent: 'center', padding: 0 }} aria-label="Fewer blades" disabled={locked || blades.length <= 1} onClick={() => setCount(blades.length - 1)}><Icon name="minus" /></button>
            <span className="input mono" style={{ width: 56, justifyContent: 'center', fontSize: 16, borderLeft: 0, borderRight: 0 }} aria-live="polite">{blades.length}</span>
            <button type="button" className="input" style={{ width: 38, justifyContent: 'center', padding: 0 }} aria-label="More blades" disabled={locked || blades.length >= 8} onClick={() => setCount(blades.length + 1)}><Icon name="plus" /></button>
          </div>
          <div className="col" style={{ gap: 1 }}>
            <b style={{ fontWeight: 600 }}>Blades</b>
            <span className="hint">Every light or motor the saber controls separately.{detected.length ? ` The board reported ${detected.length} pixel strip${detected.length === 1 ? '' : 's'} (${detected.join(', ')} px).` : ''}</span>
          </div>
        </div>

        {blades.map((b, i) => {
          const kind = kindOf(b);
          const isOpen = open === b.id;
          const parents = blades.filter((x) => x.id !== b.id && x.type === 'pixel' && x.wiring.kind === 'own');
          const problem = pins.problems.find((p) => p.startsWith(`Blade ${i + 1} `));
          if (!isOpen) {
            return (
              <button key={b.id} type="button" className={`bcard sum ${problem ? 'warn' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', textAlign: 'left' }} aria-expanded={false} onClick={() => setOpen(b.id)}>
                <span className="mono mute" style={{ fontSize: 11, width: 16 }}>{i + 1}</span>
                <span style={{ display: 'flex', width: 18, color: problem ? 'var(--amber)' : 'var(--holo)' }}><Icon name={{ main: 'blade', crystal: 'crystal', accent: 'led', side: 'side', motor: 'motor' }[b.role]} /></span>
                <span style={{ fontWeight: 600, fontSize: 13.5, width: 150, flex: 'none' }}>{ROLE_META[b.role].label}</span>
                <span className="dim grow ellip small">{problem ?? bladeSummary(blades, b, board)}</span>
                <span style={{ color: problem ? 'var(--amber)' : 'var(--green)', display: 'flex', width: 16 }}><Icon name={problem ? 'warn' : 'check'} /></span>
                <span className="mute" style={{ display: 'flex', width: 16 }}><Icon name="down" /></span>
              </button>
            );
          }
          const w = b.wiring;
          return (
            <div key={b.id} className="bcard open col" style={{ gap: 0 }}>
              <div className="row" style={{ gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                <span className="mono mute" style={{ fontSize: 11, width: 16 }}>{i + 1}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{ROLE_META[b.role].label}</span>
                <span className="hint grow ellip">{ROLE_META[b.role].hint}</span>
                <button type="button" className="chip" aria-label="Collapse" onClick={() => setOpen(null)}><Icon name="up" /></button>
                {blades.length > 1 && !locked && <button type="button" className="chip" onClick={() => { onChange(blades.filter((x) => x.id !== b.id).map((x) => (x.wiring.kind === 'chain' && x.wiring.after === b.id ? withKind({ ...x, wiring: { kind: 'own', dataPin: dataPins(board)[0], powerPins: ['bladePowerPin1'] } }, 'pixel', board) : x))); setOpen(null); }}><Icon name="trash" />Remove</button>}
              </div>
              <div className="col" style={{ padding: '12px 14px 14px', gap: 12 }}>
                <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <div className="col" style={{ gap: 6 }}>
                    <span className="label">What is it</span>
                    <div className="seg" role="radiogroup" aria-label="Role">
                      {ROLES.map((r) => <button key={r} type="button" role="radio" aria-checked={b.role === r} className={b.role === r ? 'on' : ''} disabled={locked} onClick={() => onChange(blades.map((x) => (x.id === b.id ? withKind({ ...x, role: r }, r === 'motor' ? 'motor' : kindOf(x) === 'motor' ? ROLE_META[r].kind : kindOf(x), board) : x)))}><Icon name={{ main: 'blade', crystal: 'crystal', accent: 'led', side: 'side', motor: 'motor' }[r]} />{ROLE_META[r].label}</button>)}
                    </div>
                  </div>
                  {b.role !== 'motor' && (
                    <div className="col" style={{ gap: 6 }}>
                      <span className="label">Built from</span>
                      <div className="seg" role="radiogroup" aria-label="Type">
                        {(['pixel', 'single', 'star'] as Kind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} disabled={locked} onClick={() => set(b.id, withKind(b, k, board))}><Icon name={k === 'pixel' ? 'strip' : 'led'} />{KIND_LABEL[k]}</button>)}
                      </div>
                    </div>
                  )}
                </div>

                {kind === 'pixel' && (
                  <div className="grid3">
                    <label className="field"><span className="label">Pixels</span><span className="input"><input type="number" min={1} max={400} value={b.pixels} disabled={locked} aria-label="Pixel count" onChange={(e) => set(b.id, { pixels: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></span></label>
                    <label className="field"><span className="label">Colour order</span><span className="input"><span className="ellip">{b.order || 'GRB'}</span><span className="caret"><Icon name="down" /></span><select value={b.order || 'GRB'} disabled={locked || w.kind === 'chain'} aria-label="Colour order" onChange={(e) => set(b.id, { order: e.target.value })}>{['GRB', 'RGB', 'GRBW', 'RGBW', 'BGR', 'BRG'].map((o) => <option key={o} value={o}>{o}</option>)}</select></span></label>
                    <label className="field"><span className="label">Strips on this wire</span><span className="input sans"><span className="ellip">{b.parallel > 1 ? `${b.parallel} in parallel` : 'One strip'}</span><span className="caret"><Icon name="down" /></span><select value={String(b.parallel)} disabled={locked} aria-label="Strips wired in parallel on this data line" onChange={(e) => set(b.id, { parallel: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? 'One strip' : `${n} in parallel`}</option>)}</select></span></label>
                    {b.parallel > 1 && <span className="hint" style={{ gridColumn: '1 / -1' }}>Strips soldered to the same data wire show the same thing and cannot be controlled separately, so they count as one blade with one strip's pixel count.</span>}
                  </div>
                )}
                {kind === 'star' && <span className="hint">A tri-colour star LED on three power pins, red, green and blue in that order. The resistor values are the stock ProffieOS examples; ask the installer if the colours look wrong.</span>}
                {kind === 'single' && <span className="hint">One LED on one power pin. Shown white in previews; its look decides the brightness.</span>}
                {kind === 'motor' && <span className="hint">Runs from one power pin at full power while its look is on.</span>}

                <div className="col" style={{ gap: 8 }}>
                  <span className="label">Wiring</span>
                  {kind === 'pixel' ? (
                    <>
                      <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
                        <button type="button" className={`opt ${w.kind === 'own' ? 'on' : ''}`} role="radio" aria-checked={w.kind === 'own'} disabled={locked} onClick={() => w.kind !== 'own' && set(b.id, { wiring: { kind: 'own', dataPin: dataPins(board).find((p) => !pins.data.find((r) => r.pin === p)?.users.length) ?? dataPins(board)[0], powerPins: ['bladePowerPin1'] } })}>
                          <span className="radio" /><span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>Own data line</b><span className="hint">Its own wire and its own power pins.</span></span>
                        </button>
                        <button type="button" className={`opt ${w.kind === 'chain' ? 'on' : ''}`} role="radio" aria-checked={w.kind === 'chain'} disabled={locked || parents.length === 0} style={parents.length === 0 ? { opacity: 0.5 } : undefined} onClick={() => parents[0] && w.kind !== 'chain' && set(b.id, { wiring: { kind: 'chain', after: parents[0].id }, order: '' })}>
                          <span className="radio" /><span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>Continues another blade's wire</b><span className="hint">{parents.length === 0 ? 'Needs another pixel blade on its own data line.' : w.kind === 'chain' && ranges.get(b.id) ? `Same strip: pixels ${ranges.get(b.id)!.first}–${ranges.get(b.id)!.last}, shares its power.` : 'Same strip, after that blade. Shares its power pins.'}</span></span>
                        </button>
                      </div>
                      {w.kind === 'own' && (
                        <div className="grid2">
                          <label className="field"><span className="label">Data pin</span><span className="input"><span className="ellip">{w.dataPin}</span><span className="caret"><Icon name="down" /></span><select value={w.dataPin} disabled={locked} aria-label="Data pin" onChange={(e) => set(b.id, { wiring: { ...w, dataPin: e.target.value } })}>{dataPins(board).map((p) => <option key={p} value={p}>{p}{board === 'V3' && p >= 'blade5Pin' ? ' (Free)' : ''}</option>)}</select></span></label>
                          <div className="field"><span className="label">Power pins</span><div className="row wrap" style={{ gap: 6, minHeight: 38 }}>{powerOptions(board).filter((o) => o.kind === 'fet').map((o) => { const on = w.powerPins.includes(o.pin); return <button key={o.pin} type="button" className={`chip ${on ? 'sel' : ''}`} aria-pressed={on} disabled={locked} onClick={() => { const next = on ? w.powerPins.filter((x) => x !== o.pin) : [...w.powerPins, o.pin].sort(); if (next.length) set(b.id, { wiring: { ...w, powerPins: next } }); }}>{o.label}</button>; })}</div></div>
                        </div>
                      )}
                      {w.kind === 'chain' && (
                        <div className="grid2">
                          <label className="field"><span className="label">After</span><span className="input sans"><span className="ellip">Blade {blades.findIndex((x) => x.id === w.after) + 1}</span><span className="caret"><Icon name="down" /></span><select value={w.after} disabled={locked} aria-label="Continues after" onChange={(e) => set(b.id, { wiring: { ...w, after: e.target.value } })}>{parents.map((p) => <option key={p.id} value={p.id}>Blade {blades.indexOf(p) + 1} · {ROLE_META[p.role].label}</option>)}</select></span></label>
                          <label className="row" style={{ gap: 10, alignSelf: 'end', height: 38, fontSize: 13, color: 'var(--dim)' }}><button type="button" className={`tog ${w.reverse ? 'on' : ''}`} role="switch" aria-checked={!!w.reverse} disabled={locked} onClick={() => set(b.id, { wiring: { ...w, reverse: !w.reverse } })}><i /></button>Runs the other way (reversed)</label>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="grid3">
                      {(w as { pins: string[] }).pins.map((pin, k) => (
                        <label key={k} className="field"><span className="label">{kind === 'star' ? ['Red', 'Green', 'Blue'][k] : 'Power pin'}</span><span className="input sans"><span className="ellip">{pinLabel(board, pin)}</span><span className="caret"><Icon name="down" /></span>
                          <select value={pin} disabled={locked} aria-label={kind === 'star' ? `${['Red', 'Green', 'Blue'][k]} power pin` : 'Power pin'} onChange={(e) => { const pinsNext = [...(w as { pins: string[] }).pins]; pinsNext[k] = e.target.value; set(b.id, { wiring: { kind: 'power', pins: pinsNext } }); }}>
                            {powerOptions(board).filter((o) => o.kind === 'fet' || kind === 'single').map((o) => <option key={o.pin} value={o.pin}>{o.label}{o.kind === 'pwm' ? ' · PWM, small LED only' : ''}</option>)}
                          </select></span></label>
                      ))}
                      <div className="field" style={{ gridColumn: kind === 'star' ? '1 / -1' : '2 / -1' }}><span className="label">Note</span><span className="hint" style={{ paddingTop: 6 }}>LED 1–6 switch battery power through a FET. Sharing one between blades is fine; the build adds the shared-power option.{board === 'V3' && kind === 'single' ? ' On a V3 a small indicator LED can use Free 1–3 as PWM instead and keep the FETs free.' : ''}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <aside className="col" style={{ gap: 12 }}>
        <div style={{ border: '1px solid var(--line)', background: '#0b1016', padding: 12 }} className="col">
          <div className="row" style={{ gap: 0, padding: '4px 0 10px' }}><Hilt crystal={crystal ? '#ff3d3d' : null} /><BladeBar color="#3d7bff" /></div>
          <div className="list" style={{ border: '1px solid var(--line)' }}>
            {blades.map((b, i) => {
              const r = ranges.get(b.id);
              const kind = kindOf(b);
              return (
                <div key={b.id} className="li" style={{ minHeight: 34, gap: 10 }}>
                  <span className="mono mute" style={{ fontSize: 11, width: 12 }}>{i + 1}</span>
                  <span style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                    {b.role === 'crystal' ? <Crystal color="#ff3d3d" h={20} /> : b.role === 'motor' ? <span className="mute" style={{ display: 'flex' }}><Icon name="motor" /></span> : kind !== 'pixel' ? <span className="lens" style={{ '--c': '#ffffff', width: 12, height: 12 } as CSSProperties} /> : <span className="blade" style={{ '--c': '#3d7bff', width: 22, height: 6, borderRadius: '0 3px 3px 0' } as CSSProperties} />}
                  </span>
                  <span className="grow small">{ROLE_META[b.role].label}</span>
                  <span className="mono mute" style={{ fontSize: 11 }}>{kind === 'pixel' ? `${b.pixels} px${b.wiring.kind === 'chain' && r ? ` · ${r.first}–${r.last}` : ''}` : KIND_LABEL[kind]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ border: '1px solid var(--line)', background: '#0b1016', padding: 12 }} className="col">
          <div className="row between" style={{ paddingBottom: 6 }}><b style={{ fontWeight: 600, fontSize: 13 }}>Pins · Proffieboard {board}</b>{pins.problems.length ? <span className="chip err"><Icon name="x" />{pins.problems.length} problem{pins.problems.length > 1 ? 's' : ''}</span> : pins.shared.length ? <span className="chip warn"><Icon name="info" />Shared power</span> : <span className="chip ok"><Icon name="check" />No conflicts</span>}</div>
          {pins.data.map((r) => <div key={r.pin} className={`pin ${r.conflict ? 'bad' : ''}`}><span className="k">{r.pin}</span>{r.users.length ? <span className="v">{r.users.map((id) => `Blade ${blades.findIndex((b) => b.id === id) + 1}`).join(', then ')}</span> : <span className="free">free</span>}</div>)}
          <div style={{ height: 1, background: 'var(--line)', margin: '6px 0' }} />
          {pins.power.map((r) => <div key={r.pin} className={`pin ${r.conflict ? 'bad' : ''}`}><span className="k">{r.label}</span>{r.users.length ? <span className="v">{[...new Set(r.users)].map((id) => `Blade ${blades.findIndex((b) => b.id === id) + 1}`).join(' + ')}{r.shared && <span className="amber"> · shared</span>}</span> : <span className="free">{r.kind === 'pwm' ? 'free · PWM' : 'free'}</span>}</div>)}
          {pins.shared.length > 0 && <div className="hint" style={{ paddingTop: 8 }}>{pins.shared.join(', ')} {pins.shared.length > 1 ? 'power' : 'powers'} more than one blade. ProffieOS allows that with the shared-power option, which the build adds for you.</div>}
          {pins.problems.map((p) => <div key={p} className="red small" style={{ paddingTop: 8 }}>{p}</div>)}
        </div>
      </aside>
    </div>
  );
}
