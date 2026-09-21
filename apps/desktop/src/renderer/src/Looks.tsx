// Looks: the compiled blade styles a saber can use. Starter looks ship with Hiltwright; pasted looks come from
// the Fett263 library (their headers are kept). A look is "compiled in" once an install put it in a preset slot,
// "queued" when it is in the build model but not yet installed, and "new" otherwise.

import { useEffect, useMemo, useState } from 'react';
import { STARTER_LOOKS, analyzeStyleCode, argInfo, formatBuiltin, formatStyleArgs, hexToColorWord, lookSlots, type BladeRole, type LookDef } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { BladePreview, canSimulate } from './BladePreview';
import { draftModel, infoFromRecord, queuedLookIds, withLookInSlot } from './saberModel';

const api = () => window.hiltwright;
const ROLE_LABEL: Record<BladeRole, string> = { main: 'main blade', side: 'side blade', crystal: 'crystal', accent: 'accent', motor: 'motor' };
/** Looks that read the saber's motion sensors: tilt from gravity, swing and twist from the gyro. */
const usesMotion = (l: LookDef) => /BladeAngle|TwistAngle|SwingSpeed|SwingAcceleration/.test(l.define ?? l.code);

type LookState = 'compiled' | 'queued' | 'new';

export function Looks({ board, onPresets, onBuild, onDemo }: { board: Board; onPresets: () => void; onBuild: () => void; onDemo: (lookId: string) => void }) {
  const { status } = board;
  // Looks can be chosen for a remembered saber with nothing plugged in; only the install needs the board.
  const live = status === 'connected' && !!board.info && !!board.saber;
  const saber = live ? board.saber : board.library[0] ?? null;
  const info = useMemo(() => (live ? board.info : saber ? infoFromRecord(saber) : null), [live, board.info, saber]);
  const connected = !!info && !!saber;
  const [pasted, setPasted] = useState<LookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string>(STARTER_LOOKS[0].id);
  const [q, setQ] = useState('');
  const [onlyFirmware, setOnlyFirmware] = useState(false);
  const [roleFilter, setRoleFilter] = useState<BladeRole | null>(null);
  const [onlyMotion, setOnlyMotion] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState('');
  const [lookName, setLookName] = useState('');
  const [lookBy, setLookBy] = useState('Fett263');
  const [targetPreset, setTargetPreset] = useState<number>(0);
  const [targetBlade, setTargetBlade] = useState<number>(1);
  const [note, setNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  // Colours and timings tried on the preview only. Nothing here reaches the saber: saved colours belong to a preset.
  const [tried, setTried] = useState<Record<number, string>>({});
  useEffect(() => { setTried({}); }, [selectedId]);

  useEffect(() => { void api().looks.list().then(setPasted); }, []);
  useEffect(() => {
    if (!pasting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPasting(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pasting]);
  useEffect(() => { if (info?.currentPreset != null) setTargetPreset(info.currentPreset); }, [info?.currentPreset]);

  const looks = useMemo(() => [...STARTER_LOOKS, ...pasted], [pasted]);
  const model = connected ? draftModel(info, saber) : null;
  const queued = new Set(queuedLookIds(model ?? undefined, saber?.firmware));
  const compiled = new Set((saber?.firmware?.looks ?? []).map((l) => l.id));
  const stateOf = (id: string): LookState => (compiled.has(id) ? 'compiled' : queued.has(id) ? 'queued' : 'new');
  const visible = looks.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q.toLowerCase()) && !l.by.toLowerCase().includes(q.toLowerCase())) return false;
    if (onlyFirmware && stateOf(l.id) !== 'compiled') return false;
    if (roleFilter && !l.roles.includes(roleFilter)) return false;
    if (onlyMotion && !usesMotion(l)) return false;
    return true;
  });
  const sel = looks.find((l) => l.id === selectedId) ?? looks[0];
  const selState = stateOf(sel.id);
  const analysis = useMemo(() => (code.trim() ? analyzeStyleCode(code) : null), [code]);
  const bladesForLook = model ? model.blades.map((b, i) => ({ n: i + 1, role: b.role, fits: sel.roles.includes(b.role) })) : [];
  const fittingBlade = bladesForLook.find((b) => b.n === targetBlade) ?? bladesForLook.find((b) => b.fits) ?? bladesForLook[0];
  const isDot = (l: LookDef) => !l.roles.includes('main') && !l.roles.includes('side');

  const savePasted = async () => {
    if (!analysis?.ok) return;
    const id = `look_${(lookName || 'pasted').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'pasted'}_${Date.now().toString(36)}`;
    const roles: BladeRole[] = ['main', 'side'];
    const look: LookDef = { id, name: lookName.trim() || 'Pasted look', source: 'pasted', by: lookBy.trim() || 'unknown', code: analysis.expression, header: analysis.header, roles, args: analysis.args, preview: analysis.preview, defaults: analysis.defaults, description: analysis.header ? analysis.header.split('\n').map((l) => l.replace(/^\/\/\s?|\/\*|\*\//g, '').trim()).filter(Boolean).slice(0, 3).join(' · ') : 'Pasted style code.' };
    setPasted(await api().looks.add(look));
    setSelectedId(id);
    setPasting(false); setCode(''); setLookName('');
  };

  const removePasted = async (id: string) => {
    setPasted(await api().looks.remove(id));
    if (selectedId === id) setSelectedId(STARTER_LOOKS[0].id);
  };

  const presetName = (i: number) => info?.presets[i]?.name.replace(/\s*\n\s*/g, ' ') ?? `preset ${i + 1}`;
  const colourCount = Object.keys(tried).length;
  const withColours = colourCount ? ` with the ${colourCount === 1 ? 'setting' : `${colourCount} settings`} you chose` : '';

  /** A look not on the saber yet: queue it for the next build, and keep the chosen colours for after the install. */
  const addToSaber = async () => {
    if (!model || !saber || !fittingBlade) return;
    const next = withLookInSlot(model, sel, targetPreset, fittingBlade.n, formatStyleArgs(triedArgs) || null);
    await board.updateSaber({ model: next }, saber.id);
    setNote({ tone: 'green', text: `"${sel.name}" goes into ${presetName(targetPreset)}, blade ${fittingBlade.n}${withColours}, with the next Build & Install.${colourCount ? ' The colours are written to the saber right after the install.' : ''}` });
  };

  /** A look already on the saber: point the preset's blade at it now, with the chosen colours. */
  const [applying, setApplying] = useState(false);
  const useInPreset = async () => {
    if (!saber?.firmware || !fittingBlade) return;
    const slots = lookSlots(saber.firmware, sel.id);
    const slot = slots.find((sl) => sl.blade === fittingBlade.n) ?? slots[0];
    if (!slot) return;
    setApplying(true); setNote(null);
    try {
      const style = formatBuiltin({ preset: slot.preset, blade: slot.blade, args: formatStyleArgs(triedArgs) || null });
      const ok = await board.setPresetStyles(targetPreset, { [fittingBlade.n]: style }, `${sel.name} → ${presetName(targetPreset)}`);
      setNote(ok ? { tone: 'green', text: `${presetName(targetPreset)} now uses "${sel.name}" on blade ${fittingBlade.n}${withColours}. The saber confirmed it.` } : { tone: 'red', text: 'The saber did not confirm the change. Nothing was left half done; try again, or check the connection on the Armory page.' });
    } finally { setApplying(false); }
  };

  const triedArgs = useMemo(() => new Map(Object.entries(tried).map(([n, v]) => [Number(n), /^#/.test(v) ? hexToColorWord(v) : v])), [tried]);
  const stateChip = (st: LookState) => (st === 'compiled' ? <span className="chip ok"><Icon name="check" />On the saber</span> : st === 'queued' ? <span className="chip warn"><Icon name="clock" />Queued</span> : <span className="chip">Needs a build</span>);

  return (
    <>
      {pasting && (
        <div className="dialog-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPasting(false); }}>
          <section className="panel dialog" role="dialog" aria-modal="true" aria-label="Paste style code">
            <div className="ph"><h2>Paste a style</h2><button type="button" className="chip" aria-label="Close" onClick={() => setPasting(false)}><Icon name="x" /></button></div>
            <div className="pb col scroll" style={{ gap: 12 }}>
              <span className="hint">Paste the whole block from the Fett263 style library, comments included. Its copyright header stays with the look and goes into your config; Hiltwright never redistributes the library itself.</span>
              <textarea className="console" autoFocus style={{ minHeight: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', color: 'var(--text)', background: '#0b1016', border: '1px solid var(--line)', padding: 10 }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Style code" placeholder={'// Fett263 Style Library\n// Copyright ...\nStylePtr<Layers<...>>()'} spellCheck={false} />
              {analysis && !analysis.ok && analysis.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
              {analysis?.ok && (
                <div className="note green"><Icon name="check" /><span>Looks like a style. {analysis.args.length ? `Colours and options you can change live: ${analysis.args.map((n) => argInfo(n).name).join(', ')}.` : 'It has no live arguments, so its colours are fixed.'}{analysis.header ? ' Header kept.' : ' No header found; add the library comment block if this came from Fett263.'}</span></div>
              )}
              <div className="row wrap" style={{ gap: 12 }}>
                <label className="field grow"><span className="label">Name</span><span className="input sans"><input type="text" value={lookName} onChange={(e) => setLookName(e.target.value)} placeholder="Ember" aria-label="Look name" /></span></label>
                <label className="field" style={{ width: 200 }}><span className="label">By</span><span className="input sans"><input type="text" value={lookBy} onChange={(e) => setLookBy(e.target.value)} aria-label="Look author" /></span></label>
                <button type="button" className="btn pri" style={{ alignSelf: 'end' }} disabled={!analysis?.ok} onClick={() => void savePasted()}><span className="b"><span className="i"><Icon name="plus" />Save look</span></span></button>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
        <div className="col" style={{ gap: 12, minHeight: 0 }}>
          <div className="toolbar">
            <label className="input sans" style={{ width: 180, height: 32 }}><Icon name="search" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks" aria-label="Search looks" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <button type="button" className={`chip ${onlyFirmware ? 'sel' : ''}`} aria-pressed={onlyFirmware} disabled={!saber?.firmware} onClick={() => setOnlyFirmware((v) => !v)}><Icon name="check" />On the saber {compiled.size}</button>
            {(['main', 'crystal', 'accent', 'motor'] as BladeRole[]).map((r) => <button key={r} type="button" className={`chip ${roleFilter === r ? 'sel' : ''}`} aria-pressed={roleFilter === r} onClick={() => setRoleFilter(roleFilter === r ? null : r)}>{ROLE_LABEL[r]}</button>)}
            <button type="button" className={`chip ${onlyMotion ? 'sel' : ''}`} aria-pressed={onlyMotion} title="Looks that respond to tilt, swing or twist" onClick={() => setOnlyMotion((v) => !v)}>Motion</button>
            <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPasting(true)}><span className="b"><span className="i"><Icon name="import" />Paste style code</span></span></button>
          </div>
          <div className="scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 10, alignContent: 'start', paddingRight: 4 }}>
            {visible.map((l) => (
              <button key={l.id} type="button" className={`lookcard ${l.id === sel.id ? 'on' : ''}`} aria-pressed={l.id === sel.id} onClick={() => { setSelectedId(l.id); setNote(null); }}>
                <div style={{ padding: '8px 14px 0', width: '100%', boxSizing: 'border-box' }}>
                  <BladePreview lookId={l.id} fallbackColor={l.preview} dot={isDot(l)} size="sm" />
                </div>
                <div className="col" style={{ padding: '2px 14px 12px', gap: 4, width: '100%' }}>
                  <div className="row between" style={{ gap: 8 }}><b className="ellip" style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</b>{stateOf(l.id) === 'compiled' ? <span className="green small nowrap">on the saber</span> : stateOf(l.id) === 'queued' ? <span className="amber small nowrap">queued</span> : null}</div>
                  <div className="hint ellip">{l.source === 'pasted' ? `${l.by}, ` : ''}{ROLE_LABEL[l.roles[0]]}{l.roles.length > 1 ? ` +${l.roles.length - 1}` : ''}{l.kb != null ? `, ${l.kb.toFixed(1)} KB` : ''}</div>
                </div>
              </button>
            ))}
            {visible.length === 0 && <div className="hint" style={{ gridColumn: '1 / -1', padding: 20 }}>No looks match. Clear a filter, or paste one.</div>}
          </div>
        </div>

        <section className="panel fill" aria-label="Selected look">
          <div className="ph">
            <div className="col" style={{ gap: 2, minWidth: 0 }}><h2 className="ellip">{sel.name}</h2><span className="hint ellip">{sel.by}, for {sel.roles.map((r) => ROLE_LABEL[r]).join(' or ')}</span></div>
            <div className="row" style={{ gap: 8 }}>{canSimulate(sel.id) && !isDot(sel) && <button type="button" className="chip" title="Swing it in the demo room" onClick={() => onDemo(sel.id)}><Icon name="play" />Demo room</button>}{stateChip(selState)}</div>
          </div>
          <div className="pb col scroll" style={{ gap: 14, overflowX: 'hidden' }}>
            <BladePreview key={sel.id} lookId={sel.id} args={triedArgs} fallbackColor={tried[1] ?? sel.preview} dot={isDot(sel)} hilt={!isDot(sel)} controls />

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
                      <label key={n} className="row" style={{ gap: 8, height: 32 }} title={`Style argument ${n}`}>
                        <span className="small dim ellip grow">{a.name}</span>
                        <span className="input" style={{ width: 104, height: 28, flex: 'none' }}><input type="number" min={0} step={50} value={tried[n] ?? ''} placeholder="default" aria-label={`Try a ${a.name.toLowerCase()}`} onChange={(e) => setTried((t) => { const { [n]: _drop, ...rest } = t; return e.target.value === '' ? rest : { ...rest, [n]: String(Math.max(0, Math.round(Number(e.target.value)))) }; })} /></span>
                      </label>
                    );
                  })}
                </div>
                <span className="hint">These go with the look when you put it on a preset below. Fine-tune later on the <button type="button" className="holo" onClick={onPresets}>Presets page</button>.</span>
              </div>
            )}
            <p className="dim" style={{ fontSize: 13 }}>{sel.description}</p>

            {sel.args.length === 0 && <span className="hint">Nothing in this look can be changed live.</span>}
            {sel.source === 'pasted' && sel.header && <pre className="console" style={{ maxHeight: 110, margin: 0, fontSize: 11, flex: 'none' }}>{sel.header}</pre>}
            {sel.source === 'pasted' && <button type="button" className="btn sm ghost" onClick={() => void removePasted(sel.id)}><span className="b"><span className="i"><Icon name="trash" />Remove from library</span></span></button>}
          </div>
          <div className="col" style={{ gap: 8, padding: '12px 18px 14px', borderTop: '1px solid var(--line)', background: '#0d131a', flex: 'none' }}>
              {!connected && <span className="hint">Connect a saber once and Hiltwright remembers it. After that, looks can be added with it unplugged.</span>}
              {connected && model && (
                <div className="row" style={{ gap: 8, alignItems: 'end' }}>
                  <label className="field grow"><span className="label">Preset</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{presetName(targetPreset)}</span><span className="caret"><Icon name="down" /></span>
                    <select value={targetPreset} aria-label="Preset to put the look in" onChange={(e) => setTargetPreset(Number(e.target.value))}>{info!.presets.map((_p, i) => <option key={i} value={i}>{i + 1}. {presetName(i)}</option>)}</select></span></label>
                  <label className="field" style={{ width: 140 }}><span className="label">Blade</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{fittingBlade ? `${fittingBlade.n}. ${ROLE_LABEL[fittingBlade.role]}` : 'none'}</span><span className="caret"><Icon name="down" /></span>
                    <select value={fittingBlade?.n ?? 1} aria-label="Blade slot" onChange={(e) => setTargetBlade(Number(e.target.value))}>{bladesForLook.map((b) => <option key={b.n} value={b.n}>{b.n}. {ROLE_LABEL[b.role]}{b.fits ? '' : ' (unusual)'}</option>)}</select></span></label>
                </div>
              )}
              {connected && model && selState === 'compiled' && (
                <>
                  <button type="button" className="btn pri full" disabled={!live || !fittingBlade || applying || board.busy} onClick={() => void useInPreset()}><span className="b"><span className="i"><Icon name="presets" />{applying ? 'Writing to the saber…' : `Use it in ${presetName(targetPreset)}`}</span></span></button>
                  <span className="hint">{live ? `This look is already on ${saber!.name}, so it is written to the preset now${colourCount ? ', in the colours you chose above' : ''}. No rebuild.` : `This look is already on ${saber!.name}. Plug the saber in to put it on a preset.`} <button type="button" className="holo" onClick={onPresets}>Open Presets</button></span>
                </>
              )}
              {connected && model && selState !== 'compiled' && (
                <>
                  <button type="button" className="btn pri full" disabled={!fittingBlade} onClick={() => void addToSaber()}><span className="b"><span className="i"><Icon name="plus" />{selState === 'queued' ? `Also use it in ${presetName(targetPreset)}` : `Add to ${presetName(targetPreset)}`}</span></span></button>
                  {selState === 'queued'
                    ? <button type="button" className="btn warn full" onClick={onBuild}><span className="b"><span className="i"><Icon name="bolt" />Build &amp; install queued looks</span></span></button>
                    : <span className="hint">New looks reach the saber with the next Build &amp; Install{sel.kb != null ? `, and cost about ${sel.kb.toFixed(1)} KB of firmware space once` : ''}.{colourCount ? ' The colours you tried go with it.' : ''}</span>}
                </>
              )}
              {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : 'x'} /><span>{note.text}</span></div>}
            </div>
        </section>
      </div>
    </>
  );
}
