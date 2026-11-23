// The style editor: build a look and watch it on the blade, then save it as a look.
//
// Two ways in. "Simple" is a stack of plain-language blocks (core/styleBuilder.ts) for people who want a colour and a
// few effects. "Full" is the tree editor (TreeEditor.tsx): every ProffieOS template, nested however Layers<> allows,
// with the same reach as the official style editor. A simple look can be opened as a tree at any time; the C++ that
// gets compiled is the same kind of alias either way.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BASES, EFFECTS, TRANSITIONS, aliasFor, checkStyle, defaultStyle, defaultTree, evaluateStyle, isStyleDoc, isTreeDoc, newBlock, printStyle, registerStyleSim, sharedSettings, styleToCpp, styleToLook, withOrigin, styleToSim, treeFromCpp, treeToCpp, treeToLook, treeToSim, type Block, type BlockDef, type Cue, type Knob, type LookDef, type Node, type StyleDoc, type StyleOrigin, type StyleProblem, type TreeDoc } from '@hiltwright/core';
import { BladePreview } from './BladePreview';
import { useHistory } from './editorHistory';
import { Icon } from './Icon';
import { Loader } from './Loader';
import { PreviewNote } from './PreviewNote';
import { PasteStyle, TreeEditor } from './TreeEditor';
import { Select } from './Select';
import { saveTarget, type EditorMode } from './styleSave';

const api = () => window.hiltwright;

/** What undo and redo move between: both editors' documents, and which editor is showing. */
interface Draft { doc: StyleDoc; tree: TreeDoc; mode: 'simple' | 'tree'; /** The full editor's layer keys, not saved. */ keys?: string[] }
const PREVIEW_ID = 'style_editor_preview';

export function StyleEditor({ editing, onSaved, onDemo, onLeaveGuard, inBrowser }: { editing: LookDef | null; onSaved: (look: LookDef) => void; onDemo: (lookId: string) => void; onLeaveGuard?: (guard: ((proceed: () => void) => void) | null) => void; /** The workshop on the website: saved styles last the visit. */ inBrowser?: boolean }) {
  // The whole document, both editors' halves of it and which one is showing, under undo and redo (editorHistory.ts).
  const history = useHistory<Draft>(() => ({
    doc: editing && isStyleDoc(editing.style) ? structuredClone(editing.style) : defaultStyle(),
    tree: editing && isTreeDoc(editing.style) ? structuredClone(editing.style) : defaultTree(),
    mode: editing && isTreeDoc(editing.style) ? 'tree' : 'simple',
  }), !!editing && (isStyleDoc(editing.style) || isTreeDoc(editing.style)));
  const { doc, tree, mode } = history.present;
  const setTree = (fn: (t: TreeDoc) => TreeDoc, step = false, keys?: string[]) => history.edit((s) => ({ ...s, tree: fn(s.tree), keys: keys ?? s.keys }), step);
  const setMode = (m: Draft['mode']) => history.view((s) => (s.mode === m ? s : { ...s, mode: m }));
  // Once saved, further saves update the same look rather than making another.
  const [editingId, setEditingId] = useState<string | null>(editing && (isStyleDoc(editing.style) || isTreeDoc(editing.style)) ? editing.id : null);
  // What Save writes is the half the owner changed, not whichever tab is showing (styleSave.ts).
  const start = useRef(history.present);
  const [savedMode, setSavedMode] = useState<EditorMode>(editing && isTreeDoc(editing.style) ? 'tree' : 'simple');
  const since = history.saved ?? start.current;
  const docChanged = since.doc !== doc;
  const treeChanged = since.tree !== tree;
  const target = saveTarget({ showing: mode, docChanged, treeChanged, originalMode: savedMode, isNew: !editingId });
  const dirty = target.dirty;
  // Worth a warning on the way out: what Save would write, or, for a style never saved, any change at all.
  const unsaved = editingId ? dirty : docChanged || treeChanged;
  const [leaving, setLeaving] = useState<{ proceed: () => void; error?: string } | null>(null);
  const unsavedRef = useRef(unsaved); unsavedRef.current = unsaved;
  useEffect(() => {
    onLeaveGuard?.((proceed) => { if (unsavedRef.current) setLeaving({ proceed }); else proceed(); });
    // Closing or reloading the window: main asks the owner (will-prevent-unload) when this says there is work to lose.
    const onUnload = (e: BeforeUnloadEvent) => { if (unsavedRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => { onLeaveGuard?.(null); window.removeEventListener('beforeunload', onUnload); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState<{ id: string; sabers: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // What the check before saving found wrong with a full-editor style, by layer (ST33). Cleared by the next edit.
  // Where the style started, so saving keeps its author and header (ST16): from the style being edited, or from a paste
  // here (which applies to the full editor's half only).
  const [origin, setOrigin] = useState<{ o: StyleOrigin; pasted: boolean } | null>(() => (editing && (isStyleDoc(editing.style) || isTreeDoc(editing.style)) ? { o: { by: editing.by, header: editing.header, editedBy: editing.editedBy }, pasted: false } : null));
  const [problems, setProblems] = useState<StyleProblem[] | null>(null);
  useEffect(() => { setProblems(null); }, [tree]);
  // Colours of a Simple style that share one live setting on the saber (ST32).
  const shared = useMemo(() => sharedSettings(doc), [doc]);
  // A new style's id is made once, so a second press can never make a second style.
  const newId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  // The full editor can hide layers from the preview while you work, and ask it to show a layer off.
  const [previewTree, setPreviewTree] = useState<Node | null>(null);
  const [cue, setCue] = useState<(Cue & { n: number; at: number }) | null>(null);
  // The preview runs the current document through the simulator. Re-registered on every change; the preview restarts.
  const evaluated = useMemo(() => (mode === 'tree' ? evaluateStyle(previewTree ?? tree.tree) : null), [mode, tree, previewTree]);
  const docKey = useMemo(() => (mode === 'tree' ? JSON.stringify(previewTree ?? tree.tree) : JSON.stringify(doc)), [mode, tree, doc, previewTree]);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    registerStyleSim(PREVIEW_ID, mode === 'tree' ? evaluated!.make : styleToSim(doc));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setPreviewKey((k) => k + 1), 120); // a slider drag restarts it once, not per step
    return () => { if (settle.current) clearTimeout(settle.current); };
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (d: StyleDoc) => void, step = false) => history.edit((s) => { const next = structuredClone(s.doc); fn(next); return { ...s, doc: next }; }, step);
  const name = mode === 'tree' ? tree.name : doc.name;
  const setName = (v: string) => (mode === 'tree' ? setTree((t) => ({ ...t, name: v })) : update((d) => { d.name = v; }));
  // Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) anywhere on the page. A text box keeps its own undo for what is typed in it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|number|)$/.test((t as HTMLInputElement).type)))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); history.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.undo, history.redo]); // eslint-disable-line react-hooks/exhaustive-deps

  const cpp = useMemo(() => (mode === 'tree' ? treeToCpp(tree, 'HwYourLook') : styleToCpp(doc, 'HwYourLook')), [mode, tree, doc]);

  const openAsTree = () => history.edit((s) => ({ ...s, tree: treeFromCpp(styleToCpp(s.doc, 'X'), s.doc.name), mode: 'tree', keys: undefined }), true);
  const openParsed = (t: Node, from: StyleOrigin) => { history.edit((s) => ({ ...s, tree: { ...s.tree, tree: t, labels: [] }, mode: 'tree', keys: undefined }), true); setOrigin({ o: from, pasted: true }); setPasting(false); };

  /** Save what the owner changed (see `target`). One at a time; a failure is shown and rethrown for the leave dialog. */
  const save = async (anyway = false) => {
    if (savingRef.current) return;
    // A style that does not check out is not saved quietly: the owner is shown what is wrong, and can still save it.
    if (target.write === 'tree' && !anyway) {
      const found = checkStyle(tree.tree, tree.labels ?? []);
      if (found.length) { setProblems(found); throw new Error(`The style has ${found.length === 1 ? 'a problem' : `${found.length} problems`}; see the note in the editor.`); }
    }
    setProblems(null);
    savingRef.current = true; setSaving(true); setSaveError(null);
    try {
      const write = target.write;
      const title = write === 'tree' ? tree.name : doc.name;
      newId.current ??= `look_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'built'}_${Date.now().toString(36)}`;
      const id = editingId ?? newId.current;
      const built = write === 'tree' ? treeToLook(tree, id, aliasFor(id)) : styleToLook(doc, id);
      // The author set on Styles stays, and a pasted style keeps its author and header, edited by the owner; a new style is the owner's own.
      const look: LookDef = withOrigin(built, origin && (!origin.pasted || write === 'tree') ? origin.o : null);
      registerStyleSim(id, write === 'tree' ? treeToSim(tree) : styleToSim(doc));
      const sabers = editingId ? (await api().looks.update(id, look)).sabersUpdated : ((await api().looks.add(look)), 0);
      setSaved({ id, sabers }); setEditingId(id); setSavedMode(write); history.markSaved();
      onSaved(look);
    } catch (err) {
      setSaveError(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, ''));
      throw err;
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };

  return (
    <div className="work editorwork">
      <section className="panel fill" aria-label="Layers" data-tour="editor-layers">
        <div className="ph edhead">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <span className="input sans" style={{ height: 32, width: 220, minWidth: 120, flexShrink: 1 }}><input type="text" value={name} aria-label="Style name" onChange={(e) => setName(e.target.value)} /></span>
            <div className="seg" role="tablist" aria-label="Editor mode" style={{ height: 32, flex: 'none', flexWrap: 'nowrap' }} data-tour="editor-mode">
              <button type="button" role="tab" aria-selected={mode === 'simple'} className={mode === 'simple' ? 'on' : ''} style={{ height: 30, padding: '0 12px', fontSize: 12 }} data-tour="editor-simple" onClick={() => setMode('simple')}>Simple</button>
              <button type="button" role="tab" aria-selected={mode === 'tree'} className={mode === 'tree' ? 'on' : ''} style={{ height: 30, padding: '0 12px', fontSize: 12 }} data-tour="editor-full" onClick={() => setMode('tree')}>Full</button>
            </div>
            <span className={`hint nowrap edstatus ${dirty ? 'dirty' : ''}`} title={dirty ? 'Changes not saved yet' : 'Everything is saved'}><i /><span className="edhint">{dirty ? (editingId ? 'Unsaved changes' : 'Not saved yet') : 'Saved'}</span></span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="chip" disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={history.undo}><Icon name="undo" /></button>
            <button type="button" className="chip" disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Y or Ctrl+Shift+Z)" onClick={history.redo}><Icon name="redo" /></button>
            <button type="button" className="chip" aria-label="Paste a style" title="Paste a style" onClick={() => setPasting((p) => !p)}><Icon name="import" /><span className="chiptext">Paste a style</span></button>
            <button type="button" className="chip" aria-label={showCode ? 'Hide the code' : 'Show the code'} title={showCode ? 'Hide the code' : 'Show the code'} onClick={() => setShowCode((s) => !s)}><Icon name="code" /><span className="chiptext">{showCode ? 'Hide the code' : 'Show the code'}</span></button>
            <button type="button" className="btn sm pri" disabled={!name.trim() || saving} onClick={() => void save().catch(() => undefined)}><span className="b"><span className="i">{saving ? <Loader size="sm" /> : <Icon name="check" />}{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save as a style'}</span></span></button>
          </div>
        </div>
        <div className="pb col scroll" style={{ gap: 14 }}>
          {target.dropsOther && <div className="note amber"><Icon name="warn" /><span>Saving keeps the {mode === 'tree' ? 'Full' : 'Simple'} version. Your changes in {mode === 'tree' ? 'Simple' : 'Full'} are not kept.</span></div>}
          {problems && problems.length > 0 && (
            <div className="note red" role="alert"><Icon name="warn" /><span>
              <b>Not saved: this style has {problems.length === 1 ? 'a problem' : `${problems.length} problems`}.</b> The build would probably stop on {problems.length === 1 ? 'it' : 'them'}.
              <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>{problems.map((p, i) => <li key={i}><b>{p.where}:</b> {p.text}</li>)}</ul>
              Fix {problems.length === 1 ? 'it' : 'them'} and save again, or <button type="button" className="holo" onClick={() => void save(true).catch(() => undefined)}>save it as it is</button> if you know better.
            </span></div>
          )}
          {saveError && <div className="note red" role="alert"><Icon name="x" /><span>Could not save the style: {saveError}</span></div>}
          {saved && inBrowser && <div className="note green"><Icon name="check" /><span>Saved for this visit. The style is in Styles now, where <b>Save for the app</b> takes it into Hiltwright. <button type="button" className="holo" onClick={() => onDemo(saved.id)}>Swing it in the demo room</button>.</span></div>}
          {saved && !inBrowser && <div className="note green"><Icon name="check" /><span>Saved. The style is in your Styles now: add it to a preset there, and its live colours can be changed once installed.{saved.sabers > 0 ? ` ${saved.sabers === 1 ? "1 saber's plan now has" : `${saved.sabers} sabers' plans now have`} this version; it needs a build to reach the saber.` : ''} <button type="button" className="holo" onClick={() => onDemo(saved.id)}>Swing it in the demo room</button>.</span></div>}
          {pasting && <PasteStyle onParsed={openParsed} onClose={() => setPasting(false)} />}

          {mode === 'tree' ? (
            <TreeEditor tree={tree.tree} labels={tree.labels ?? []}
              layerKeys={history.present.keys} onChange={(t, labels, step, keys) => setTree((cur) => ({ ...cur, tree: t, labels }), step, keys)} onPreview={setPreviewTree} onCue={(c) => setCue((p) => ({ ...c, n: (p?.n ?? 0) + 1, at: Date.now() }))} />
          ) : (
            <>
              {shared.map((x) => <div key={x.arg} className="note amber"><Icon name="warn" /><span>{x.text}</span></div>)}
              <div className="note"><Icon name="info" /><span>The simple editor covers a colour, a handful of effects and the ignition. For everything ProffieOS can do, <button type="button" className="holo" onClick={openAsTree}>open this style in the full editor</button>: every template, nested any way you like.</span></div>
              <div className="col" style={{ gap: 8 }}>
                <div className="row between">
                  <span className="small" style={{ fontWeight: 600 }}>Effects — top paints over the ones below</span>
                  {!adding && <button type="button" className="btn sm" onClick={() => setAdding(true)}><span className="b"><span className="i"><Icon name="plus" />Add an effect</span></span></button>}
                </div>
                {adding && (
                  <div className="col" style={{ gap: 6, padding: 12, border: '1px solid var(--holo)', background: 'var(--bar)' }}>
                    <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Add an effect on top</span><button type="button" className="chip" onClick={() => setAdding(false)}><Icon name="x" /></button></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                      {EFFECTS.map((e) => (
                        <button key={e.kind} type="button" className="opt" style={{ flex: 'none' }} onClick={() => { update((d) => { d.effects.push(newBlock(e)); }, true); setAdding(false); }}>
                          <span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</b><span className="hint">{e.description}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Shown top first: the last effect paints over the rest, as in an image editor's layer list. */}
                {doc.effects.map((b, i) => ({ b, i })).reverse().map(({ b, i }, shown) => {
                  const def = EFFECTS.find((e) => e.kind === b.kind) ?? EFFECTS[0];
                  return (
                    <BlockCard key={`${b.kind}-${i}`} title={def.name} hint={def.description} def={def} block={b} index={shown}
                      onParam={(key, v) => update((d) => { d.effects[i].params[key] = v; })}
                      onMove={(dir) => update((d) => { const j = i - dir; if (j < 0 || j >= d.effects.length) return; [d.effects[i], d.effects[j]] = [d.effects[j], d.effects[i]]; }, true)}
                      onRemove={() => update((d) => { d.effects.splice(i, 1); }, true)} canUp={i < doc.effects.length - 1} canDown={i > 0} />
                  );
                })}
              </div>
              <BlockCard title="Blade" hint="What the blade does on its own, underneath every effect" def={BASES.find((b) => b.kind === doc.base.kind) ?? BASES[0]} block={doc.base} choices={BASES}
                onKind={(k) => update((d) => { d.base = newBlock(BASES.find((b) => b.kind === k)!); }, true)} onParam={(key, v) => update((d) => { d.base.params[key] = v; })} />

              <div className="grid2" style={{ gap: 10 }}>
                <BlockCard title="Ignition" hint="How the blade comes on" def={TRANSITIONS.find((t) => t.kind === doc.ignition.kind) ?? TRANSITIONS[0]} block={doc.ignition} choices={TRANSITIONS}
                  onKind={(k) => update((d) => { d.ignition = newBlock(TRANSITIONS.find((t) => t.kind === k)!); }, true)} onParam={(key, v) => update((d) => { d.ignition.params[key] = v; })} />
                <BlockCard title="Retraction" hint="How it goes out" def={TRANSITIONS.find((t) => t.kind === doc.retraction.kind) ?? TRANSITIONS[0]} block={doc.retraction} choices={TRANSITIONS}
                  onKind={(k) => update((d) => { d.retraction = newBlock(TRANSITIONS.find((t) => t.kind === k)!); }, true)} onParam={(key, v) => update((d) => { d.retraction.params[key] = v; })} />
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

      <section className="panel fill" aria-label="Preview" data-tour="editor-preview">
        <div className="ph"><h2>On the blade</h2><span className="hint">Simulated from the same maths the saber runs</span></div>
        <div className="pb col scroll" style={{ gap: 12 }}>
          <BladePreview version={previewKey} lookId={PREVIEW_ID} hilt controls cue={cue} />
          <PreviewNote report={evaluated?.report ?? null} />
          <span className="hint">{mode === 'tree' ? 'Colours wrapped in a live setting (RgbArg) can be changed on Presets once installed; everything else is baked in when the style is built.' : 'Every colour here is a live setting once the style is on a saber: change it on Presets without a rebuild. The sliders are baked into the style when it is built.'}</span>
        </div>
      </section>
      {leaving && (
        <div className="dialog-back" role="presentation" onKeyDown={(e) => { if (e.key === 'Escape') setLeaving(null); }}>
          <section className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text" style={{ width: 'min(520px, 92vw)' }}>
            <div className="ph"><h2 id="leave-title">Save your style first?</h2></div>
            <div className="pb col" style={{ gap: 14 }}>
              <p id="leave-text" className="dim" style={{ fontSize: 13.5 }}>{name.trim() ? <>“{name.trim()}”</> : 'This style'} has changes that are not saved. Leave now and they are lost; undo cannot bring them back once you are off this page.</p>
              {leaving.error && <div className="note red"><Icon name="warn" /><span>Could not save: {leaving.error}</span></div>}
              {!name.trim() && <div className="note amber"><Icon name="warn" /><span>Give it a name to save it.</span></div>}
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="chip" onClick={() => setLeaving(null)}>Stay</button>
                <button type="button" className="btn sm danger" onClick={() => { const go = leaving.proceed; setLeaving(null); go(); }}><span className="b"><span className="i">Leave without saving</span></span></button>
                <button type="button" className="btn sm pri" autoFocus disabled={!name.trim()} onClick={() => { const go = leaving.proceed; void save().then(() => { setLeaving(null); go(); }, (err: unknown) => setLeaving({ proceed: go, error: String(err).replace(/^Error: /, '') })); }}><span className="b"><span className="i"><Icon name="check" />Save and leave</span></span></button>
              </div>
            </div>
          </section>
        </div>
      )}
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
            <span className="input sans" style={{ height: 32, width: 260, maxWidth: '100%' }}><span className="ellip"><b style={{ fontWeight: 600 }}>{title}:</b> {def.name}</span><span className="caret"><Icon name="down" /></span>
              <Select value={block.kind} aria-label={title} onChange={(e) => onKind?.(e.target.value)}>{choices.map((c) => <option key={c.kind} value={c.kind}>{c.name}</option>)}</Select></span>
          ) : <b style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</b>}
          <span className="hint">{choices ? def.description : hint}</span>
        </div>
        {onMove && <button type="button" className="chip" disabled={!canUp} aria-label="Move up the stack" onClick={() => onMove(-1)}><Icon name="up" /></button>}
        {onMove && <button type="button" className="chip" disabled={!canDown} aria-label="Move down the stack" onClick={() => onMove(1)}><Icon name="down" /></button>}
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
          <Select value={String(value)} aria-label={knob.label} onChange={(e) => onChange(e.target.value)}>{knob.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></span>
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
