// The shell, and the flow through it. One saber at a time is being worked on (the plugged-in one, or the one chosen
// in the Armory); the steps down the left take it from wiring to an installed board. Looks are made and tried in
// the Workshop, off to the side, and picked from the Presets step.

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { registerLookSim, type LookDef } from '@hiltwright/core';
import { useBoard } from './board';
import { Icon, Mark } from './Icon';
import { Presets } from './Presets';
import { Fonts } from './Fonts';
import { Build } from './Build';
import { Looks } from './Looks';
import { Wiring } from './Wiring';
import { ErrorBoundary } from './ErrorBoundary';
import { SaberControls } from './Controls';
import { guessBlades, infoFromRecord, queuedLookIds } from './saberModel';
import { usePendingLookColours } from './pendingColours';
import { StyleEditor } from './StyleEditor';
import { flowStatus, nextStep, useWorkspace, type Workspace } from './workspace';
// three.js is only needed in the demo room, so it loads when that page is first opened.
const Demo = lazy(() => import('./Demo').then((m) => ({ default: m.Demo })));

type Page = 'armory' | 'wiring' | 'presets' | 'fonts' | 'build' | 'looks' | 'editor' | 'demo' | 'diag';
const NAV: { section: string; pages: { id: Page; title: string; icon: Parameters<typeof Icon>[0]['name']; step?: number }[] }[] = [
  { section: 'Saber', pages: [
    { id: 'armory', title: 'Armory', icon: 'armory' },
    { id: 'wiring', title: 'Wiring', icon: 'blade', step: 1 },
    { id: 'presets', title: 'Presets', icon: 'presets', step: 2 },
    { id: 'fonts', title: 'Fonts & SD', icon: 'fonts', step: 3 },
    { id: 'build', title: 'Build & Install', icon: 'build', step: 4 },
  ] },
  { section: 'Workshop', pages: [
    { id: 'looks', title: 'Looks', icon: 'looks' },
    { id: 'editor', title: 'Style editor', icon: 'gear' },
    { id: 'demo', title: 'Demo room', icon: 'play' },
  ] },
  { section: 'Tools', pages: [{ id: 'diag', title: 'Diagnostics', icon: 'diag' }] },
];
const PAGES = NAV.flatMap((g) => g.pages);
const TITLE: Record<Page, string> = { armory: 'Armory', wiring: 'Wiring', presets: 'Presets', fonts: 'Fonts & SD', build: 'Build & Install', looks: 'Looks', editor: 'Style editor', demo: 'Demo room', diag: 'Diagnostics' };

export function App() {
  const real = useBoard();
  usePendingLookColours(real);
  // Dev aid: hiltwrightGoto('fake:presets') shows the connected pages from the remembered saber, with no board, for
  // layout screenshots. Nothing is sent anywhere; never available in a packaged app.
  const [fake, setFake] = useState(false);
  const lib0 = real.library[0];
  const board: typeof real = fake && import.meta.env.DEV && lib0 ? { ...real, status: 'connected', portName: 'FAKE', saber: lib0, info: { ...infoFromRecord(lib0), currentPreset: 0, battery: 3.91, volume: 1800 } } : real;
  const ws = useWorkspace(board);
  const [page, setPage] = useState<Page>('armory');
  const [demoLook, setDemoLook] = useState<string | null>(null);
  const [editingLook, setEditingLook] = useState<LookDef | null>(null);
  // Saved looks get a simulator at startup (built ones from their layers, pasted ones from their code), so they preview like library looks.
  useEffect(() => { void window.hiltwright.looks.list().then((ls) => { for (const l of ls) registerLookSim(l); }); }, []);
  const { status, info } = board;
  const connected = status === 'connected';
  const configName = info?.version?.config?.replace(/^config\//, '').replace(/\.h$/, '') ?? null;
  // Dev aid: lets main switch pages for screenshots.
  useEffect(() => { (window as unknown as { hiltwrightGoto?: (p: string) => void }).hiltwrightGoto = (p) => { setFake(p.startsWith('fake:')); setPage(p.replace('fake:', '') as Page); }; }, []);
  // Ctrl+1..9 switch pages, in the order shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!e.ctrlKey || e.altKey || e.shiftKey) return; const p = PAGES[Number(e.key) - 1]; if (p) { e.preventDefault(); setPage(p.id); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const queued = queuedLookIds(ws.model ?? undefined, ws.saber?.firmware).length;
  const go = (p: Page) => setPage(p);

  return (
    <div className="app">
      <aside className="side" aria-label="Primary">
        <div className="brand"><Mark /><span>HILTWRIGHT</span></div>
        <nav className="nav" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.section} className="col" style={{ gap: 2 }}>
              <span className="sec">{g.section}</span>
              {g.pages.map((p) => (
                <a key={p.id} href="#" className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} title={`Ctrl+${PAGES.indexOf(p) + 1}`} onClick={(e) => { e.preventDefault(); setPage(p.id); }}>
                  {p.step ? <span className="stepn">{p.step}</span> : <Icon name={p.icon} />}<span>{p.title}</span>
                  {p.id === 'presets' && ws.live && !ws.model?.presetsFrom && <span className="tier">live</span>}
                  {p.id === 'build' && (queued > 0 ? <span className="badge" title="Looks waiting for a build">{queued} queued</span> : null)}
                </a>
              ))}
            </div>
          ))}
        </nav>
        {ws.saber && <div className="col" style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', gap: 2 }}><span className="sec" style={{ padding: 0 }}>Working on</span><b className="ellip" style={{ fontWeight: 600, fontSize: 13 }}>{ws.saber.name}</b><span className="hint">{ws.live ? 'plugged in' : ws.saber.planned ? 'planned, not seen yet' : 'not plugged in'}</span></div>}
        <div className="mono mute" style={{ marginTop: 'auto', padding: '14px 20px', borderTop: '1px solid var(--line)', fontSize: 11 }}>Hiltwright {window.hiltwright?.appVersion ?? '?'} alpha</div>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 0, minWidth: 0 }}>
          <h1>{TITLE[page]}</h1>
          <div className="ident">
            <b className="ellip">{ws.saber?.name ?? configName ?? 'No saber yet'}</b>
            <span className="hint ellip">{info?.version ? `ProffieOS ${info.version.version}, ${info.version.prop ?? 'unknown prop'}, ${info.presets.length} presets` : ws.saber ? (ws.saber.planned ? 'planned ahead' : 'not plugged in') : 'plug one in, or plan one in the Armory'}</span>
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
        <ErrorBoundary key={page} what={`the ${TITLE[page]} page`}>
          {page === 'armory' ? <Armory board={board} ws={ws} go={go} />
            : page === 'wiring' ? <Wiring ws={ws} board={board} go={go} />
            : page === 'presets' ? <Presets ws={ws} board={board} go={go} />
            : page === 'fonts' ? <Fonts board={board} />
            : page === 'build' ? <Build ws={ws} board={board} go={go} />
            : page === 'looks' ? <Looks ws={ws} board={board} onPresets={() => setPage('presets')} onBuild={() => setPage('build')} onDemo={(id) => { setDemoLook(id); setPage('demo'); }} onEdit={(l) => { setEditingLook(l); setPage('editor'); }} onNew={() => { setEditingLook(null); setPage('editor'); }} />
            : page === 'editor' ? <StyleEditor key={editingLook?.id ?? 'new'} editing={editingLook} onSaved={() => undefined} onDemo={(id) => { setDemoLook(id); setPage('demo'); }} />
            : page === 'demo' ? <Suspense fallback={<span className="hint">Opening the demo room…</span>}><Demo initialLook={demoLook} board={board} /></Suspense>
            : <Diagnostics board={board} />}
        </ErrorBoundary>
      </main>
    </div>
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

/** The Armory: the sabers this computer knows, which one is being worked on, and how far along it is. */
function Armory({ board, ws, go }: { board: ReturnType<typeof useBoard>; ws: Workspace; go: (p: Page) => void }) {
  const { status, error } = board;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planName, setPlanName] = useState('');
  const plan = async () => {
    const name = planName.trim() || `Saber ${board.library.length + 1}`;
    const rec = await board.planSaber(name, { name: `hiltwright_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'saber'}`, board: 'V2', buttons: 2, prop: 'fett263', blades: guessBlades([132]), presets: [], looks: [], generator: `hiltwright ${window.hiltwright.appVersion}` });
    setPlanning(false); setPlanName('');
    ws.choose(rec.id); go('wiring');
  };
  const steps = flowStatus(ws);
  const next = nextStep(ws);
  const stepPage: Record<string, Page> = { wiring: 'wiring', presets: 'presets', fonts: 'fonts', build: 'build' };
  const stepTitle: Record<string, string> = { wiring: 'Wiring', presets: 'Presets', fonts: 'Fonts & SD', build: 'Build & Install' };
  const cur = ws.saber;
  const plans = ws.plans;
  const adoptable = ws.live && cur && !cur.firmware && !cur.planned && plans.length > 0;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
      <div className="col" style={{ gap: 16, minHeight: 0 }}>
        <section className="panel" aria-label="Connection">
          <div className="row" style={{ padding: '16px 18px', gap: 18 }}>
            <span style={{ color: ws.live ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 28, height: 28 }}><Icon name="usb" /></span>
            <div className="col grow" style={{ gap: 3 }}>
              <h3>{ws.live ? `${cur?.name ?? 'A saber'} is plugged in` : status === 'connecting' ? 'Opening the port…' : status === 'reading' ? 'Reading the saber…' : status === 'error' ? 'Something went wrong' : 'Nothing plugged in'}</h3>
              <div className="dim small">{ws.live && board.info?.version ? `ProffieOS ${board.info.version.version}, ${board.info.version.prop ?? 'unknown prop'}, ${board.info.version.buttons ?? '?'} buttons. Installed ${board.info.version.installed ?? '?'}.` : error ?? (status === 'no-port' ? 'No Proffieboard is granted to this app yet. Plug one in over a data cable and press Connect. Or set a saber up ahead and install when it arrives.' : 'Plug a saber in over a data cable and press Connect, or work on a remembered one below.')}</div>
            </div>
            {!ws.live && (status === 'no-port' || status === 'error' || status === 'idle') && <button type="button" className="btn pri" onClick={() => void board.connect(true)}><span className="b"><span className="i"><Icon name="usb" />Connect</span></span></button>}
            {ws.live && <button type="button" className="btn sm ghost" onClick={() => void board.identify()}><span className="b"><span className="i"><Icon name="undo" />Read again</span></span></button>}
          </div>
          {ws.live && board.info && board.info.rejected.length > 0 && <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="warn" /><span>This firmware does not know {board.info.rejected.join(', ')}. Hiltwright adapts to what the board supports.</span></div>}
          {adoptable && (
            <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="info" /><span>Is this a saber you set up ahead? {plans.map((p) => <button key={p.id} type="button" className="holo" style={{ marginRight: 10 }} onClick={() => void board.adoptPlan(p.id)}>It is "{p.name}"</button>)}Its wiring, presets and looks move onto this saber, ready to install.</span></div>
          )}
        </section>

        <section className="panel" aria-label="Your sabers" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="ph"><h2>Your sabers</h2>
            {planning
              ? <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void plan(); }}><span className="input sans" style={{ height: 30, width: 200 }}><input type="text" value={planName} autoFocus placeholder="Name the saber" aria-label="Name for the new saber" onChange={(e) => setPlanName(e.target.value)} /></span><button type="submit" className="btn sm pri"><span className="b"><span className="i">Start</span></span></button><button type="button" className="chip" onClick={() => setPlanning(false)}><Icon name="x" /></button></form>
              : <button type="button" className="btn sm pri" title="Set a saber up before it is plugged in: wiring, presets and looks, ready to install when it arrives" onClick={() => setPlanning(true)}><span className="b"><span className="i"><Icon name="plus" />New saber</span></span></button>}
          </div>
          <div className="list" style={{ overflow: 'auto' }}>
            {board.library.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>No sabers yet. Plug one in and it is remembered, or start a new one to set up ahead.</div>}
            {board.library.map((s) => {
              const isCur = s.id === cur?.id; const plugged = ws.live && isCur;
              return (
                <div key={s.id} className={`li ${isCur ? 'on' : ''}`} style={{ gap: 14, minHeight: 50 }}>
                  <span style={{ color: plugged ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 18 }}><Icon name={plugged ? 'usb' : s.planned ? 'gear' : 'blade'} /></span>
                  {editing && isCur
                    ? <form className="row grow" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void board.renameSaber(draft); setEditing(false); }}>
                        <span className="input sans grow" style={{ height: 32 }}><input type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Saber name" /></span>
                        <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
                        <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}><span className="b"><span className="i">Cancel</span></span></button>
                      </form>
                    : <>
                        <span className="col grow" style={{ gap: 0 }} title={s.identity.configName ? `${s.identity.configName}, USB serial ${s.identity.usbSerial ?? 'unknown'}` : undefined}>
                          <b className="ellip" style={{ fontWeight: 600 }}>{s.name}</b>
                          <span className="hint ellip">{plugged ? 'plugged in' : s.planned ? `set up ahead · ${s.model?.presets.length ?? 0} presets · not seen yet` : `${s.identity.configName ?? '?'} · ${s.presets.length} presets · last seen ${new Date(s.lastSeen).toLocaleDateString()}`}</span>
                        </span>
                        {isCur ? <span className="chip live"><span className="dot" />Working on it</span> : <button type="button" className="btn sm" disabled={ws.live} title={ws.live ? 'Unplug the connected saber to work on another' : undefined} onClick={() => ws.choose(s.id)}><span className="b"><span className="i">Work on it</span></span></button>}
                        {isCur && plugged && <button type="button" className="chip" onClick={() => { setDraft(s.name); setEditing(true); }}>Rename</button>}
                        {s.planned && !isCur && <button type="button" className="chip" title="Drop this plan" aria-label={`Drop the plan ${s.name}`} onClick={() => void window.hiltwright.library.remove(s.id).then(() => board.refreshLibrary())}><Icon name="trash" /></button>}
                      </>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="rail" aria-label="Progress">
        {!cur ? (
          <div className="stepc now"><div className="head"><b>Start here</b></div><span className="small dim">Plug a saber in, or press New saber to set one up ahead. Then the steps down the left take it from wiring to an installed board.</span></div>
        ) : (
          <>
            <div className="row between" style={{ minHeight: 24 }}><b style={{ fontWeight: 600 }} className="ellip">{cur.name}</b><span className="hint">{ws.live ? 'plugged in' : cur.planned ? 'set up ahead' : 'unplugged'}</span></div>
            {steps.map((st, i) => {
              const done = (st.step === 'wiring' && (!!ws.model?.wiringConfirmedAt || !!cur.firmware)) || (st.step === 'presets' && !!ws.model?.presets.length) || (st.step === 'build' && !!cur.firmware && !queuedLookIds(ws.model ?? undefined, cur.firmware).length && !ws.model?.presetsFrom);
              const now = st.step === next;
              return (
                <button key={st.step} type="button" className={`stepc ${done ? 'done' : now ? 'now' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go(stepPage[st.step])}>
                  <div className="head"><span className="nbox">{done ? <Icon name="check" /> : i + 1}</span><b>{stepTitle[st.step]}</b><span className="what">{st.label}</span></div>
                </button>
              );
            })}
            <button type="button" className="btn pri full" onClick={() => go(stepPage[next])}><span className="b"><span className="i"><Icon name="chev" />Continue with {stepTitle[next]}</span></span></button>
            <span className="hint">Looks are chosen on the Presets step; make and try new ones in the Workshop.</span>
          </>
        )}
      </aside>
    </div>
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
