// Looks: the compiled blade styles a saber can use. Starter looks ship with Hiltwright; pasted looks come from
// the Fett263 library (their headers are kept). A look is "compiled in" once an install put it in a preset slot,
// "queued" when it is in the build model but not yet installed, and "new" otherwise.

import { useEffect, useMemo, useState } from 'react';
import { LOOK_FX, STARTER_LOOKS, UNKNOWN_AUTHOR, analyzeStyleCode, layoutStyleCode, creditOf, creditWords, pastedAuthor, registerLookSim, argInfo, hexToColorWord, type BladeRole, type LookDef } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { Loader, LoadingSpace } from './Loader';
import { ContributorLogo, CreditCard, NOT_A_CONTRIBUTOR, useContributors } from './credits';
import { BladePreview, canSimulate } from './BladePreview';
import { installedLookIds, queuedLookIds } from './slotModel';
import { modelAfterPutIn, planPutIn, putInResult, putInWords } from './styleToSaber';
import { LookPreviewNote } from './PreviewNote';
import type { Workspace } from './workspace';
import { Select } from './Select';

const api = () => window.hiltwright;
const ROLE_LABEL: Record<BladeRole, string> = { main: 'main blade', side: 'side blade', crystal: 'crystal', accent: 'accent', motor: 'motor' };
/** Looks that read the saber's motion sensors: tilt from gravity, swing and twist from the gyro. */
const usesMotion = (l: LookDef) => /BladeAngle|TwistAngle|SwingSpeed|SwingAcceleration/.test(l.define ?? l.code);

type LookState = 'compiled' | 'queued' | 'new';

export function Looks({ ws, board, initialCreator, onPresets, onBuild, onDemo, onEdit, onNew }: { ws: Workspace; board: Board; initialCreator?: string | null; onPresets: () => void; onBuild: () => void; onDemo: (lookId: string) => void; onEdit: (look: LookDef) => void; onNew: () => void }) {
  // Looks go into the working saber's presets: written to it when it is plugged in and already carries the look,
  // otherwise queued in its model for the next build. Nothing plugged in is fine.
  const { saber, info, live, model } = ws;
  const connected = !!info && !!saber && !!model;
  const [pasted, setPasted] = useState<LookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string>(STARTER_LOOKS[0].id);
  // The style whose code is open in the right pane: picking another style closes it.
  const [codeOf, setCodeOf] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');
  const [onlyFirmware, setOnlyFirmware] = useState(false);
  const [roleFilter, setRoleFilter] = useState<BladeRole | null>(null);
  // Who made it, matched regardless of case; the owner's own styles (no author, or 'you') count as one creator, You, and
  // styles by nobody known as another, Unknown: never one under the other's name.
  const creatorKey = (by: string) => { const c = creditOf(by); return c.kind === 'own' ? '' : c.kind === 'unknown' ? '?unknown' : c.name.toLowerCase(); };
  const [creator, setCreator] = useState<string | null>(() => (initialCreator != null ? creatorKey(initialCreator) : null));
  const [onlyMotion, setOnlyMotion] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState('');
  const [lookName, setLookName] = useState('');
  // A paste is credited to nobody until the owner says who made it, or that nobody knows (ST13).
  const [lookBy, setLookBy] = useState('');
  const [authorUnknown, setAuthorUnknown] = useState(false);
  const author = pastedAuthor(lookBy, authorUnknown);
  const [targetPreset, setTargetPreset] = useState<number>(0);
  const [targetBlade, setTargetBlade] = useState<number>(1);
  const [note, setNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  // Colours and timings tried on the preview only. Nothing here reaches the saber: saved colours belong to a preset.
  const [tried, setTried] = useState<Record<number, string>>({});
  useEffect(() => { setTried({}); }, [selectedId]);

  // Until the owner's styles are read, the gallery is not shown: it would show the starters alone, then jump.
  const [pastedRead, setPastedRead] = useState(false);
  useEffect(() => { void api().looks.list().then((ls) => { for (const l of ls) registerLookSim(l); setPasted(ls); }).finally(() => setPastedRead(true)); }, []);
  useEffect(() => {
    if (!pasting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPasting(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pasting]);
  useEffect(() => { if (info?.currentPreset != null) setTargetPreset(info.currentPreset); }, [info?.currentPreset]);

  const looks = useMemo(() => [...STARTER_LOOKS, ...pasted], [pasted]);
  const queued = new Set(queuedLookIds(model ?? undefined, saber?.firmware));
  // On the saber only when the firmware holds this version: a style edited since the install is not.
  const compiled = installedLookIds(saber?.firmware, (id) => looks.find((l) => l.id === id));
  const stateOf = (id: string): LookState => (compiled.has(id) ? 'compiled' : queued.has(id) ? 'queued' : 'new');
  const creators = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const l of looks) { const k = creatorKey(l.by); const c = m.get(k) ?? { name: k === '' ? 'You' : k === '?unknown' ? 'Unknown' : l.by.trim(), count: 0 }; c.count++; m.set(k, c); }
    return [...m.entries()].sort(([a, x], [b, y]) => y.count - x.count || (a ? 0 : 1) - (b ? 0 : 1) || x.name.localeCompare(y.name));
  }, [looks]);
  const visible = looks.filter((l) => {
    if (creator !== null && creatorKey(l.by) !== creator) return false;
    if (q && !l.name.toLowerCase().includes(q.toLowerCase()) && !l.by.toLowerCase().includes(q.toLowerCase())) return false;
    if (onlyFirmware && stateOf(l.id) !== 'compiled') return false;
    if (roleFilter && !l.roles.includes(roleFilter)) return false;
    if (onlyMotion && !usesMotion(l)) return false;
    return true;
  });
  const sel = visible.find((l) => l.id === selectedId) ?? visible[0] ?? looks.find((l) => l.id === selectedId) ?? looks[0];
  const selState = stateOf(sel.id);
  const analysis = useMemo(() => (code.trim() ? analyzeStyleCode(code) : null), [code]);
  const bladesForLook = model ? model.blades.map((b, i) => ({ n: i + 1, role: b.role, fits: sel.roles.includes(b.role) })) : [];
  const fittingBlade = bladesForLook.find((b) => b.n === targetBlade) ?? bladesForLook.find((b) => b.fits) ?? bladesForLook[0];
  const isDot = (l: LookDef) => !l.roles.includes('main') && !l.roles.includes('side');

  const [pasteState, setPasteState] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const savePasted = async () => {
    if (!analysis?.ok || pasteState.saving || author === null) return;
    const id = `look_${(lookName || 'pasted').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'pasted'}_${Date.now().toString(36)}`;
    const roles: BladeRole[] = ['main', 'side'];
    const look: LookDef = { id, name: lookName.trim() || 'Pasted style', source: 'pasted', by: author, code: analysis.expression, header: analysis.header, roles, args: analysis.args, preview: analysis.preview, defaults: analysis.defaults, description: analysis.header ? analysis.header.split('\n').map((l) => l.replace(/^\/\/\s?|\/\*|\*\//g, '').trim()).filter(Boolean).slice(0, 3).join(' · ') : 'Pasted style code.' };
    setPasteState({ saving: true, error: null });
    try {
      registerLookSim(look);
      setPasted(await api().looks.add(look));
      setSelectedId(id);
      setPasting(false); setCode(''); setLookName(''); setLookBy(''); setAuthorUnknown(false);
      setPasteState({ saving: false, error: null });
    } catch (err) {
      setPasteState({ saving: false, error: String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '') });
    }
  };

  const people = useContributors();
  /** The author of one of the owner's own looks, typed in when it was pasted; fixed here if it was wrong. */
  // After a rename, the old name's logo and link can be carried to the new one (copied: others may still credit it).
  const [carry, setCarry] = useState<{ from: string; to: string } | null>(null);
  const setAuthor = async (look: LookDef, by: string) => {
    // Cleared on someone else's pasted style it becomes unknown, never "you": it is not the owner's work.
    const to = by || (look.source === 'pasted' ? UNKNOWN_AUTHOR : 'you');
    const next = (await api().looks.update(look.id, { ...look, by: to })).looks;
    setPasted(next);
    registerLookSim(next.find((l) => l.id === look.id) ?? look);
    const from = look.by;
    const has = (n: string) => !!(people.ownLogoFor(n) || people.urlFor(n));
    setCarry(from.trim().toLowerCase() !== to.trim().toLowerCase() && !NOT_A_CONTRIBUTOR.test(to.trim()) && has(from) && !has(to) ? { from, to } : null);
  };
  const giveCredit = async () => {
    if (!carry) return;
    try { await people.copyTo(carry.from, carry.to); setNote({ tone: 'green', text: `${carry.to} now has the same logo and link as ${carry.from}.` }); setCarry(null); }
    catch (err) { setNote({ tone: 'red', text: `Could not copy the logo and link: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` }); }
  };
  // Removing asks first, and names the sabers that have the style queued or installed (they keep their copies).
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const usersOf = (id: string) => board.library.map((s) => ({ name: s.name, queued: !!s.model?.presets.some((p) => (p.looks ?? []).includes(id)), installed: !!s.firmware?.looks.some((l) => l.id === id) })).filter((u) => u.queued || u.installed);
  const removePasted = async (id: string) => {
    try {
      setPasted(await api().looks.remove(id));
      if (selectedId === id) setSelectedId(STARTER_LOOKS[0].id);
      setConfirmRemove(null);
    } catch (err) { setNote({ tone: 'red', text: `Could not remove the style: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}` }); }
  };

  const presetName = (i: number) => (model?.presets[i]?.name ?? info?.presets[i]?.name)?.replace(/\s*\n\s*/g, ' ') ?? `preset ${i + 1}`;
  const colourCount = Object.keys(tried).length;
  const triedArgs = useMemo(() => new Map(Object.entries(tried).map(([n, v]) => [Number(n), /^#/.test(v) ? hexToColorWord(v) : v])), [tried]);

  // What "Use it in" does here (styleToSaber.ts): written live, saved in the plan (staged or not), already there, or
  // nothing while the saber's card is out or shared. The picker lists the model's presets, so `preset` is a model index.
  const preset = model ? Math.min(targetPreset, Math.max(0, model.presets.length - 1)) : 0;
  const locked = live ? (info?.sdMissing ? 'no-card' as const : board.card.shared ? 'card-shared' as const : null) : null;
  const plan = connected && model && info && fittingBlade
    ? planPutIn({ model, firmware: saber?.firmware, saberPresets: info.presets, live, locked, look: sel, preset, blade: fittingBlade.n, tried: triedArgs })
    : null;
  const words = plan && fittingBlade && saber ? putInWords(plan, { saber: saber.name, preset: presetName(preset), blade: fittingBlade.n, queuedElsewhere: selState === 'queued', kb: sel.kb ?? null, tried: colourCount > 0 }) : null;

  const [applying, setApplying] = useState(false);
  const putIn = async () => {
    if (!plan || !model || !saber || !fittingBlade || applying) return;
    // The model as it was when the owner acted: a draft rebuilt meanwhile from the saber's read-back loses nothing.
    const snapshot = model;
    const look = sel;
    const blade = fittingBlade.n;
    const names = { saber: saber.name, preset: presetName(preset), blade, look: look.name, tried: colourCount > 0 };
    setApplying(true); setNote(null);
    try {
      let ok = true;
      // Through the board's write path (busy state, stall recovery, the shared-card refusal), as Presets writes.
      if (plan.kind === 'live') ok = await board.setPresetStyles(preset, { [blade]: plan.style }, `${look.name} → ${names.preset}`);
      const next = ok ? modelAfterPutIn(snapshot, plan, look, preset, blade) : null;
      if (next) await ws.saveModel(next);
      setNote(putInResult(plan, names, ok));
    } finally { setApplying(false); }
  };

  const stateChip = (st: LookState) => (st === 'compiled' ? <span className="chip ok"><Icon name="check" />On the saber</span> : st === 'queued' ? <span className="chip warn"><Icon name="clock" />Queued</span> : <span className="chip">Needs a build</span>);

  return (
    <>
      {pasting && (
        <div className="dialog-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPasting(false); }}>
          <section className="panel dialog" role="dialog" aria-modal="true" aria-label="Paste style code">
            <div className="ph"><h2>Paste a style</h2><button type="button" className="chip" aria-label="Close" onClick={() => setPasting(false)}><Icon name="x" /></button></div>
            <div className="pb col scroll" style={{ gap: 12 }}>
              <span className="hint">Paste the whole block from the Fett263 style library, comments included. The block{'’'}s copyright header stays with the style and goes into your config; Hiltwright never redistributes the library itself.</span>
              <textarea className="console" autoFocus style={{ minHeight: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', color: 'var(--text)', padding: 10 }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Style code" placeholder={'// Fett263 Style Library\n// Copyright ...\nStylePtr<Layers<...>>()'} spellCheck={false} />
              {analysis && !analysis.ok && analysis.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
              {pasteState.error && <div className="note red" role="alert"><Icon name="x" /><span>Could not save the style: {pasteState.error}</span></div>}
              {analysis?.ok && (
                <div className="note green"><Icon name="check" /><span>Looks like a style. {analysis.args.length ? `Colours and options you can change live: ${analysis.args.map((n) => argInfo(n).name).join(', ')}.` : 'This style has no live arguments, so its colours are fixed.'}{analysis.header ? ' Header kept.' : ' No header found; add the library comment block if this came from Fett263.'}</span></div>
              )}
              <div className="row wrap" style={{ gap: 12 }}>
                <label className="field grow"><span className="label">Name</span><span className="input sans"><input type="text" value={lookName} onChange={(e) => setLookName(e.target.value)} placeholder="Ember" aria-label="Style name" /></span></label>
                <label className="field" style={{ width: 200 }}><span className="label">By</span><span className="input sans"><input type="text" value={authorUnknown ? '' : lookBy} disabled={authorUnknown} onChange={(e) => setLookBy(e.target.value)} placeholder="Who made it" aria-label="Style author" /></span></label>
                <label className="row" style={{ gap: 6, alignSelf: 'end', height: 32 }}><input type="checkbox" checked={authorUnknown} onChange={(e) => setAuthorUnknown(e.target.checked)} /><span className="small">Author unknown</span></label>
                <button type="button" className="btn pri" style={{ alignSelf: 'end' }} title={author === null ? 'Say who made it, or that the author is unknown' : undefined} disabled={!analysis?.ok || pasteState.saving || author === null} onClick={() => void savePasted()}><span className="b"><span className="i"><Icon name="plus" />Save style</span></span></button>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
        <div className="col" style={{ gap: 12, minHeight: 0 }}>
          <div className="toolbar">
            <label className="input sans" style={{ width: 180, height: 32 }}><Icon name="search" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search styles" aria-label="Search styles" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <button type="button" className={`chip ${onlyFirmware ? 'sel' : ''}`} aria-pressed={onlyFirmware} disabled={!saber?.firmware} onClick={() => setOnlyFirmware((v) => !v)}><Icon name="check" />On the saber {compiled.size}</button>
            {(['main', 'crystal', 'accent', 'motor'] as BladeRole[]).map((r) => <button key={r} type="button" className={`chip ${roleFilter === r ? 'sel' : ''}`} aria-pressed={roleFilter === r} onClick={() => setRoleFilter(roleFilter === r ? null : r)}>{ROLE_LABEL[r]}</button>)}
            <button type="button" className={`chip ${onlyMotion ? 'sel' : ''}`} aria-pressed={onlyMotion} title="Styles that respond to tilt, swing or twist" onClick={() => setOnlyMotion((v) => !v)}>Motion</button>
            <label className="input sans" style={{ width: 190, height: 32 }} title="Show one creator's styles">
              {creator !== null && creator !== '' ? <ContributorLogo name={creators.find(([k]) => k === creator)?.[1].name ?? creator} logo={people.logoFor(creator)} size={18} /> : <Icon name="people" />}
              <span className="ellip">{creator === null ? 'Every creator' : creators.find(([k]) => k === creator)?.[1].name ?? creator}</span><span className="caret"><Icon name="down" /></span>
              <Select value={creator ?? '*'} aria-label="Creator" onChange={(e) => setCreator(e.target.value === '*' ? null : e.target.value)}>
                <option value="*">Every creator ({looks.length})</option>
                {creators.map(([k, c]) => <option key={k || '-'} value={k}>{c.name} ({c.count})</option>)}
              </Select>
            </label>
            <button type="button" className="btn sm pri" style={{ marginLeft: 'auto' }} data-tour="looks-new" onClick={onNew}><span className="b"><span className="i"><Icon name="plus" />Build a style</span></span></button>
            <button type="button" className="btn sm" onClick={() => setPasting(true)}><span className="b"><span className="i"><Icon name="import" />Paste style code</span></span></button>
          </div>
          <div className="scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, alignContent: 'start', paddingRight: 4 }} data-tour="looks-grid">
            {!pastedRead && <div style={{ gridColumn: '1 / -1' }}><LoadingSpace text="Reading your styles…" /></div>}
            {pastedRead && visible.map((l) => (
              <button key={l.id} type="button" className={`lookcard ${l.id === sel.id ? 'on' : ''}`} aria-pressed={l.id === sel.id} data-tour={stateOf(l.id) === 'queued' ? 'look-card-queued' : 'look-card'} onClick={() => { setSelectedId(l.id); setNote(null); }}>
                <div style={{ padding: '8px 14px 0', width: '100%', boxSizing: 'border-box' }}>
                  <BladePreview lookId={l.id} fallbackColor={l.preview} dot={isDot(l)} size="sm" />
                </div>
                <div className="col" style={{ padding: '2px 14px 12px', gap: 4, width: '100%' }}>
                  <div className="row between" style={{ gap: 8 }}><b className="ellip" style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</b>{stateOf(l.id) === 'compiled' ? <span className="green small nowrap">on the saber</span> : stateOf(l.id) === 'queued' ? <span className="amber small nowrap">queued</span> : null}</div>
                  <div className="hint ellip row" style={{ gap: 6 }}>{people.logoFor(l.by) && <ContributorLogo name={l.by} logo={people.logoFor(l.by)} size={16} />}<span className="ellip">{l.source !== 'starter' ? `${creditWords(l)}, ` : ''}{ROLE_LABEL[l.roles[0]]}{l.roles.length > 1 ? ` +${l.roles.length - 1}` : ''}{l.kb != null ? `, ${l.kb.toFixed(1)} KB` : ''}</span></div>
                </div>
              </button>
            ))}
            {pastedRead && visible.length === 0 && <div className="hint" style={{ gridColumn: '1 / -1', padding: 20 }}>No styles match. Clear a filter, or paste one.</div>}
          </div>
        </div>

        <section className="panel fill" aria-label="Selected style">
          <div className="ph">
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              {!NOT_A_CONTRIBUTOR.test(sel.by.trim()) && <ContributorLogo name={sel.by} logo={people.logoFor(sel.by)} size={34} />}
              <div className="col" style={{ gap: 2, minWidth: 0 }}><h2 className="ellip">{sel.name}</h2><span className="hint ellip">{creditOf(sel.by).kind === 'named' ? `by ${creditWords(sel)}` : creditWords(sel)}, for {sel.roles.map((r) => ROLE_LABEL[r]).join(' or ')}</span></div>
            </div>
            <div className="row" style={{ gap: 8 }} data-tour="looks-state">{canSimulate(sel.id) && !isDot(sel) && <button type="button" className="chip" title="Swing it in the demo room" onClick={() => onDemo(sel.id)}><Icon name="play" />Demo room</button>}{stateChip(selState)}</div>
          </div>
          <div className="pb col scroll" style={{ gap: 14, overflowX: 'hidden', flex: 1 }} data-tour="looks-detail">
            <BladePreview key={sel.id} lookId={sel.id} args={triedArgs} fallbackColor={tried[1] ?? sel.preview} dot={isDot(sel)} hilt={!isDot(sel)} controls />
            <LookPreviewNote look={sel} />

            {sel.args.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="small" style={{ fontWeight: 600 }}>Try its colours</span>{Object.keys(tried).length > 0 && <button type="button" className="holo small" onClick={() => setTried({})}>Back to defaults</button>}</div>
                <div className="grid2" style={{ gap: 6 }}>
                  {sel.args.map((n) => {
                    const a = argInfo(n);
                    if (a.kind === 'color') {
                      const shown = tried[n] ?? sel.defaults?.[n] ?? (n === 1 ? sel.preview : '#ffffff');
                      return (
                        <label key={n} className={`swatch ${tried[n] ? '' : 'linked'}`} style={{ height: 32 }} title={`Style argument ${n}`}>
                          <span className="sq" style={{ width: 14, height: 14, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                          <span className="small ellip">{a.name}</span>
                          <input type="color" value={shown} aria-label={`Try a ${a.name.toLowerCase()}`} onChange={(e) => setTried((t) => ({ ...t, [n]: e.target.value }))} />
                        </label>
                      );
                    }
                    return (
                      <label key={n} className="row" style={{ gap: 8, height: 32, gridColumn: '1 / -1' }} title={`Style argument ${n}`}>
                        <span className="small dim ellip grow">{a.name}</span>
                        <span className="input" style={{ width: 104, height: 28, flex: 'none' }}><input type="number" min={0} step={50} value={tried[n] ?? ''} placeholder="default" aria-label={`Try a ${a.name.toLowerCase()}`} onChange={(e) => setTried((t) => { const { [n]: _drop, ...rest } = t; return e.target.value === '' ? rest : { ...rest, [n]: String(Math.max(0, Math.round(Number(e.target.value)))) }; })} /></span>
                      </label>
                    );
                  })}
                </div>
                <span className="hint">These go with the style when you put it on a preset below. Fine-tune later on the <button type="button" className="holo" onClick={onPresets}>Presets page</button>.</span>
              </div>
            )}
            <p className="dim" style={{ fontSize: 13 }}>{sel.description}</p>
            <CreditCard key={`credit:${sel.id}`} name={sel.by} editedBy={!!sel.editedBy} label={sel.source === 'starter' ? 'Made by' : sel.source === 'built' ? 'Built by' : 'Style by'} onRename={sel.source === 'starter' ? undefined : (by) => setAuthor(sel, by)} onError={(text) => setNote({ tone: 'red', text })} />
            {carry && carry.to.toLowerCase() === sel.by.trim().toLowerCase() && (
              <div className="note" role="dialog" aria-label="Carry the credit over"><Icon name="info" /><span className="col" style={{ gap: 8 }}>
                <span>Give {carry.to} the logo and link of {carry.from}? {carry.from} keeps its own, in case other fonts or styles still credit it.</span>
                <span className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn sm pri" onClick={() => void giveCredit()}><span className="b"><span className="i">Give them</span></span></button>
                  <button type="button" className="btn sm ghost" onClick={() => setCarry(null)}><span className="b"><span className="i">No thanks</span></span></button>
                </span>
              </span></div>
            )}

            {sel.args.length === 0 && <span className="hint">Nothing in this style can be changed live.</span>}
            {(() => {
              // What goes into the config for this style: a pasted style's copyright header, the shared wrapper and
              // alias for Hiltwright's own, then the preset-slot expression, laid out one argument a line where long.
              const code = [sel.header, sel.usesFx ? LOOK_FX : null, sel.define ?? null, layoutStyleCode(sel.code)].filter(Boolean).join('\n\n');
              const open = codeOf === sel.id;
              const copy = () => {
                void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
              };
              return (
                <div className="col" style={{ gap: 6, flex: 'none' }}>
                  <div className="row between" style={{ gap: 8 }}>
                    <button type="button" className="chip" aria-expanded={open} onClick={() => { setCodeOf(open ? null : sel.id); setCopied(false); }}><Icon name="code" />{open ? 'Hide the code' : 'Show the code'}</button>
                    {open && <button type="button" className="chip" onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy the style'}</button>}
                  </div>
                  {open && <pre className="console" style={{ margin: 0, fontSize: 11, maxHeight: 320, whiteSpace: 'pre' }}>{code}</pre>}
                </div>
              );
            })()}
            {sel.source === 'built' && <button type="button" className="btn sm" onClick={() => onEdit(sel)}><span className="b"><span className="i"><Icon name="gear" />Edit the layers</span></span></button>}
            {(sel.source === 'pasted' || sel.source === 'built') && confirmRemove === sel.id && (() => {
              const users = usersOf(sel.id);
              return (
                <div className="note amber" role="alertdialog" aria-label="Remove this style"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
                  <span>Remove "{sel.name}" from your Styles?{users.length ? ` ${users.map((u) => `${u.name} has it ${u.queued && u.installed ? 'installed and queued' : u.installed ? 'installed' : 'queued'}`).join('; ')}. ${users.length === 1 ? 'That saber keeps its' : 'Those sabers keep their'} own copy for the next build.` : ' No saber uses it.'}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn sm danger" onClick={() => void removePasted(sel.id)}><span className="b"><span className="i">Remove</span></span></button>
                    <button type="button" className="btn sm ghost" onClick={() => setConfirmRemove(null)}><span className="b"><span className="i">Cancel</span></span></button>
                  </span>
                </span></div>
              );
            })()}
            {(sel.source === 'pasted' || sel.source === 'built') && confirmRemove !== sel.id && <button type="button" className="btn sm ghost" onClick={() => setConfirmRemove(sel.id)}><span className="b"><span className="i"><Icon name="trash" />Remove from library</span></span></button>}
          </div>
          <div className="col" style={{ gap: 8, padding: '12px 18px 14px', borderTop: '1px solid var(--line)', background: 'var(--bar)', flex: 'none' }} data-tour="looks-use">
              {!connected && ws.loading && <span className="row hint" style={{ gap: 10 }}><Loader size="sm" />Reading your sabers…</span>}
              {!connected && !ws.loading && <span className="hint">No saber yet: start one in the Armory, and styles can be put into its presets before it is ever plugged in.</span>}
              {connected && model && (
                <div className="row" style={{ gap: 8, alignItems: 'end' }}>
                  <label className="field grow"><span className="label">Preset</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{presetName(preset)}</span><span className="caret"><Icon name="down" /></span>
                    <Select value={preset} aria-label="Preset to put the style in" onChange={(e) => setTargetPreset(Number(e.target.value))}>{model!.presets.map((_p, i) => <option key={i} value={i}>{i + 1}. {presetName(i)}</option>)}</Select></span></label>
                  <label className="field" style={{ width: 140 }}><span className="label">Blade</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{fittingBlade ? `${fittingBlade.n}. ${ROLE_LABEL[fittingBlade.role]}` : 'none'}</span><span className="caret"><Icon name="down" /></span>
                    <Select value={fittingBlade?.n ?? 1} aria-label="Blade slot" onChange={(e) => setTargetBlade(Number(e.target.value))}>{bladesForLook.map((b) => <option key={b.n} value={b.n}>{b.n}. {ROLE_LABEL[b.role]}{b.fits ? '' : ' (unusual)'}</option>)}</Select></span></label>
                </div>
              )}
              {plan && words && (
                <>
                  <button type="button" className="btn pri full" disabled={!words.enabled || applying || (plan.kind === 'live' && board.busy)} onClick={() => void putIn()}><span className="b"><span className="i">{applying && plan.kind === 'live' ? <Loader size="sm" /> : <Icon name={plan.kind === 'live' ? 'presets' : plan.kind === 'already' ? 'check' : 'plus'} />}{applying && plan.kind === 'live' ? 'Writing to the saber…' : words.button}</span></span></button>
                  <span className="hint" style={{ minHeight: '2lh' }}>{words.hint} <button type="button" className="holo" onClick={onPresets}>Open Presets</button></span>
                  {selState === 'queued' && <button type="button" className="btn warn full" onClick={onBuild}><span className="b"><span className="i"><Icon name="bolt" />Build &amp; flash queued styles</span></span></button>}
                </>
              )}
              {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : 'x'} /><span>{note.text}</span></div>}
            </div>
        </section>
      </div>
    </>
  );
}
