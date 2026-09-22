// The full style editor: every ProffieOS template, as a tree of cards. The root is normally Layers<base, ...layers>,
// shown as a stack; each layer is a card whose parameters are colours, numbers and nested templates. Anything the
// official style editor can express can be pasted in, edited slot by slot, and printed back out as C++.

import { useMemo, useState } from 'react';
import { CATALOGUE, cloneNode, defaultFor, kindOf, newNode, paramFor, parseStyle, printStyle, type CatEntry, type Kind, type Node } from '@hiltwright/core';
import { Icon } from './Icon';

const EFFECTS = 'CLASH BLAST FORCE STAB BOOT LOCKUP_BEGIN LOCKUP_END DRAG_BEGIN DRAG_END PREON POSTOFF IGNITION RETRACTION CHANGE NEWFONT BLADEIN BLADEOUT LOW_BATTERY POWERSAVE BATTERY_LEVEL VOLUME_LEVEL ACCENT_SWING ACCENT_SLASH SPIN ON FAST_ON QUOTE SECONDARY_IGNITION SECONDARY_RETRACTION OFF FAST_OFF OFF_CLASH NEXT_QUOTE INTERACTIVE_PREON INTERACTIVE_BLAST TRACK BEGIN_BATTLE_MODE END_BATTLE_MODE BEGIN_AUTO_BLAST END_AUTO_BLAST ALT_SOUND TRANSITION_SOUND SOUND_LOOP STUN FIRE CLIP_IN CLIP_OUT RELOAD MODE RANGE EMPTY FULL JAM UNJAM PLI_ON PLI_OFF DESTRUCT BOOM USER1 USER2 USER3 USER4 USER5 USER6 USER7 USER8'.split(' ').map((e) => `EFFECT_${e}`);
const LOCKUPS = ['NORMAL', 'DRAG', 'MELT', 'ARMED', 'AUTOFIRE'].map((l) => `SaberBase::LOCKUP_${l}`);
const COLOR_ARGS: [string, string][] = [['BASE_COLOR_ARG', 'Base colour'], ['ALT_COLOR_ARG', 'Alt colour'], ['IGNITION_COLOR_ARG', 'Ignition colour'], ['BLAST_COLOR_ARG', 'Blast colour'], ['CLASH_COLOR_ARG', 'Clash colour'], ['LOCKUP_COLOR_ARG', 'Lockup colour'], ['DRAG_COLOR_ARG', 'Drag colour'], ['LB_COLOR_ARG', 'Lightning block colour'], ['STAB_COLOR_ARG', 'Stab colour'], ['SWING_COLOR_ARG', 'Swing colour'], ['EMITTER_COLOR_ARG', 'Emitter colour'], ['PREON_COLOR_ARG', 'Pre-on colour'], ['RETRACTION_COLOR_ARG', 'Retraction colour'], ['POSTOFF_COLOR_ARG', 'Post-off colour'], ['OFF_COLOR_ARG', 'Off colour'], ['ALT_COLOR2_ARG', '2nd alt colour'], ['ALT_COLOR3_ARG', '3rd alt colour']];

const APPROX_WORDS = (n: string): string => ({ ClashImpactF: 'clash strength (soft, or hard with a swing behind it)', SoundLevel: 'sound level (a modelled hum)', WavLen: 'sound lengths (1 s)', VolumeLevel: 'volume', SwingAcceleration: 'swing acceleration', TwistAcceleration: 'twist acceleration', MarbleF: 'the marble (gravity from the tilt only)', OriginalBlastF: 'the original blast shape' } as Record<string, string>)[n] ?? friendly(n);

/** Catalogue entries a slot of `kind` can take, the current one included even if it is an internal helper. */
function choicesFor(kind: Kind, current: string): CatEntry[] {
  const all = Object.values(CATALOGUE).filter((e) => !e.internal || e.name === current);
  const list = kind === 'COLOR' ? all.filter((e) => e.kind === 'COLOR') : kind === 'FUNCTION' || kind === 'INTEGER' ? all.filter((e) => e.kind === 'FUNCTION') : kind === 'TRANSITION' ? all.filter((e) => e.kind === 'TRANSITION') : all;
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Plain words for a template name: ResponsiveLightningBlockL -> Responsive lightning block. */
export const friendly = (name: string): string => name.replace(/L$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/^./, (c) => c.toUpperCase());
const PARAM_WORDS: Record<string, string> = { TR1: 'Begin', TR2: 'End', BEGINTR: 'Begin', ENDTR: 'End', BEGIN_TR: 'Begin', END_TR: 'End', OUTTR: 'Ignition', INTR: 'Retraction', OUT_TR: 'Ignition', IN_TR: 'Retraction', MILLIS: 'Milliseconds', MS: 'Milliseconds', RPM: 'Speed (rpm)', COLOR: 'Colour', BASE: 'Underneath', LAYER: 'Layer', F: 'Function', N: 'Number', OFF: 'Off colour', OFF_COLOR: 'Off colour', EFFECT: 'On which effect', LOCKUP_TYPE: 'Lockup type', CONDITION: 'Only when', TOP: 'Top limit', BOTTOM: 'Bottom limit', SIZE: 'Size', SIZE1: 'Size at rest', SIZE2: 'Size when twisted', LOCATION: 'Where', FADEOUT_MS: 'Fade out (ms)', WAVE_SIZE: 'Wave size', WAVE_MS: 'Wave speed (ms)', FADE: 'Fade (ms)', GRADE: 'Grade', SPEED: 'Speed', PERCENT: 'Percent', WIDTH: 'Width', MIN: 'Minimum', MAX: 'Maximum', DELAY_MS: 'Delay (ms)', PULSE_MILLIS: 'Pulse (ms)', SPARK_COLOR: 'Spark colour', SPARK_SIZE: 'Spark size', ARG: 'Setting', DEFAULT_COLOR: 'Starting colour', STRIPE_WIDTH: 'Stripe width', STRIPE_SPEED: 'Stripe speed', BLINK_MILLIS: 'Blink (ms)', BLINK_PROMILLE: 'On fraction (‰)', SPARK_CHANCE_PROMILLE: 'Spark chance (‰)', SPARK_INTENSITY: 'Spark intensity', HUMP_WIDTH: 'Hump width', ALPHA: 'Opacity', SPEED_MIN: 'Speed at least', SPEED_MAX: 'Speed at most' };
const friendlyParam = (p: string): string => PARAM_WORDS[p.toUpperCase()] ?? p.toLowerCase().replace(/_/g, ' ').replace(/\bms\b/, 'ms').replace(/^./, (c) => c.toUpperCase());

const hexOf = (n: Node): string | null => {
  if (n.name === 'Rgb' && n.args.length === 3) return '#' + n.args.map((a) => Math.max(0, Math.min(255, Number(a.name) || 0)).toString(16).padStart(2, '0')).join('');
  const e = CATALOGUE[n.name];
  if (e && e.kind === 'COLOR' && !e.params.length) { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(e.doc); if (m) return '#' + m.slice(1, 4).map((x) => Number(x).toString(16).padStart(2, '0')).join(''); }
  return null;
};
const rgbNode = (hex: string): Node => { const v = parseInt(hex.slice(1), 16); return { name: 'Rgb', args: [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => ({ name: String(x), args: [] })) }; };

/** Swap a node for another template, keeping arguments whose kinds still fit their new slots. */
function retarget(old: Node, name: string): Node {
  const next = newNode(name);
  const e = CATALOGUE[name];
  if (!e) return next;
  for (let i = 0; i < next.args.length; i++) {
    const p = paramFor(e, i); const prev = old.args[i];
    if (p && prev && kindOf(prev) === p.kind) next.args[i] = cloneNode(prev);
  }
  return next;
}

export function TreeEditor({ tree, onChange, unsupported, approximate }: { tree: Node; onChange: (t: Node) => void; unsupported: string[]; approximate: string[] }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const update = (fn: (t: Node) => void) => { const next = cloneNode(tree); fn(next); onChange(next); };
  const isLayers = tree.name === 'Layers';
  const layerChoices = useMemo(() => choicesFor('COLOR', '').filter((e) => /L$/.test(e.name) || /LAYER/i.test(e.doc)), []);
  const shown = useMemo(() => { const q = filter.trim().toLowerCase(); return (q ? choicesFor('COLOR', '') : layerChoices).filter((e) => !q || e.name.toLowerCase().includes(q) || e.doc.toLowerCase().includes(q)); }, [filter, layerChoices]);

  return (
    <div className="col" style={{ gap: 12 }}>
      {unsupported.length > 0 && <div className="note amber"><Icon name="warn" /><span>The preview cannot show {unsupported.map(friendly).join(', ')} yet; they compile and run on the saber as written.</span></div>}
      {approximate.length > 0 && <span className="hint">Modelled without the saber's sensors, so only roughly: {approximate.map(APPROX_WORDS).join(', ')}.</span>}
      {isLayers ? (
        <>
          <NodeCard node={tree.args[0] ?? defaultFor('COLOR')} kind="COLOR" label="Blade" hint="What the blade does on its own, underneath every layer" depth={0}
            onChange={(n) => update((t) => { t.args[0] = n; })} />
          <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Layers, bottom to top</span><span className="hint">Later layers paint over earlier ones.</span></div>
          {tree.args.slice(1).map((n, i) => (
            <NodeCard key={i} node={n} kind="COLOR" index={i} depth={0} label={friendly(n.name)}
              onChange={(m) => update((t) => { t.args[i + 1] = m; })}
              onMove={(dir) => update((t) => { const a = i + 1; const b = a + dir; if (b < 1 || b >= t.args.length) return; [t.args[a], t.args[b]] = [t.args[b], t.args[a]]; })}
              onRemove={() => update((t) => { t.args.splice(i + 1, 1); })} canUp={i > 0} canDown={i < tree.args.length - 2} />
          ))}
          {adding ? (
            <div className="col" style={{ gap: 8, padding: 12, border: '1px solid var(--holo)', background: '#0d131a' }}>
              <div className="row between" style={{ gap: 10 }}>
                <span className="small" style={{ fontWeight: 600 }}>Add a layer</span>
                <span className="input sans grow" style={{ height: 28, maxWidth: 320 }}><input type="text" placeholder="Search every ProffieOS template" value={filter} aria-label="Search templates" onChange={(e) => setFilter(e.target.value)} /></span>
                <button type="button" className="chip" onClick={() => { setAdding(false); setFilter(''); }}><Icon name="x" /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, maxHeight: 320, overflow: 'auto' }}>
                {shown.map((e) => (
                  <button key={e.name} type="button" className="opt" style={{ flex: 'none' }} title={e.doc} onClick={() => { update((t) => { t.args.push(newNode(e.name)); }); setAdding(false); setFilter(''); }}>
                    <span className="col" style={{ gap: 2, minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{friendly(e.name)}</b><span className="hint ellip" style={{ display: 'block' }}>{e.doc || e.name}</span></span>
                  </button>
                ))}
                {!shown.length && <span className="hint">Nothing matches.</span>}
              </div>
            </div>
          ) : <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><span className="b"><span className="i"><Icon name="plus" />Add a layer</span></span></button>}
        </>
      ) : (
        <>
          <NodeCard node={tree} kind="COLOR" label="Style" depth={0} onChange={onChange} />
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ name: 'Layers', args: [tree] })}><span className="b"><span className="i"><Icon name="plus" />Put it under Layers, so effects can go on top</span></span></button>
        </>
      )}
    </div>
  );
}

/** One template and its parameters. Leaves (plain colours, numbers, enums) get a direct control; the rest nest. */
function NodeCard({ node, kind, label, hint, index, depth, onChange, onMove, onRemove, canUp, canDown }: {
  node: Node; kind: Kind; label: string; hint?: string; index?: number; depth: number;
  onChange: (n: Node) => void; onMove?: (dir: -1 | 1) => void; onRemove?: () => void; canUp?: boolean; canDown?: boolean;
}) {
  const [open, setOpen] = useState(depth < 2);
  const entry = CATALOGUE[node.name];
  const choices = useMemo(() => choicesFor(kind, node.name), [kind, node.name]);
  const hex = kind === 'COLOR' ? hexOf(node) : null;
  const isArg = node.name === 'RgbArg';
  const isNumber = /^-?\d+$/.test(node.name);
  const isInt = node.name === 'Int' && node.args.length === 1 && /^-?\d+$/.test(node.args[0]?.name ?? '');
  const isEnum = kind === 'EFFECT' || kind === 'LOCKUP_TYPE';
  const leaf = isNumber || isInt || isEnum || (hex != null && !isArg);
  const setArg = (i: number, n: Node) => { const c = cloneNode(node); c.args[i] = n; onChange(c); };

  // Which slots to show: every declared parameter, plus any extra arguments the pasted style supplied.
  const slots: { i: number; name: string; kind: Kind; doc: string; def: string | null }[] = [];
  if (entry) {
    const fixed = entry.variadic ? entry.params.length - 1 : entry.params.length;
    const count = Math.max(fixed, node.args.length);
    for (let i = 0; i < count; i++) { const p = paramFor(entry, i); if (p) slots.push({ i, name: p.name, kind: p.kind, doc: p.doc, def: p.default }); else slots.push({ i, name: `Argument ${i + 1}`, kind: kindOf(node.args[i] ?? { name: '', args: [] }), doc: '', def: null }); }
  } else for (let i = 0; i < node.args.length; i++) slots.push({ i, name: `Argument ${i + 1}`, kind: kindOf(node.args[i]), doc: '', def: null });

  const picker = (
    <span className="input sans" style={{ height: 28, minWidth: 0, width: depth === 0 ? 280 : 220 }} title={entry?.doc}>
      <span className="ellip">{isNumber || isInt ? 'Number' : friendly(node.name)}</span><span className="caret"><Icon name="down" /></span>
      <select value={isNumber || isInt ? '#' : node.name} aria-label={`${label} template`} onChange={(e) => { const v = e.target.value; const cur = isInt ? node.args[0].name : isNumber ? node.name : '300'; onChange(v === '#' ? (kind === 'INTEGER' ? { name: cur, args: [] } : { name: 'Int', args: [{ name: cur, args: [] }] }) : v === 'Rgb' ? rgbNode('#ffffff') : retarget(node, v)); }}>
        {(kind === 'INTEGER' || kind === 'FUNCTION') && <option value="#">Number</option>}
        {kind === 'COLOR' && !hex && <option value="Rgb">Colour</option>}
        {choices.filter((c) => c.name !== 'Int').map((c) => <option key={c.name} value={c.name} title={c.doc}>{friendly(c.name)}</option>)}
        {!isNumber && !isInt && !choices.some((c) => c.name === node.name) && <option value={node.name}>{node.name}</option>}
      </select>
    </span>
  );

  const leafControl = (
    <>
      {isNumber && <input type="number" className="mono" value={node.name} aria-label={label} style={{ width: 90 }} onChange={(e) => onChange({ name: String(Math.trunc(Number(e.target.value) || 0)), args: [] })} />}
      {isInt && <input type="number" className="mono" value={node.args[0].name} aria-label={label} style={{ width: 90 }} onChange={(e) => setArg(0, { name: String(Math.trunc(Number(e.target.value) || 0)), args: [] })} />}
      {hex != null && !isArg && <label className="swatch" style={{ width: 'auto', height: 28, padding: '0 8px', gap: 8 }} title={hint}><span className="sq" style={{ width: 14, height: 14, background: hex, boxShadow: `0 0 8px ${hex}` }} /><span className="mono mute" style={{ fontSize: 11 }}>{hex}</span><input type="color" value={hex} aria-label={label} onChange={(e) => onChange(rgbNode(e.target.value))} /></label>}
    </>
  );

  // ---- leaves ----
  if (leaf && depth > 0) {
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
        <span className="small dim nowrap" style={{ width: 120 }} title={hint}>{label}</span>
        {leafControl}
        {isEnum && (
          <span className="input sans" style={{ height: 28, width: 220 }}><span className="ellip">{friendly(node.name.replace(/^(SaberBase::)?(EFFECT_|LOCKUP_)/, ''))}</span><span className="caret"><Icon name="down" /></span>
            <select value={node.name} aria-label={label} onChange={(e) => onChange({ name: e.target.value, args: [] })}>{(kind === 'EFFECT' ? EFFECTS : LOCKUPS).map((v) => <option key={v} value={v}>{friendly(v.replace(/^(SaberBase::)?(EFFECT_|LOCKUP_)/, ''))}</option>)}{![...EFFECTS, ...LOCKUPS].includes(node.name) && <option value={node.name}>{node.name}</option>}</select></span>
        )}
        {(kind === 'COLOR' || kind === 'FUNCTION' || kind === 'TRANSITION') && !isEnum && <span style={{ marginLeft: 'auto' }}>{picker}</span>}
      </div>
    );
  }

  // ---- branches ----
  const body = (
    <div className="col" style={{ gap: 6 }}>
      {isArg && (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="small dim nowrap" style={{ width: 120 }}>Live setting</span>
          <span className="input sans" style={{ height: 28, width: 220 }}><span className="ellip">{COLOR_ARGS.find(([a]) => a === node.args[0]?.name)?.[1] ?? node.args[0]?.name}</span><span className="caret"><Icon name="down" /></span>
            <select value={node.args[0]?.name ?? 'BASE_COLOR_ARG'} aria-label="Which live colour setting" onChange={(e) => setArg(0, { name: e.target.value, args: [] })}>{COLOR_ARGS.map(([a, n]) => <option key={a} value={a}>{n}</option>)}</select></span>
          <span className="hint">Changed on Presets without a rebuild; the colour below is its starting value.</span>
        </div>
      )}
      {slots.filter((s) => !(isArg && s.i === 0)).map((s) => {
        const child = node.args[s.i];
        if (!child) return (
          <div key={s.i} className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="small dim nowrap" style={{ width: 120 }} title={s.doc}>{friendlyParam(s.name)}</span>
            <span className="hint ellip" style={{ flex: 1 }}>Default: {s.def ?? 'none'}</span>
            <button type="button" className="chip" onClick={() => { const c = cloneNode(node); while (c.args.length < s.i) c.args.push(defaultFor(paramFor(entry!, c.args.length)?.kind ?? 'FUNCTION', paramFor(entry!, c.args.length)?.default)); c.args[s.i] = defaultFor(s.kind, s.def); onChange(c); }}>Set</button>
          </div>
        );
        const hintText = s.doc || (s.def ? `Default ${s.def}` : undefined);
        return <NodeCard key={s.i} node={child} kind={s.kind} label={friendlyParam(s.name)} hint={hintText} depth={depth + 1} onChange={(n) => setArg(s.i, n)}
          onRemove={entry?.variadic && s.i >= entry.params.length - 1 ? () => { const c = cloneNode(node); c.args.splice(s.i, 1); onChange(c); } : (s.i >= (entry ? (entry.variadic ? entry.params.length - 1 : entry.params.length) : 0) || s.def) && s.i === node.args.length - 1 ? () => { const c = cloneNode(node); c.args.pop(); onChange(c); } : undefined} />;
      })}
      {entry?.variadic && <button type="button" className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => { const c = cloneNode(node); c.args.push(defaultFor(entry.params[entry.params.length - 1].kind, entry.params[entry.params.length - 1].default)); onChange(c); }}><Icon name="plus" />{friendlyParam(entry.params[entry.params.length - 1].name)}</button>}
    </div>
  );

  if (depth === 0) {
    return (
      <div className="bcard col" style={{ gap: 10, padding: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          {index != null && <span className="nbox">{index + 1}</span>}
          <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 10 }}>{index == null && <b style={{ fontWeight: 600, fontSize: 13.5 }}>{label}:</b>}{picker}{leafControl}</div>
            <span className="hint" title={entry?.doc}>{entry?.doc ? entry.doc.slice(0, 160) + (entry.doc.length > 160 ? '…' : '') : hint ?? (entry ? '' : 'Not in this ProffieOS version’s catalogue; kept as written.')}</span>
          </div>
          {onMove && <button type="button" className="chip" disabled={!canUp} aria-label="Move down the stack" onClick={() => onMove(-1)}><Icon name="up" /></button>}
          {onMove && <button type="button" className="chip" disabled={!canDown} aria-label="Move up the stack" onClick={() => onMove(1)}><Icon name="down" /></button>}
          {onRemove && <button type="button" className="chip" aria-label={`Remove ${label}`} onClick={onRemove}><Icon name="trash" /></button>}
        </div>
        {slots.length > 0 && body}
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 6, borderLeft: '1px solid var(--line2)', paddingLeft: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button type="button" className="chip" style={{ padding: '0 4px' }} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => !o)}><Icon name={open ? 'down' : 'chev'} /></button>
        <span className="small dim nowrap" style={{ width: 104 }} title={hint}>{label}</span>
        {picker}
        {isArg && hexOf(node.args[1] ?? { name: '', args: [] }) && <span className="sq" style={{ width: 14, height: 14, background: hexOf(node.args[1]) ?? '#000', boxShadow: `0 0 8px ${hexOf(node.args[1])}` }} />}
        {!open && <span className="hint mono ellip" style={{ flex: 1, fontSize: 11 }}>{printStyle(node).replace(/\s+/g, ' ')}</span>}
        {onRemove && <button type="button" className="chip" style={{ marginLeft: 'auto' }} aria-label={`Remove ${label}`} onClick={onRemove}><Icon name="x" /></button>}
      </div>
      {open && slots.length > 0 && <div style={{ paddingLeft: 26 }}>{body}</div>}
    </div>
  );
}

/** Paste box: any style expression from the official editor or a library, parsed into a tree. */
export function PasteStyle({ onParsed, onClose }: { onParsed: (t: Node) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = () => { try { onParsed(parseStyle(text)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="col" style={{ gap: 8, padding: 12, border: '1px solid var(--holo)', background: '#0d131a' }}>
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Paste a style</span><button type="button" className="chip" onClick={onClose}><Icon name="x" /></button></div>
      <textarea className="console mono" value={text} rows={6} spellCheck={false} aria-label="Style code" placeholder="StylePtr<Layers<Red, ResponsiveClashL<White>, InOutTrL<TrWipe<300>, TrWipeIn<500>>>>()" style={{ resize: 'vertical', fontSize: 12 }} onChange={(e) => { setText(e.target.value); setErr(null); }} />
      {err && <div className="note red"><Icon name="warn" /><span>{err}</span></div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm pri" disabled={!text.trim()} onClick={go}><span className="b"><span className="i"><Icon name="import" />Open it in the editor</span></span></button>
        <span className="hint">Anything from the official style editor or a style library works; the comment header is dropped.</span>
      </div>
    </div>
  );
}
