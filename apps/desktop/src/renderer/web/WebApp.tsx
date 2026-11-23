// The workshop on the website: the app's own Styles page and style editor, in the app's own frame, with no saber.
// Everything made here ends in a file the app opens (.hwstyle): the website is for trying, the app is for sabers.

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { makeStyleShare, registerLookSim, STYLE_SHARE_EXTENSION, type LookDef } from '@hiltwright/core';
import { Looks } from '../src/Looks';
import { StyleEditor } from '../src/StyleEditor';
import { ErrorBoundary } from '../src/ErrorBoundary';
import { Icon } from '../src/Icon';
import { Loader } from '../src/Loader';
import { Logo } from '../src/Logo';
import { Select } from '../src/Select';
import { applyTheme, currentTheme } from '../src/theme';
import { THEMES } from '../../shared/themes';
import { noSaberBoard, noSaberWorkspace } from './noSaber';

// The demo room carries three.js: fetched the first time the room opens, as in the app.
const Demo = lazy(() => import('../src/Demo').then((m) => ({ default: m.Demo })));

type Page = 'looks' | 'editor' | 'demo';
const TITLE: Record<Page, string> = { looks: 'Styles', editor: 'Style editor', demo: 'Demo room' };
const PAGES: { id: Page; title: string; icon: 'looks' | 'gear' | 'play' }[] = [{ id: 'looks', title: 'Styles', icon: 'looks' }, { id: 'editor', title: 'Style editor', icon: 'gear' }, { id: 'demo', title: 'Demo room', icon: 'play' }];
const HASH: Record<Page, string> = { looks: '#', editor: '#editor', demo: '#demo' };
const pageFromHash = (): Page => (location.hash === '#editor' ? 'editor' : location.hash === '#demo' ? 'demo' : 'looks');

/** Where the website keeps the download page and the help, from /workshop/. */
const SITE = { download: '../download.html', help: '../docs/styles.html', home: '../index.html' };

/** A file name from a style's name: letters, digits and dashes. */
const fileStem = (name: string) => name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'styles';

/** Hand the visitor a .hwstyle file holding these styles. */
function saveForApp(styles: LookDef[], stem: string): void {
  const blob = new Blob([JSON.stringify(makeStyleShare(styles, 'website'), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${stem}.${STYLE_SHARE_EXTENSION}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** In place of "Use it in": the way from this style to a saber, which is the app. */
function HandOff({ sel, yours }: { sel: LookDef; yours: LookDef[] }) {
  const getApp = <a className="btn sm" href={SITE.download}><span className="b"><span className="i"><Icon name="export" />Get the app</span></span></a>;
  if (sel.source === 'starter') {
    return (
      <>
        <span className="hint">{sel.name} comes with the Hiltwright app. Put it on a saber there, with its colours set preset by preset.</span>
        <div className="row" style={{ gap: 8 }}>{getApp}</div>
      </>
    );
  }
  return (
    <>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn sm pri" onClick={() => saveForApp([sel], fileStem(sel.name))}><span className="b"><span className="i"><Icon name="export" />Save for the app</span></span></button>
        {yours.length > 1 && <button type="button" className="btn sm" onClick={() => saveForApp(yours, 'my-styles')}><span className="b"><span className="i">Save all {yours.length}</span></span></button>}
        {getApp}
      </div>
      <span className="hint">Styles made here last until this tab is closed. To keep one and put it on a saber, save it, then in the app open Styles, choose <b>Import styles</b> and pick the file.</span>
    </>
  );
}

/** Narrower than the app's pages are laid out for. */
const NARROW = '(max-width: 899px)';

/** On a phone or a narrow window: the workshop is laid out like the app, for a computer screen. */
function TooNarrow({ onAnyway }: { onAnyway: () => void }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box', background: 'var(--bg0)' }}>
      <section className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="ph"><div className="row" style={{ gap: 10 }}><Logo size={24} /><h2>The workshop needs a bigger screen</h2></div></div>
        <div className="pb col" style={{ gap: 12 }}>
          <span>The workshop is Hiltwright{'’'}s own Styles page and style editor, laid out for a computer. Open this page on a computer, or widen the window.</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <a className="btn sm pri" href={SITE.home}><span className="b"><span className="i">Back to the website</span></span></a>
            <button type="button" className="btn sm ghost" onClick={onAnyway}><span className="b"><span className="i">Open it anyway</span></span></button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function WebApp() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  const [anyway, setAnyway] = useState(false);
  useEffect(() => { const m = matchMedia(NARROW); const on = () => setNarrow(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return narrow && !anyway ? <TooNarrow onAnyway={() => setAnyway(true)} /> : <Workshop />;
}

function Workshop() {
  const [page, setPageNow] = useState<Page>(pageFromHash);
  const [editing, setEditing] = useState<LookDef | null>(null);
  // The style the demo room opens with, when Styles or the editor sends one there.
  const [demoLook, setDemoLook] = useState<string | null>(null);
  // Bumped each time Styles opens the editor, so it starts afresh on that style (or a new one).
  const [editorOpen, setEditorOpen] = useState(0);
  const [theme, setTheme] = useState(() => currentTheme().id);
  const leaveGuard = useRef<((proceed: () => void) => void) | null>(null);

  const setPage = (p: Page, then?: () => void) => {
    const move = () => { then?.(); setPageNow(p); history.replaceState(null, '', HASH[p]); };
    if (p !== page && leaveGuard.current) leaveGuard.current(move); else move();
  };
  // Styles made earlier in this tab preview like the built-in ones.
  useEffect(() => { void window.hiltwright.looks.list().then((ls) => { for (const l of ls) registerLookSim(l); }); }, []);
  const pickTheme = (id: string) => { const t = applyTheme(id); setTheme(t.id); void window.hiltwright.theme.set(t.id); };
  // Full screen: the whole workshop, so the demo room and the editor get the browser's chrome back as room. Esc, or
  // the same button, leaves it; the browser's own way out (F11, its bar) is followed too.
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => { const on = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);
  const toggleFull = () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined); };

  return (
    <div className="app">
      <aside className="side" aria-label="Primary">
        <a className="brand" href={SITE.home} style={{ textDecoration: 'none', color: 'inherit' }}><Logo size={28} /><span className="wordmark">Hiltwright</span></a>
        <nav className="nav" aria-label="Sections">
          <div className="col" style={{ gap: 2 }}>
            <span className="sec">Workshop</span>
            {PAGES.map((p) => (
              <a key={p.id} href={HASH[p.id]} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setPage(p.id, p.id === 'editor' ? () => { setEditing(null); setEditorOpen((n) => n + 1); } : undefined); }}>
                <Icon name={p.icon} /><span>{p.title}</span>
              </a>
            ))}
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="sec">For your saber</span>
            <a href={SITE.download}><Icon name="export" /><span>Get the app</span></a>
            <a href={SITE.help}><Icon name="info" /><span>Help</span></a>
          </div>
          {/* In the sidebar, not the top bar: on a tablet held upright the top bar runs past the edge of the screen. */}
          {document.fullscreenEnabled && (
            <div className="col" style={{ gap: 2 }}>
              <span className="sec">View</span>
              <a href="#" aria-pressed={full} title={full ? 'Leave full screen (Esc)' : 'Fill the screen with the workshop'} onClick={(e) => { e.preventDefault(); toggleFull(); }}><Icon name={full ? 'exitfull' : 'fullscreen'} /><span>{full ? 'Leave full screen' : 'Full screen'}</span></a>
            </div>
          )}
        </nav>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 0, minWidth: 0 }}>
          <h1>{TITLE[page]}</h1>
          <div className="ident">
            <b className="ellip">Workshop on the web</b>
            <span className="hint ellip">try and build styles here; the app puts them on a saber</span>
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <label className="input sans" style={{ width: 150, height: 32 }} title="Theme">
            <span className="ellip">{THEMES.find((t) => t.id === theme)?.name ?? 'Theme'}</span><span className="caret"><Icon name="down" /></span>
            <Select value={theme} aria-label="Theme" onChange={(e) => pickTheme(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </label>
          <a className="btn sm pri" href={SITE.download}><span className="b"><span className="i"><Icon name="export" />Get the app</span></span></a>
        </div>
      </header>

      <main className="main">
        <ErrorBoundary key={page} what={`the ${TITLE[page]} page`}>
          {page === 'looks'
            ? <Looks ws={noSaberWorkspace} board={noSaberBoard} onPresets={() => undefined} onBuild={() => undefined} onDemo={(id) => setPage('demo', () => setDemoLook(id))}
                onEdit={(l) => setPage('editor', () => { setEditing(l); setEditorOpen((n) => n + 1); })} onNew={() => setPage('editor', () => { setEditing(null); setEditorOpen((n) => n + 1); })}
                browser={{ handOff: (sel, yours) => <HandOff sel={sel} yours={yours} />, demo: true }} />
            : page === 'editor'
            ? <StyleEditor key={editorOpen} editing={editing} inBrowser onSaved={() => undefined} onDemo={(id) => setPage('demo', () => setDemoLook(id))} onLeaveGuard={(g) => { leaveGuard.current = g; }} />
            : <Suspense fallback={<span className="hint row" style={{ gap: 14, padding: 24 }}><Loader />Opening the demo room…</span>}><Demo initialLook={demoLook} board={noSaberBoard} inBrowser /></Suspense>}
        </ErrorBoundary>
      </main>
    </div>
  );
}
