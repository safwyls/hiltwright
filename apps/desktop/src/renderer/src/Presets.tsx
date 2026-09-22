// Presets page against the live board. Selecting a row selects it on the saber; every edit is written to the
// current preset and only shown as saved once the saber reads it back. Snapshots live on disk per saber.

import { useEffect, useState } from 'react';
import type { PresetRecord } from '@hiltwright/core';
import { LookRows } from './LookRows';
import { SaberControls } from './Controls';
import type { Board } from './board';
import { Icon } from './Icon';
import { Banks } from './Banks';

function splitFont(font: string): { folder: string; common: boolean } {
  const parts = font.split(';');
  return { folder: parts[0] ?? '', common: parts.slice(1).includes('common') };
}

function joinFont(folder: string, common: boolean): string {
  return common && folder !== 'common' ? `${folder};common` : folder;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Presets({ board, onLooks, onBuild }: { board: Board; onLooks: () => void; onBuild: () => void }) {
  const { info, status, save, busy, snapshots, saber } = board;
  const connected = status === 'connected' && !!info;
  // Two views: the presets on the connected saber, and banks built here to load onto one. Without a saber, banks it is.
  const [view, setView] = useState<'saber' | 'banks'>(() => { try { return localStorage.getItem('hiltwright.presets.view') === 'banks' ? 'banks' : 'saber'; } catch { return 'saber'; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.presets.view', view); } catch { /* private mode */ } }, [view]);
  const current = info && info.currentPreset != null ? info.presets[info.currentPreset] : null;
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [side, setSide] = useState<'try' | 'history'>('try');
  useEffect(() => { setName(current?.name ?? ''); setConfirmDelete(false); }, [current?.name, info?.currentPreset]);

  const switcher = (
    <div className="seg" role="tablist" aria-label="Presets view" style={{ alignSelf: 'flex-start', height: 34 }}>
      <button type="button" role="tab" aria-selected={view === 'saber'} className={view === 'saber' ? 'on' : ''} onClick={() => setView('saber')}><Icon name="usb" />On the saber{connected && info ? ` · ${info.presets.length}` : ''}</button>
      <button type="button" role="tab" aria-selected={view === 'banks'} className={view === 'banks' ? 'on' : ''} onClick={() => setView('banks')}><Icon name="presets" />Preset banks</button>
    </div>
  );
  if (!connected || !info) {
    return (
      <>
        <div className="note"><Icon name="info" /><span>No saber is connected, so this is the preset banks: presets built here, loaded onto a saber later. A saber's own presets appear here when it is plugged in.</span></div>
        <Banks board={board} onLooks={onLooks} onBuild={onBuild} />
      </>
    );
  }
  if (view === 'banks') return <>{switcher}<Banks board={board} onLooks={onLooks} onBuild={onBuild} /></>;

  const idx = info.currentPreset ?? 0;
  const fontFolders = [...new Set([...info.fonts.filter((f) => f !== 'common'), ...(current ? [splitFont(current.font).folder] : [])])];
  const trackChoices = [...new Set(['', ...info.tracks, ...(current ? [current.track] : [])])];
  const cf = current ? splitFont(current.font) : { folder: '', common: true };


  return (
    <>
      {switcher}
      <div className="work" style={{ gridTemplateColumns: 'minmax(220px,280px) minmax(0,1fr) minmax(260px,320px)' }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset list">
          <div className="ph"><h2>Presets · {info.presets.length}</h2>
            <div className="row" style={{ gap: 4 }}>
              <button type="button" className="chip" disabled={busy || idx <= 0} aria-label="Move preset up" title="Move up" onClick={() => void board.movePreset(idx - 1)}><Icon name="up" /></button>
              <button type="button" className="chip" disabled={busy || idx >= info.presets.length - 1} aria-label="Move preset down" title="Move down" onClick={() => void board.movePreset(idx + 1)}><Icon name="down" /></button>
            </div>
          </div>
          <div className="list" role="listbox" aria-label="Presets on the saber" style={{ overflow: 'auto' }}>
            {info.presets.map((p, i) => (
              <button key={i} type="button" role="option" aria-selected={i === idx} className={`li click ${i === idx ? 'on' : ''}`} disabled={busy} onClick={() => void board.choosePreset(i)}>
                <span className="n">{i + 1}</span>
                <span className="col grow" style={{ gap: 0 }}><span className="ellip" style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name.replace(/\s*\n\s*/g, ' ')}</span><span className="hint ellip">{splitFont(p.font).folder}</span></span>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--line)', gap: 6 }}>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void board.duplicatePreset()}><span className="b"><span className="i"><Icon name="copy" />Duplicate</span></span></button>
            {confirmDelete
              ? <button type="button" className="btn sm danger" disabled={busy || info.presets.length <= 1} onClick={() => { setConfirmDelete(false); void board.deletePreset(); }}><span className="b"><span className="i"><Icon name="trash" />Really delete</span></span></button>
              : <button type="button" className="btn sm ghost" disabled={busy || info.presets.length <= 1} onClick={() => setConfirmDelete(true)}><span className="b"><span className="i"><Icon name="trash" />Delete</span></span></button>}
          </div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset editor">
          <div className="ph"><h2 className="ellip" style={{ minWidth: 0 }}>{current ? current.name.replace('\n', ' ') : 'No preset'}</h2>
            <div className="row" style={{ gap: 8 }}>
              <SaveChip save={save} />
              <button type="button" className="btn sm" disabled={busy || snapshots.length === 0} title="Put back the values from before the last change" onClick={() => void board.restoreSnapshot(snapshots[0])}><span className="b"><span className="i"><Icon name="undo" />Undo</span></span></button>
            </div>
          </div>
          {current && (
            <div className="pb col" style={{ gap: 16, overflowY: 'auto', overflowX: 'hidden' }}>
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
                <label className="row" style={{ gap: 10, alignSelf: 'end', minHeight: 38, fontSize: 13, color: 'var(--dim)' }}>
                  <button type="button" className={`tog ${cf.common ? 'on' : ''}`} role="switch" aria-checked={cf.common} disabled={busy} aria-label="Also use the common folder" onClick={() => void board.editPreset({ font: joinFont(cf.folder, !cf.common) }, cf.common ? 'Drop common fallback' : 'Add common fallback')}><i /></button>
                  Also use <span className="mono">common</span> sounds
                </label>
              </form>

              <LookRows board={board} current={current} onLooks={onLooks} />

              <div className="row" style={{ gap: 16 }}>
                <span className="label">Variation</span><span className="mono small">{current.variation}</span>
                <span className="hint">Colour-change value the saber saved.</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel fill" aria-label="Try it and history">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={side === 'try'} className={side === 'try' ? 'on' : ''} onClick={() => setSide('try')}><Icon name="bolt" />Try it</button>
            <button type="button" role="tab" aria-selected={side === 'history'} className={side === 'history' ? 'on' : ''} onClick={() => setSide('history')}><Icon name="clock" />History<span className="count">{snapshots.length}</span></button>
          </div>
          {side === 'try' && <SaberControls board={board} bare />}
          {side === 'history' && <>
          <div className="list" style={{ overflow: 'auto' }}>
            {snapshots.length === 0 && <div className="li hint" style={{ minHeight: 40 }}>No snapshots yet.</div>}
            {snapshots.map((s, i) => (
              <div key={s.file} className="li" style={{ minHeight: 44, gap: 8 }}>
                <span className="col grow" style={{ gap: 0 }}><span className="ellip small">{s.label}</span><span className="hint mono" style={{ fontSize: 11 }}>{when(s.at)} · {s.presets} presets</span></span>
                <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy} onClick={() => void board.restoreSnapshot(s)}>{i === 0 ? 'Undo' : 'Restore'}</button>
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>A snapshot of the saber's presets is kept before every change. Restore sends the earlier values back and waits for the saber to confirm them.</div>
          </>}
        </section>
      </div>
    </>
  );
}

function SaveChip({ save }: { save: Board['save'] }) {
  switch (save.kind) {
    case 'writing': return <span className="chip warn"><span className="dot" />Writing {save.what}…</span>;
    case 'saved': return <span className="chip ok"><Icon name="check" />Saved, {save.what}</span>;
    case 'failed': return <span className="chip err"><Icon name="x" />{save.what} failed: {save.error}</span>;
    default: return <span className="chip"><span className="dot" />No changes yet</span>;
  }
}

export type { PresetRecord };
