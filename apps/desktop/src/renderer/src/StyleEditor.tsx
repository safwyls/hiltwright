// The style editor: build a look and watch it on the blade, then save it as a look.
//
// Two ways in. "Simple" is a stack of plain-language blocks (core/styleBuilder.ts) for people who want a colour and a
// few effects. "Full" is the tree editor (TreeEditor.tsx): every ProffieOS template, nested however Layers<> allows,
// with the same reach as the official style editor. A simple look can be opened as a tree at any time; the C++ that
// gets compiled is the same kind of alias either way.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BASES, EFFECTS, TRANSITIONS, aliasFor, defaultStyle, defaultTree, evaluateStyle, isStyleDoc, isTreeDoc, newBlock, printStyle, registerStyleSim, styleToCpp, styleToLook, styleToSim, treeFromCpp, treeToCpp, treeToLook, treeToSim, type Block, type BlockDef, type Knob, type LookDef, type Node, type StyleDoc, type TreeDoc } from '@hiltwright/core';
import { BladePreview } from './BladePreview';
import { Icon } from './Icon';
import { PasteStyle, TreeEditor } from './TreeEditor';

const api = () => window.hiltwright;
const PREVIEW_ID = 'style_editor_preview';

export function StyleEditor({ editing, onSaved, onDemo }: { editing: LookDef | null; onSaved: (look: LookDef) => void; onDemo: (lookId: string) => void }) {
  const [doc, setDoc] = useState<StyleDoc>(() => (editing && isStyleDoc(editing.style) ? structuredClone(editing.style) : defaultStyle()));
  const [tree, setTree] = useState<TreeDoc>(() => (editing && isTreeDoc(editing.style) ? structuredClone(editing.style) : defaultTree()));
  const [mode, setMode] = useState<'simple' | 'tree'>(editing && isTreeDoc(editing.style) ? 'tree' : 'simple');
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  // Once saved, further saves update the same look rather than making another.
  const [editingId, setEditingId] = useState<string | null>(editing && (isStyleDoc(editing.style) || isTreeDoc(editing.style)) ? editing.id : null);

  // The preview runs the current document through the simulator. Re-registered on every change; the preview restarts.
  const evaluated = useMemo(() => (mode === 'tree' ? evaluateStyle(tree.tree) : null), [mode, tree]);
  const docKey = useMemo(() => (mode === 'tree' ? JSON.stringify(tree) : JSON.stringify(doc)), [mode, tree, doc]);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    registerStyleSim(PREVIEW_ID, mode === 'tree' ? evaluated!.make : styleToSim(doc));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setPreviewKey((k) => k + 1), 120); // a slider drag restarts it once, not per step
    return () => { if (settle.current) clearTimeout(settle.current); };
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (d: StyleDoc) => void) => setDoc((d) => { const next = structuredClone(d); fn(next); return next; });
  const name = mode === 'tree' ? tree.name : doc.name;
  const setName = (v: string) => (mode === 'tree' ? setTree((t) => ({ ...t, name: v })) : update((d) => { d.name = v; }));
  const cpp = useMemo(() => (mode === 'tree' ? treeToCpp(tree, 'HwYourLook') : styleToCpp(doc, 'HwYourLook')), [mode, tree, doc]);

  const openAsTree = () => { setTree(treeFromCpp(styleToCpp(doc, 'X'), doc.name)); setMode('tree'); };
  const openParsed = (t: Node) => { setTree((cur) => ({ ...cur, tree: t })); setMode('tree'); setPasting(false); };

  const save = async () => {
    const id = editingId ?? `look_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'built'}_${Date.now().toString(36)}`;
    const look = mode === 'tree' ? treeToLook(tree, id, aliasFor(id)) : styleToLook(doc, id);
    registerStyleSim(id, mode === 'tree' ? treeToSim(tree) : styleToSim(doc));
    if (editingId) await api().looks.update(id, look); else await api().looks.add(look);
    setSaved(id); setEditingId(id);
    onSaved(look);
  };

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 440px' }}>
      <section className="panel fill" aria-label="Layers">
        <div className="ph">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <span className="input sans" style={{ height: 32, width: 220 }}><input type="text" value={name} aria-label="Look name" onChange={(e) => setName(e.target.value)} /></span>
            <div className="seg" role="tablist" aria-label="Editor mode" style={{ height: 32, flex: 'none', flexWrap: 'nowrap' }}>
              <button type="button" role="tab" aria-selected={mode === 'simple'} className={mode === 'simple' ? 'on' : ''} style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => setMode('simple')}>Simple</button>
              <button type="button" role="tab" aria-selected={mode === 'tree'} className={mode === 'tree' ? 'on' : ''} style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => setMode('tree')}>Full</button>
            </div>
            <span className="hint nowrap">{editingId ? 'Editing a saved look' : 'A new look'}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="chip" onClick={() => setPasting((p) => !p)}><Icon name="import" />Paste a style</button>
            <button type="button" className="chip" onClick={() => setShowCode((s) => !s)}>{showCode ? 'Hide the code' : 'Show the code'}</button>
            <button type="button" className="btn sm pri" disabled={!name.trim()} onClick={() => void save()}><span className="b"><span className="i"><Icon name="check" />{editingId ? 'Save changes' : 'Save as a look'}</span></span></button>
          </div>
        </div>
        <div className="pb col scroll" style={{ gap: 14 }}>
          {saved && <div className="note green"><Icon name="check" /><span>Saved. It is in your Looks now: add it to a preset there, and its live colours can be changed once installed. <button type="button" className="holo" onClick={() => onDemo(saved)}>Swing it in the demo room</button>.</span></div>}
          {pasting && <PasteStyle onParsed={openParsed} onClose={() => setPasting(false)} />}

          {mode === 'tree' ? (
            <TreeEditor tree={tree.tree} unsupported={evaluated?.report.unsupported ?? []} approximate={evaluated?.report.approximate ?? []} onChange={(t) => setTree((cur) => ({ ...cur, tree: t }))} />
          ) : (
            <>
              <div className="note"><Icon name="info" /><span>The simple editor covers a colour, a handful of effects and the ignition. For everything ProffieOS can do, <button type="button" className="holo" onClick={openAsTree}>open this look in the full editor</button>: every template, nested any way you like.</span></div>
              <BlockCard title="Blade" hint="What the blade does on its own" def={BASES.find((b) => b.kind === doc.base.kind) ?? BASES[0]} block={doc.base} choices={BASES}
                onKind={(k) => update((d) => { d.base = newBlock(BASES.find((b) => b.kind === k)!); })} onParam={(key, v) => update((d) => { d.base.params[key] = v; })} />

              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Effects, bottom to top</span><span className="hint">Later layers paint over earlier ones.</span></div>
                {doc.effects.map((b, i) => {
                  const def = EFFECTS.find((e) => e.kind === b.kind) ?? EFFECTS[0];
                  return (
                    <BlockCard key={`${b.kind}-${i}`} title={def.name} hint={def.description} def={def} block={b} index={i}
                      onParam={(key, v) => update((d) => { d.effects[i].params[key] = v; })}
                      onMove={(dir) => update((d) => { const j = i + dir; if (j < 0 || j >= d.effects.length) return; [d.effects[i], d.effects[j]] = [d.effects[j], d.effects[i]]; })}
                      onRemove={() => update((d) => { d.effects.splice(i, 1); })} canUp={i > 0} canDown={i < doc.effects.length - 1} />
                  );
                })}
                {adding ? (
                  <div className="col" style={{ gap: 6, padding: 12, border: '1px solid var(--holo)', background: '#0d131a' }}>
                    <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Add an effect</span><button type="button" className="chip" onClick={() => setAdding(false)}><Icon name="x" /></button></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                      {EFFECTS.map((e) => (
                        <button key={e.kind} type="button" className="opt" style={{ flex: 'none' }} onClick={() => { update((d) => { d.effects.push(newBlock(e)); }); setAdding(false); }}>
                          <span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</b><span className="hint">{e.description}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><span className="b"><span className="i"><Icon name="plus" />Add an effect</span></span></button>}
              </div>

              <div className="grid2" style={{ gap: 10 }}>
                <BlockCard title="Ignition" hint="How the blade comes on" def={TRANSITIONS.find((t) => t.kind === doc.ignition.kind) ?? TRANSITIONS[0]} block={doc.ignition} choices={TRANSITIONS}
                  onKind={(k) => update((d) => { d.ignition = newBlock(TRANSITIONS.find((t) => t.kind === k)!); })} onParam={(key, v) => update((d) => { d.ignition.params[key] = v; })} />
                <BlockCard title="Retraction" hint="How it goes out" def={TRANSITIONS.find((t) => t.kind === doc.retraction.kind) ?? TRANSITIONS[0]} block={doc.retraction} choices={TRANSITIONS}
                  onKind={(k) => update((d) => { d.retraction = newBlock(TRANSITIONS.find((t) => t.kind === k)!); })} onParam={(key, v) => update((d) => { d.retraction.params[key] = v; })} />
              </div>
              <span className="hint">Ignition and retraction times are live settings on the saber (300 and 500 ms unless you change them on Presets), so they are not set here.</span>
            </>
          )}

          {showCode && (
            <div className="col" style={{ gap: 6 }}>
              <div className="row between"><span className="small" style={{ fontWeight: 600 }}>The C++ this compiles to</span><button type="button" className="chip" onClick={() => void navigator.clipboard.writeText(mode === 'tree' ? printStyle(tree.tree) : cpp)}><Icon name="copy" />Copy the style</button></div>
              <pre className="console" style={{ margin: 0, fontSize: 11, maxHeight: 320 }}>{cpp}</pre>
            </div>
          )}
        </div>
      </section>

      <section className="panel fill" aria-label="Preview">
        <div className="ph"><h2>On the blade</h2><span className="hint">Simulated from the same maths the saber runs</span></div>
        <div className="pb col scroll" style={{ gap: 12 }}>
          <BladePreview key={previewKey} lookId={PREVIEW_ID} hilt controls />
          <span className="hint">{mode === 'tree' ? 'Colours wrapped in a live setting (RgbArg) can be changed on Presets once installed; everything else is baked in when the look is built.' : 'Every colour here is a live setting once the look is on a saber: change it on Presets without a rebuild. The sliders are baked into the look when it is built.'}</span>
        </div>
      </section>
    </div>
  );
}

function BlockCard({ title, hint, def, block, choices, index, onKind, onParam, onMove, onRemove, canUp, canDown }: {
  title: string; hint: string; def: BlockDef; block: Block; choices?: BlockDef[]; index?: number;
  onKind?: (kind: string) => void; onParam: (key: string, v: number | string) => void; onMove?: (dir: -1 | 1) => void; onRemove?: () => void; canUp?: boolean; canDown?: boolean;
}) {
  return (
    <div className="bcard col" style={{ gap: 10, padding: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        {index != null && <span className="nbox">{index + 1}</span>}
        <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
          {choices ? (
            <span className="input sans" style={{ height: 32, width: 260 }}><span className="ellip"><b style={{ fontWeight: 600 }}>{title}:</b> {def.name}</span><span className="caret"><Icon name="down" /></span>
              <select value={block.kind} aria-label={title} onChange={(e) => onKind?.(e.target.value)}>{choices.map((c) => <option key={c.kind} value={c.kind}>{c.name}</option>)}</select></span>
          ) : <b style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</b>}
          <span className="hint">{choices ? def.description : hint}</span>
        </div>
        {onMove && <button type="button" className="chip" disabled={!canUp} aria-label="Move down the stack" onClick={() => onMove(-1)}><Icon name="up" /></button>}
        {onMove && <button type="button" className="chip" disabled={!canDown} aria-label="Move up the stack" onClick={() => onMove(1)}><Icon name="down" /></button>}
        {onRemove && <button type="button" className="chip" aria-label={`Remove ${title}`} onClick={onRemove}><Icon name="trash" /></button>}
      </div>
      {def.knobs.length > 0 && (
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          {def.knobs.map((k) => <KnobControl key={k.key} knob={k} value={block.params[k.key] ?? def.defaults[k.key]} onChange={(v) => onParam(k.key, v)} />)}
        </div>
      )}
    </div>
  );
}

function KnobControl({ knob, value, onChange }: { knob: Knob; value: number | string; onChange: (v: number | string) => void }) {
  if (knob.kind === 'color') {
    const shown = String(value);
    return (
      <label className="swatch" style={{ width: 'auto', height: 30, padding: '0 10px 0 8px', gap: 8 }} title={knob.hint ?? knob.label}>
        <span className="sq" style={{ width: 14, height: 14, background: shown, boxShadow: `0 0 8px ${shown}` }} />
        <span className="small nowrap">{knob.label}</span>
        <input type="color" value={shown} aria-label={knob.label} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (knob.kind === 'choice') {
    return (
      <label className="row" style={{ gap: 6 }} title={knob.hint}>
        <span className="small dim">{knob.label}</span>
        <span className="input sans" style={{ height: 28, width: 150 }}><span className="ellip">{knob.options.find((o) => o.value === value)?.label}</span><span className="caret"><Icon name="down" /></span>
          <select value={String(value)} aria-label={knob.label} onChange={(e) => onChange(e.target.value)}>{knob.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></span>
      </label>
    );
  }
  return (
    <label className="row" style={{ gap: 8, minWidth: 220 }} title={knob.hint}>
      <span className="small dim nowrap" style={{ width: 84 }}>{knob.label}</span>
      <input type="range" min={knob.min} max={knob.max} step={knob.step} value={Number(value)} aria-label={knob.label} style={{ flex: 1, minWidth: 80 }} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono mute nowrap" style={{ fontSize: 11, minWidth: 56, textAlign: 'right' }}>{value}{knob.unit ?? ''}</span>
    </label>
  );
}
