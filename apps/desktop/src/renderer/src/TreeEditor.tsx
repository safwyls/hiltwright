// The full style editor: every ProffieOS template, laid out as a stack of layers. The root is normally
// Layers<base, ...layers, InOutTrL<...>>: the stack reads top-first down the left, with the base and the ignition pinned
// underneath, and the chosen layer opens on the right as a card of What / Where / When (LayerCard.tsx). Layers the
// card does not recognise open as a tree, so anything the official style editor can express still pastes, edits and
// prints back out as C++.

import { useEffect, useMemo, useRef, useState } from 'react';
import { RECIPES, analyzeStyleCode, cloneNode, composedName, firstColour, layerCue, newLayer, parseStyle, pastedAuthor, readBase, readLayer, type Cue, type LayerCard, type Node, type StyleOrigin } from '@hiltwright/core';
import { Icon } from './Icon';
import { LayerCardView } from './LayerCard';
import { NodeCard } from './NodeCard';
import { describe, friendly, friendlyEnum, layerPickList } from './treeWords';

/** A layer's name when it has not been given one: what the card calls it, or the template's name. */
function defaultName(n: Node, card: LayerCard): string {
  if (card.form === 'composed') return composedName(n, card);
  // An effect that runs a sequence of its own: name it by its trigger, so three of them are told apart.
  const eff = card.form === 'template' && /TransitionEffectL$/.test(card.template) ? card.slots.find((s) => s.kind === 'EFFECT') : undefined;
  if (eff && n.args[eff.i]) return `${friendlyEnum(n.args[eff.i].name)} sequence`;
  return friendly(card.form === 'template' ? card.template : n.name);
}
/** The short tag down the right of the stack: what sets the layer off. */
function tagFor(card: LayerCard, cue: Cue | null): string {
  if (card.form === 'tree') return 'custom';
  if (card.form === 'template' && /^InOut(Tr|Helper)L$/.test(card.template)) return 'on / off';
  if (cue?.lockup) return cue.lockup === 'normal' ? 'lockup' : cue.lockup === 'lb' ? 'lightning' : cue.lockup;
  if (cue?.effect) return friendlyEnum(cue.effect).toLowerCase();
  return 'always';
}
const isOnOff = (n: Node | undefined): boolean => !!n && /^InOut(Tr|Helper)L$/.test(n.name);

// Random, not counted: keys live on in the undo history, which outlasts this module when it is reloaded, so a counter
// starting again at 1 would hand a new layer the key of an old one (and open the wrong card).
const freshKey = (): string => `l${crypto.randomUUID().slice(0, 8)}`;

export interface TreeEditorProps {
  tree: Node;
  /** Names given to the layers, by position in Layers<> (the base is 0). */
  labels: (string | null)[];
  /** `step` marks a change that is one deliberate act (adding, removing, moving a layer): never joined with others for undo. */
  onChange: (t: Node, labels: (string | null)[], step?: boolean, keys?: string[]) => void;
  /** The layers' keys as last reported through onChange, so undo brings a layer back as itself (selected, hidden). */
  layerKeys?: string[];
  /** The tree the preview should run: the same, less any layers hidden while editing. */
  onPreview: (t: Node) => void;
  /** Show a layer off on the preview. */
  onCue: (c: Cue) => void;
}

export function TreeEditor({ tree, labels, layerKeys, onChange, onPreview, onCue }: TreeEditorProps) {
  const isLayers = tree.name === 'Layers';
  // Keys follow the layers through moves and deletes, so a layer keeps its selection and hidden state.
  const keys = useRef<string[]>([]);
  if (layerKeys && layerKeys.length === tree.args.length) keys.current = layerKeys;
  else if (keys.current.length !== tree.args.length) keys.current = tree.args.map(freshKey);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const last = tree.args.length - 1;
  const onOff = isLayers && last > 0 && isOnOff(tree.args[last]) ? last : -1;
  const top = onOff > 0 ? onOff - 1 : last; // the highest layer that can move: the ignition stays last
  const stack = isLayers ? tree.args.map((n, a) => ({ n, a })).slice(1, top + 1).reverse() : [];
  const cards = useMemo(() => tree.args.map((n, a) => (a === 0 ? readBase(n) : readLayer(n))), [tree]);
  const labelAt = (a: number): string => labels[a] ?? '';

  const selIndex = keys.current.indexOf(sel ?? '');
  const current = selIndex >= 0 ? selIndex : top >= 1 ? top : 0;

  useEffect(() => {
    onPreview(hidden.size ? { name: tree.name, args: tree.args.filter((_, i) => !hidden.has(keys.current[i])) } : tree);
  }, [tree, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every change goes through here, keeping the keys and names lined up with the arguments.
  const apply = (args: Node[], ks: string[], ls: (string | null)[], step = false) => { keys.current = ks; onChange({ name: tree.name, args }, ls, step, ks); };
  const lined = () => ({ args: tree.args.slice(), ks: keys.current.slice(), ls: tree.args.map((_, i) => labels[i] ?? null) });
  const setLayer = (a: number, n: Node) => { const { args, ks, ls } = lined(); args[a] = n; apply(args, ks, ls); };
  const setLabel = (a: number, v: string) => { const { args, ks, ls } = lined(); ls[a] = v.trim() ? v : null; apply(args, ks, ls); };
  /** Move layer `a` so it shows at `slot` in the list (0 is the top), shifting the others: one undo step. */
  const moveTo = (a: number, slot: number) => {
    const shown = stack.map((s) => s.a); // top first
    const from = shown.indexOf(a); if (from < 0) return;
    const order = shown.slice(); order.splice(from, 1); order.splice(slot > from ? slot - 1 : slot, 0, a);
    if (order.every((x, i) => x === shown[i])) return;
    const { args, ks, ls } = lined();
    const bottomUp = order.slice().reverse(); // Layers<> runs from the bottom of the stack up
    const [na, nk, nl] = [args.slice(), ks.slice(), ls.slice()];
    bottomUp.forEach((src, i) => { na[1 + i] = args[src]; nk[1 + i] = ks[src]; nl[1 + i] = ls[src]; });
    apply(na, nk, nl, true);
  };
  // Dragging a row: it dims where it was and a line marks where it will land. A press that does not move is a click.
  const [drag, setDrag] = useState<{ a: number; slot: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const slotAt = (y: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('.li[data-movable]') ?? [])];
    const i = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    return i < 0 ? rows.length : i;
  };
  const startDrag = (e: React.PointerEvent, a: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const y0 = e.clientY; let live = false; dragged.current = false;
    const onMove = (m: PointerEvent) => {
      if (!live && Math.abs(m.clientY - y0) < 5) return;
      if (!live) { live = true; dragged.current = true; document.body.classList.add('dragging-layer'); }
      setDrag({ a, slot: slotAt(m.clientY) });
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('dragging-layer');
      if (live && u.type === 'pointerup') moveTo(a, slotAt(u.clientY));
      setDrag(null);
      if (live) setTimeout(() => { dragged.current = false; }, 0); // after the click the drop may fire, whichever row it lands on
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  };
  const move = (a: number, dir: 1 | -1) => { const b = a + dir; if (b < 1 || b > top) return; const { args, ks, ls } = lined(); [args[a], args[b]] = [args[b], args[a]]; [ks[a], ks[b]] = [ks[b], ks[a]]; [ls[a], ls[b]] = [ls[b], ls[a]]; apply(args, ks, ls, true); };
  const remove = (a: number) => { const { args, ks, ls } = lined(); args.splice(a, 1); const [k] = ks.splice(a, 1); ls.splice(a, 1); setHidden((h) => { const n = new Set(h); n.delete(k); return n; }); setSel(null); apply(args, ks, ls, true); };
  const insert = (n: Node, label: string | null = null, at = top + 1) => { const { args, ks, ls } = lined(); const k = freshKey(); args.splice(at, 0, n); ks.splice(at, 0, k); ls.splice(at, 0, label); setSel(k); apply(args, ks, ls, true); };
  const toggleHidden = (a: number) => setHidden((h) => { const n = new Set(h); const k = keys.current[a]; if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const closeAdd = () => { setAdding(false); setFilter(''); };
  const groups = useMemo(() => layerPickList(filter), [filter]);
  const recipes = useMemo(() => { const q = filter.trim().toLowerCase(); return RECIPES.filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q)); }, [filter]);

  if (!isLayers) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <NodeCard node={tree} kind="COLOR" label="Style" depth={0} onChange={(t) => onChange(t, labels)} />
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ name: 'Layers', args: [tree] }, [], true)}><span className="b"><span className="i"><Icon name="plus" />Put it under Layers, so effects can go on top</span></span></button>
      </div>
    );
  }

  const row = (a: number, pinned: boolean) => {
    const n = tree.args[a]; const card = cards[a]; const cue = a === 0 ? null : layerCue(n, card);
    const hex = firstColour(n); const off = hidden.has(keys.current[a]);
    const pick = () => { if (dragged.current) return; setSel(keys.current[a]); closeAdd(); };
    const shownAt = stack.findIndex((s) => s.a === a);
    const dropCls = drag && !pinned && drag.a !== a ? (drag.slot === shownAt ? 'drop-before' : drag.slot === stack.length && shownAt === stack.length - 1 ? 'drop-after' : '') : '';
    return (
      <div key={keys.current[a]} className={`li ${!adding && current === a ? 'on' : ''} ${off ? 'muted' : ''} ${pinned ? 'pinned' : ''} ${drag?.a === a ? 'lifted' : ''} ${dropCls}`} role="button" tabIndex={0} aria-current={!adding && current === a}
        title={`${labelAt(a) || (a === 0 ? 'Blade' : defaultName(n, card))}${pinned ? '' : '. Drag to move it, or Alt+Up / Alt+Down.'}`} data-movable={pinned ? undefined : ''}
        onPointerDown={pinned ? undefined : (e) => startDrag(e, a)} onClick={pick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
          else if (!pinned && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(a, e.key === 'ArrowUp' ? 1 : -1); }
        }}>
        {pinned ? <span className="iconbtn pinlock" style={{ width: 14 }} title="Stays at the bottom of the stack"><Icon name="lock" /></span> : <Icon name="grip" className="grip" />}
        {a === onOff ? <span className="onoff"><Icon name="power" /></span> : <span className="sq" style={{ background: hex ?? 'transparent', borderStyle: hex ? 'solid' : 'dashed', boxShadow: hex ? `0 0 6px ${hex}` : 'none' }} />}
        <span className="nm ellip">{labelAt(a) || (a === 0 ? 'Blade' : defaultName(n, card))}</span>
        {!pinned && <span className="when">{tagFor(card, cue)}</span>}
        {!pinned && <button type="button" className="iconbtn" aria-label={off ? 'Show this layer in the preview' : 'Hide this layer in the preview'} title={off ? 'Hidden in the preview' : 'Hide in the preview'} onClick={(e) => { e.stopPropagation(); toggleHidden(a); }}><Icon name={off ? 'eyeOff' : 'eye'} /></button>}
      </div>
    );
  };

  const n = tree.args[current]; const card = cards[current];
  const isBase = current === 0; const pinned = isBase || current === onOff;
  const cue = isBase ? null : layerCue(n, card);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="layerswrap"><div className="layers">
        <div className="stackcol">
          <div className="row between" style={{ padding: '2px 2px 8px' }}>
            <span className="small" style={{ fontWeight: 600 }}>Layers</span>
            <button type="button" className={`btn sm ${adding ? 'pri' : ''}`} onClick={() => setAdding(true)}><span className="b"><span className="i"><Icon name="plus" />Add</span></span></button>
          </div>
          <span className="hint stackhint">Top paints over the ones below.</span>
          <div className="list stack" ref={listRef}>
            {stack.map(({ a }) => row(a, false))}
            {!stack.length && <span className="hint" style={{ padding: '8px 10px' }}>No layers yet. Add one to paint an effect over the blade.</span>}
            <div className="sep">Underneath everything</div>
            {row(0, true)}
            {onOff > 0 && row(onOff, true)}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {adding ? (
            <div className="col" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="small nowrap" style={{ fontWeight: 600 }}>Add a layer on top</span>
                <span className="input sans grow" style={{ height: 30, maxWidth: 340 }}><input type="text" autoFocus placeholder="Search every ProffieOS template" value={filter} aria-label="Search templates" onChange={(e) => setFilter(e.target.value)} /></span>
                <span style={{ flex: 1 }} />
                <button type="button" className="chip" aria-label="Close" onClick={closeAdd}><Icon name="x" /></button>
              </div>
              {recipes.length > 0 && (
                <div className="col" style={{ gap: 6 }}>
                  <span className="small dim" style={{ fontWeight: 600 }}>Start from</span>
                  <div className="pickgrid">
                    {recipes.map((r) => (
                      <button key={r.name} type="button" className="opt" style={{ flex: 'none' }} onClick={() => { insert(parseStyle(r.code)); closeAdd(); }}>
                        <span className="col" style={{ gap: 2, minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</b><span className="hint">{r.description}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.group} className="col" style={{ gap: 6 }}>
                  {g.group && <span className="small dim" style={{ fontWeight: 600 }}>{g.group}</span>}
                  <div className="pickgrid">
                    {g.entries.map((e) => (
                      <button key={e.name} type="button" className="opt" style={{ flex: 'none' }} title={e.doc || undefined} onClick={() => { insert(newLayer(e.name)); closeAdd(); }}>
                        <span className="col" style={{ gap: 2, minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{friendly(e.name)}</b><span className="hint ellip" style={{ display: 'block' }}>{describe(e) || ' '}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!recipes.length && !groups.some((g) => g.entries.length) && <span className="hint">Nothing matches.</span>}
            </div>
          ) : n ? (
            <LayerCardView key={keys.current[current]} layer={n} card={card} base={isBase} pinned={pinned}
              name={labelAt(current)} defaultName={isBase ? 'Blade' : defaultName(n, card)} onName={(v) => setLabel(current, v)}
              onChange={(m) => setLayer(current, m)} cue={cue} onCue={onCue}
              hidden={hidden.has(keys.current[current])} onHidden={pinned ? undefined : () => toggleHidden(current)}
              onRemove={pinned ? undefined : () => remove(current)} onDuplicate={pinned ? undefined : () => insert(cloneNode(n), labelAt(current) ? `${labelAt(current)} copy` : null, current + 1)}
              onMove={pinned ? undefined : (dir) => move(current, dir)} canUp={current < top} canDown={current > 1} />
          ) : null}
        </div>
      </div></div>
    </div>
  );
}

/** Paste box: any style expression from the official editor or a library, parsed into a tree. It keeps the header comment and says who made it (ST16). */
export function PasteStyle({ onParsed, onClose }: { onParsed: (t: Node, origin: StyleOrigin) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Credited to nobody until the owner says who made it, or that nobody knows.
  const [by, setBy] = useState('');
  const [unknown, setUnknown] = useState(false);
  const author = pastedAuthor(by, unknown);
  const go = () => { if (author === null) return; try { onParsed(parseStyle(text), { by: author, header: analyzeStyleCode(text).header }); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="col" style={{ gap: 8, padding: 12, border: '1px solid var(--holo)', background: 'var(--bar)' }}>
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Paste a style</span><button type="button" className="chip" onClick={onClose}><Icon name="x" /></button></div>
      <textarea className="console mono" value={text} rows={6} spellCheck={false} aria-label="Style code" placeholder="StylePtr<Layers<Red, ResponsiveClashL<White>, InOutTrL<TrWipe<300>, TrWipeIn<500>>>>()" style={{ resize: 'vertical', fontSize: 12 }} onChange={(e) => { setText(e.target.value); setErr(null); }} />
      {err && <div className="note red"><Icon name="warn" /><span>{err}</span></div>}
      <div className="row wrap" style={{ gap: 12 }}>
        <label className="field" style={{ width: 200 }}><span className="label">Made by</span><span className="input sans"><input type="text" value={unknown ? '' : by} disabled={unknown} placeholder="Who made it" aria-label="Style author" onChange={(e) => setBy(e.target.value)} /></span></label>
        <label className="row" style={{ gap: 6, alignSelf: 'end', height: 32 }}><input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} /><span className="small">Author unknown</span></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm pri" disabled={!text.trim() || author === null} title={author === null ? 'Say who made it, or that the author is unknown' : undefined} onClick={go}><span className="b"><span className="i"><Icon name="import" />Open it in the editor</span></span></button>
        <span className="hint">Anything from the official style editor or a style library works. The comment header and the author stay with it when you save, and it is saved as theirs, edited by you.</span>
      </div>
    </div>
  );
}
