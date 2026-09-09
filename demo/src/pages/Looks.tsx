import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveSaber, useStore } from '../store';
import { COLOR_LABELS, flashEstimate } from '../model';
import { Icon } from '../components/Icon';
import { Button, Chip, Note, Panel } from '../components/ui';
import { BladeBar, Hilt, type Fx } from '../components/saber';

export function Looks() {
  const nav = useNavigate();
  const saber = useActiveSaber();
  const looks = useStore((s) => s.looks);
  const selectedId = useStore((s) => s.selectedLookId);
  const filters = useStore((s) => s.lookFilters);
  const { selectLook, toggleLookFilter, addLookToSaber, showToast } = useStore();
  const [q, setQ] = useState('');
  const [fx, setFx] = useState<Fx>('on');
  const [phase, setPhase] = useState(0);

  const state = (id: string) => (saber.compiled.includes(id) ? 'compiled' : saber.pending.includes(id) ? 'pending' : 'new');
  const visible = looks.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filters.includes('firmware') && state(l.id) !== 'compiled') return false;
    if (filters.includes('dual') && !l.tags.includes('dual')) return false;
    if (filters.includes('crystal') && !l.tags.includes('crystal')) return false;
    return true;
  });
  const sel = looks.find((l) => l.id === selectedId) ?? looks[0];
  const selState = state(sel.id);
  const now = flashEstimate(saber, looks);
  const after = flashEstimate(saber, looks, selState === 'new' ? [sel.id] : []);
  const pulse = (s: Fx, ms: number) => { setFx(s); setTimeout(() => setFx('on'), ms); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Looks · style library</div>
          <h1>Blade looks</h1>
          <p className="lead" style={{ marginTop: 8 }}>A look is a compiled blade style. Looks already in your firmware cost nothing to reuse. New ones need a build.</p>
        </div>
        <Button icon="import" onClick={() => showToast('Paste style code from the Fett263 library. The copyright header is kept (simulated).')}>Paste style code</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
        <div className="col" style={{ gap: 16, minHeight: 0 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="input sans" style={{ width: 220 }}><Icon name="search" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks" aria-label="Search looks" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <Chip tone="live" icon="check" selected={filters.includes('firmware')} onClick={() => toggleLookFilter('firmware')}>In this firmware · {saber.compiled.length}</Chip>
            <Chip selected={filters.includes('dual')} onClick={() => toggleLookFilter('dual')}>Dual-phase</Chip>
            <Chip selected={filters.includes('crystal')} onClick={() => toggleLookFilter('crystal')}>Crystal chamber</Chip>
            <span className="hint" style={{ marginLeft: 'auto' }}>{visible.length} of {looks.length} looks</span>
          </div>
          <div className="grid3" style={{ gap: 16, overflow: 'auto', alignContent: 'start' }}>
            {visible.map((l) => {
              const st = state(l.id);
              return (
                <button key={l.id} type="button" className={`lookcard ${l.id === sel.id ? 'on' : ''}`} aria-pressed={l.id === sel.id} onClick={() => selectLook(l.id)}>
                  <div className="col" style={{ padding: '18px 16px 12px', width: '100%', gap: 6 }}>
                    <BladeBar color={l.c} />
                    {l.c2 ? <BladeBar color={l.c2} thin style={{ maxWidth: '55%' }} /> : <div style={{ height: 6 }} />}
                  </div>
                  <div className="col" style={{ padding: '4px 16px 14px', gap: 6, width: '100%' }}>
                    <div className="row between"><b style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</b>{st === 'compiled' ? <Chip tone="ok" icon="check">Compiled in</Chip> : st === 'pending' ? <Chip tone="warn" icon="clock">Queued</Chip> : <Chip tone="warn">Needs build</Chip>}</div>
                    <div className="row" style={{ gap: 10, fontSize: 12, color: 'var(--mute)' }}><span>{l.by}</span><span>·</span><span className="mono">{l.os}</span><span>·</span><span className="mono">{l.kb.toFixed(1)} KB</span></div>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && <div className="hint" style={{ gridColumn: '1 / -1', padding: 20 }}>No looks match. Clear a filter or search for something else.</div>}
          </div>
          <Note>Fett263 library looks are GPL. Their copyright headers stay in your config, and Hiltwright never redistributes the library itself.</Note>
        </div>

        <Panel label="Selected look" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="ph">
            <div className="col" style={{ gap: 2 }}><h2>{sel.name}</h2><span className="hint">{sel.by} · {sel.os} · {sel.tags.includes('dual') ? 'dual-phase' : sel.tags.includes('crystal') ? 'for short strips' : 'base look'}</span></div>
            {selState === 'compiled' ? <Chip tone="ok" icon="check">Compiled in</Chip> : selState === 'pending' ? <Chip tone="warn" icon="clock">Queued</Chip> : <Chip tone="warn">Needs build</Chip>}
          </div>
          <div className="pb col" style={{ gap: 16, overflow: 'auto' }}>
            <div className="col" style={{ gap: 8, padding: '10px 0 4px' }}>
              <div className="row" style={{ gap: 0 }}><Hilt /><BladeBar color={phase === 1 && sel.c2 ? sel.c2 : sel.c} fx={fx} /></div>
              {sel.c2 && <div className="row" style={{ gap: 0 }}><span style={{ width: 64, flex: 'none' }} /><BladeBar color={phase === 1 ? sel.c : sel.c2} fx={fx} thin /></div>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" onClick={() => setFx(fx === 'off' ? 'on' : 'off')}>{fx === 'off' ? 'Ignite' : 'Retract'}</Button>
              <Button size="sm" onClick={() => fx !== 'off' && pulse('clash', 220)}>Clash</Button>
              {sel.c2 && <Button size="sm" onClick={() => setPhase((p) => 1 - p)}>Switch phase</Button>}
            </div>
            <p className="dim" style={{ fontSize: 13, textWrap: 'pretty' }}>{sel.desc}</p>
            <div className="col" style={{ gap: 0 }}>
              <h2 style={{ fontSize: 10.5, color: 'var(--dim)', paddingBottom: 8 }}>Colours you can change later</h2>
              {sel.args.map((k) => (
                <div key={k} className="row" style={{ minHeight: 36, gap: 10, borderBottom: '1px solid var(--line)' }}>
                  <span style={{ width: 14, height: 14, background: k === 'base' ? sel.c : k === 'alt' ? sel.c2 ?? '#fff' : k === 'lockup' ? '#ffb547' : '#fff', boxShadow: '0 0 6px currentColor', flex: 'none' }} />
                  <span className="grow small">{COLOR_LABELS[k].label}</span>
                  <span className="mono mute" style={{ fontSize: 11 }}>arg {COLOR_LABELS[k].arg}</span>
                </div>
              ))}
            </div>
            {sel.needs && <Note tone="amber">{sel.needs} Hiltwright adds both when you install.</Note>}
          </div>
          <div className="col" style={{ marginTop: 'auto', padding: 18, borderTop: '1px solid var(--line)', gap: 10 }}>
            {selState === 'new' && (
              <div className="row between" style={{ fontSize: 12.5, color: 'var(--dim)' }}>
                <span>Adds {sel.kb.toFixed(1)} KB</span>
                <span className="mono">{now.pct}% → <b className={after.pct > 90 ? 'red' : after.pct > 70 ? 'amber' : 'green'} style={{ fontWeight: 600 }}>{after.pct}%</b> of flash</span>
              </div>
            )}
            {selState === 'compiled' && <Button variant="pri" icon="presets" onClick={() => nav('/presets')} full>Use it in a preset</Button>}
            {selState === 'pending' && <Button variant="warn" icon="bolt" onClick={() => nav('/build')} full>Install queued looks</Button>}
            {selState === 'new' && <Button variant="pri" icon="plus" onClick={() => addLookToSaber(sel.id)} full disabled={after.pct > 100}>{after.pct > 100 ? 'Will not fit on this board' : `Add to ${saber.name}`}</Button>}
            <span className="hint">{selState === 'compiled' ? 'Already in the firmware. Free to use.' : 'Builds new firmware (about 1 minute). Your presets and backup stay untouched.'}</span>
          </div>
        </Panel>
      </div>
    </>
  );
}
