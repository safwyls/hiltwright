// Settings: the owner's own preferences for this app, not about any one saber. The theme first; more join it here.

import { useState } from 'react';
import { Icon } from './Icon';
import { THEMES } from '../../shared/themes';
import { chooseTheme, currentTheme } from './theme';

/** `touring`: the guided tour runs, so nothing is saved and the choices are shown but not offered. */
export function Settings({ touring }: { touring: boolean }) {
  const [theme, setTheme] = useState(() => currentTheme().id);
  return (
    <div className="col" style={{ gap: 16, maxWidth: 900, flex: 'none' }}>
      <section className="panel" aria-label="Theme" data-tour="settings-theme">
        <div className="ph"><h2>Theme</h2></div>
        {touring && <div className="note" style={{ margin: '14px 18px 0' }}><Icon name="info" /><span>Choosing a theme saves a setting, and nothing is saved while the tour runs. Pick one after the tour.</span></div>}
        <div className="pb row wrap" role="radiogroup" aria-label="Theme" style={{ gap: 10, alignItems: 'stretch' }}>
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} disabled={touring} className={`opt ${theme === t.id ? 'on' : ''}`} style={{ minWidth: 260 }} onClick={() => void chooseTheme(t.id).then((now) => setTheme(now.id))}>
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
    </div>
  );
}
