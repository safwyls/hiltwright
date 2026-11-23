// A layer of the full style editor as a card: what it paints, where on the blade, and when. The card reads the layer
// through core/layerCard.ts and edits it one slot at a time, so anything it does not lay out is kept exactly as written.
// Slots holding something the card has no control for (a Sin<> driving a Mix, a noise function) open as the tree.

import { useState } from 'react';
import {
  CATALOGUE, EFFECT_VALUES, LOCKUP_VALUES, SENSORS, TR_CHOICES, at, cloneNode, colourNode, colourView, defaultFor, describeComposed, newNode, numNode, numView, paramFor, paramLabel as paramLabelOf, parseStyle, printStyle,
  numberUnit, setAt, setShape, setStrength, setWhen, trNode, trView, unlockPair, type Cue, type Pair, type LayerCard as Card, type Pose, type Kind, type Node, type NumView, type Path, type SensorKey, type Shape, type Slot, type WhenType,
} from '@hiltwright/core';
import { Icon } from './Icon';
import { NodeCard } from './NodeCard';
import { PATTERNS, makePattern } from './patterns';
import { CurveControl, NumControl, PairControl, PreviewPose, type Unit } from './NumControl';
import { COLOR_ARGS, COLOUR_GROUPS, colourGroup, colourName, describe, friendly, friendlyDefault, friendlyEnum } from './treeWords';
import { Select } from './Select';

type Composed = Extract<Card, { form: 'composed' }>;
const parse = (s: string | null | undefined): Node | undefined => { if (!s) return undefined; try { return parseStyle(s); } catch { return undefined; } };
const pct = (v: number): number => Math.round((v / 32768) * 100);

// ---------------- controls ----------------

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="lrow">
      <span className="small dim" title={hint}>{label}</span>
      <div className="row wrap" style={{ gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** A colour slot's choices, grouped: the plain colour, then the patterns under their colour-list groups. */
function patternOptions(extra?: { value: string; label: string }) {
  return [
    <optgroup key="plain" label="Colours"><option value="">Plain colour</option></optgroup>,
    ...COLOUR_GROUPS.map((g) => { const list = PATTERNS.filter(([p]) => colourGroup(p) === g); return list.length ? <optgroup key={g} label={g}>{list.map(([p, words]) => <option key={p} value={p}>{words}</option>)}</optgroup> : null; }),
    extra ? <optgroup key="written" label="As written"><option value={extra.value} disabled>{extra.label}</option></optgroup> : null,
  ];
}

/** A colour: one plain colour (optionally a live setting changeable on Presets), or a pattern whose settings open below. */
export function ColourControl({ node, def, label, liveArg, onChange, patterns = true }: { node: Node | undefined; def?: string | null; label: string; liveArg: string; onChange: (n: Node) => void; patterns?: boolean }) {
  const cur = node ?? parse(def) ?? { name: 'White', args: [] };
  const v = colourView(cur);
  const pattern = v ? '' : cur.name;
  const picker = patterns && (
    <Select className="plain" value={PATTERNS.some(([p]) => p === pattern) || pattern === '' ? pattern : '?'} aria-label={`${label}: plain colour or a pattern`} onChange={(e) => onChange(makePattern(e.target.value, cur))}>
      {patternOptions(!!pattern && !PATTERNS.some(([p]) => p === pattern) ? { value: '?', label: friendly(pattern) } : undefined)}
    </Select>
  );
  if (!v) {
    return (
      <div className="col" style={{ gap: 8, minWidth: 0 }}>
        {picker && <div className="row" style={{ gap: 8 }}>{picker}</div>}
        <TemplateSlots node={cur} onChange={onChange} liveArg={liveArg} fallbackLabel={label} />
      </div>
    );
  }
  const argName = COLOR_ARGS.find(([a]) => a === v.arg)?.[1];
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        {picker}
        <label className="swatch" style={{ display: 'inline-flex', width: 'auto', height: 30, padding: '0 10px 0 8px', gap: 8 }}>
          <span className="sq" style={{ width: 14, height: 14, ['--c' as string]: v.hex, background: v.hex }} />
          <span className="small nowrap">{colourName(v.hex)}</span><span className="mono mute" style={{ fontSize: 11 }}>{v.hex}</span>
          <input type="color" value={v.hex} aria-label={label} onChange={(e) => onChange(colourNode({ ...v, hex: e.target.value }, cur))} />
        </label>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        <button type="button" className={`tog ${v.arg ? 'on' : ''}`} role="switch" aria-checked={!!v.arg} aria-label="Changeable on Presets without a rebuild" onClick={() => onChange(colourNode({ ...v, arg: v.arg ? null : liveArg }, cur))}><i /></button>
        <span className="small">{v.arg ? <>Changeable on Presets as the</> : 'Changeable on Presets without a rebuild'}</span>
        {v.arg && (
          <Select className="plain" value={v.arg} aria-label="Which live colour setting" onChange={(e) => onChange(colourNode({ ...v, arg: e.target.value }, cur))}>
            {COLOR_ARGS.map(([a, n]) => <option key={a} value={a}>{n.toLowerCase()}</option>)}
            {!argName && <option value={v.arg}>{v.arg}</option>}
          </Select>
        )}
      </div>
    </div>
  );
}

/** A transition: one of the common ones with its time, or the tree for anything else. */
export function TrControl({ node, def, label, onChange }: { node: Node | undefined; def?: string | null; label: string; onChange: (n: Node) => void }) {
  const cur = node ?? parse(def) ?? { name: 'TrInstant', args: [] };
  const v = trView(cur);
  if (!v) return <NodeCard node={cur} kind="TRANSITION" label={label} depth={1} onChange={onChange} />;
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <Select className="plain" value={v.base} aria-label={label} onChange={(e) => onChange(trNode({ ...v, base: e.target.value, ms: v.ms ?? 300 }, v))}>
        {TR_CHOICES.filter(([t]) => CATALOGUE[t]).map(([t, words]) => <option key={t} value={t}>{words}</option>)}
      </Select>
      {v.base !== 'TrInstant' && <><input type="number" className="num" value={v.ms ?? 0} min={0} step={50} aria-label={`${label}, milliseconds`} onChange={(e) => onChange(trNode({ ...v, ms: Number(e.target.value) || 0 }, v))} /><span className="hint">ms</span></>}
      {v.live && <span className="hint">{v.live === 'ignition' ? 'The ignition time' : 'The retraction time'} is a live setting: this is its starting value.</span>}
    </div>
  );
}

function EnumControl({ node, def, kind, label, onChange }: { node: Node | undefined; def?: string | null; kind: Kind; label: string; onChange: (n: Node) => void }) {
  const cur = node?.name ?? def ?? (kind === 'EFFECT' ? 'EFFECT_CLASH' : 'SaberBase::LOCKUP_NORMAL');
  const list = kind === 'EFFECT' ? EFFECT_VALUES : LOCKUP_VALUES;
  return (
    <Select className="plain" value={cur} aria-label={label} onChange={(e) => onChange({ name: e.target.value, args: [] })}>
      {list.map((x) => <option key={x} value={x}>{friendlyEnum(x)}</option>)}
      {!list.includes(cur) && <option value={cur}>{cur}</option>}
    </Select>
  );
}

/** One parameter of a template, with the control its kind calls for. */
function SlotControl({ node, slot, liveArg, onSet, onRemove, template }: { node: Node | undefined; slot: Slot; liveArg: string; onSet: (n: Node) => void; onRemove?: () => void; template: string }) {
  const def = node ? null : slot.def;
  const tip = slot.doc || (slot.def ? `Default ${friendlyDefault(slot.def)}` : undefined);
  const meaning = numberUnit(template, slot.param, slot.kind); // a wave's size is a sharpness: never a share of the blade
  if (!node && slot.def == null) return <Row label={slot.label} hint={tip}><span className="hint">Not set</span><button type="button" className="chip" onClick={() => onSet(defaultFor(slot.kind))}>Set</button></Row>;
  const remove = onRemove && <button type="button" className="iconbtn" aria-label={`Remove ${slot.label.toLowerCase()}`} onClick={onRemove}><Icon name="x" /></button>;
  const flag = slot.kind === 'INTEGER' && /^(ALLOW_|ENABLE|DISABLE)/.test(slot.param) && /^[01]$/.test(node?.name ?? slot.def ?? '');
  if (flag) { const on = (node?.name ?? slot.def) === '1'; return <Row label={slot.label} hint={tip}><button type="button" className={`tog ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={slot.label} onClick={() => onSet({ name: on ? '0' : '1', args: [] })}><i /></button>{!node && <span className="hint">default</span>}{slot.doc && <span className="hint" style={{ flexBasis: '100%' }}>{slot.doc}</span>}</Row>; }
  if (slot.kind === 'FUNCTION' || slot.kind === 'INTEGER') return <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}><div className="grow"><NumControl node={node} def={def} unit={meaning?.kind === 'wavewidth' ? 'raw' : unitOf(slot)} meaning={meaning} bare={slot.kind === 'INTEGER'} label={slot.label} hint={tip} onChange={onSet} /></div>{remove}</div>;
  let control: React.ReactNode;
  if (slot.kind === 'COLOR') control = <ColourControl node={node} def={def} label={slot.label} liveArg={liveArg} onChange={onSet} patterns={false} />;
  else if (slot.kind === 'TRANSITION') control = <TrControl node={node} def={def} label={slot.label} onChange={onSet} />;
  else if (slot.kind === 'EFFECT' || slot.kind === 'LOCKUP_TYPE') control = <EnumControl node={node} def={def} kind={slot.kind} label={slot.label} onChange={onSet} />;
  else control = <NodeCard node={node ?? defaultFor(slot.kind, slot.def)} kind={slot.kind} label={slot.label} depth={1} onChange={onSet} />;
  // Something the card has no control for (a chain of steps, a template in a colour slot) gets the full width as a tree.
  const simple = slot.kind === 'COLOR' ? true : slot.kind === 'TRANSITION' ? !!trView(node ?? parse(slot.def)) : slot.kind === 'EFFECT' || slot.kind === 'LOCKUP_TYPE';
  if (!simple) return <div className="col" style={{ gap: 6, minWidth: 0 }}><div className="row" style={{ gap: 8 }}><span className="small dim" title={tip}>{slot.label}</span>{remove}</div><div className="slotwide">{control}</div></div>;
  return <Row label={slot.label} hint={tip}>{control}{!node && <span className="hint">default</span>}{remove}</Row>;
}

/** How a template's number reads: a point along the blade, a length of it, how solid, or a plain number. */
const unitOf = (s: Slot): Unit => (!s.blade ? 'raw' : /SIZE|WIDTH/i.test(s.param) ? 'size' : /ALPHA/i.test(s.param) ? 'strength' : 'pos');

/** Set argument `i`, filling any defaulted arguments before it so the positions stay right. */
function setArg(n: Node, i: number, v: Node): Node {
  const e = CATALOGUE[n.name];
  const c = cloneNode(n);
  while (c.args.length < i) { const p = e && paramFor(e, c.args.length); c.args.push(defaultFor(p?.kind ?? 'FUNCTION', p?.default)); }
  c.args[i] = v;
  return c;
}

/** Every parameter of a template in order, for a pattern inside a colour slot. */
function TemplateSlots({ node, onChange, liveArg, fallbackLabel }: { node: Node; onChange: (n: Node) => void; liveArg: string; fallbackLabel: string }) {
  const e = CATALOGUE[node.name];
  if (!e || e.kind !== 'COLOR') return <NodeCard node={node} kind="COLOR" label={fallbackLabel} depth={1} onChange={onChange} />;
  const fixed = e.variadic ? e.params.length - 1 : e.params.length;
  const count = Math.max(e.variadic ? fixed + 1 : fixed, node.args.length);
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) { const p = paramFor(e, i)!; slots.push({ i, path: [i], param: p.name, label: paramLabelOf(node.name, p.name), kind: p.kind, def: p.default, doc: p.doc, role: 'what', blade: /^(POS|SIZE|WIDTH|TOP|BOTTOM|LOCATION)/i.test(p.name), present: i < node.args.length, extra: e.variadic && i >= fixed && node.args.length > fixed + 1 }); }
  return (
    <div className="col" style={{ gap: 8 }}>
      {slots.map((s) => <SlotControl key={s.i} template={node.name} node={node.args[s.i]} slot={s} liveArg={liveArg} onSet={(v) => onChange(setArg(node, s.i, v))} onRemove={s.extra ? () => { const c = cloneNode(node); c.args.splice(s.i, 1); onChange(c); } : undefined} />)}
      {e.variadic && <button type="button" className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => { const last = e.params[e.params.length - 1]; const c = cloneNode(node); c.args.push(defaultFor(last.kind, last.default)); onChange(c); }}><Icon name="plus" />Another {paramLabelOf(node.name, e.params[e.params.length - 1].name).toLowerCase()}</button>}
    </div>
  );
}

// ---------------- the card ----------------

/** The live colour setting a layer's colour should become by default, from what triggers it. */
function liveArgFor(cue: Cue | null, base: boolean): string {
  if (base) return 'BASE_COLOR_ARG';
  if (cue?.lockup) return ({ normal: 'LOCKUP_COLOR_ARG', drag: 'DRAG_COLOR_ARG', melt: 'LOCKUP_COLOR_ARG', lb: 'LB_COLOR_ARG' } as const)[cue.lockup];
  const e = cue?.effect?.replace('EFFECT_', '');
  return e && COLOR_ARGS.some(([a]) => a === `${e}_COLOR_ARG`) ? `${e}_COLOR_ARG` : 'ALT_COLOR_ARG';
}

export interface LayerCardProps {
  layer: Node; card: Card; base?: boolean; pinned?: boolean;
  name: string; defaultName: string; onName: (v: string) => void;
  onChange: (n: Node) => void; cue: Cue | null; onCue: (c: Cue) => void;
  hidden?: boolean; onHidden?: () => void; onRemove?: () => void; onDuplicate?: () => void; onMove?: (dir: 1 | -1) => void; canUp?: boolean; canDown?: boolean;
}

export function LayerCardView({ layer, card, base, pinned, name, defaultName, onName, onChange, cue, onCue, hidden, onHidden, onRemove, onDuplicate, onMove, canUp, canDown }: LayerCardProps) {
  const [code, setCode] = useState(false);
  const [asTree, setAsTree] = useState(card.form === 'tree');
  const liveArg = liveArgFor(cue, !!base);
  const template = card.form === 'template' ? card.template : card.form === 'tree' ? layer.name : null;

  const sentence = (() => {
    if (card.form === 'tree') return <>Hiltwright has no card for this layer, so it is shown as a tree. The layer is kept exactly as written.</>;
    if (card.form === 'template' && /^InOutTrL$/.test(card.template)) {
      const tr = (n: Node | undefined) => { const v = trView(n); if (!v) return <b>its own transition</b>; const w = (TR_CHOICES.find(([t]) => t === v.base)?.[1] ?? v.base).toLowerCase(); return v.ms == null ? <b>{w}</b> : <><b>{w}</b> over {v.ms} ms</>; };
      return <>Comes on with {tr(layer.args[0])} and goes out with {tr(layer.args[1])}.</>;
    }
    if (card.form === 'template') { const d = describe(CATALOGUE[card.template]); return <>{base ? 'What the blade shows underneath every layer.' : `${card.when}.`} {d}</>; }
    if (base) return <>The blade is <b>{colourName(colourView(at(layer, card.colour))?.hex ?? '#000000').toLowerCase()}</b> underneath every layer.</>;
    return <>{describeComposed(layer, card, colourName).map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <b key={i}>{p.b}</b>))}</>;
  })();

  const pose = (p?: Pose) => onCue({ ...(cue ?? {}), pose: p, hold: true });
  return (
    <PreviewPose.Provider value={pose}>
    <div className="col lcard" style={{ gap: 0 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="input sans" style={{ height: 34, minWidth: 160, maxWidth: 320, flex: 1 }}><input type="text" value={name} placeholder={defaultName} aria-label="Layer name" onChange={(e) => onName(e.target.value)} /></span>
        <span style={{ flex: 1 }} />
        {cue && <button type="button" className="btn sm" title={cue.lockup ? 'Hold it on the preview for a moment' : 'Set it off on the preview'} onClick={() => onCue(cue)}><span className="b"><span className="i"><Icon name="play" />{cue.lockup ? 'Hold it' : 'Trigger'}</span></span></button>}
        {onHidden && <button type="button" className={`chip ${hidden ? 'sel' : ''}`} aria-pressed={!!hidden} aria-label={hidden ? 'Hidden in the preview: show it' : 'Hide it in the preview'} title="Hide the layer in the preview to see what it adds. A hidden layer is still saved and built." onClick={onHidden}><Icon name={hidden ? 'eyeOff' : 'eye'} /></button>}
        {onMove && <button type="button" className="chip" disabled={!canUp} aria-label="Move up the stack" onClick={() => onMove(1)}><Icon name="up" /></button>}
        {onMove && <button type="button" className="chip" disabled={!canDown} aria-label="Move down the stack" onClick={() => onMove(-1)}><Icon name="down" /></button>}
        {onDuplicate && <button type="button" className="chip" aria-label="Duplicate this layer" onClick={onDuplicate}><Icon name="copy" /></button>}
        {onRemove && <button type="button" className="chip" aria-label="Remove this layer" onClick={onRemove}><Icon name="trash" /></button>}
      </div>
      <p className="sentence">{sentence}</p>

      {asTree ? (
        <div style={{ padding: '12px 0' }}><NodeCard node={layer} kind="COLOR" label={name || defaultName} depth={0} onChange={onChange} /></div>
      ) : card.form === 'composed' ? (
        <ComposedSections layer={layer} card={card} base={!!base} liveArg={liveArg} onChange={onChange} />
      ) : card.form === 'template' ? (
        <TemplateSections layer={layer} card={card} base={!!base} pinned={!!pinned} liveArg={liveArg} onChange={onChange} />
      ) : null}

      <div className="row" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <button type="button" className="chip" onClick={() => setCode((c) => !c)}><Icon name="code" />{code ? 'Hide' : 'Show'} this layer's code</button>
        {card.form !== 'tree' && <button type="button" className="chip" onClick={() => setAsTree((t) => !t)}><Icon name="tree" />{asTree ? 'Back to the card' : 'Edit as a tree'}</button>}
        {code && <button type="button" className="chip" onClick={() => void navigator.clipboard.writeText(printStyle(layer))}><Icon name="copy" />Copy</button>}
        <span style={{ flex: 1 }} />
        {template && <span className="mono mute ellip" style={{ fontSize: 11, maxWidth: 220 }} title="The ProffieOS template behind this card">{template}</span>}
      </div>
      {code && <pre className="console" style={{ margin: '10px 0 0', fontSize: 11 }}>{printStyle(layer)}</pre>}
    </div>
    </PreviewPose.Provider>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="sect"><span className="label">{label}</span><div className="col" style={{ gap: 10, minWidth: 0 }}>{children}</div></div>;
}

function Seg<T extends string>({ value, options, onPick, label }: { value: T; options: [T, string][]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="seg sm" role="radiogroup" aria-label={label}>
      {options.map(([k, words]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => value !== k && onPick(k)}>{words}</button>)}
    </div>
  );
}

function ComposedSections({ layer, card, base, liveArg, onChange }: { layer: Node; card: Composed; base: boolean; liveArg: string; onChange: (n: Node) => void }) {
  const set = (p: Path) => (n: Node) => onChange(setAt(layer, p, n));
  const w = card.where; const t = card.when;
  const shapes: [Exclude<Shape, 'custom'>, string][] = [['whole', 'Whole blade'], ['spot', 'A spot'], ['hilt', 'From the hilt'], ['tip', 'From the tip']];
  return (
    <>
      <Section label="What">
        <ColourControl node={at(layer, card.colour)} label="Colour" liveArg={liveArg} onChange={set(card.colour)} />
      </Section>
      {base ? (
        <>
          <Section label="Where"><span className="small dim">The whole blade, underneath every layer.</span></Section>
          <Section label="When"><span className="small dim">Always, while the blade is on.</span></Section>
        </>
      ) : (
        <>
          <Section label="Where">
            {w.shape === 'custom'
              ? <><span className="small dim">A shape of its own. Pick one of these to replace it, or edit it below.</span><Seg value={'custom' as Exclude<Shape, 'custom'>} options={shapes} label="Where on the blade" onPick={(s) => onChange(setShape(layer, card, s))} /><NodeCard node={at(layer, w.mask)!} kind="FUNCTION" label="Shape" depth={1} onChange={set(w.mask)} /></>
              : <Seg value={w.shape} options={shapes} label="Where on the blade" onPick={(s) => onChange(setShape(layer, card, s))} />}
            {w.shape === 'spot' && <><NumControl node={at(layer, w.pos)} unit="pos" label="Position" hint="0% is the hilt, 100% the tip" onChange={set(w.pos)} /><NumControl node={at(layer, w.size)} def="Int<16385>" unit="size" label="Width" hint="How much of the blade the spot covers" onChange={set(w.size)} /></>}
            {(w.shape === 'hilt' || w.shape === 'tip') && <><NumControl node={at(layer, w.pos)} unit="pos" label={w.shape === 'tip' ? 'Reaches down to' : 'Reaches up to'} hint="0% is the hilt, 100% the tip" onChange={set(w.pos)} /><SoftControl node={at(layer, w.soft)!} onChange={set(w.soft)} /></>}
            {w.shape === 'whole' && <NumControl node={w.strength ? at(layer, w.strength) : undefined} def="Int<32768>" unit="strength" label="Strength" hint="How much it covers what is underneath: 100% is solid" onChange={(n) => onChange(setStrength(layer, card, n))} />}
          </Section>
          <Section label="When">
            <Seg<WhenType> value={t.type} options={[['always', 'Always'], ['effect', 'On an effect'], ['lockup', 'During a lockup']]} label="When it shows" onPick={(v) => onChange(setWhen(layer, card, v))} />
            {t.type === 'lockup' && <Row label="Lockup"><EnumControl node={at(layer, t.lockup)} kind="LOCKUP_TYPE" label="Which lockup" onChange={set(t.lockup)} /></Row>}
            {t.type === 'effect' && <Row label="Effect"><EnumControl node={at(layer, t.effect)} kind="EFFECT" label="Which effect" onChange={set(t.effect)} /></Row>}
            {t.type !== 'always' && <Row label="Comes in"><TrControl node={at(layer, t.inTr)} label="Comes in" onChange={set(t.inTr)} /></Row>}
            {t.type !== 'always' && <Row label="Goes out"><TrControl node={at(layer, t.outTr)} label="Goes out" onChange={set(t.outTr)} /></Row>}
          </Section>
        </>
      )}
    </>
  );
}

/** How soft the edge of a from-the-hilt / from-the-tip shape is. The sign says which way it faces, so it is kept. */
function SoftControl({ node, onChange }: { node: Node; onChange: (n: Node) => void }) {
  const v = numView(node);
  if (v.mode === 'other') return <NodeCard node={node} kind="FUNCTION" label="Edge" depth={1} onChange={onChange} />;
  // Shown and edited as a size; written back with the sign the shape faces by. A width of 0 would flip nothing, so 1 is the least.
  const sign = (v.mode === 'fixed' ? v.value : v.from) < 0 ? -1 : 1;
  const signed = (x: number) => sign * Math.max(1, Math.abs(x));
  const shown = numNode(v.mode === 'fixed' ? { mode: 'fixed', value: Math.abs(v.value) } : { ...v, from: Math.abs(v.from), to: Math.abs(v.to) }, node);
  return <NumControl node={shown} unit="size" label="Soft edge" hint="0% is a hard edge" onChange={(n) => { const m = numView(n); onChange(m.mode === 'fixed' ? numNode({ mode: 'fixed', value: signed(m.value) }, node) : m.mode === 'follow' ? numNode({ ...m, from: signed(m.from), to: signed(m.to) }, n) : n); }} />;
}

function TemplateSections({ layer, card, base, pinned, liveArg, onChange }: { layer: Node; card: Extract<Card, { form: 'template' }>; base: boolean; pinned: boolean; liveArg: string; onChange: (n: Node) => void }) {
  const e = CATALOGUE[card.template];
  const slot = (s: Slot) => <SlotControl key={s.i} template={card.template} node={layer.args[s.i]} slot={s} liveArg={liveArg} onSet={(v) => onChange(setArg(layer, s.i, v))}
    onRemove={s.extra ? () => { const c = cloneNode(layer); c.args.splice(s.i, 1); onChange(c); } : undefined} />;
  // Parameters that are the two ends of one reading show as one control, in the place of the first of them.
  const paired = new Set(card.pairs.flatMap((p) => [p.a, p.b]));
  const of = (r: Slot['role']) => card.slots.filter((s) => s.role === r && !paired.has(s.i));
  // Reacting to something else than the template chose means writing the template out in full: same layer, now open.
  const unlock = (p: Pair) => (sensor: SensorKey) => { if (sensor === p.sensor) return; const open = unlockPair(layer, p, sensor); if (open) onChange(open); };
  const pairsOf = (r: Slot['role']) => card.pairs.filter((p) => p.role === r).map((p) => p.shape === 'curve'
    ? <CurveControl key={`p${p.a}`} layer={layer} pair={p} hint="Where on the blade the effect lands as it tilts" onChange={onChange} onUnlock={unlock(p)} />
    : <PairControl key={`p${p.a}`} layer={layer} pair={p} unit={unitOf(card.slots[p.a])} onChange={onChange} onUnlock={unlock(p)} />);
  const more = e?.variadic ? <button type="button" className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => { const last = e.params[e.params.length - 1]; const c = cloneNode(layer); c.args.push(defaultFor(last.kind, last.default)); onChange(c); }}><Icon name="plus" />Another {paramLabelOf(card.template, e.params[e.params.length - 1].name).toLowerCase()}</button> : null;
  const io = /^InOut(Tr|Helper)L$/.test(card.template); // the ignition layer: its on/off transitions lead
  const what = of('what');
  const whatSection = (
    <Section label={io ? 'When off' : 'What'}>
      {base && <BasePattern layer={layer} onChange={onChange} />}
      {pairsOf('what')}
      {what.map(slot)}
      {!what.length && <span className="small dim">{friendly(card.template)}: it brings its own colours.</span>}
      {more && e?.params[e.params.length - 1].kind === 'COLOR' && more}
    </Section>
  );
  const whenSection = (
    <Section label={io ? 'On and off' : 'When'}>
      {!io && <span className="small">{base ? 'Always, while the blade is on.' : card.when}</span>}
      {pairsOf('when')}
      {of('when').map(slot)}
    </Section>
  );
  const sequenceOnly = !base && !io && !what.length && !of('where').length && !card.pairs.length; // TransitionEffectL<TrConcat<...>>: everything is in the steps
  return (
    <>
      {io ? whenSection : !sequenceOnly && whatSection}
      {!io && !sequenceOnly && (
        <Section label="Where">
          {base ? <span className="small dim">The whole blade, underneath every layer.</span> : of('where').length || pairsOf('where').length ? <>{pairsOf('where')}{of('where').map(slot)}</> : <span className="small dim">Where the template puts it.</span>}
        </Section>
      )}
      {io ? whatSection : whenSection}
      {pairsOf('tuning').length > 0 && <Section label="Settings">{pairsOf('tuning')}</Section>}
      <Tuning slots={of('tuning')} render={slot} more={more && e?.params[e.params.length - 1].kind !== 'COLOR' ? more : null} />
    </>
  );
}

/** The template's other settings. Ones still at their defaults wait behind "More settings", so the card starts short. */
function Tuning({ slots, render, more }: { slots: Slot[]; render: (s: Slot) => React.ReactNode; more: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const set = slots.filter((s) => s.present); const unset = slots.filter((s) => !s.present);
  if (!slots.length && !more) return null;
  return (
    <Section label="Settings">
      {set.map(render)}
      {open && unset.map(render)}
      {more}
      {unset.length > 0 && <button type="button" className="chip" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name={open ? 'up' : 'down'} />{open ? 'Fewer settings' : `More settings (${unset.length})`}</button>}
    </Section>
  );
}

/** The base's pattern picker: a plain colour or one of the common patterns. */
function BasePattern({ layer, onChange }: { layer: Node; onChange: (n: Node) => void }) {
  const known = PATTERNS.some(([p]) => p === layer.name);
  return (
    <div className="row" style={{ gap: 8 }}>
      <Select className="plain" value={known ? layer.name : '?'} aria-label="Plain colour or a pattern" onChange={(e) => onChange(makePattern(e.target.value, layer))}>
        {patternOptions(known ? undefined : { value: '?', label: friendly(layer.name) })}
      </Select>
    </div>
  );
}
