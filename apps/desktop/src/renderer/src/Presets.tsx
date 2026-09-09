// Presets page against the live board. Selecting a row selects it on the saber; every edit is written to the
// current preset and only shown as saved once the saber reads it back.

import { useEffect, useState } from 'react';
import { parseBuiltin, type PresetRecord } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';

function splitFont(font: string): { folder: string; common: boolean } {
  const parts = font.split(';');
  return { folder: parts[0] ?? '', common: parts.slice(1).includes('common') };
}

function joinFont(folder: string, common: boolean): string {
  return common && folder !== 'common' ? `${folder};common` : folder;
}

export function Presets({ board }: { board: Board }) {
  const { info, status, save, busy, snapshots } = board;
  const connected = status === 'connected' && !!info;
  const current = info && info.currentPreset != null ? info.presets[info.currentPreset] : null;
  const [name, setName] = useState('');
  useEffect(() => { setName(current?.name ?? ''); }, [current?.name]);

  if (!connected || !info) {
    return (
      <>
        <div className="page-head"><div><div className="eyebrow">Presets · live on the saber</div><h1>Presets</h1></div></div>
        <section className="panel"><div className="pb dim">Connect a saber first. Presets are read from and written to the board itself; nothing is stored in the app yet.</div></section>
      </>
    );
  }

  const fontFolders = [...new Set([...info.fonts.filter((f) => f !== 'common'), ...(current ? [splitFont(current.font).folder] : [])])];
  const trackChoices = [...new Set(['', ...info.tracks, ...(current ? [current.track] : [])])];
  const cf = current ? splitFont(current.font) : { folder: '', common: true };

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Presets · live on the saber</div><h1>{info.version?.config?.replace(/^config\//, '').replace(/\.h$/, '') ?? 'Saber'}</h1></div>
        <div className="row">
          <SaveChip save={save} />
          <button type="button" className="btn sm" disabled={busy || snapshots.length === 0} onClick={() => void board.restoreSnapshot(snapshots[0])}><span className="b"><span className="i"><Icon name="undo" />Undo</span></span></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr) 320px', gap: 20, flex: 1, minHeight: 0 }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset list">
          <div className="ph"><h2>Presets · {info.presets.length}</h2><span className="hint">on the saber</span></div>
          <div className="list" role="listbox" aria-label="Presets on the saber" style={{ overflow: 'auto' }}>
            {info.presets.map((p, i) => (
              <button key={i} type="button" role="option" aria-selected={i === info.currentPreset} className={`li click ${i === info.currentPreset ? 'on' : ''}`} disabled={busy} onClick={() => void board.choosePreset(i)}>
                <span className="n">{i + 1}</span>
                <span className="col grow" style={{ gap: 0 }}><span className="ellip" style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'pre-line' }}>{p.name}</span><span className="hint ellip">{splitFont(p.font).folder}</span></span>
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--line)' }}>Choosing a preset here selects it on the saber too, the way the button would. Reordering comes later.</div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset editor">
          <div className="ph"><h2 className="ellip">{current ? current.name.replace('\n', ' ') : 'No preset'}</h2><span className="mono mute" style={{ fontSize: 11.5 }}>preset {info.currentPreset != null ? info.currentPreset + 1 : '?'} of {info.presets.length}</span></div>
          {current && (
            <div className="pb col" style={{ gap: 18, overflow: 'auto' }}>
              <form className="grid2" onSubmit={(e) => { e.preventDefault(); if (name !== current.name) void board.editPreset({ name }, 'Rename'); }}>
                <label className="field"><span className="label">Name</span>
                  <span className="input sans"><input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== current.name) void board.editPreset({ name }, 'Rename'); }} disabled={busy} aria-label="Preset name" /></span>
                </label>
                <label className="field"><span className="label">Sound font</span>
                  <span className="input sans"><Icon name="fonts" /><span className="ellip">{cf.folder}</span>{cf.common && <span className="mute">+ common</span>}<span className="caret"><Icon name="down" /></span>
                    <select value={cf.folder} disabled={busy} aria-label="Sound font" onChange={(e) => void board.editPreset({ font: joinFont(e.target.value, cf.common) }, `Font → ${e.target.value}`)}>
                      {fontFolders.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </span>
                </label>
                <label className="field"><span className="label">Track</span>
                  <span className="input"><span className="ellip">{current.track || 'No track'}</span><span className="caret"><Icon name="down" /></span>
                    <select value={current.track} disabled={busy} aria-label="Track" onChange={(e) => void board.editPreset({ track: e.target.value }, `Track → ${e.target.value || 'none'}`)}>
                      {trackChoices.map((t) => <option key={t} value={t}>{t || 'No track'}</option>)}
                    </select>
                  </span>
                </label>
                <label className="row" style={{ gap: 10, alignSelf: 'end', height: 38, fontSize: 13, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                  <button type="button" className={`tog ${cf.common ? 'on' : ''}`} role="switch" aria-checked={cf.common} disabled={busy} aria-label="Fall back to the common folder" onClick={() => void board.editPreset({ font: joinFont(cf.folder, !cf.common) }, cf.common ? 'Drop common fallback' : 'Add common fallback')}><i /></button>
                  Also use <span className="mono">common</span> sounds
                </label>
              </form>

              <div className="col" style={{ gap: 6 }}>
                <div className="row between"><h2 style={{ fontSize: 10.5, color: 'var(--dim)' }}>Looks per blade</h2><span className="hint">Read-only in this build. These are the styles compiled into the firmware.</span></div>
                {current.styles.map((s, k) => {
                  const b = parseBuiltin(s);
                  return (
                    <div key={k} className="row" style={{ gap: 12, minHeight: 36 }}>
                      <span className="mono mute" style={{ fontSize: 11, width: 12 }}>{k + 1}</span>
                      <span className="grow small">Blade {k + 1}</span>
                      <span className="mono small">{b ? `compiled look ${b.preset + 1}.${b.blade}${b.args ? ` · args ${b.args}` : ''}` : s}</span>
                    </div>
                  );
                })}
              </div>

              <div className="row" style={{ gap: 16 }}>
                <span className="label">Variation</span><span className="mono small">{current.variation}</span>
                <span className="hint">Colour-change value the saber saved. Editable once the style arguments are understood.</span>
              </div>
            </div>
          )}
          <div className="note" style={{ margin: 'auto 18px 18px' }}><Icon name="info" /><span>Each change is written to the saber's <span className="mono">presets.ini</span>, then read back. "Saved" only appears once the saber reports the new value. A snapshot is kept before each change.</span></div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Snapshots">
          <div className="ph"><h2>Snapshots</h2><span className="hint">before each change</span></div>
          <div className="list" style={{ overflow: 'auto' }}>
            {snapshots.length === 0 && <div className="li hint" style={{ minHeight: 40 }}>No changes yet this session.</div>}
            {snapshots.map((s, i) => (
              <div key={s.at} className="li" style={{ minHeight: 40, gap: 8 }}>
                <span className="mono" style={{ fontSize: 12 }}>{new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="grow dim ellip small">{s.label}</span>
                <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy} onClick={() => void board.restoreSnapshot(s)}>{i === 0 ? 'Undo' : 'Restore'}</button>
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--line)' }}>Restore re-sends the earlier values for the current preset and waits for the saber to confirm. Snapshots live in this session only for now.</div>
        </section>
      </div>
    </>
  );
}

function SaveChip({ save }: { save: Board['save'] }) {
  switch (save.kind) {
    case 'writing': return <span className="chip warn"><span className="dot" />Writing {save.what}…</span>;
    case 'saved': return <span className="chip ok"><Icon name="check" />Saved to saber · {save.what} · {save.ms} ms</span>;
    case 'failed': return <span className="chip err"><Icon name="x" />{save.what} failed: {save.error}</span>;
    default: return <span className="chip"><span className="dot" />No changes yet</span>;
  }
}

export type { PresetRecord };
