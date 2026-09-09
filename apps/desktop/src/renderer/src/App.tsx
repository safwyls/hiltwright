import { useEffect, useRef, useState } from 'react';
import { parseBuiltin } from '@hiltwright/core';
import { useBoard } from './board';
import { Icon, Mark } from './Icon';
import { Presets } from './Presets';
import { Fonts } from './Fonts';

type Page = 'armory' | 'presets' | 'fonts' | 'diag';

export function App() {
  const board = useBoard();
  const [page, setPage] = useState<Page>('armory');
  const { status, info } = board;
  const connected = status === 'connected';
  const configName = info?.version?.config?.replace(/^config\//, '').replace(/\.h$/, '') ?? null;
  // Dev aid: lets main switch pages for screenshots.
  useEffect(() => { (window as unknown as { hiltwrightGoto?: (p: Page) => void }).hiltwrightGoto = setPage; }, []);

  return (
    <div className="app">
      <aside className="side" aria-label="Primary">
        <div className="brand"><Mark /><span>HILTWRIGHT</span></div>
        <nav className="nav" aria-label="Sections">
          <div className="sec">Saber</div>
          <a href="#" className={page === 'armory' ? 'on' : ''} aria-current={page === 'armory' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setPage('armory'); }}><Icon name="armory" /><span>Armory</span></a>
          <a href="#" className={page === 'presets' ? 'on' : ''} aria-current={page === 'presets' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setPage('presets'); }}><Icon name="presets" /><span>Presets</span><span className="tier">live</span></a>
          <a href="#" className="dis"><Icon name="looks" /><span>Looks</span></a>
          <a href="#" className={page === 'fonts' ? 'on' : ''} aria-current={page === 'fonts' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setPage('fonts'); }}><Icon name="fonts" /><span>Fonts &amp; SD</span></a>
          <a href="#" className="dis"><Icon name="build" /><span>Build &amp; Install</span></a>
          <a href="#" className={page === 'diag' ? 'on' : ''} aria-current={page === 'diag' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setPage('diag'); }}><Icon name="diag" /><span>Diagnostics</span></a>
        </nav>
        <div className="col" style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--line)', gap: 4 }}>
          <div className="eyebrow" style={{ opacity: 0.6 }}>Walking skeleton</div>
          <div className="mono mute" style={{ fontSize: 11.5 }}>Hiltwright {window.hiltwright?.appVersion ?? '?'} · {window.hiltwright?.platform ?? '?'}</div>
          <div className="hint" style={{ fontSize: 11 }}>Real board over Web Serial. Preset edits are live. No toolchain yet.</div>
        </div>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 14 }}>
          <span className="input sans" style={{ height: 36, minWidth: 300, fontWeight: 600 }}>
            <span style={{ display: 'flex', width: 16 }}><Mark /></span>
            <span className="ellip">{configName ?? 'No saber'}</span>
            {info?.version && <span className="mute" style={{ fontWeight: 400 }}>· ProffieOS {info.version.version}</span>}
          </span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <StatusChip status={status} port={board.portName} />
          <span className="chip"><Icon name="battery" />{info?.battery != null ? `${info.battery.toFixed(2)} V` : '—'}</span>
          {connected
            ? <button type="button" className="btn sm" onClick={() => void board.disconnect()}><span className="b"><span className="i">Disconnect</span></span></button>
            : <button type="button" className="btn sm pri" onClick={() => void board.connect(true)} disabled={status === 'connecting' || status === 'reading'}><span className="b"><span className="i"><Icon name="usb" />Connect</span></span></button>}
        </div>
      </header>

      <main className="main">
        {page === 'armory' ? <Armory board={board} configName={configName} onPresets={() => setPage('presets')} /> : page === 'presets' ? <Presets board={board} /> : page === 'fonts' ? <Fonts /> : <Diagnostics board={board} />}
      </main>

      <footer className="status" aria-label="Board status">
        <span><b>Board</b> {board.portName ? `USB ${board.portName}` : 'not connected'}</span>
        <span><b>Firmware</b> {info?.version ? `${info.version.version} · ${info.version.config ?? '?'} · installed ${info.version.installed ?? '?'}` : '—'}</span>
        <span><b>Prop</b> {info?.version?.prop ?? '—'}{info?.version?.buttons != null ? ` · ${info.version.buttons} buttons` : ''}</span>
        <span style={{ marginLeft: 'auto' }}><b>Volume</b> {info?.volume ?? '—'}</span>
      </footer>
    </div>
  );
}

function Library({ board }: { board: ReturnType<typeof useBoard> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const others = board.library.filter((s) => s.id !== board.saber?.id);
  return (
    <section className="panel" aria-label="Your sabers">
      <div className="ph"><h2>Library · {board.library.length}</h2><span className="hint">remembered on this computer</span></div>
      <div className="list">
        {board.saber && (
          <div className="li" style={{ gap: 14, minHeight: 48 }}>
            <span style={{ color: 'var(--holo)', display: 'flex', width: 18 }}><Icon name="usb" /></span>
            {editing
              ? <form className="row grow" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void board.renameSaber(draft); setEditing(false); }}>
                  <span className="input sans grow" style={{ height: 32 }}><input type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Saber name" /></span>
                  <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
                  <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}><span className="b"><span className="i">Cancel</span></span></button>
                </form>
              : <>
                  <span className="col grow" style={{ gap: 0 }}><b style={{ fontWeight: 600 }}>{board.saber.name}</b><span className="hint">{board.saber.identity.configName ?? '?'} · {board.saber.identity.pixelBlades.length ? `${board.saber.identity.pixelBlades.join(' + ')} px` : 'blades unknown'} · serial {board.saber.identity.usbSerial ?? 'unknown'} · first seen {new Date(board.saber.firstSeen).toLocaleDateString()}</span></span>
                  <span className="chip live"><span className="dot" />Connected</span>
                  <button type="button" className="btn sm ghost" onClick={() => { setDraft(board.saber!.name); setEditing(true); }}><span className="b"><span className="i">Rename</span></span></button>
                </>}
          </div>
        )}
        {others.map((s) => (
          <div key={s.id} className="li" style={{ gap: 14, minHeight: 48 }}>
            <span style={{ color: 'var(--mute)', display: 'flex', width: 18 }}><Icon name="blade" /></span>
            <span className="col grow" style={{ gap: 0 }}><b style={{ fontWeight: 600 }}>{s.name}</b><span className="hint">{s.identity.configName ?? '?'} · {s.presets.length} presets · last seen {new Date(s.lastSeen).toLocaleString()}</span></span>
            <span className="chip"><span className="dot" />Not connected</span>
          </div>
        ))}
        {board.library.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>No sabers remembered yet. Plug one in and it will be added.</div>}
      </div>
    </section>
  );
}

function StatusChip({ status, port }: { status: ReturnType<typeof useBoard>['status']; port: string | null }) {
  switch (status) {
    case 'connected': return <span className="chip live"><span className="dot" />Connected · {port}</span>;
    case 'connecting': return <span className="chip warn"><span className="dot" />Opening port…</span>;
    case 'reading': return <span className="chip warn"><span className="dot" />Reading the saber…</span>;
    case 'error': return <span className="chip err"><Icon name="x" />Error</span>;
    case 'no-port': return <span className="chip"><span className="dot" />No saber found</span>;
    default: return <span className="chip"><span className="dot" />Not connected</span>;
  }
}

function Armory({ board, configName, onPresets }: { board: ReturnType<typeof useBoard>; configName: string | null; onPresets: () => void }) {
  const { status, info, error } = board;
  if (status !== 'connected' || !info) {
    return (
      <>
        <div className="page-head"><div><div className="eyebrow">Armory</div><h1>Your sabers</h1></div></div>
        <section className="panel">
          <div className="row" style={{ padding: '18px', gap: 18 }}>
            <span style={{ color: 'var(--holo)', display: 'flex', width: 28, height: 28 }}><Icon name="usb" /></span>
            <div className="col grow" style={{ gap: 4 }}>
              <h3>{status === 'connecting' ? 'Opening the port…' : status === 'reading' ? 'Reading the saber…' : status === 'error' ? 'Something went wrong' : 'Plug in a saber'}</h3>
              <div className="dim small">{error ?? (status === 'no-port' ? 'No Proffieboard is granted to this app yet. Plug one in over a data cable and press Connect.' : 'Looking for a Proffieboard on USB. The first read takes about a second.')}</div>
            </div>
            {(status === 'no-port' || status === 'error' || status === 'idle') && <button type="button" className="btn pri" onClick={() => void board.connect(true)}><span className="b"><span className="i"><Icon name="usb" />Connect</span></span></button>}
          </div>
        </section>
      </>
    );
  }
  const v = info.version;
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Armory</div><h1>Your sabers</h1></div>
        <button type="button" className="btn" onClick={() => void board.identify()}><span className="b"><span className="i"><Icon name="undo" />Read again</span></span></button>
      </div>

      <section className="panel" aria-label="Connected saber">
        <div className="row" style={{ padding: '16px 18px', gap: 18 }}>
          <span style={{ color: 'var(--holo)', display: 'flex', width: 28, height: 28 }}><Icon name="usb" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{board.saber?.name ?? configName ?? 'Unnamed saber'} is connected</h3>
            <div className="dim small">
              ProffieOS {v?.version ?? '?'} · {v?.prop ?? 'unknown prop'} · {v?.buttons ?? '?'} buttons · {info.presets.length} presets · current preset {info.currentPreset != null ? info.currentPreset + 1 : '?'} · installed {v?.installed ?? '?'}
            </div>
          </div>
          <span className="chip live"><span className="dot" />Live</span>
          <button type="button" className="btn sm pri" onClick={onPresets}><span className="b"><span className="i"><Icon name="presets" />Edit presets</span></span></button>
        </div>
        {info.rejected.length > 0 && (
          <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="warn" /><span>This firmware does not know {info.rejected.join(', ')}. Hiltwright adapts to what the board supports.</span></div>
        )}
      </section>

      <Library board={board} />

      <section className="panel" aria-label="Presets on the saber">
        <div className="ph"><h2>Presets · {info.presets.length}</h2><span className="mono dim" style={{ fontSize: 12 }}>list_presets in {info.timings['list_presets'] ?? '?'} ms</span></div>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Font</th><th>Track</th><th>Looks</th><th>Variation</th></tr></thead>
          <tbody>
            {info.presets.map((p, i) => (
              <tr key={i} className={i === info.currentPreset ? 'on' : ''}>
                <td className="mono mute">{i + 1}</td>
                <td style={{ fontWeight: 600, whiteSpace: 'pre-line' }}>{p.name}</td>
                <td className="mono small">{p.font}</td>
                <td className="mono small">{p.track || <span className="mute">none</span>}</td>
                <td className="mono small">{p.styles.map((s, k) => { const b = parseBuiltin(s); return <span key={k} className="chip" style={{ marginRight: 4 }}>{b ? `${b.preset}.${b.blade}${b.args ? ' +args' : ''}` : s}</span>; })}</td>
                <td className="mono small">{p.variation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Diagnostics({ board }: { board: ReturnType<typeof useBoard> }) {
  const [cmd, setCmd] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [board.lines]);
  const quick = ['version', 'battery', 'get_volume', 'get_preset', 'show_current_preset', 'list_fonts', 'list_tracks', 'id', 'scanid'];
  const connected = board.status === 'connected';
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Diagnostics</div><h1>Serial console</h1></div></div>
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="ph"><h2>Console</h2><div className="row wrap" style={{ gap: 6 }}>{quick.map((q) => <button key={q} type="button" className="chip" disabled={!connected} onClick={() => void board.send(q, q === 'show_current_preset' ? { until: board.isPresetBlockEnd } : { idleMs: 700 })}>{q}</button>)}</div></div>
        <div className="console grow" style={{ border: 0, minHeight: 0 }}>
          {board.lines.length === 0 && <span className="mute">Connect a saber, then type a command. Events the board prints on its own show in amber.</span>}
          {board.lines.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
          <div ref={end} />
        </div>
        <form className="row" style={{ padding: 12, borderTop: '1px solid var(--line)', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) { void board.send(cmd.trim(), { idleMs: 700 }); setCmd(''); } }}>
          <span className="input grow"><input type="text" value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Serial command" placeholder="Type a command" disabled={!connected} /></span>
          <button type="submit" className="btn sm pri" disabled={!connected}><span className="b"><span className="i">Send</span></span></button>
        </form>
      </section>
    </>
  );
}
