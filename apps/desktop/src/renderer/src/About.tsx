// About: the app's version and licence, the source of this exact build, the theme, and the notices for what it is
// made from.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import { LICENCE_NAME, STYLE_STATEMENT, sourceUrl } from '../../shared/about';
import type { LegalTexts } from '../../shared/about';
import { UpdatesPanel, type UpdatesView } from './Updates';
import { THEMES } from '../../shared/themes';
import { chooseTheme, currentTheme } from './theme';

/** `updates`: the update state and its buttons; null during the tour, when nothing about updates shows. */
export function About({ updates }: { updates: UpdatesView | null }) {
  const version = window.hiltwright?.appVersion ?? '?';
  const [legal, setLegal] = useState<LegalTexts | null>(null);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<'licence' | 'notices' | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [theme, setTheme] = useState(() => currentTheme().id);
  useEffect(() => { void window.hiltwright.app.legal().then(setLegal, () => setFailed(true)); }, []);
  const url = sourceUrl(version);
  const open = async () => { setLinkError(null); try { await window.hiltwright.app.openSource(); } catch (err) { setLinkError(String(err).replace(/^Error: /, '')); } };
  const toggle = (what: 'licence' | 'notices') => setShow((s) => (s === what ? null : what));
  const text = show && legal ? legal[show] : null;

  // flex: none on the root, so the page keeps its full height and the main area scrolls to its end (as a shrinking
  // column it was cut to the window's height and its last panel ran past the scroll range).
  return (
    <div className="col" style={{ gap: 16, maxWidth: 900, flex: 'none' }}>
      <section className="panel" aria-label="About Hiltwright" data-tour="about-panel">
        <div className="ph"><h2>Hiltwright {version}</h2></div>
        <div className="pb col" style={{ gap: 14 }}>
          <div className="col" style={{ gap: 6 }}>
            <span>Licensed under {LICENCE_NAME}. You may use, change and share it under those terms.</span>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm" aria-pressed={show === 'licence'} onClick={() => toggle('licence')}><span className="b"><span className="i">{show === 'licence' ? 'Hide the licence' : 'Show the licence'}</span></span></button>
              <button type="button" className="btn sm" aria-pressed={show === 'notices'} onClick={() => toggle('notices')}><span className="b"><span className="i">{show === 'notices' ? 'Hide the third-party notices' : 'Show the third-party notices'}</span></span></button>
            </span>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span>The source of this exact build is on GitHub{url ? <>: <span className="mono small">{url}</span></> : '.'}</span>
            <span><button type="button" className="btn sm" disabled={!url} title={url ? undefined : 'This version has no release tag to link to'} onClick={() => void open()}><span className="b"><span className="i"><Icon name="link" />Open the source</span></span></button></span>
            {linkError && <span className="hint" role="alert">Could not open the link: {linkError}</span>}
          </div>
          <span className="dim">{STYLE_STATEMENT}</span>
        </div>
      </section>
      {/* Not shown during the tour: choosing a theme saves a setting, and nothing is saved while the tour runs. */}
      {updates && (
        <section className="panel" aria-label="Theme">
          <div className="ph"><h2>Theme</h2></div>
          <div className="pb row wrap" role="radiogroup" aria-label="Theme" style={{ gap: 10, alignItems: 'stretch' }}>
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={`opt ${theme === t.id ? 'on' : ''}`} style={{ minWidth: 260 }} onClick={() => void chooseTheme(t.id).then((now) => setTheme(now.id))}>
                <span className="radio" />
                <span className="col grow" style={{ gap: 6, minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{t.name}</b>
                  <span className="hint">{t.about}</span>
                  <span className="themeswatch" aria-hidden="true">{t.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {updates && <UpdatesPanel view={updates} />}
      {failed && <div className="note amber" role="alert"><Icon name="warn" /><span>The licence and notices could not be read from this install. They are in the Hiltwright source on GitHub.</span></div>}
      {show && !legal && !failed && <section className="panel"><LoadingSpace text={show === 'licence' ? 'Reading the licence…' : 'Reading the notices…'} compact /></section>}
      {show && legal && (
        <section className="panel" aria-label={show === 'licence' ? 'Licence text' : 'Third-party notices'} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ph"><h2>{show === 'licence' ? 'Licence' : 'Third-party notices'}</h2></div>
          {text
            ? <pre className="mono small" style={{ margin: 0, padding: 18, overflow: 'auto', maxHeight: '60vh', whiteSpace: 'pre-wrap' }}>{text}</pre>
            : <div className="pb hint">This file was not found in this install.</div>}
        </section>
      )}
    </div>
  );
}
