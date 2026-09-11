// Looks: the compiled blade styles a saber can use. Starter looks ship with Hiltwright; pasted looks come from
// the Fett263 library (their headers are kept). A look is "compiled in" once an install put it in a preset slot,
// "queued" when it is in the build model but not yet installed, and "new" otherwise.

import { useEffect, useMemo, useState } from 'react';
import { STARTER_LOOKS, analyzeStyleCode, argInfo, lookSlots, type BladeRole, type LookDef } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { BladeBar, Hilt, type Fx } from './Saber';
import { draftModel, queuedLookIds, withLookInSlot } from './saberModel';

const api = () => window.hiltwright;
const ROLE_LABEL: Record<BladeRole, string> = { main: 'main blade', side: 'side blade', crystal: 'crystal', accent: 'accent', motor: 'motor' };
type LookState = 'compiled' | 'queued' | 'new';

export function Looks({ board, onPresets, onBuild }: { board: Board; onPresets: () => void; onBuild: () => void }) {
  const { info, saber, status } = board;
  const connected = status === 'connected' && !!info && !!saber;
  const [pasted, setPasted] = useState<LookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string>(STARTER_LOOKS[0].id);
  const [q, setQ] = useState('');
  const [onlyFirmware, setOnlyFirmware] = useState(false);
  const [roleFilter, setRoleFilter] = useState<BladeRole | null>(null);
  const [fx, setFx] = useState<Fx>('on');
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState('');
  const [lookName, setLookName] = useState('');
  const [lookBy, setLookBy] = useState('Fett263');
  const [targetPreset, setTargetPreset] = useState<number>(0);
  const [targetBlade, setTargetBlade] = useState<number>(1);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { void api().looks.list().then(setPasted); }, []);
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
    return true;
  });
  const sel = looks.find((l) => l.id === selectedId) ?? looks[0];
  const selState = stateOf(sel.id);
  const analysis = useMemo(() => (code.trim() ? analyzeStyleCode(code) : null), [code]);
  const bladesForLook = model ? model.blades.map((b, i) => ({ n: i + 1, role: b.role, fits: sel.roles.includes(b.role) })) : [];
  const fittingBlade = bladesForLook.find((b) => b.n === targetBlade) ?? bladesForLook.find((b) => b.fits) ?? bladesForLook[0];
  const pulse = (s: Fx, ms: number) => { setFx(s); setTimeout(() => setFx('on'), ms); };

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

  const addToSaber = async () => {
    if (!model || !saber || !fittingBlade) return;
    const next = withLookInSlot(model, sel, targetPreset, fittingBlade.n);
    await board.updateSaber({ model: next });
    setNote(`"${sel.name}" will be compiled into preset ${targetPreset + 1} (${info?.presets[targetPreset]?.name.replace('\n', ' ') ?? ''}), blade ${fittingBlade.n}. Build & Install puts it on the saber.`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Looks · style library</div>
          <h1>Blade looks</h1>
          <p className="lead" style={{ marginTop: 8 }}>A look is a compiled blade style. Looks already in the firmware cost nothing to reuse and their colours change live. New ones need a build.</p>
        </div>
        <button type="button" className="btn" onClick={() => setPasting((p) => !p)}><span className="b"><span className="i"><Icon name="import" />{pasting ? 'Close' : 'Paste style code'}</span></span></button>
      </div>

      {pasting && (
        <section className="panel" aria-label="Paste style code">
          <div className="ph"><h2>Paste a style from the Fett263 library</h2><span className="hint">The whole block, comments included. The copyright header stays with the look.</span></div>
          <div className="pb col" style={{ gap: 12 }}>
            <textarea className="console" style={{ minHeight: 160, resize: 'vertical', width: '100%', boxSizing: 'border-box', color: 'var(--text)', background: '#0b1016', border: '1px solid var(--line)', padding: 10 }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Style code" placeholder={'// Fett263 Style Library\n// Copyright ...\nStylePtr<Layers<...>>()'} spellCheck={false} />
            {analysis && !analysis.ok && analysis.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
            {analysis?.ok && (
              <div className="note green"><Icon name="check" /><span>Looks like a style. {analysis.args.length ? `Runtime arguments: ${analysis.args.map((n) => argInfo(n).name).join(', ')}.` : 'No runtime arguments, so no live colour changes for this one.'}{analysis.header ? ' Header kept.' : ' No header found; add the library comment block if this came from Fett263.'}</span></div>
            )}
            <div className="row wrap" style={{ gap: 12 }}>
              <label className="field" style={{ width: 260 }}><span className="label">Name</span><span className="input sans"><input type="text" value={lookName} onChange={(e) => setLookName(e.target.value)} placeholder="Ember" aria-label="Look name" /></span></label>
              <label className="field" style={{ width: 200 }}><span className="label">By</span><span className="input sans"><input type="text" value={lookBy} onChange={(e) => setLookBy(e.target.value)} aria-label="Look author" /></span></label>
              <button type="button" className="btn pri" style={{ alignSelf: 'end' }} disabled={!analysis?.ok} onClick={() => void savePasted()}><span className="b"><span className="i"><Icon name="plus" />Save look</span></span></button>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
        <div className="col" style={{ gap: 16, minHeight: 0 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="input sans" style={{ width: 220 }}><Icon name="search" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks" aria-label="Search looks" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <button type="button" className={`chip ${onlyFirmware ? 'sel' : ''}`} aria-pressed={onlyFirmware} disabled={!saber?.firmware} onClick={() => setOnlyFirmware((v) => !v)}><Icon name="check" />In this firmware · {compiled.size}</button>
            {(['main', 'crystal', 'accent', 'motor'] as BladeRole[]).map((r) => <button key={r} type="button" className={`chip ${roleFilter === r ? 'sel' : ''}`} aria-pressed={roleFilter === r} onClick={() => setRoleFilter(roleFilter === r ? null : r)}>{ROLE_LABEL[r]}</button>)}
            <span className="hint" style={{ marginLeft: 'auto' }}>{visible.length} of {looks.length} looks</span>
          </div>
          <div className="grid3" style={{ gap: 16, overflow: 'auto', alignContent: 'start' }}>
            {visible.map((l) => {
              const st = stateOf(l.id);
              return (
                <button key={l.id} type="button" className={`lookcard ${l.id === sel.id ? 'on' : ''}`} aria-pressed={l.id === sel.id} onClick={() => setSelectedId(l.id)}>
                  <div className="col" style={{ padding: '18px 16px 12px', width: '100%', gap: 6 }}>
                    <BladeBar color={l.preview} thin={!l.roles.includes('main') && !l.roles.includes('side')} />
                  </div>
                  <div className="col" style={{ padding: '4px 16px 14px', gap: 6, width: '100%' }}>
                    <div className="row between"><b style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</b>{st === 'compiled' ? <span className="chip ok"><Icon name="check" />Compiled in</span> : st === 'queued' ? <span className="chip warn"><Icon name="clock" />Queued</span> : <span className="chip warn">Needs build</span>}</div>
                    <div className="row" style={{ gap: 10, fontSize: 12, color: 'var(--mute)' }}><span>{l.by}</span><span>·</span><span>{l.roles.map((r) => ROLE_LABEL[r]).join(', ')}</span><span>·</span><span className="mono">{l.args.length} arg{l.args.length === 1 ? '' : 's'}</span></div>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && <div className="hint" style={{ gridColumn: '1 / -1', padding: 20 }}>No looks match. Clear a filter or paste one.</div>}
          </div>
          <div className="note"><Icon name="info" /><span>Fett263 library looks are GPL. Their copyright headers stay in your config, and Hiltwright never redistributes the library itself.</span></div>
        </div>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Selected look">
          <div className="ph">
            <div className="col" style={{ gap: 2 }}><h2>{sel.name}</h2><span className="hint">{sel.by} · for {sel.roles.map((r) => ROLE_LABEL[r]).join(' or ')}</span></div>
            {selState === 'compiled' ? <span className="chip ok"><Icon name="check" />Compiled in</span> : selState === 'queued' ? <span className="chip warn"><Icon name="clock" />Queued</span> : <span className="chip warn">Needs build</span>}
          </div>
          <div className="pb col" style={{ gap: 16, overflow: 'auto' }}>
            <div className="col" style={{ gap: 8, padding: '10px 0 4px' }}>
              <div className="row" style={{ gap: 0 }}><Hilt /><BladeBar color={sel.preview} fx={fx} /></div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm" onClick={() => setFx(fx === 'off' ? 'on' : 'off')}><span className="b"><span className="i">{fx === 'off' ? 'Ignite' : 'Retract'}</span></span></button>
              <button type="button" className="btn sm" onClick={() => fx !== 'off' && pulse('clash', 220)}><span className="b"><span className="i">Clash</span></span></button>
              <button type="button" className="btn sm" onClick={() => fx !== 'off' && pulse('blast', 300)}><span className="b"><span className="i">Blast</span></span></button>
            </div>
            <p className="dim" style={{ fontSize: 13 }}>{sel.description}</p>
            <div className="col" style={{ gap: 0 }}>
              <h2 style={{ fontSize: 10.5, color: 'var(--dim)', paddingBottom: 8 }}>{sel.args.length ? 'Colours and options you can change live' : 'No live arguments'}</h2>
              {sel.args.map((n) => {
                const a = argInfo(n);
                return (
                  <div key={n} className="row" style={{ minHeight: 34, gap: 10, borderBottom: '1px solid var(--line)' }}>
                    <span style={{ width: 12, height: 12, flex: 'none', background: a.kind === 'color' ? (sel.defaults?.[n] ?? (n === 1 ? sel.preview : '#fff')) : 'transparent', border: a.kind === 'color' ? 'none' : '1px solid var(--line2)' }} />
                    <span className="grow small">{a.name}</span>
                    <span className="mono mute" style={{ fontSize: 11 }}>arg {n}</span>
                  </div>
                );
              })}
            </div>
            {selState === 'compiled' && saber?.firmware && <span className="hint">Compiled into {lookSlots(saber.firmware, sel.id).map((s) => `preset ${s.preset + 1} blade ${s.blade}`).join(', ')}.</span>}
            {sel.source === 'pasted' && sel.header && <pre className="console" style={{ maxHeight: 120, margin: 0, fontSize: 11 }}>{sel.header}</pre>}
            {note && <div className="note green"><Icon name="check" /><span>{note}</span></div>}
          </div>
          <div className="col" style={{ marginTop: 'auto', padding: 18, borderTop: '1px solid var(--line)', gap: 10 }}>
            {!connected && <span className="hint">Connect a saber to add looks to it.</span>}
            {connected && selState === 'compiled' && <button type="button" className="btn pri" onClick={onPresets}><span className="b"><span className="i"><Icon name="presets" />Use it in a preset</span></span></button>}
            {connected && selState === 'queued' && <button type="button" className="btn warn" onClick={onBuild}><span className="b"><span className="i"><Icon name="bolt" />Build &amp; install queued looks</span></span></button>}
            {connected && selState !== 'compiled' && model && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <label className="field grow"><span className="label">Preset</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{info!.presets[targetPreset]?.name.replace('\n', ' ')}</span><span className="caret"><Icon name="down" /></span>
                    <select value={targetPreset} aria-label="Preset to compile the look into" onChange={(e) => setTargetPreset(Number(e.target.value))}>{info!.presets.map((p, i) => <option key={i} value={i}>{i + 1} · {p.name.replace('\n', ' ')}</option>)}</select></span></label>
                  <label className="field" style={{ width: 150 }}><span className="label">Blade</span><span className="input sans" style={{ height: 32 }}><span className="ellip">{fittingBlade ? `${fittingBlade.n} · ${ROLE_LABEL[fittingBlade.role]}` : '—'}</span><span className="caret"><Icon name="down" /></span>
                    <select value={fittingBlade?.n ?? 1} aria-label="Blade slot" onChange={(e) => setTargetBlade(Number(e.target.value))}>{bladesForLook.map((b) => <option key={b.n} value={b.n}>{b.n} · {ROLE_LABEL[b.role]}{b.fits ? '' : ' (unusual)'}</option>)}</select></span></label>
                </div>
                <button type="button" className="btn pri" disabled={!fittingBlade} onClick={() => void addToSaber()}><span className="b"><span className="i"><Icon name="plus" />{selState === 'queued' ? 'Also use here' : `Add to ${saber!.name}`}</span></span></button>
                <span className="hint">Compiles the look into that slot. After the install it is available to every preset from the look picker.</span>
              </div>
            )}
            {sel.source === 'pasted' && <button type="button" className="btn sm ghost" onClick={() => void removePasted(sel.id)}><span className="b"><span className="i"><Icon name="trash" />Remove from library</span></span></button>}
          </div>
        </section>
      </div>
    </>
  );
}
