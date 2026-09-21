// Per-blade look choice and colour arguments for the current preset, written live to the saber.
// Names and argument maps come from the firmware manifest Hiltwright stored when it installed; on vendor
// firmware only the compiled slots are known, so looks are offered by slot and colours stay read-only.

import { useEffect, useRef, useState } from 'react';
import { argInfo, colorWordToHex, formatBuiltin, formatStyleArgs, hexToColorWord, lookAtSlot, lookSlots, parseBuiltin, parseStyleArgs, type PresetRecord } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { BladePreview, canSimulate } from './BladePreview';

/** Colour pickers fire on every drag step; the saber rewrites a 256 KB file per write, so only the settled value goes out. */
const SETTLE_MS = 450;

export function LookRows({ board, current, onLooks }: { board: Board; current: PresetRecord; onLooks: () => void }) {
  const { info, busy, saber } = board;
  const manifest = saber?.firmware ?? null;
  // Pending picker values per "blade:arg", shown at once and written when the picker settles and the board is free.
  const [pending, setPending] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => () => { for (const t of Object.values(timers.current)) clearTimeout(t); }, []);
  const schedule = (key: string, hex: string, commit: (hex: string) => void) => {
    setPending((p) => ({ ...p, [key]: hex }));
    clearTimeout(timers.current[key]);
    const fire = () => {
      if (busyRef.current) { timers.current[key] = setTimeout(fire, 200); return; }
      delete timers.current[key];
      setPending((p) => { const { [key]: _drop, ...rest } = p; return rest; });
      commit(hex);
    };
    timers.current[key] = setTimeout(fire, SETTLE_MS);
  };
  if (!info) return null;
  /** LED count the saber reports for blade slot `k` (0-based); the preview uses it so wipes and bumps are to scale. */
  const pixels = (k: number) => Math.max(1, Math.min(288, info.pixelBlades[k] ?? 132));
  /** The slot's arguments with any colour still being dragged laid over them, so the preview follows the picker at once. */
  const previewArgs = (k: number, args: Map<number, string>) => {
    const m = new Map(args);
    for (const [key, hex] of Object.entries(pending)) { const [blade, n] = key.split(':').map(Number); if (blade === k) m.set(n, hexToColorWord(hex)); }
    return m;
  };

  /** Choices for blade slot `blade` (1-based). With a manifest: one per look; otherwise one per compiled slot. */
  const choices = (blade: number, currentStyle: string) => {
    const out: { value: string; label: string }[] = [];
    const cur = parseBuiltin(currentStyle);
    const curLook = cur && manifest ? lookAtSlot(manifest, cur.preset, cur.blade) : null;
    if (manifest) {
      for (const l of manifest.looks) {
        // The look already in this slot keeps the slot's own address so the select shows it as chosen.
        if (curLook && l.id === curLook.id) { out.push({ value: currentStyle, label: l.name }); continue; }
        const slot = lookSlots(manifest, l.id).find((s) => s.blade === blade) ?? lookSlots(manifest, l.id)[0];
        if (slot) out.push({ value: formatBuiltin({ preset: slot.preset, blade: slot.blade, args: null }), label: l.name });
      }
    } else {
      const seen = new Set<string>();
      info.presets.forEach((p, pi) => {
        const b = parseBuiltin(p.styles[blade - 1] ?? '');
        if (!b) return;
        const key = `${b.preset} ${b.blade}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ value: formatBuiltin({ preset: b.preset, blade: b.blade, args: null }), label: `Look ${b.preset + 1}.${b.blade} · from "${info.presets[b.preset]?.name.replace('\n', ' ') ?? `preset ${pi + 1}`}"` });
      });
    }
    if (currentStyle && !out.some((o) => o.value === currentStyle)) out.push({ value: currentStyle, label: currentStyle });
    return out;
  };

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row between"><h2 style={{ fontSize: 10.5, color: 'var(--dim)' }}>Look per blade</h2><span className="hint">{manifest ? 'Looks Hiltwright compiled into this saber. Colours write live.' : 'Any look compiled into this firmware, per blade slot.'}</span></div>
      {current.styles.map((s, k) => {
        const b = parseBuiltin(s);
        const value = b ? formatBuiltin({ ...b, args: null }) : s;
        const opts = choices(k + 1, value);
        const look = b && manifest ? lookAtSlot(manifest, b.preset, b.blade) : null;
        const args = parseStyleArgs(b?.args);
        const write = (map: Map<number, string>, label: string) => {
          if (!b) return;
          const a = formatStyleArgs(map);
          void board.editPreset({ styles: { [k + 1]: formatBuiltin({ preset: b.preset, blade: b.blade, args: a || null }) } }, label);
        };
        return (
          <div key={k} className="col" style={{ gap: 6, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ gap: 12, minHeight: 40 }}>
              <span className="mono mute" style={{ fontSize: 11, width: 12 }}>{k + 1}</span>
              <span style={{ width: 90, flex: 'none' }} className="small">Blade {k + 1}</span>
              <span className="input sans grow" style={{ height: 34 }}>
                <span className="ellip">{opts.find((c) => c.value === value)?.label ?? s}</span>
                {b?.args && !look && <span className="mono mute" style={{ fontSize: 11 }}>args {b.args}</span>}
                <span className="caret"><Icon name="down" /></span>
                <select value={value} disabled={busy} aria-label={`Look for blade ${k + 1}`} onChange={(e) => void board.editPreset({ styles: { [k + 1]: b?.args ? `${e.target.value} ${b.args}` : e.target.value } }, `Blade ${k + 1} look`)}>
                  {opts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </span>
            </div>
            {look && canSimulate(look.id) && (
              <div style={{ paddingLeft: 24 }}>
                <BladePreview lookId={look.id} args={previewArgs(k, args)} leds={pixels(k)} dot={pixels(k) <= 4} controls={k === 0} size={k === 0 ? 'md' : 'sm'} />
              </div>
            )}
            {look && look.args.length > 0 && (
              <div className="row wrap" style={{ gap: 8, paddingLeft: 24 }}>
                {look.args.map((n) => {
                  const a = argInfo(n);
                  const word = args.get(n);
                  if (a.kind === 'color') {
                    const set = word ? colorWordToHex(word) : null;
                    const key = `${k}:${n}`;
                    const shown = pending[key] ?? set ?? look.defaults?.[n] ?? '#808080';
                    return (
                      <span key={n} className="row" style={{ gap: 4 }}>
                        <label className={`swatch ${set || pending[key] ? '' : 'linked'}`} style={{ width: 'auto', height: 32, paddingRight: 12 }} title={set ? `${a.name} · argument ${n}` : `${a.name} · compiled default · argument ${n}`}>
                          <span className="sq" style={{ width: 16, height: 16, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                          <span className="small" style={{ whiteSpace: 'nowrap' }}>{a.name}{pending[key] ? <span className="mute"> · …</span> : set ? '' : <span className="mute"> · default</span>}</span>
                          <input type="color" value={shown} aria-label={`${a.name} for blade ${k + 1}`} onChange={(e) => schedule(key, e.target.value, (hex) => { const m = new Map(args); m.set(n, hexToColorWord(hex)); write(m, `${a.name} → ${hex}`); })} />
                        </label>
                        {set && <button type="button" className="chip" disabled={busy} aria-label={`Reset ${a.name} to the compiled default`} title="Back to the compiled default" onClick={() => { const m = new Map(args); m.delete(n); write(m, `${a.name} → default`); }}><Icon name="undo" /></button>}
                      </span>
                    );
                  }
                  return (
                    <label key={n} className="row" style={{ gap: 6, fontSize: 12 }} title={`${a.name} · argument ${n}`}>
                      <span className="small dim">{a.name}</span>
                      <span className="input" style={{ width: 84, height: 28 }}><input type="number" defaultValue={word ?? ''} placeholder="default" disabled={busy} aria-label={`${a.name} for blade ${k + 1}`} onBlur={(e) => { const m = new Map(args); if (e.target.value === '') m.delete(n); else m.set(n, String(Math.max(0, Math.round(Number(e.target.value))))); if ((m.get(n) ?? '') !== (word ?? '')) write(m, `${a.name} → ${e.target.value || 'default'}`); }} /></span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {!manifest && <span className="hint">Colour editing needs to know which arguments a look uses. Install Hiltwright firmware with a look from <button type="button" className="holo" onClick={onLooks}>Looks</button> and every colour becomes a swatch here.</span>}
    </div>
  );
}
