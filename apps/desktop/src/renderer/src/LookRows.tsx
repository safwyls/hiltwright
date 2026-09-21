// Per-blade look choice and colour arguments for the current preset, written live to the saber.
// Names and argument maps come from the firmware manifest Hiltwright stored when it installed; on vendor
// firmware only the compiled slots are known, so looks are offered by slot and colours stay read-only.

import { useEffect, useRef, useState, type JSX } from 'react';
import { argInfo, colorWordToHex, formatBuiltin, formatStyleArgs, hexToColorWord, lookAtSlot, lookSlots, parseBuiltin, parseStyleArgs, type PresetRecord } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { BladePreview, canSimulate } from './BladePreview';
import { ROLE_META } from './hardwareModel';

/** Arguments grouped the way an owner thinks about them, not in argument-number order. */
const BLADE_ARGS = [1, 2, 33, 34, 18, 20, 22, 31];
const EFFECT_ARGS = [9, 10, 11, 13, 15, 16];

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

  const cards = current.styles.map((s, k) => {
    const b = parseBuiltin(s);
    const value = b ? formatBuiltin({ ...b, args: null }) : s;
    const opts = choices(k + 1, value);
    const look = b && manifest ? lookAtSlot(manifest, b.preset, b.blade) : null;
    const args = parseStyleArgs(b?.args);
    const small = pixels(k) <= 4;
    const role = saber?.model?.blades[k]?.role;
    const title = role ? ROLE_META[role].label : `Blade ${k + 1}`;
    const write = (map: Map<number, string>, label: string) => {
      if (!b) return;
      const a = formatStyleArgs(map);
      void board.editPreset({ styles: { [k + 1]: formatBuiltin({ preset: b.preset, blade: b.blade, args: a || null }) } }, label);
    };

    const picker = (
      <span className="input sans" style={{ height: 32, width: small ? undefined : 260, flex: small ? '1 1 auto' : 'none' }}>
        <span className="ellip">{opts.find((c) => c.value === value)?.label ?? s}</span>
        {b?.args && !look && <span className="mono mute" style={{ fontSize: 11 }}>args {b.args}</span>}
        <span className="caret"><Icon name="down" /></span>
        <select value={value} disabled={busy} aria-label={`Look for ${title}, blade ${k + 1}`} onChange={(e) => void board.editPreset({ styles: { [k + 1]: b?.args ? `${e.target.value} ${b.args}` : e.target.value } }, `Blade ${k + 1} look`)}>
          {opts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </span>
    );

    const swatch = (n: number) => {
      const a = argInfo(n);
      const word = args.get(n);
      const set = word ? colorWordToHex(word) : null;
      const key = `${k}:${n}`;
      const shown = pending[key] ?? set ?? look?.defaults?.[n] ?? '#808080';
      const short = a.name.replace(/ colour$/i, '');
      return (
        <span key={n} className="row" style={{ gap: 2 }}>
          <label className={`swatch ${set || pending[key] ? '' : 'linked'}`} style={{ width: 'auto', height: 30, padding: '0 10px 0 8px', gap: 8 }} title={`${a.name}${set ? '' : ', the look\u2019s own default'}. Click to change.`}>
            <span className="sq" style={{ width: 14, height: 14, background: shown, boxShadow: `0 0 8px ${shown}` }} />
            <span className="small nowrap">{short}{pending[key] ? <span className="mute"> …</span> : null}</span>
            <input type="color" value={shown} aria-label={`${a.name} for ${title}`} onChange={(e) => schedule(key, e.target.value, (hex) => { const m = new Map(args); m.set(n, hexToColorWord(hex)); write(m, `${a.name} → ${hex}`); })} />
          </label>
          {set && <button type="button" className="chip" style={{ height: 30, padding: '0 6px' }} disabled={busy} aria-label={`Reset ${a.name} to the look's default`} title="Back to the look's default" onClick={() => { const m = new Map(args); m.delete(n); write(m, `${a.name} → default`); }}><Icon name="undo" /></button>}
        </span>
      );
    };
    const number = (n: number) => {
      const a = argInfo(n);
      const word = args.get(n);
      const isTime = /time/i.test(a.name);
      return (
        <label key={`${n}:${word ?? ''}`} className="row" style={{ gap: 8 }} title={`${a.name}. Leave empty for the look's default.`}>
          <span className="small dim nowrap">{a.name.replace(/ time$/i, '')}</span>
          <span className="input" style={{ width: 104, height: 30 }}><input type="number" min={0} step={isTime ? 50 : 1} defaultValue={word ?? ''} placeholder="default" disabled={busy} aria-label={`${a.name} for ${title}`} onBlur={(e) => { const m = new Map(args); if (e.target.value === '') m.delete(n); else m.set(n, String(Math.max(0, Math.round(Number(e.target.value))))); if ((m.get(n) ?? '') !== (word ?? '')) write(m, `${a.name} → ${e.target.value || 'default'}`); }} /></span>
          {isTime && <span className="hint">ms</span>}
        </label>
      );
    };

    const all = look?.args ?? [];
    const colours = all.filter((n) => argInfo(n).kind === 'color');
    const effectArgs = colours.filter((n) => EFFECT_ARGS.includes(n));
    const bladeArgs = [...BLADE_ARGS.filter((n) => colours.includes(n)), ...colours.filter((n) => !BLADE_ARGS.includes(n) && !EFFECT_ARGS.includes(n))];
    const numbers = all.filter((n) => argInfo(n).kind !== 'color');
    const group = (label: string, items: JSX.Element[]) => items.length > 0 && (
      <>
        <span className="small dim" style={{ paddingTop: 6 }}>{label}</span>
        <div className="row wrap" style={{ gap: 6 }}>{items}</div>
      </>
    );
    const settings = look && all.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: small ? '1fr' : '64px minmax(0,1fr)', gap: small ? 6 : '8px 12px', alignItems: 'start' }}>
        {small
          ? <div className="row wrap" style={{ gap: 6 }}>{[...bladeArgs, ...effectArgs].map(swatch)}{numbers.map(number)}</div>
          : <>{group('Blade', bladeArgs.map(swatch))}{group('Effects', effectArgs.map(swatch))}{group('Timing', numbers.map(number))}</>}
      </div>
    );
    const sim = look && canSimulate(look.id);

    return {
      small,
      el: (
        <div key={k} className="bcard col" style={{ gap: 10, padding: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="nbox">{k + 1}</span>
            <span className="col grow" style={{ gap: 0 }}><b className="ellip" style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</b><span className="hint">{pixels(k)} {pixels(k) === 1 ? 'LED' : 'LEDs'}</span></span>
            {!small && picker}
          </div>
          {small
            ? <div className="row" style={{ gap: 10 }}>{sim && <div style={{ width: 64, flex: 'none' }}><BladePreview lookId={look.id} args={previewArgs(k, args)} leds={pixels(k)} dot size="sm" /></div>}{picker}</div>
            : sim && <BladePreview lookId={look.id} args={previewArgs(k, args)} leds={pixels(k)} hilt size="sm" controls="compact" />}
          {settings}
        </div>
      ),
    };
  });

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Blades</span><span className="hint">{manifest ? 'Click a colour to change it. It is written to the saber as you pick.' : 'Colours can be changed here once Hiltwright firmware is installed (Build & Install).'}</span></div>
      {cards.filter((c) => !c.small).map((c) => c.el)}
      {cards.some((c) => c.small) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>{cards.filter((c) => c.small).map((c) => c.el)}</div>}
      {!manifest && <span className="hint">Colour editing needs to know which arguments a look uses. Install Hiltwright firmware with a look from <button type="button" className="holo" onClick={onLooks}>Looks</button> and every colour becomes a swatch here.</span>}
    </div>
  );
}
