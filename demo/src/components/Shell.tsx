import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore, useActiveSaber } from '../store';
import { Icon, Mark } from './Icon';
import { Button, Chip } from './ui';

const NAV = [
  { to: '/armory', label: 'Armory', icon: 'armory' },
  { to: '/presets', label: 'Presets', icon: 'presets', tier: 'live' },
  { to: '/looks', label: 'Looks', icon: 'looks' },
  { to: '/fonts', label: 'Fonts & SD', icon: 'fonts' },
  { to: '/build', label: 'Build & Install', icon: 'build', tier: 'build' },
  { to: '/diag', label: 'Diagnostics', icon: 'diag' },
];

export function Shell() {
  const saber = useActiveSaber();
  const sabers = useStore((s) => s.sabers);
  const setActive = useStore((s) => s.setActive);
  const connectedId = useStore((s) => s.connectedId);
  const savedAt = useStore((s) => s.savedAt);
  const sdMounted = useStore((s) => s.sdMounted);
  const toast = useStore((s) => s.toast);
  const showToast = useStore((s) => s.showToast);
  const build = useStore((s) => s.build);
  const loc = useLocation();
  const connected = saber.id === connectedId;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => showToast(''), 3600);
    return () => clearTimeout(t);
  }, [toast, showToast]);

  // Move focus to the page heading on navigation, for keyboard and screen-reader users.
  useEffect(() => {
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [loc.pathname]);

  const variant = saber.variants?.find((v) => v.id === saber.activeVariant);

  return (
    <div className="app">
      <aside className="side" aria-label="Primary">
        <div className="brand"><Mark /><span>HILTWRIGHT</span></div>
        <nav className="nav" aria-label="Sections">
          <div className="sec">Saber</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={n.icon} /><span>{n.label}</span>{n.tier && <span className="tier">{n.tier}</span>}
            </NavLink>
          ))}
          <div className="sec">App</div>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'on' : '')}><Icon name="gear" /><span>Settings</span></NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--line)' }} className="col">
          <div className="eyebrow" style={{ opacity: 0.6 }}>Toolchain</div>
          <div className="mono dim" style={{ fontSize: 11.5 }}>ProffieOS 8.10 · core 4.6</div>
          <div className="mono mute" style={{ fontSize: 11.5 }}>GCC 14.2 ready · 1.6 GB</div>
          <div className="hint" style={{ fontSize: 11, marginTop: 6 }}>Demo build. Board, toolchain and SD card are simulated.</div>
        </div>
      </aside>

      <header className="top">
        <div className="row" style={{ gap: 14 }}>
          <span className="input sans" style={{ height: 36, minWidth: 300, fontWeight: 600, fontSize: 13.5 }}>
            <span style={{ display: 'flex', width: 16 }}><Mark /></span>
            <span className="ellip">{saber.name}</span>
            <span className="mute" style={{ fontWeight: 400 }}>· Proffieboard {saber.board}</span>
            <span className="caret"><Icon name="down" /></span>
            <select value={saber.id} onChange={(e) => setActive(e.target.value)} aria-label="Active saber">
              {sabers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </span>
          {variant && <Chip tone="live" icon="blade">{variant.name} detected · {variant.pixels} px</Chip>}
        </div>
        <div className="row" style={{ gap: 12 }}>
          {connected ? <Chip tone="live">Connected · COM7</Chip> : <Chip>Not connected · last seen {saber.lastSeen}</Chip>}
          <Chip icon="battery">{connected ? '3.92 V · 78%' : '— · —'}</Chip>
          <Button size="sm" icon="shield" disabled={!connected || build.status === 'running'} onClick={() => showToast('Backup written: full flash + presets.ini.')}>Back up</Button>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <footer className="status" aria-label="Board status">
        <span><b>Board</b> Proffieboard {saber.board} · {saber.flashKB} KB</span>
        <span><b>Firmware</b> {saber.fw}</span>
        <span><b>presets.ini</b> {connected ? `saved ${Math.max(0, Math.round((Date.now() - savedAt) / 1000))} s ago` : 'not reachable'}</span>
        <span><b>SD</b> {sdMounted ? 'mounted via saber' : 'ejected'}</span>
        <span style={{ marginLeft: 'auto' }}><b>Backup</b> {saber.lastBackup}</span>
      </footer>

      {toast && <div className="toast fade" role="status" aria-live="polite"><Icon name="info" size={16} style={{ color: 'var(--holo)' }} />{toast}</div>}
    </div>
  );
}
