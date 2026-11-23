// The shell, and the flow through it. One saber at a time is being worked on (the plugged-in one, or the one chosen
// in the Armory); the steps down the left take it from wiring to an installed board. Looks are made and tried in
// the Workshop, off to the side, and picked from the Presets step.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { registerLookSim, wiringConfirmed, type LookDef } from '@hiltwright/core';
import { useBoard } from './board';
import { Icon } from './Icon';
import { Loader, LoadingSpace } from './Loader';
import { Logo } from './Logo';
import { Presets } from './Presets';
import { Fonts } from './Fonts';
import { FontChoice } from './FontChoice';
import { chosenFonts } from './saberFonts';
import { Build } from './Build';
import { Looks } from './Looks';
import { Wiring } from './Wiring';
import { ErrorBoundary } from './ErrorBoundary';
import { SaveDiagnostics } from './SaveDiagnostics';
import { SaberControls } from './Controls';
import { firmwareLine, guessBlades, infoFromRecord, queuedLookIds } from './saberModel';
import { usePendingLookColours } from './pendingColours';
import { StyleEditor } from './StyleEditor';
import { FontLibrary } from './FontLibrary';
import { Contributors } from './Contributors';
import { About } from './About';
import { Settings } from './Settings';
import { UpdateChip, useUpdates } from './Updates';
import { QUICK_COMMANDS, destructiveReason } from './consoleCommands';
import { flowStatus, fontsMissingAsLastRead, nextStep, starterModel, useWorkspace, type Workspace } from './workspace';
import { fontLibraryList, packList } from './sharedLists';
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

// The sidebar (docs/install-live-plan.md): the Armory on top, where a saber is picked; Install, the numbered steps that
// set a saber up and flash it; Live, for adjusting a saber that is plugged in now; the Workshop; and Tools.
type Page = 'armory' | 'wiring' | 'fonts' | 'presets' | 'card' | 'build' | 'live-presets' | 'diag' | 'live-card' | 'looks' | 'editor' | 'library' | 'contributors' | 'demo' | 'settings' | 'about';
const NAV: { section: string; pages: { id: Page; title: string; icon: Parameters<typeof Icon>[0]['name']; step?: number }[] }[] = [
  { section: '', pages: [{ id: 'armory', title: 'Armory', icon: 'armory' }] },
  { section: 'Install', pages: [
    { id: 'wiring', title: 'Wiring', icon: 'blade', step: 1 },
    { id: 'fonts', title: 'Fonts', icon: 'fonts', step: 2 },
    { id: 'presets', title: 'Presets', icon: 'presets', step: 3 },
    { id: 'card', title: 'Card', icon: 'sd', step: 4 },
    { id: 'build', title: 'Build & Flash', icon: 'build', step: 5 },
  ] },
  { section: 'Live', pages: [
    { id: 'live-presets', title: 'Presets', icon: 'presets' },
    { id: 'diag', title: 'Controls', icon: 'diag' },
    { id: 'live-card', title: 'Card', icon: 'sd' },
  ] },
  { section: 'Workshop', pages: [
    { id: 'looks', title: 'Styles', icon: 'looks' },
    { id: 'editor', title: 'Style editor', icon: 'gear' },
    { id: 'library', title: 'Font library', icon: 'fonts' },
    { id: 'contributors', title: 'Contributors', icon: 'people' },
    { id: 'demo', title: 'Demo room', icon: 'play' },
  ] },
  { section: 'Tools', pages: [{ id: 'settings', title: 'Settings', icon: 'gear' }, { id: 'about', title: 'About', icon: 'info' }] },
];
const PAGES = NAV.flatMap((g) => g.pages);
const INSTALL_PAGES = NAV.find((g) => g.section === 'Install')!.pages.map((p) => p.id);
const LIVE_PAGES = NAV.find((g) => g.section === 'Live')!.pages.map((p) => p.id);
/** What the owner is doing with the picked saber (the Armory's two panels): adjusting it live, or changing its setup. */
type Focus = 'live' | 'setup';
const TITLE: Record<Page, string> = { armory: 'Armory', wiring: 'Wiring', presets: 'Presets', fonts: 'Fonts', card: 'Card', build: 'Build & Flash', 'live-presets': 'Live presets', diag: 'Controls', 'live-card': 'Card', looks: 'Styles', editor: 'Style editor', library: 'Font library', contributors: 'Contributors', demo: 'Demo room', settings: 'Settings', about: 'About' };
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
  // Install's pages work on the saber picked in the Armory; Live's on the saber plugged in (workspace.ts).
  const ws = useWorkspace(board);
  const liveWs = useWorkspace(board, 'board');
  const [page, setPageNow] = useState<Page>('armory');
  // What the owner is doing with each saber: adjusting it live, or changing its setup. Chosen on the Armory, or by
  // opening a page of either section; the sidebar brings that section forward. Live only while the saber is plugged in.
  const [focusBy, setFocusBy] = useState<Record<string, Focus>>(() => { try { return JSON.parse(localStorage.getItem('hiltwright.armory.focus') ?? '{}') as Record<string, Focus>; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.armory.focus', JSON.stringify(focusBy)); } catch { /* private mode */ } }, [focusBy]);
  const focus: Focus = !ws.live ? 'setup' : (ws.saber && focusBy[ws.saber.id]) || 'live';
  const setFocus = (f: Focus) => { const id = ws.saber?.id; if (id && (f === 'setup' || ws.live)) setFocusBy((m) => (m[id] === f ? m : { ...m, [id]: f })); };
  useEffect(() => { if (INSTALL_PAGES.includes(page)) setFocus('setup'); else if (LIVE_PAGES.includes(page)) setFocus('live'); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <aside className="side" aria-label="Primary">
        <div className="brand"><Logo size={28} /><span className="wordmark">Hiltwright</span></div>
        <nav className="nav" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.section} className={`col${(g.section === 'Install' && focus === 'live') || (g.section === 'Live' && focus === 'setup') ? ' aside' : ''}`} style={{ gap: 2 }} data-tour={`nav-${g.section.toLowerCase() || 'top'}`}>
              {g.section && <span className={`sec${(g.section === 'Install' && focus === 'setup') || (g.section === 'Live' && focus === 'live') ? ' focus' : ''}`}>{g.section}{g.section === 'Live' && ws.live && <span className="livedot" title={`${ws.saber?.name ?? 'A saber'} is plugged in`} />}</span>}
              {g.pages.map((p) => (
                <a key={p.id} href="#" className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} title={`Ctrl+${PAGES.indexOf(p) + 1}`} onClick={(e) => { e.preventDefault(); setPage(p.id, () => setStyleCreator(null)); }}>
                  {p.step ? <span className="stepn">{p.step}</span> : <Icon name={p.icon} />}<span>{p.title}</span>
                  {p.id === 'build' && (queued > 0 ? <span className="badge" title={`${queued} ${queued === 1 ? 'style is' : 'styles are'} waiting for a build`} aria-label={`${queued} queued`}>{queued}</span> : null)}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 0, minWidth: 0 }}>
          <h1>{TITLE[page]}</h1>
          <div className="ident" data-tour="top-saber">
            <b className="ellip">{ws.saber?.name ?? configName ?? (ws.loading ? 'Reading your sabers…' : 'No saber yet')}</b>
            <span className="hint ellip">{ws.live ? 'plugged in' : ws.saber ? (ws.saber.planned ? 'planned ahead' : 'not plugged in') : ws.loading ? '' : 'plug one in, or plan one in the Armory'}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="chip tourchip" data-tour="top-tour" disabled={!!tour} aria-label="Show me this page" title="Show me this page: a short tour of it" onClick={() => startTour(startForPage(TOUR_STEPS, page))}><Icon name="info" /><span className="tct">Show me this page</span></button>
          <span className="row" style={{ gap: 12 }} data-tour="top-status">
          {board.switchingTo
            ? <span className="chip warn" role="status"><Loader size="sm" />Connecting to {board.switchingTo.name}…</span>
            : <StatusChip status={status} port={board.plugged.find((p) => p.serial === board.saber?.identity.usbSerial)?.port ?? board.portName} />}
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
          {page === 'armory' ? <Armory board={board} ws={ws} go={go} focus={focus} setFocus={setFocus} />
            : page === 'wiring' ? <Wiring ws={ws} board={board} go={go} />
            : page === 'presets' ? <Presets ws={ws} board={board} go={go} mode="install" />
            : page === 'fonts' ? <FontChoice ws={ws} board={board} go={go} />
            : page === 'card' ? <Fonts board={board} ws={ws} go={go} mode="install" />
            : page === 'build' ? <Build ws={ws} board={board} go={go} />
            : page === 'looks' ? <Looks ws={ws} board={board} initialCreator={styleCreator} onPresets={() => setPage('presets')} onBuild={() => setPage('build')} onDemo={(id) => { setDemoLook(id); setPage('demo'); }} onEdit={(l) => { setEditingLook(l); setEditorOpen((n) => n + 1); setPage('editor'); }} onNew={() => { setEditingLook(null); setEditorOpen((n) => n + 1); setPage('editor'); }} />
            : page === 'editor' ? <EditorLoader key={editorOpen} lookId={editingLook?.id ?? null}>{(fresh) => (
                <StyleEditor key={fresh?.id ?? 'new'} editing={fresh} onSaved={(look) => { setEditingLook(look); void board.refreshLibrary(); }} onDemo={(id) => setPage('demo', () => setDemoLook(id))} onLeaveGuard={(g) => { leaveGuard.current = g; }} />
              )}</EditorLoader>
            : page === 'library' ? <FontLibrary board={board} onDemo={(folder) => { setDemoFont(folder); setPage('demo'); }} />
            : page === 'contributors' ? <Contributors onFonts={() => setPage('library')} onLooks={(name) => { setStyleCreator(name); setPage('looks'); }} onDemo={() => setPage('demo')} />
            : page === 'demo' ? <Suspense fallback={<span className="hint row" style={{ gap: 14, padding: 24 }}><Loader />Opening the demo room…</span>}><Demo initialLook={demoLook} initialFont={demoFont} board={board} /></Suspense>
            : page === 'live-presets' ? <Presets ws={liveWs} board={board} go={go} mode="live" />
            : page === 'live-card' ? <Fonts board={board} ws={liveWs} go={go} mode="live" />
            : page === 'settings' ? <Settings touring={!!tour} />
            : page === 'about' ? <About updates={tour ? null : updates} />
            : <Diagnostics board={board} />}
        </ErrorBoundary>}
      </main>
      {/* The bar along the bottom: the tour, the saber worked on, what its firmware says in full, and this app's version. */}
      <footer className="status" aria-label="Status">
        <button type="button" className="tourbtn" data-tour="side-tour" disabled={!!tour} onClick={() => startTour(0)}><Icon name="info" /><span>Take the tour</span></button>
        <span className="st" title={ws.saber ? `Working on ${ws.saber.name}` : undefined}>
          <span style={{ display: 'flex', width: 14, color: ws.live ? 'var(--holo)' : 'var(--mute)' }}><Icon name={ws.live ? 'usb' : ws.saber?.planned ? 'gear' : 'blade'} /></span>
          {ws.saber
            ? <><span>Working on</span><b className="ellip" style={{ maxWidth: 220 }}>{ws.saber.name}</b><span>{ws.live ? 'plugged in' : ws.saber.planned ? 'planned, not seen yet' : 'not plugged in'}</span></>
            : <span>{ws.loading ? 'Reading your sabers…' : 'No saber yet'}</span>}
        </span>
        {(() => {
          const line = firmwareLine(ws.info, ws.saber?.name);
          if (!line) return <span className="st grow" />;
          const text = ws.live ? line : `Last read: ${line}`;
          return <span className="st grow" title={text}><span className="ellip">{text}</span></span>;
        })()}
        {!tour && <span className="st"><UpdateChip view={updates} onOpen={() => setPage('about')} /></span>}
        <span className="st">Hiltwright {window.hiltwright?.appVersion ?? '?'}</span>
      </footer>
      {tour?.phase === 'on' && <Tour steps={TOUR_STEPS} index={tour.index} page={page} onIndex={(i) => setTour((t) => (t ? { ...t, index: i } : t))} onEnd={endTour} />}
      {offer && !tour && (
        <div className="dialog-back" role="presentation" onKeyDown={(e) => { if (e.key === 'Escape') answerOffer(false); }}>
          <section className="panel dialog" role="dialog" aria-modal="true" aria-labelledby="tour-offer-title" aria-describedby="tour-offer-text" style={{ width: 'min(500px, 92vw)' }} data-tour="tour-offer">
            <div className="ph"><h2 id="tour-offer-title">New to Hiltwright?</h2></div>
            <div className="pb col" style={{ gap: 14 }}>
              <div id="tour-offer-text" className="col" style={{ gap: 8 }}>
                <p className="dim" style={{ fontSize: 13.5 }}>A short tour shows what each page is for, and how a saber goes from a plan to installed firmware.</p>
                <p className="dim" style={{ fontSize: 13.5 }}>The tour uses an example saber, so nothing is sent to a saber or saved while it runs.</p>
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn sm ghost" onClick={() => answerOffer(false)}><span className="b"><span className="i">Not now</span></span></button>
                <button type="button" className="btn sm pri" autoFocus onClick={() => answerOffer(true)}><span className="b"><span className="i">Take a five-minute tour</span></span></button>
              </div>
              <span className="hint">You can take it later from "Take the tour" at the bottom left of the window.</span>
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

/**
 * The Armory (docs/install-live-plan.md, variant D): the sabers this computer knows on the left, to pick from; the
 * picked saber on the right with its two ways forward, each explained: adjust it live (plugged in, any firmware), or
 * change its setup for the next install. A saber plugged in is picked on its own; another can be picked meanwhile.
 */
function Armory({ board, ws, go, focus, setFocus }: { board: ReturnType<typeof useBoard>; ws: Workspace; go: (p: Page) => void; focus: Focus; setFocus: (f: Focus) => void }) {
  const { status, error } = board;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planName, setPlanName] = useState('');
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
    // Picked at once, even while another saber is plugged in: that one stays connected, for Live.
    ws.choose(rec.id); go('wiring');
  };
  // Sharing a saber's setup with another owner (saberShare.ts): a .hwsaber file out, or one in as a planned saber.
  const [shareNote, setShareNote] = useState<{ tone: 'green' | 'amber' | 'red'; lines: string[] } | null>(null);
  const [sharing, setSharing] = useState(false);
  const reason = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  // Fonts it names that this computer has neither in the font library nor among the fonts that come with Hiltwright.
  const fontsNotHere = async (fonts: string[]) => {
    const [lib, packs] = await Promise.all([fontLibraryList.load().catch(() => []), packList.load().catch(() => [])]);
    const have = new Set([...lib.map((f) => f.folder), ...packs.filter((p) => p.kind === 'font').map((p) => p.name)].map((n) => n.toLowerCase()));
    return fonts.filter((f) => !have.has(f.toLowerCase()));
  };
  const shareSaber = async (s: SaberRecord) => {
    setShareNote(null); setSharing(true);
    try {
      // The plan as the Install pages show it: with the live presets while it is plugged in.
      const model = s.id === ws.saber?.id && ws.model ? ws.model : starterModel(s);
      const r = await window.hiltwright.library.exportShare(s.name, model);
      if (!r) return;
      setShareNote({ tone: 'green', lines: [
        `${s.name} is saved as ${r.file.split(/[\\/]/).pop()}: ${r.presets} preset${r.presets === 1 ? '' : 's'}${r.styles ? `, ${r.styles} pasted or built style${r.styles === 1 ? '' : 's'}` : ''}${r.customProp ? `, and the prop file ${r.customProp}` : ''}. Anyone with Hiltwright can import it here, in the Armory.`,
        r.fonts.length ? `Sound fonts are named in the file, not carried. Whoever imports the file needs ${listed(r.fonts)}.` : 'The file names no sound fonts.',
      ] });
    } catch (err) { setShareNote({ tone: 'red', lines: [`${s.name} was not shared: ${reason(err)}`] }); } finally { setSharing(false); }
  };
  const importSaber = async () => {
    setShareNote(null); setSharing(true);
    try {
      const r = await window.hiltwright.library.importShare();
      if (!r) return;
      await board.refreshLibrary();
      ws.choose(r.saber.id);
      const missing = await fontsNotHere(r.fonts);
      const lines = [
        `${r.saber.name} is imported as a saber set up ahead${r.from !== r.saber.name ? ` (shared as "${r.from}")` : ''}. ${r.saber.name}’s presets are the list for its next flash${r.stylesAdded ? `, and ${r.stylesAdded} of its styles are now in your Styles` : ''}.`,
        'Before you flash it, choose its board and check every pin on Wiring against your own hilt: a wrong pin can damage the board.',
      ];
      if (r.customProp) lines.push(r.propMissing ? `${r.saber.name} builds with the prop file ${r.customProp}, which was not in the shared file. Choose that prop file on Wiring.` : `${r.saber.name} builds with the prop file ${r.customProp}, which came in the shared file. A prop file is code that goes into the firmware: flash it only if you trust where it came from.`);
      if (missing.length) lines.push(`Not in your font library: ${listed(missing)}. Add ${missing.length === 1 ? 'it' : 'them'} before you get the card ready.`);
      setShareNote({ tone: missing.length || r.propMissing || r.customProp ? 'amber' : 'green', lines });
    } catch (err) { setShareNote({ tone: 'red', lines: [`The saber was not imported: ${reason(err)}`] }); } finally { setSharing(false); }
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
  const stepPage: Record<string, Page> = { wiring: 'wiring', presets: 'presets', fonts: 'fonts', card: 'card', build: 'build' };
  const stepTitle: Record<string, string> = { wiring: 'Wiring', presets: 'Presets', fonts: 'Fonts', card: 'Card', build: 'Build & Flash' };
  const cur = ws.saber;
  const plans = ws.plans;
  // A plan is offered only to a saber Hiltwright knows nothing about yet: no setup made here and no install recorded.
  // One already set up here (a saved model) is its own saber, not a plan arriving, so it is not asked about every time
  // it is plugged in; adopting would replace its setup.
  const adoptable = ws.live && cur && !cur.firmware && !cur.model && !cur.planned && plans.length > 0;
  // The saber connected now, whichever is picked.
  const plugged = status === 'connected' && board.saber ? board.saber : null;
  // Every saber plugged in, connected or not, by USB serial, with its COM port (Windows names one): undefined when a
  // saber is not plugged in, null when it is but no port is known.
  const portOf = (s: SaberRecord): string | null | undefined => {
    const b = s.identity.usbSerial ? board.plugged.find((p) => p.serial === s.identity.usbSerial) : undefined;
    return b ? b.port : undefined;
  };
  // Picking a saber that is plugged in but not the one connected connects to it, so two sabers on one computer can each
  // be worked on live. A switch waits for a running job, and says so.
  const [switchNote, setSwitchNote] = useState<string | null>(null);
  const pick = (s: SaberRecord) => {
    ws.choose(s.id);
    setSwitchNote(null);
    if (plugged?.id === s.id || portOf(s) === undefined || !s.identity.usbSerial) return;
    void board.switchTo(s.identity.usbSerial, s.name).then((why) => setSwitchNote(why ? `${s.name} was not connected: ${why}` : null));
  };
  const info = ws.live ? board.info : null;
  const playing = info?.currentPreset != null ? info.presets[info.currentPreset] ?? null : null;
  const fwLine = firmwareLine(ws.info, cur?.name);
  // The panel to use now is the bright one: live while the picked saber is plugged in, its setup otherwise.
  const door = (bright: boolean): React.CSSProperties => (bright ? { borderLeft: '3px solid var(--sel)', background: 'color-mix(in srgb,var(--sel) 5%,transparent)' } : {}); // the Start here panel
  // One line each, two to a row: the right column fits the default window without scrolling.
  const fact = (icon: Parameters<typeof Icon>[0]['name'], k: string, v: string) => (
    <div className="row" style={{ gap: 8, padding: '6px 10px', border: '1px solid var(--line2)', borderRadius: 'var(--r-field)', background: 'var(--field)', minWidth: 0 }} title={`${k}: ${v}`}>
      <span className="hint" style={{ display: 'flex', width: 13, flex: 'none' }}><Icon name={icon} /></span>
      <b className="ellip" style={{ fontWeight: 600, fontSize: 12.5, minWidth: 0 }}>{v}</b>
    </div>
  );

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(400px,470px)' }}>
      <div className="col" style={{ gap: 16, minHeight: 0 }}>
        {problems.map((p) => (
          <div key={p.keptAs} className="note amber" role="alert"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
            <span>Your {p.store} could not be read. The file was kept as <b className="mono">{p.keptAs}</b> in {p.place === 'fonts' ? 'the font library folder' : "Hiltwright's data folder"}, and Hiltwright started {p.startedFrom === 'backup' ? 'from its backup copy' : p.startedFrom === 'readable records' ? 'with the entries it could read' : 'with an empty one'}.</span>
            <span className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => void openFolder(p.place)}><span className="b"><span className="i">Open folder</span></span></button><button type="button" className="btn sm ghost" onClick={() => setProblems((ps) => ps.filter((x) => x !== p))}><span className="b"><span className="i">Dismiss</span></span></button></span>
          </span></div>
        ))}
        <section className="panel" aria-label="Your sabers" style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }} data-tour="armory-sabers">
          <div className="ph"><h2>Your sabers</h2>
            {planning
              ? <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void plan(); }}><span className="input sans" style={{ height: 30, width: 200 }}><input type="text" value={planName} autoFocus placeholder="Name the saber" aria-label="Name for the new saber" onChange={(e) => setPlanName(e.target.value)} /></span><button type="submit" className="btn sm pri"><span className="b"><span className="i">Start</span></span></button><button type="button" className="chip" aria-label="Do not start a new saber" onClick={() => setPlanning(false)}><Icon name="x" /></button></form>
              : <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" disabled={sharing} title="Bring in a saber someone shared with you (.hwsaber): its wiring, prop, presets and styles, set up ahead" onClick={() => void importSaber()}><span className="b"><span className="i"><Icon name="import" />Import</span></span></button>
                  <button type="button" className="btn sm pri" data-tour="armory-new" title="Set a saber up before it is plugged in: wiring, presets and styles, ready to install when it arrives" onClick={() => setPlanning(true)}><span className="b"><span className="i"><Icon name="plus" />New saber</span></span></button>
                </div>}
          </div>
          {planError && planning && (
            <div className="note red" role="alert" style={{ margin: '12px 18px 0' }}><Icon name="warn" /><span>The new saber was not started: {planError}</span></div>
          )}
          {shareNote && (
            <div className={`note ${shareNote.tone}`} role="status" style={{ margin: '12px 18px 0' }}><Icon name={shareNote.tone === 'green' ? 'check' : 'warn'} />
              <span className="col grow" style={{ gap: 6 }}>{shareNote.lines.map((l) => <span key={l}>{l}</span>)}</span>
              <button type="button" className="chip" aria-label="Dismiss" style={{ alignSelf: 'flex-start' }} onClick={() => setShareNote(null)}><Icon name="x" /></button>
            </div>
          )}
          <div className="list" role="listbox" aria-label="Sabers to pick from" style={{ overflow: 'auto' }}>
            {ws.loading && <LoadingSpace text="Reading your sabers…" />}
            {!ws.loading && board.library.length === 0 && <div className="hint" style={{ padding: '14px 18px' }}>No sabers yet. Plug one in and it is remembered, or start a new one to set up ahead.</div>}
            {board.library.map((s, n) => {
              const isCur = s.id === cur?.id; const isPlugged = plugged?.id === s.id; const port = portOf(s);
              return (
                <div key={s.id} className={`li ${isCur ? 'on' : ''}`} style={{ gap: 10, minHeight: 62, ...(isCur ? { background: 'color-mix(in srgb,var(--sel) 8%,transparent)', boxShadow: 'inset 3px 0 0 var(--sel)' } : {}) }}>
                  {editing && isCur
                    ? <form className="row grow" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void board.renameSaber(draft); setEditing(false); }}>
                        <span className="input sans grow" style={{ height: 32 }}><input type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Saber name" /></span>
                        <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
                        <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}><span className="b"><span className="i">Cancel</span></span></button>
                      </form>
                    : <>
                        <button type="button" role="option" aria-selected={isCur} className="row grow" style={{ gap: 12, minWidth: 0, alignSelf: 'stretch', textAlign: 'left' }} title={s.identity.configName ? `${s.identity.configName}, USB serial ${s.identity.usbSerial ?? 'unknown'}${port ? `, on ${port}` : ''}${!isPlugged && port !== undefined ? '. Pick it to connect to it.' : ''}` : undefined} onClick={() => pick(s)}>
                          <span className="n" aria-hidden="true">{n + 1}</span>
                          <span style={{ color: isPlugged ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 18, flex: 'none' }}><Icon name={isPlugged ? 'usb' : s.planned ? 'gear' : 'blade'} /></span>
                          <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                            <b className="ellip" style={{ fontWeight: 600 }}>{s.name}</b>
                            <span className="hint ellip">{s.planned ? `set up ahead · ${s.model?.presets.length ?? 0} presets · not seen yet` : `${s.identity.configName ?? '?'} · ${s.presets.length} presets · last seen ${new Date(s.lastSeen).toLocaleDateString()}`}</span>
                          </span>
                          {isPlugged
                            ? <span className="chip live"><span className="dot" />Connected{port ? ` · ${port}` : ''}</span>
                            : board.switchingTo && board.switchingTo.serial === s.identity.usbSerial
                              ? <span className="chip warn" role="status"><Loader size="sm" />Connecting{port ? ` · ${port}` : ''}</span>
                              : port !== undefined && <span className="chip"><Icon name="usb" />Plugged in{port ? ` · ${port}` : ''}</span>}
                          {s.planned && <span className="chip">Set up ahead</span>}
                        </button>
                        {isCur && isPlugged && <button type="button" className="chip" onClick={() => { setDraft(s.name); setEditing(true); }}>Rename</button>}
                        {s.id !== EXAMPLE_ID && <button type="button" className="chip" disabled={sharing} title={`Share ${s.name}: save its setup as a file someone else can import (wiring, prop, presets, styles, and its fonts by name)`} aria-label={`Share ${s.name}`} onClick={() => void shareSaber(s)}><Icon name="export" />Share</button>}
                        {s.id !== EXAMPLE_ID && (() => { const why = removeBlock(s, isPlugged ? s.id : null); return <button type="button" className="chip" disabled={!!why} title={why ?? (s.planned ? 'Remove this plan' : 'Remove this saber from the Armory')} aria-label={`Remove ${s.name}`} onClick={() => askRemove(s)}><Icon name="trash" /></button>; })()}
                      </>}
                </div>
              );
            })}
          </div>
          <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>{board.plugged.length > 1 ? 'Pick a saber that is plugged in to connect to it. Pick any other to change its setup.' : plugged ? 'Pick a saber to change its setup, even while another is plugged in.' : 'Plug a saber in over a data cable and it is picked here on its own. Or pick one to change its setup unplugged.'}</div>
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

      <div className="col" style={{ gap: 12, minHeight: 0, overflow: 'auto' }} aria-label="The picked saber">
        {!cur && ws.loading ? <section className="panel"><LoadingSpace text="Reading your sabers…" compact /></section> : !cur ? (
          <section className="panel" style={door(true)}><div className="pb col" style={{ gap: 8 }}><h3>Start here</h3><span className="small dim">Plug a saber in over a data cable, or press New saber to set one up ahead. Then the Install steps take it from wiring to an installed board.</span></div></section>
        ) : (
          <>
            <div className="col" style={{ gap: 4, padding: '2px 4px' }}>
              <div className="row" style={{ gap: 10, minWidth: 0 }}>
                <h2 className="ellip" style={{ margin: 0, fontSize: 22, minWidth: 0 }}>{cur.name}</h2>
                {ws.live ? <span className="chip live"><span className="dot" />Plugged in</span> : cur.planned ? <span className="chip">Set up ahead</span> : <span className="chip">Not plugged in</span>}
                <span className="grow" />
                {ws.live && <button type="button" className="btn sm ghost" onClick={() => void board.identify()}><span className="b"><span className="i"><Icon name="undo" />Read again</span></span></button>}
              </div>
              <span className="dim small" style={{ overflowWrap: 'anywhere' }}>{cur.planned ? 'Planned ahead: no firmware yet. Set it up below, and install it when the saber arrives.' : fwLine ? `${ws.live ? '' : 'Last read: '}${fwLine}` : 'Not read yet.'}</span>
              {status === 'error' && error && <span className="small red">{error}</span>}
            </div>
            {ws.live && board.info && noBattery(board.info.battery) && <div className="note amber"><Icon name="battery" /><span>No battery detected: {cur.name} is running on USB power alone. {cur.name} may pause for a moment when it plays sound or reads its card. If it does, Hiltwright reconnects to it on its own.</span></div>}
            {ws.live && board.info && board.info.rejected.length > 0 && <div className="note amber"><Icon name="warn" /><span>This firmware does not know {board.info.rejected.join(', ')}. Hiltwright adapts to what the board supports.</span></div>}
            {adoptable && !adopting && (
              <div className="note amber"><Icon name="info" /><span>Is this a saber you set up ahead? {plans.map((p) => <button key={p.id} type="button" className="holo" style={{ marginRight: 10 }} onClick={() => setAdopting(p)}>It is "{p.name}"</button>)}The plan{'’'}s wiring, presets and styles move onto this saber, ready to install.</span></div>
            )}
            {adoptable && adopting && (
              <div className="note amber" role="alertdialog" aria-label="Adopt a planned saber"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
                <span>Adopting "{adopting.name}" moves its wiring, prop, presets and styles onto {cur.name}. The next install replaces the styles compiled into {cur.name}'s current firmware, and the presets on its card will then be the plan's.</span>
                {cur.model && <span>{cur.name} already has wiring and presets set up in Hiltwright. They will be replaced by the plan's.</span>}
                <span className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn sm pri" onClick={() => { const id = adopting.id; setAdopting(null); void board.adoptPlan(id); }}><span className="b"><span className="i">Adopt</span></span></button>
                  <button type="button" className="btn sm ghost" onClick={() => setAdopting(null)}><span className="b"><span className="i">Not now</span></span></button>
                </span>
              </span></div>
            )}

            {/* The two ways forward, as a choice: the one chosen is bright here and its section comes forward in the sidebar. */}
            <div className="col" role="radiogroup" aria-label={`What you are doing with ${cur.name}`} style={{ gap: 12 }}>
            <section className={`panel door ${focus === 'live' ? 'on' : ''} ${ws.live ? '' : 'off'}`} style={{ flex: 'none', ...(ws.live ? {} : { opacity: 0.78 }) }} role="radio" aria-checked={focus === 'live'} aria-disabled={!ws.live} tabIndex={ws.live ? 0 : -1} aria-label="Adjust it live" data-tour="armory-live" onClick={() => setFocus('live')} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setFocus('live'); } }}>
              <div className="col" style={{ gap: 10, padding: '16px 18px' }}>
                <div className="row" style={{ gap: 10 }}><span className="radio" aria-hidden="true" /><span style={{ display: 'flex', width: 20, height: 20, color: focus === 'live' ? 'var(--holo)' : 'var(--dim)' }}><Icon name="bolt" /></span><h3 style={{ margin: 0 }}>Adjust it live</h3></div>
                <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{ws.live ? 'Change its presets, volume and colours on the saber itself, at once. Nothing is built or flashed; any ProffieOS firmware works.' : cur.planned ? 'A planned saber has no firmware yet, so there is nothing to adjust live.' : portOf(cur) !== undefined ? `${cur.name} is plugged in, but another saber is connected. Connect to ${cur.name} to change its presets, volume and colours on the saber itself.` : `Plug ${cur.name} in to change its presets, volume and colours on the saber itself.`}</p>
                {ws.live && info && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6 }}>
                    {fact('play', 'Playing', playing ? `Preset ${info.currentPreset! + 1} · ${playing.name.replace(/\s*\n\s*/g, ' ') || playing.font}` : 'Preset not known')}
                    {fact('presets', 'Presets', `${info.presets.length} presets on the card`)}
                    {fact('battery', 'Battery', `Battery ${batteryLabel(info.battery)}`)}
                    {fact('sd', 'Card', info.sdMissing ? 'Card not readable' : board.card.shared ? 'Card shared here' : 'Card in the saber')}
                  </div>
                )}
                {ws.live
                  ? <button type="button" className={`btn full ${focus === 'live' ? 'pri' : ''}`} onClick={() => go('live-presets')}><span className="b"><span className="i"><Icon name="bolt" />Adjust it live</span></span></button>
                  : !cur.planned && (portOf(cur) !== undefined
                    // Plugged in, while another saber is the one connected: connect to this one instead.
                    ? (() => {
                        const under = !!board.switchingTo || status === 'connecting' || status === 'reading';
                        return <button type="button" className="btn full" disabled={under} onClick={() => pick(cur)}><span className="b"><span className="i">{under ? <Loader size="sm" /> : <Icon name="usb" />}{under ? `Connecting to ${board.switchingTo?.name ?? cur.name}…` : `Connect to ${cur.name}${portOf(cur) ? ` on ${portOf(cur)}` : ''}`}</span></span></button>;
                      })()
                    : <button type="button" className="btn full" disabled><span className="b"><span className="i"><Icon name="usb" />Plug it in to adjust</span></span></button>)}
                {switchNote && <div className="note amber" role="status"><Icon name="warn" /><span>{switchNote}</span></div>}
                {!ws.live && plugged && plugged.id !== cur.id && <span className="hint">{plugged.name} is connected now. <button type="button" className="holo" onClick={() => ws.choose(plugged.id)}>Pick {plugged.name}</button> to adjust it live.</span>}
              </div>
            </section>

            <section className={`panel door ${focus === 'setup' ? 'on' : ''}`} style={{ flex: 'none' }} role="radio" aria-checked={focus === 'setup'} tabIndex={0} aria-label="Change its setup" data-tour="armory-progress" onClick={() => setFocus('setup')} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setFocus('setup'); } }}>
              <div className="col" style={{ gap: 10, padding: '16px 18px' }}>
                <div className="row" style={{ gap: 10 }}><span className="radio" aria-hidden="true" /><span style={{ display: 'flex', width: 20, height: 20, color: focus === 'setup' ? 'var(--holo)' : 'var(--dim)' }}><Icon name="build" /></span><h3 style={{ margin: 0 }}>Change its setup</h3></div>
                <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>Wiring, fonts and presets for the next install. Nothing on the saber changes until you install it.</p>
                {/* One line per step: done, next (bright) or to come; each goes to its page. */}
                <div className="col" style={{ gap: 0, border: '1px solid var(--line2)', borderRadius: 'var(--r-field)', overflow: 'hidden' }}>
                  {steps.map((st, i) => {
                    const done = (st.step === 'wiring' && wiringConfirmed(ws.model)) || (st.step === 'fonts' && chosenFonts(ws.model).length > 0) || (st.step === 'presets' && !!ws.model?.presets.length) || (st.step === 'card' && fontsMissingAsLastRead(ws)?.length === 0) || (st.step === 'build' && !!cur.firmware && !queuedLookIds(ws.model ?? undefined, cur.firmware).length && !ws.model?.presetsFrom);
                    const now = st.step === next;
                    return (
                      <button key={st.step} type="button" className="row" style={{ gap: 10, padding: '7px 10px', minWidth: 0, textAlign: 'left', borderTop: i ? '1px solid var(--line)' : 0, background: now ? 'color-mix(in srgb,var(--sel) 10%,transparent)' : undefined }} onClick={() => go(stepPage[st.step])}>
                        <span className="mono small" aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', width: 16, flex: 'none', color: done ? 'var(--green)' : now ? 'var(--holo)' : 'var(--mute)' }}>{done ? <span style={{ display: 'flex', width: 14 }}><Icon name="check" /></span> : i + 1}</span>
                        <b style={{ fontWeight: now ? 700 : 600, fontSize: 13, width: 112, flex: 'none' }}>{stepTitle[st.step]}{done && <span className="sr"> (done)</span>}{now && <span className="sr"> (next)</span>}</b>
                        <span className="hint ellip" style={{ minWidth: 0 }} title={st.label}>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className={`btn full ${focus === 'setup' ? 'pri' : ''}`} onClick={() => go(stepPage[next])}><span className="b"><span className="i"><Icon name="chev" />Continue with {stepTitle[next]}</span></span></button>
              </div>
            </section>
            </div>
          </>
        )}
      </div>
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
  if (!state) return <div className="pb hint row" style={{ gap: 14 }}><Loader />Loading the style…</div>;
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
