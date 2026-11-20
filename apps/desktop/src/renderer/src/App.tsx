// The shell, and the flow through it. One saber at a time is being worked on (the plugged-in one, or the one chosen
// in the Armory); the steps down the left take it from wiring to an installed board. Looks are made and tried in
// the Workshop, off to the side, and picked from the Presets step.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { registerLookSim, wiringConfirmed, type LookDef } from '@hiltwright/core';
import { useBoard } from './board';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Presets } from './Presets';
import { Fonts } from './Fonts';
import { Build } from './Build';
import { Looks } from './Looks';
import { Wiring } from './Wiring';
import { ErrorBoundary } from './ErrorBoundary';
import { SaveDiagnostics } from './SaveDiagnostics';
import { SaberControls } from './Controls';
import { guessBlades, infoFromRecord, queuedLookIds } from './saberModel';
import { usePendingLookColours } from './pendingColours';
import { StyleEditor } from './StyleEditor';
import { FontLibrary } from './FontLibrary';
import { Contributors } from './Contributors';
import { About } from './About';
import { UpdateChip, useUpdates } from './Updates';
import { chipText } from '../../shared/updates';
import { QUICK_COMMANDS, destructiveReason } from './consoleCommands';
import { flowStatus, nextStep, useWorkspace, type Workspace } from './workspace';
import type { SaberRecord } from '../../shared/api';
import { batteryLabel, noBattery } from './battery';
import { Tour, waitForStep } from './Tour';
import { TOUR } from './tourSteps';
import { flattenTour, startForPage } from './tourEngine';
import { tourBoard } from './tourBoard';
import { EXAMPLE_ID } from './tourSaber';
import { removeBlock, removeWords } from './armoryRemove';
import { TOUR_OFFERED_KEY, restorePrefs, setTourLock, snapshotPrefs, takeHeldConnect } from './tourLock';
// three.js is only needed in the demo room, so it loads when that page is first opened.
const Demo = lazy(() => import('./Demo').then((m) => ({ default: m.Demo })));

type Page = 'armory' | 'wiring' | 'presets' | 'fonts' | 'build' | 'looks' | 'editor' | 'library' | 'contributors' | 'demo' | 'diag' | 'about';
const NAV: { section: string; pages: { id: Page; title: string; icon: Parameters<typeof Icon>[0]['name']; step?: number }[] }[] = [
  { section: 'Saber', pages: [
    { id: 'armory', title: 'Armory', icon: 'armory' },
    { id: 'wiring', title: 'Wiring', icon: 'blade', step: 1 },
    { id: 'presets', title: 'Presets', icon: 'presets', step: 2 },
    { id: 'fonts', title: 'Fonts & SD', icon: 'fonts', step: 3 },
    { id: 'build', title: 'Build & Install', icon: 'build', step: 4 },
  ] },
  { section: 'Workshop', pages: [
    { id: 'looks', title: 'Styles', icon: 'looks' },
    { id: 'editor', title: 'Style editor', icon: 'gear' },
    { id: 'library', title: 'Font library', icon: 'fonts' },
    { id: 'contributors', title: 'Contributors', icon: 'people' },
    { id: 'demo', title: 'Demo room', icon: 'play' },
  ] },
  { section: 'Tools', pages: [{ id: 'diag', title: 'Diagnostics', icon: 'diag' }, { id: 'about', title: 'About', icon: 'info' }] },
];
const PAGES = NAV.flatMap((g) => g.pages);
const TITLE: Record<Page, string> = { armory: 'Armory', wiring: 'Wiring', presets: 'Presets', fonts: 'Fonts & SD', build: 'Build & Install', looks: 'Styles', editor: 'Style editor', library: 'Font library', contributors: 'Contributors', demo: 'Demo room', diag: 'Diagnostics', about: 'About' };
const TOUR_STEPS = flattenTour(TOUR);
/**
 * The guided tour (Tour.tsx). 'starting': the page underneath has closed, and main is being told to refuse writes;
 * 'on': the steps show, on the example saber; 'ending': the tour's pages have closed, and main is being told it is over.
 */
interface TourRun { phase: 'starting' | 'on' | 'ending'; index: number; from: Page }

export function App() {
  const real = useBoard();
  usePendingLookColours(real);
  // Dev aid: hiltwrightGoto('fake:presets') shows the connected pages from the remembered saber, with no board, for
  // layout screenshots; 'fake-shared:presets' does the same with its card shared (card-safety 3.4). Nothing is sent
  // anywhere; never available in a packaged app.
  const [fake, setFake] = useState<false | 'plain' | 'shared'>(false);
  const lib0 = real.library[0];
  // While the tour runs, every page is given the example saber instead (tourBoard.ts): nothing it does reaches a saber.
  const [tour, setTour] = useState<TourRun | null>(null);
  const tourRef = useRef(tour); tourRef.current = tour;
  const exampleBoard = useMemo(() => tourBoard(real), [real.library, real.refreshLibrary, real.isPresetBlockEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const board: typeof real = tour ? exampleBoard : fake && import.meta.env.DEV && lib0 ? { ...real, status: 'connected', portName: 'FAKE', saber: lib0, info: { ...infoFromRecord(lib0), currentPreset: 0, battery: 3.91, volume: 1800 }, card: { shared: fake === 'shared', root: fake === 'shared' ? 'H:\\' : null } } : real;
  const ws = useWorkspace(board);
  const [page, setPageNow] = useState<Page>('armory');
  // Bumped when the tour ends: every page opens afresh on the owner's own saber, with nothing of the example kept.
  const [epoch, setEpoch] = useState(0);
  // A page with unsaved work (the Style editor) can hold navigation: it gets a proceed callback, and calls it once the
  // owner has saved or chosen to leave. Every page change goes through here.
  const leaveGuard = useRef<((proceed: () => void) => void) | null>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const setPage = (p: Page, then?: () => void) => {
    const move = () => { then?.(); setPageNow(p); };
    if (p !== pageRef.current && leaveGuard.current) leaveGuard.current(move); else move();
  };
  const setPageRef = useRef(setPage); setPageRef.current = setPage;
  const [demoLook, setDemoLook] = useState<string | null>(null);
  const [demoFont, setDemoFont] = useState<string | null>(null);
  // The Styles page opened from the Contributors page shows that person's styles.
  const [styleCreator, setStyleCreator] = useState<string | null>(null);
  const [editingLook, setEditingLook] = useState<LookDef | null>(null);
  // Bumped each time Styles opens the editor on a style (or a new one); saving never remounts the editor.
  const [editorOpen, setEditorOpen] = useState(0);
  // Saved looks get a simulator at startup (built ones from their layers, pasted ones from their code), so they preview like library looks.
  useEffect(() => { void window.hiltwright.looks.list().then((ls) => { for (const l of ls) registerLookSim(l); }); }, []);
  const { status, info } = board;
  const connected = status === 'connected';
  const configName = info?.version?.config?.replace(/^config\//, '').replace(/\.h$/, '') ?? null;
  // Dev aid: lets main switch pages for screenshots.
  useEffect(() => { if (!import.meta.env.DEV) return; (window as unknown as { hiltwrightGoto?: (p: string) => void }).hiltwrightGoto = (p) => { setOffer(false); setFake(p.startsWith('fake-shared:') ? 'shared' : p.startsWith('fake:') ? 'plain' : false); setPage(p.replace(/^fake(-shared)?:/, '') as Page); }; }, []);
  // Dev aid: hiltwrightFault() makes the current page throw while rendering, to check the fault screen and its log line.
  // The fault belongs to the page it was raised on, so moving to another page shows that page normally.
  const [faultPage, setFaultPage] = useState<Page | null>(null);
  useEffect(() => { if (!import.meta.env.DEV) return; (window as unknown as { hiltwrightFault?: () => void }).hiltwrightFault = () => setFaultPage(pageRef.current); }, []);
  // Ctrl+1..9 switch pages, in the order shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!e.ctrlKey || e.altKey || e.shiftKey) return; const p = PAGES[Number(e.key) - 1]; if (p) { e.preventDefault(); setPageRef.current(p.id); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const queued = queuedLookIds(ws.model ?? undefined, ws.saber?.firmware).length;
  const go = (p: Page) => setPage(p);

  // ---- the guided tour ----
  // Offered once, on the first start; remembered with the page's other small settings.
  const [offer, setOffer] = useState(() => { try { return !localStorage.getItem(TOUR_OFFERED_KEY); } catch { return false; } });
  const prefs = useRef<Map<string, string>>(new Map());
  // A page with unsaved work (the Style editor) is asked first, as when leaving it.
  const startTour = (at: number) => {
    if (tourRef.current) return;
    const begin = () => {
      try { prefs.current = snapshotPrefs(localStorage); } catch { prefs.current = new Map(); }
      setTourLock(true);
      setOffer(false);
      setTour({ phase: 'starting', index: at, from: pageRef.current });
    };
    if (leaveGuard.current) leaveGuard.current(begin); else begin();
  };
  const endTour = () => setTour((t) => (t && t.phase === 'on' ? { ...t, phase: 'ending' } : t));
  const answerOffer = (take: boolean) => {
    try { localStorage.setItem(TOUR_OFFERED_KEY, new Date().toISOString()); } catch { /* private mode */ }
    setOffer(false);
    if (take) startTour(0);
  };
  const realRef = useRef(real); realRef.current = real;
  // In-app updates (Updates.tsx): hidden and still while the tour runs. A restart asks a page with unsaved work first.
  const updates = useUpdates({ tourOn: !!tour, cardShared: board.card.shared, beforeRestart: (proceed) => { if (leaveGuard.current) leaveGuard.current(proceed); else proceed(); } });
  // A tour left on by a reload is over: main hears so as the page loads.
  useEffect(() => { void window.hiltwright.tour?.setActive(false).catch(() => undefined); }, []);
  useEffect(() => {
    if (tour?.phase === 'starting') {
      void window.hiltwright.tour.setActive(true).catch((err) => console.log(`[tour] main was not told: ${String(err)}`))
        .finally(() => { console.log('[tour] started'); setTour((t) => (t && t.phase === 'starting' ? { ...t, phase: 'on' } : t)); });
    }
    if (tour?.phase === 'ending') {
      const from = tour.from;
      void window.hiltwright.tour.setActive(false).catch((err) => console.log(`[tour] main was not told: ${String(err)}`)).finally(() => {
        try { restorePrefs(localStorage, prefs.current); } catch { /* private mode */ }
        setTourLock(false);
        setTour(null); setPageNow(from); setEpoch((n) => n + 1);
        // The page opens afresh at its top, as when it is chosen in the sidebar.
        for (const el of document.querySelectorAll('.app, .main')) { el.scrollTop = 0; el.scrollLeft = 0; }
        console.log('[tour] ended');
        // A saber plugged in during the tour is connected now.
        if (takeHeldConnect()) void realRef.current.connect(false);
      });
    }
  }, [tour?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each step's page, opened as the tour reaches it (the tour's pages hold no unsaved work, so nothing is asked).
  useEffect(() => {
    if (tour?.phase !== 'on') return;
    const p = TOUR_STEPS[tour.index]?.page as Page | undefined;
    if (p && p !== pageRef.current) setPageNow(p);
  }, [tour?.phase, tour?.index]);
  // Dev aids: hiltwrightTour(n) shows step n (from 0) and waits for it to be placed; hiltwrightTourOffer() shows the offer.
  const startRef = useRef(startTour); startRef.current = startTour;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { hiltwrightTour?: (n: number) => Promise<string>; hiltwrightTourOffer?: () => void; hiltwrightTourCount?: () => number };
    w.hiltwrightTour = (n) => { if (tourRef.current) setTour((t) => (t ? { ...t, index: n } : t)); else startRef.current(n); return waitForStep(n); };
    w.hiltwrightTourOffer = () => setOffer(true);
    w.hiltwrightTourCount = () => TOUR_STEPS.length;
  }, []);

  return (
    <div className="app">
      <aside className={`side${!tour && chipText(updates.state) ? ' hasupd' : ''}`} aria-label="Primary">
        <div className="brand"><Logo size={28} /><span className="wordmark">Hiltwright</span></div>
        <nav className="nav" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.section} className="col" style={{ gap: 2 }} data-tour={`nav-${g.section.toLowerCase()}`}>
              <span className="sec">{g.section}</span>
              {g.pages.map((p) => (
                <a key={p.id} href="#" className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} title={`Ctrl+${PAGES.indexOf(p) + 1}`} onClick={(e) => { e.preventDefault(); setPage(p.id, () => setStyleCreator(null)); }}>
                  {p.step ? <span className="stepn">{p.step}</span> : <Icon name={p.icon} />}<span>{p.title}</span>
                  {p.id === 'presets' && ws.live && !ws.model?.presetsFrom && <span className="tier">live</span>}
                  {p.id === 'build' && (queued > 0 ? <span className="badge" title="Styles waiting for a build">{queued} queued</span> : null)}
                </a>
              ))}
            </div>
          ))}
        </nav>
        {ws.saber && <div className="col" style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', gap: 2 }}><span className="sec" style={{ padding: 0 }}>Working on</span><b className="ellip" style={{ fontWeight: 600, fontSize: 13 }}>{ws.saber.name}</b><span className="hint">{ws.live ? 'plugged in' : ws.saber.planned ? 'planned, not seen yet' : 'not plugged in'}</span></div>}
        <button type="button" className="tourbtn" data-tour="side-tour" disabled={!!tour} onClick={() => startTour(0)}><Icon name="info" /><span>Take the tour</span></button>
        <div className="col" style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', gap: 8 }}>
          <span className="mono mute" style={{ fontSize: 11 }}>Hiltwright {window.hiltwright?.appVersion ?? '?'} beta</span>
          {!tour && <UpdateChip view={updates} onOpen={() => setPage('about')} />}
        </div>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 0, minWidth: 0 }}>
          <h1>{TITLE[page]}</h1>
          <div className="ident" data-tour="top-saber">
            <b className="ellip">{ws.saber?.name ?? configName ?? 'No saber yet'}</b>
            <span className="hint ellip">{info?.version ? `ProffieOS ${info.version.version}, ${info.version.prop ?? 'unknown prop'}, ${info.presets.length} presets` : ws.saber ? (ws.saber.planned ? 'planned ahead' : 'not plugged in') : 'plug one in, or plan one in the Armory'}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="chip tourchip" data-tour="top-tour" disabled={!!tour} aria-label="Show me this page" title="Show me this page: a short tour of it" onClick={() => startTour(startForPage(TOUR_STEPS, page))}><Icon name="info" /><span className="tct">Show me this page</span></button>
          <span className="row" style={{ gap: 12 }} data-tour="top-status">
          <StatusChip status={status} port={board.portName} />
          <span className="chip" title={noBattery(info?.battery ?? null) ? 'The battery reads under 2 V: none is connected, and the saber runs on USB power.' : undefined}><Icon name="battery" />{batteryLabel(info?.battery ?? null)}</span>
          {connected
            ? <button type="button" className="btn sm" onClick={() => void board.disconnect()}><span className="b"><span className="i">Disconnect</span></span></button>
            : <button type="button" className="btn sm pri" onClick={() => void board.connect(true)} disabled={status === 'connecting' || status === 'reading'}><span className="b"><span className="i"><Icon name="usb" />Connect</span></span></button>}
          </span>
        </div>
      </header>

      <main className="main">
        {tour && tour.phase !== 'on' ? null : <ErrorBoundary key={`${page}:${epoch}`} what={`the ${TITLE[page]} page`}>
          {faultPage === page && <FaultForDev />}
          {page === 'armory' ? <Armory board={board} ws={ws} go={go} />
            : page === 'wiring' ? <Wiring ws={ws} board={board} go={go} />
            : page === 'presets' ? <Presets ws={ws} board={board} go={go} />
            : page === 'fonts' ? <Fonts board={board} ws={ws} go={go} />
            : page === 'build' ? <Build ws={ws} board={board} go={go} />
            : page === 'looks' ? <Looks ws={ws} board={board} initialCreator={styleCreator} onPresets={() => setPage('presets')} onBuild={() => setPage('build')} onDemo={(id) => { setDemoLook(id); setPage('demo'); }} onEdit={(l) => { setEditingLook(l); setEditorOpen((n) => n + 1); setPage('editor'); }} onNew={() => { setEditingLook(null); setEditorOpen((n) => n + 1); setPage('editor'); }} />
            : page === 'editor' ? <EditorLoader key={editorOpen} lookId={editingLook?.id ?? null}>{(fresh) => (
                <StyleEditor key={fresh?.id ?? 'new'} editing={fresh} onSaved={(look) => { setEditingLook(look); void board.refreshLibrary(); }} onDemo={(id) => setPage('demo', () => setDemoLook(id))} onLeaveGuard={(g) => { leaveGuard.current = g; }} />
              )}</EditorLoader>
            : page === 'library' ? <FontLibrary board={board} onDemo={(folder) => { setDemoFont(folder); setPage('demo'); }} />
            : page === 'contributors' ? <Contributors onFonts={() => setPage('library')} onLooks={(name) => { setStyleCreator(name); setPage('looks'); }} onDemo={() => setPage('demo')} />
            : page === 'demo' ? <Suspense fallback={<span className="hint">Opening the demo room…</span>}><Demo initialLook={demoLook} initialFont={demoFont} board={board} /></Suspense>
            : page === 'about' ? <About updates={tour ? null : updates} />
            : <Diagnostics board={board} />}
        </ErrorBoundary>}
      </main>
      {tour?.phase === 'on' && <Tour steps={TOUR_STEPS} index={tour.index} page={page} onIndex={(i) => setTour((t) => (t ? { ...t, index: i } : t))} onEnd={endTour} />}
      {offer && !tour && (
        <div className="dialog-back" role="presentation" onKeyDown={(e) => { if (e.key === 'Escape') answerOffer(false); }}>
          <section className="panel dialog" role="dialog" aria-modal="true" aria-labelledby="tour-offer-title" aria-describedby="tour-offer-text" style={{ width: 'min(500px, 92vw)' }} data-tour="tour-offer">
            <div className="ph"><h2 id="tour-offer-title">New to Hiltwright?</h2></div>
            <div className="pb col" style={{ gap: 14 }}>
              <div id="tour-offer-text" className="col" style={{ gap: 8 }}>
                <p className="dim" style={{ fontSize: 13.5 }}>A short tour shows what each page is for, and how a saber goes from a plan to installed firmware.</p>
                <p className="dim" style={{ fontSize: 13.5 }}>It uses an example saber, so nothing is sent to a saber or saved while it runs.</p>
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn sm ghost" onClick={() => answerOffer(false)}><span className="b"><span className="i">Not now</span></span></button>
                <button type="button" className="btn sm pri" autoFocus onClick={() => answerOffer(true)}><span className="b"><span className="i">Take a five-minute tour</span></span></button>
              </div>
              <span className="hint">You can take it later from "Take the tour" at the bottom of the sidebar.</span>
            </div>
          </section>
        </div>
      )}
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
  // A plan made while a saber is plugged in: the plugged-in saber stays the working one, and this says so.
  const [plannedAside, setPlannedAside] = useState<string | null>(null);
  // Why a new saber could not be started. Without this, a refusal looked like Start doing nothing (as it did from
  // 2026-09-27 until 0.2.0-beta.8, when a new plan was refused for not having chosen its board yet).
  const [planError, setPlanError] = useState<string | null>(null);
  const plan = async () => {
    const name = planName.trim() || `Saber ${board.library.length + 1}`;
    setPlanError(null);
    let rec: Awaited<ReturnType<typeof board.planSaber>>;
    try {
      rec = await board.planSaber(name, { name: `hiltwright_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'saber'}`, board: 'V2', buttons: 2, prop: 'fett263', blades: guessBlades([132]), presets: [], looks: [], generator: `hiltwright ${window.hiltwright.appVersion}` });
    } catch (err) {
      // Electron puts its own words in front of the reason.
      setPlanError(String(err instanceof Error ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      return;
    }
    setPlanning(false); setPlanName('');
    if (ws.live) { setPlannedAside(rec.name); return; }
    ws.choose(rec.id); go('wiring');
  };
  // Stores that could not be read at start were kept aside (jsonStore.ts); say so until dismissed.
  const [problems, setProblems] = useState<Awaited<ReturnType<typeof window.hiltwright.app.storeProblems>>>([]);
  useEffect(() => { void window.hiltwright.app.storeProblems().then(setProblems, () => setProblems([])); }, []);
  const openFolder = async (place: 'data' | 'fonts') => {
    try { if (place === 'fonts') await window.hiltwright.fontLibrary.open(); else await window.hiltwright.app.openPath(await window.hiltwright.app.userDataPath()); } catch { /* nothing to open */ }
  };
  // Adoption asks first: which plan the owner said this saber is.
  const [adopting, setAdopting] = useState<SaberRecord | null>(null);
  // Removal asks first: the saber, and the data folder its kept files are in.
  const [removing, setRemoving] = useState<{ saber: SaberRecord; folder: string | null } | null>(null);
  const askRemove = (s: SaberRecord) => {
    setRemoving({ saber: s, folder: null });
    void window.hiltwright.app.userDataPath().then((folder) => setRemoving((r) => (r && r.saber.id === s.id ? { ...r, folder } : r)), () => { /* the words name the data folder without its path */ });
  };
  const confirmRemove = async (s: SaberRecord) => {
    setRemoving(null);
    try { await window.hiltwright.library.remove(s.id); } catch (err) { console.log(`[library] remove failed: ${String(err)}`); }
    // The working saber falls back to the most recently seen one that is left, or to none.
    if (ws.saber?.id === s.id) ws.choose('');
    await board.refreshLibrary();
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
        {problems.map((p) => (
          <div key={p.keptAs} className="note amber" role="alert"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
            <span>Your {p.store} could not be read. It was kept as <b className="mono">{p.keptAs}</b> in {p.place === 'fonts' ? 'the font library folder' : "Hiltwright's data folder"}, and Hiltwright started {p.startedFrom === 'backup' ? 'from its backup copy' : p.startedFrom === 'readable records' ? 'with the entries it could read' : 'with an empty one'}.</span>
            <span className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => void openFolder(p.place)}><span className="b"><span className="i">Open folder</span></span></button><button type="button" className="btn sm ghost" onClick={() => setProblems((ps) => ps.filter((x) => x !== p))}><span className="b"><span className="i">Dismiss</span></span></button></span>
          </span></div>
        ))}
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
          {ws.live && board.info && noBattery(board.info.battery) && <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="battery" /><span>No battery detected: {cur?.name ?? 'this saber'} is running on USB power alone. It may pause for a moment when it plays sound or reads its card. If it does, Hiltwright reconnects to it on its own.</span></div>}
          {ws.live && board.info && board.info.rejected.length > 0 && <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="warn" /><span>This firmware does not know {board.info.rejected.join(', ')}. Hiltwright adapts to what the board supports.</span></div>}
          {adoptable && !adopting && (
            <div className="note amber" style={{ margin: '0 18px 16px' }}><Icon name="info" /><span>Is this a saber you set up ahead? {plans.map((p) => <button key={p.id} type="button" className="holo" style={{ marginRight: 10 }} onClick={() => setAdopting(p)}>It is "{p.name}"</button>)}Its wiring, presets and styles move onto this saber, ready to install.</span></div>
          )}
          {adoptable && adopting && cur && (
            <div className="note amber" role="alertdialog" aria-label="Adopt a planned saber" style={{ margin: '0 18px 16px' }}><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
              <span>Adopting "{adopting.name}" moves its wiring, prop, presets and styles onto {cur.name}. The next install replaces the styles compiled into {cur.name}'s current firmware, and the presets on its card will then be the plan's.</span>
              {cur.model && <span>{cur.name} already has wiring and presets set up in Hiltwright. They will be replaced by the plan's.</span>}
              <span className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm pri" onClick={() => { const id = adopting.id; setAdopting(null); void board.adoptPlan(id); }}><span className="b"><span className="i">Adopt</span></span></button>
                <button type="button" className="btn sm ghost" onClick={() => setAdopting(null)}><span className="b"><span className="i">Not now</span></span></button>
              </span>
            </span></div>
          )}
        </section>

        <section className="panel" aria-label="Your sabers" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }} data-tour="armory-sabers">
          <div className="ph"><h2>Your sabers</h2>
            {planning
              ? <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void plan(); }}><span className="input sans" style={{ height: 30, width: 200 }}><input type="text" value={planName} autoFocus placeholder="Name the saber" aria-label="Name for the new saber" onChange={(e) => setPlanName(e.target.value)} /></span><button type="submit" className="btn sm pri"><span className="b"><span className="i">Start</span></span></button><button type="button" className="chip" onClick={() => setPlanning(false)}><Icon name="x" /></button></form>
              : <button type="button" className="btn sm pri" data-tour="armory-new" title="Set a saber up before it is plugged in: wiring, presets and styles, ready to install when it arrives" onClick={() => setPlanning(true)}><span className="b"><span className="i"><Icon name="plus" />New saber</span></span></button>}
          </div>
          {planError && planning && (
            <div className="note red" role="alert" style={{ margin: '12px 18px 0' }}><Icon name="warn" /><span>The new saber was not started: {planError}</span></div>
          )}
          {plannedAside && cur && (
            <div className="note" role="status" style={{ margin: '12px 18px 0' }}><Icon name="info" /><span className="col" style={{ gap: 8 }}>
              <span>{plannedAside} is set up. {cur.name} is plugged in, so it stays the saber you are working on. Unplug it to work on {plannedAside}.</span>
              <span><button type="button" className="btn sm ghost" onClick={() => setPlannedAside(null)}><span className="b"><span className="i">OK</span></span></button></span>
            </span></div>
          )}
          <div className="list" style={{ overflow: 'auto' }}>
            {board.library.length === 0 && <div className="hint" style={{ padding: '14px 18px' }}>No sabers yet. Plug one in and it is remembered, or start a new one to set up ahead.</div>}
            {board.library.map((s, n) => {
              const isCur = s.id === cur?.id; const plugged = ws.live && isCur;
              return (
                <div key={s.id} className={`li ${isCur ? 'on' : ''}`} style={{ gap: 12, minHeight: 52 }}>
                  <span className="n" aria-hidden="true">{n + 1}</span>
                  <span style={{ color: 'var(--mute)', display: 'flex', width: 18 }} title={plugged ? 'Plugged in' : s.planned ? 'Set up ahead' : 'Not plugged in'}><Icon name={plugged ? 'usb' : s.planned ? 'gear' : 'blade'} /></span>
                  {editing && isCur
                    ? <form className="row grow" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void board.renameSaber(draft); setEditing(false); }}>
                        <span className="input sans grow" style={{ height: 32 }}><input type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Saber name" /></span>
                        <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
                        <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}><span className="b"><span className="i">Cancel</span></span></button>
                      </form>
                    : <>
                        <span className="col grow" style={{ gap: 0, minWidth: 0 }} title={s.identity.configName ? `${s.identity.configName}, USB serial ${s.identity.usbSerial ?? 'unknown'}` : undefined}>
                          <b className="ellip" style={{ fontWeight: 600 }}>{s.name}</b>
                          <span className="hint ellip">{plugged ? 'plugged in' : s.planned ? `set up ahead · ${s.model?.presets.length ?? 0} presets · not seen yet` : `${s.identity.configName ?? '?'} · ${s.presets.length} presets · last seen ${new Date(s.lastSeen).toLocaleDateString()}`}</span>
                        </span>
                        {isCur ? <span className="chip"><span className="dot" style={{ background: 'currentColor' }} />Working on it</span> : <button type="button" className="btn sm" disabled={ws.live} title={ws.live ? 'Unplug the connected saber to work on another' : undefined} onClick={() => ws.choose(s.id)}><span className="b"><span className="i">Work on it</span></span></button>}
                        {isCur && plugged && <button type="button" className="chip" onClick={() => { setDraft(s.name); setEditing(true); }}>Rename</button>}
                        {s.id !== EXAMPLE_ID && (() => { const why = removeBlock(s, plugged ? s.id : null); return <button type="button" className="chip" disabled={!!why} title={why ?? (s.planned ? 'Remove this plan' : 'Remove this saber from the Armory')} aria-label={`Remove ${s.name}`} onClick={() => askRemove(s)}><Icon name="trash" /></button>; })()}
                      </>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {removing && (() => {
        const w = removeWords(removing.saber, removing.folder);
        return (
          <div className="dialog-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setRemoving(null); }} onKeyDown={(e) => { if (e.key === 'Escape') setRemoving(null); }}>
            <section className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-title" aria-describedby="remove-text" style={{ width: 'min(540px, 92vw)' }} data-testid="remove-dialog">
              <div className="ph"><h2 id="remove-title">{w.title}</h2></div>
              <div className="pb col" style={{ gap: 14, overflow: 'auto' }}>
                <div id="remove-text" className="col" style={{ gap: 10 }}>
                  <div className="col" style={{ gap: 4 }}><b style={{ fontWeight: 600 }}>Removed</b><ul className="dim" style={{ fontSize: 13.5, paddingLeft: 18 }}>{w.removed.map((t) => <li key={t}>{t}</li>)}</ul></div>
                  <div className="col" style={{ gap: 4 }}><b style={{ fontWeight: 600 }}>Kept</b><ul className="dim" style={{ fontSize: 13.5, paddingLeft: 18, overflowWrap: 'anywhere' }}>{w.kept.map((t) => <li key={t}>{t}</li>)}</ul></div>
                  <p className="dim" style={{ fontSize: 13.5 }}>{w.after}</p>
                </div>
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn sm ghost" autoFocus onClick={() => setRemoving(null)}><span className="b"><span className="i">Cancel</span></span></button>
                  <button type="button" className="btn sm danger" onClick={() => void confirmRemove(removing.saber)}><span className="b"><span className="i">{w.button}</span></span></button>
                </div>
              </div>
            </section>
          </div>
        );
      })()}
      <aside className="rail" aria-label="Progress" data-tour="armory-progress">
        {!cur ? (
          <div className="stepc now"><div className="head"><b>Start here</b></div><span className="small dim">Plug a saber in, or press New saber to set one up ahead. Then the steps down the left take it from wiring to an installed board.</span></div>
        ) : (
          <>
            <div className="row between" style={{ minHeight: 24 }}><b style={{ fontWeight: 600 }} className="ellip">{cur.name}</b><span className="hint">{ws.live ? 'plugged in' : cur.planned ? 'set up ahead' : 'unplugged'}</span></div>
            <div className="inspect">
              {steps.map((st, i) => {
                const done = (st.step === 'wiring' && wiringConfirmed(ws.model)) || (st.step === 'presets' && !!ws.model?.presets.length) || (st.step === 'build' && !!cur.firmware && !queuedLookIds(ws.model ?? undefined, cur.firmware).length && !ws.model?.presetsFrom);
                const now = st.step === next;
                return (
                  <button key={st.step} type="button" className={`insp ${done ? 'done' : now ? 'now' : ''}`} onClick={() => go(stepPage[st.step])}>
                    <span className="box" aria-hidden="true">{done ? <Icon name="check" /> : i + 1}</span>
                    <b>{stepTitle[st.step]}{done && <span className="sr"> (done)</span>}</b><span className="what" title={st.label}>{st.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn pri full" onClick={() => go(stepPage[next])}><span className="b"><span className="i"><Icon name="chev" />Continue with {stepTitle[next]}</span></span></button>
            <span className="hint">Styles are chosen on the Presets step; make and try new ones in the Workshop.</span>
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * The style editor always opens the stored, current version of a style: fetched each time the page is entered, from
 * Styles or from the sidebar, never a copy held since Styles last opened it. A style removed meanwhile opens a new one.
 */
function EditorLoader({ lookId, children }: { lookId: string | null; children: (look: LookDef | null) => React.ReactNode }) {
  const [state, setState] = useState<{ look: LookDef | null; gone: boolean } | null>(lookId ? null : { look: null, gone: false });
  useEffect(() => {
    if (!lookId) return;
    let live = true;
    void window.hiltwright.looks.list().then((all) => { const look = all.find((l) => l.id === lookId) ?? null; if (live) setState({ look, gone: !look }); }, () => { if (live) setState({ look: null, gone: true }); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return <div className="pb hint">Loading the style…</div>;
  return <>{state.gone && <div className="note amber" style={{ margin: '0 0 12px' }}><Icon name="warn" /><span>That style is no longer in your Styles, so the editor starts a new one.</span></div>}{children(state.look)}</>;
}

function FaultForDev(): never {
  throw new Error('A fault forced by hiltwrightFault() (development only)');
}

function Diagnostics({ board }: { board: ReturnType<typeof useBoard> }) {
  const [cmd, setCmd] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [board.lines]);
  const quick = QUICK_COMMANDS;
  // A typed command that restarts the board or changes files waits here until the owner says to send it.
  const [held, setHeld] = useState<{ command: string; reason: string } | null>(null);
  const run = (command: string) => { void board.send(command, { idleMs: 700 }); setCmd(''); setHeld(null); };
  const connected = board.status === 'connected';
  return (
    <>
      <div className="work" style={{ gridTemplateColumns: '380px minmax(0,1fr)' }}>
      <SaberControls board={board} />
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} data-tour="diag-console">
        <div className="ph"><h2>Console</h2><div className="row wrap" style={{ gap: 6 }}>{quick.map((q) => <button key={q} type="button" className="chip" disabled={!connected} onClick={() => void board.send(q, q === 'show_current_preset' ? { until: board.isPresetBlockEnd } : { idleMs: 700 })}>{q}</button>)}</div></div>
        <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }} data-tour="diag-save"><SaveDiagnostics small /></div>
        <div className="console grow" style={{ border: 0, minHeight: 0 }}>
          {board.lines.length === 0 && <span className="mute">Connect a saber, then type a command. Events the board prints on its own show in amber.</span>}
          {board.lines.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
          <div ref={end} />
        </div>
        {held && (
          <div className="note amber" role="alertdialog" aria-label="Confirm the command" style={{ margin: '0 12px 12px' }}><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
            <span>{held.reason} Send <b className="mono">{held.command}</b> anyway?</span>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm pri" onClick={() => run(held.command)}><span className="b"><span className="i">Send it</span></span></button>
              <button type="button" className="btn sm ghost" onClick={() => setHeld(null)}><span className="b"><span className="i">Do not send</span></span></button>
            </span>
          </span></div>
        )}
        <form className="row" style={{ padding: 12, borderTop: '1px solid var(--line)', gap: 8 }} onSubmit={(e) => { e.preventDefault(); const c = cmd.trim(); if (!c) return; const reason = destructiveReason(c); if (reason) setHeld({ command: c, reason }); else run(c); }}>
          <span className="input grow"><input type="text" value={cmd} onChange={(e) => { setCmd(e.target.value); setHeld(null); }} aria-label="Serial command" placeholder="Type a command" disabled={!connected} /></span>
          <button type="submit" className="btn sm pri" disabled={!connected}><span className="b"><span className="i">Send</span></span></button>
        </form>
      </section>
      </div>
    </>
  );
}
