import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { lookAtSlot, parseBuiltin } from '@hiltwright/core';
import { useBoard } from './board';
import { Icon, Mark } from './Icon';
import { Presets } from './Presets';
import { Fonts } from './Fonts';
import { Build } from './Build';
import { Looks } from './Looks';
import { ErrorBoundary } from './ErrorBoundary';
import { SaberControls } from './Controls';
import { infoFromRecord, queuedLookIds } from './saberModel';
import { usePendingLookColours } from './pendingColours';

// three.js is only needed in the demo room, so it loads when that page is first opened.
const Demo = lazy(() => import('./Demo').then((m) => ({ default: m.Demo })));

type Page = 'armory' | 'presets' | 'looks' | 'demo' | 'fonts' | 'build' | 'diag';
const PAGES: { id: Page; title: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'armory', title: 'Armory', icon: 'armory' }, { id: 'presets', title: 'Presets', icon: 'presets' }, { id: 'looks', title: 'Looks', icon: 'looks' }, { id: 'demo', title: 'Demo room', icon: 'play' },
  { id: 'fonts', title: 'Fonts & SD', icon: 'fonts' }, { id: 'build', title: 'Build & Install', icon: 'build' }, { id: 'diag', title: 'Diagnostics', icon: 'diag' },
];

export function App() {
  const real = useBoard();
  usePendingLookColours(real);
  // Dev aid: hiltwrightGoto('fake:presets') shows the connected pages from the remembered saber, with no board, for
  // layout screenshots. Nothing is sent anywhere; never available in a packaged app.
  const [fake, setFake] = useState(false);
  const lib0 = real.library[0];
  const board: typeof real = fake && import.meta.env.DEV && lib0 ? { ...real, status: 'connected', portName: 'FAKE', saber: lib0, info: { ...infoFromRecord(lib0), currentPreset: 0, battery: 3.91, volume: 1800 } } : real;
  const [page, setPage] = useState<Page>('armory');
  const [demoLook, setDemoLook] = useState<string | null>(null);
  const { status, info } = board;
  const connected = status === 'connected';
  const configName = info?.version?.config?.replace(/^config\//, '').replace(/\.h$/, '') ?? null;
  // Dev aid: lets main switch pages for screenshots.
  useEffect(() => { (window as unknown as { hiltwrightGoto?: (p: string) => void }).hiltwrightGoto = (p) => { setFake(p.startsWith('fake:')); setPage(p.replace('fake:', '') as Page); }; }, []);
  // Ctrl+1..7 switch pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!e.ctrlKey || e.altKey || e.shiftKey) return; const p = PAGES[Number(e.key) - 1]; if (p) { e.preventDefault(); setPage(p.id); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const known = board.saber ?? board.library[0] ?? null;
  const queued = queuedLookIds(known?.model ?? undefined, known?.firmware).length;

  return (
    <div className="app">
      <aside className="side" aria-label="Primary">
        <div className="brand"><Mark /><span>HILTWRIGHT</span></div>
        <nav className="nav" aria-label="Sections">
          {PAGES.map((p, i) => (
            <a key={p.id} href="#" className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} title={`Ctrl+${i + 1}`} onClick={(e) => { e.preventDefault(); setPage(p.id); }}>
              <Icon name={p.icon} /><span>{p.title}</span>
              {p.id === 'presets' && <span className="tier">live</span>}
              {p.id === 'build' && (queued > 0 ? <span className="badge" title="Looks waiting for a build">{queued} queued</span> : null)}
            </a>
          ))}
        </nav>
        <div className="mono mute" style={{ marginTop: 'auto', padding: '14px 20px', borderTop: '1px solid var(--line)', fontSize: 11 }}>Hiltwright {window.hiltwright?.appVersion ?? '?'} alpha</div>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 0, minWidth: 0 }}>
          <h1>{PAGES.find((p) => p.id === page)?.title}</h1>
          <div className="ident">
            <b className="ellip">{known?.name ?? configName ?? 'No saber yet'}</b>
            <span className="hint ellip">{info?.version ? `ProffieOS ${info.version.version}, ${info.version.prop ?? 'unknown prop'}, ${info.presets.length} presets` : known ? 'not plugged in' : 'plug one in over a data cable'}</span>
          </div>
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
        <ErrorBoundary key={page} what={`the ${page === 'diag' ? 'Diagnostics' : page === 'build' ? 'Build & Install' : page === 'fonts' ? 'Fonts & SD' : page === 'demo' ? 'Demo room' : page[0].toUpperCase() + page.slice(1)} page`}>{page === 'armory' ? <Armory board={board} configName={configName} onPresets={() => setPage('presets')} go={setPage} /> : page === 'presets' ? <Presets board={board} onLooks={() => setPage('looks')} /> : page === 'looks' ? <Looks board={board} onPresets={() => setPage('presets')} onBuild={() => setPage('build')} onDemo={(id) => { setDemoLook(id); setPage('demo'); }} /> : page === 'demo' ? <Suspense fallback={<span className="hint">Opening the demo room…</span>}><Demo initialLook={demoLook} /></Suspense> : page === 'fonts' ? <Fonts board={board} /> : page === 'build' ? <Build board={board} /> : <Diagnostics board={board} />}</ErrorBoundary>
      </main>

    </div>
  );
}

function Library({ board, go }: { board: ReturnType<typeof useBoard>; go: (p: Page) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const others = board.library.filter((s) => s.id !== board.saber?.id);
  return (
    <section className="panel" aria-label="Your sabers">
      <div className="ph"><h2>Remembered sabers</h2><span className="hint">{board.saber ? 'kept on this computer' : 'Looks and builds can be prepared for the most recent one while it is unplugged.'}</span></div>
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
                  <span className="col grow" style={{ gap: 0 }} title={`${board.saber.identity.configName ?? '?'}, USB serial ${board.saber.identity.usbSerial ?? 'unknown'}`}><b className="ellip" style={{ fontWeight: 600 }}>{board.saber.name}</b><span className="hint ellip">{board.saber.identity.pixelBlades.length ? `${board.saber.identity.pixelBlades.join(' + ')} px` : 'blades unknown'}, first seen {new Date(board.saber.firstSeen).toLocaleDateString()}</span></span>
                  <span className="green small nowrap">plugged in</span>
                  <button type="button" className="btn sm ghost" onClick={() => { setDraft(board.saber!.name); setEditing(true); }}><span className="b"><span className="i">Rename</span></span></button>
                </>}
          </div>
        )}
        {others.map((s) => (
          <div key={s.id} className="li" style={{ gap: 14, minHeight: 48 }}>
            <span style={{ color: 'var(--mute)', display: 'flex', width: 18 }}><Icon name="blade" /></span>
            <span className="col grow" style={{ gap: 0 }}><b style={{ fontWeight: 600 }}>{s.name}</b><span className="hint">{s.identity.configName ?? '?'} · {s.presets.length} presets · last seen {new Date(s.lastSeen).toLocaleString()}</span></span>
            {s.id === board.library[0]?.id && !board.saber
              ? <><button type="button" className="btn sm" onClick={() => go('looks')}><span className="b"><span className="i"><Icon name="looks" />Choose looks</span></span></button><button type="button" className="btn sm" onClick={() => go('build')}><span className="b"><span className="i"><Icon name="build" />Prepare a build</span></span></button></>
              : <span className="chip"><span className="dot" />Not plugged in</span>}
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

function Armory({ board, configName, onPresets, go }: { board: ReturnType<typeof useBoard>; configName: string | null; onPresets: () => void; go: (p: Page) => void }) {
  const { status, info, error } = board;
  if (status !== 'connected' || !info) {
    return (
      <>
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
        <Library board={board} go={go} />
      </>
    );
  }
  const v = info.version;
  const manifest = board.saber?.firmware ?? null;
  return (
    <>
      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
      <div className="col" style={{ gap: 16, minHeight: 0, order: 2 }}>
      <section className="panel" aria-label="Connected saber">
        <div className="row" style={{ padding: '16px 18px', gap: 18 }}>
          <span style={{ color: 'var(--holo)', display: 'flex', width: 28, height: 28 }}><Icon name="usb" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{board.saber?.name ?? configName ?? 'Unnamed saber'} is connected</h3>
            <div className="dim small">
              ProffieOS {v?.version ?? '?'}, {v?.prop ?? 'unknown prop'}, {v?.buttons ?? '?'} buttons. Installed {v?.installed ?? '?'}.
            </div>
          </div>
        </div>
        <div className="row wrap" style={{ padding: '0 18px 16px', gap: 8 }}>
          <button type="button" className="btn sm pri" onClick={onPresets}><span className="b"><span className="i"><Icon name="presets" />Edit presets</span></span></button>
          <button type="button" className="btn sm" onClick={() => go('looks')}><span className="b"><span className="i"><Icon name="looks" />Choose looks</span></span></button>
          <button type="button" className="btn sm" onClick={() => go('build')}><span className="b"><span className="i"><Icon name="build" />Build &amp; install</span></span></button>
          <button type="button" className="btn sm ghost" onClick={() => void board.identify()}><span className="b"><span className="i"><Icon name="undo" />Read again</span></span></button>
        </div>
        {info.rejected.length > 0 && (
          <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="warn" /><span>This firmware does not know {info.rejected.join(', ')}. Hiltwright adapts to what the board supports.</span></div>
        )}
      </section>

      <Library board={board} go={go} />
      </div>

      <section className="panel fill" aria-label="Presets on the saber" style={{ order: 1 }}>
        <div className="ph"><h2>Presets · {info.presets.length}</h2><span className="hint">preset {info.currentPreset != null ? info.currentPreset + 1 : '?'} is selected on the saber</span></div>
        <div className="scroll"><table>
          <thead><tr><th>#</th><th>Name</th><th>Font</th><th>Track</th><th>Looks</th></tr></thead>
          <tbody>
            {info.presets.map((p, i) => (
              <tr key={i} className={i === info.currentPreset ? 'on' : ''}>
                <td className="mono mute">{i + 1}</td>
                <td className="nowrap" style={{ fontWeight: 600 }}>{p.name.replace(/\s*\n\s*/g, ' ')}</td>
                <td className="small nowrap">{p.font.split(';')[0]}</td>
                <td className="small nowrap" title={p.track}>{p.track ? p.track.split('/').pop() : <span className="mute">none</span>}</td>
                <td className="small dim nowrap">{p.styles.map((st) => { const b = parseBuiltin(st); const look = b && manifest ? lookAtSlot(manifest, b.preset, b.blade) : null; return look ? look.name.replace(/^Hiltwright /, '') : b ? `${b.preset + 1}.${b.blade}` : st; }).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      </div>
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
      <div className="work" style={{ gridTemplateColumns: '380px minmax(0,1fr)' }}>
      <SaberControls board={board} />
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
      </div>
    </>
  );
}
