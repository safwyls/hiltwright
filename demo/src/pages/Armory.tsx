import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { flashEstimate, ROLE_META, type Saber } from '../model';
import { Icon } from '../components/Icon';
import { Button, Chip, Meter, Panel, PanelHead } from '../components/ui';
import { BladeBar, Hilt } from '../components/saber';

function SaberCard({ saber }: { saber: Saber }) {
  const nav = useNavigate();
  const setActive = useStore((s) => s.setActive);
  const connectedId = useStore((s) => s.connectedId);
  const looks = useStore((s) => s.looks);
  const p = saber.presets[0];
  const crystal = saber.blades.find((b) => b.role === 'crystal');
  const sides = saber.blades.filter((b) => b.role === 'side');
  const est = flashEstimate(saber, looks);
  const connected = saber.id === connectedId;
  const open = (to: string) => { setActive(saber.id); nav(to); };
  const bladesText = `${saber.blades.length} · ${saber.blades.map((b) => (b.role === 'main' ? `${b.pixels} px blade` : ROLE_META[b.role].label.toLowerCase())).join(', ')}`;

  return (
    <article className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="ph" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 2 }}>
          <h3>{saber.name}</h3>
          <div className="mute small">Proffieboard {saber.board} · {saber.flashKB} KB</div>
        </div>
        {connected ? <Chip tone="live">Connected</Chip> : saber.pending.length ? <Chip tone="warn">{saber.pending.length} look{saber.pending.length > 1 ? 's' : ''} to install</Chip> : <Chip>Last seen {saber.lastSeen}</Chip>}
      </div>
      <div className="pb col" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 8, padding: '6px 0' }}>
          <div className="row" style={{ gap: 0 }}><Hilt crystal={crystal ? p.crystalColor : null} /><BladeBar color={p.colors.base} /></div>
          {sides.length ? <div className="row" style={{ gap: 6, paddingLeft: 64 }}>{sides.map((b) => <BladeBar key={b.id} color={p.colors.base} thin style={{ maxWidth: '22%' }} />)}</div> : <div style={{ height: 6 }} />}
        </div>
        <dl className="grid3" style={{ margin: 0 }}>
          <div><dt className="label" style={{ fontSize: 10.5 }}>Blades</dt><dd style={{ margin: '2px 0 0', fontSize: 13 }}>{bladesText}</dd></div>
          <div><dt className="label" style={{ fontSize: 10.5 }}>Presets</dt><dd style={{ margin: '2px 0 0', fontSize: 13 }}>{saber.presets.length}</dd></div>
          <div><dt className="label" style={{ fontSize: 10.5 }}>Firmware</dt><dd style={{ margin: '2px 0 0', fontSize: 13 }}>{saber.fw}</dd></div>
        </dl>
        <div className="col" style={{ gap: 6 }}>
          <div className="row between"><span className="label" style={{ fontSize: 10.5 }}>Flash used</span><span className="mono dim" style={{ fontSize: 12 }}>{est.used.toFixed(1)} / {saber.flashKB} KB</span></div>
          <Meter pct={est.pct} label={`${est.pct} percent of flash used`} />
        </div>
      </div>
      <div className="row between" style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', marginTop: 'auto' }}>
        <span className="mono mute" style={{ fontSize: 11.5 }}>Backed up {saber.lastBackup}</span>
        <div className="row" style={{ gap: 6 }}>
          {saber.pending.length > 0 && <Button size="sm" variant="ghost" onClick={() => open('/build')}>Install</Button>}
          <Button size="sm" variant="ghost" onClick={() => open('/presets')}>Open</Button>
        </div>
      </div>
    </article>
  );
}

export function Armory() {
  const nav = useNavigate();
  const sabers = useStore((s) => s.sabers);
  const connectedId = useStore((s) => s.connectedId);
  const setActive = useStore((s) => s.setActive);
  const wizardReset = useStore((s) => s.wizardReset);
  const toast = useStore((s) => s.showToast);
  const connected = sabers.find((s) => s.id === connectedId);
  const startWizard = () => { wizardReset(); nav('/setup'); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Armory</div>
          <h1>Your sabers</h1>
          <p className="lead" style={{ marginTop: 8 }}>Every saber keeps its own wiring, presets, backups and firmware. Plug one in and Hiltwright recognises it.</p>
        </div>
        <div className="row">
          <Button icon="import" onClick={() => toast('Choose the old SD card in the file dialog (simulated).')}>Import from CFX / Xenopixel</Button>
          <Button variant="pri" icon="plus" onClick={startWizard}>Add a saber</Button>
        </div>
      </div>

      {connected && (
        <Panel label="Connected saber">
          <div className="row" style={{ padding: '16px 18px', gap: 18 }}>
            <span style={{ color: 'var(--holo)', display: 'flex', width: 28, height: 28 }}><Icon name="usb" /></span>
            <div className="col grow" style={{ gap: 2 }}>
              <h3>{connected.name} is connected</h3>
              <div className="dim small">Proffieboard {connected.board} · ProffieOS 8.10 · {connected.presets.length} presets · presets.ini matches your last edit · backed up {connected.lastBackup}</div>
            </div>
            <Button size="sm" icon="diag" onClick={() => { setActive(connected.id); nav('/diag'); }}>Diagnostics</Button>
            <Button size="sm" variant="pri" icon="presets" onClick={() => { setActive(connected.id); nav('/presets'); }}>Edit presets</Button>
          </div>
        </Panel>
      )}

      <div className="grid3" style={{ gap: 20 }}>
        {sabers.map((s) => <SaberCard key={s.id} saber={s} />)}
        <article className="panel plain" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column' }}>
          <div className="ph" style={{ borderBottom: 0 }}><h3>Add a saber</h3></div>
          <div className="list" style={{ padding: '0 6px 6px' }}>
            {[
              ['usb', 'Read from the saber', 'Plug it in. We read the board, firmware and presets.'],
              ['sd', 'Read from the SD card', 'Uses the ProffieOS source folder your installer left.'],
              ['build', 'Describe the hardware', 'Board, blades, buttons. Five steps.'],
            ].map(([ic, t, d]) => (
              <button key={t} type="button" className="li click" style={{ gap: 14 }} onClick={startWizard}>
                <span style={{ color: 'var(--holo)', display: 'flex', width: 18 }}><Icon name={ic} /></span>
                <span className="col grow" style={{ gap: 1 }}><b style={{ fontWeight: 600 }}>{t}</b><span className="hint">{d}</span></span>
                <span className="mute" style={{ display: 'flex', width: 16 }}><Icon name="chev" /></span>
              </button>
            ))}
          </div>
        </article>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 440px', gap: 20 }}>
        <Panel>
          <PanelHead><h2>Coming from Crystal Focus X or Xenopixel?</h2></PanelHead>
          <div className="pb col" style={{ gap: 14 }}>
            <p className="dim" style={{ fontSize: 13.5, maxWidth: 620, textWrap: 'pretty' }}>Point Hiltwright at your old card. It reads config.txt and colors.txt (CFX) or SET/config.ini (Xenopixel), turns each profile into a preset, converts font file names, and shows you the result before anything touches a saber.</p>
            <div className="row">
              <Button icon="sd" onClick={() => toast('Choose the old SD card in the file dialog (simulated).')}>Choose old SD card</Button>
              <span className="hint">Nothing is written until you press Install.</span>
            </div>
          </div>
        </Panel>
        <Panel label="Recent backups">
          <PanelHead right={<Button size="sm" variant="ghost" onClick={() => toast('Backups live in the app data folder (simulated).')}>All backups</Button>}><h2>Recent backups</h2></PanelHead>
          <div className="list">
            {[['Graflex Mk II · full flash + presets.ini', '12:04 today'], ['Graflex Mk II · presets.ini snapshot', '11:40 today'], ['Crossguard · full flash', '4 Sep']].map(([t, w]) => (
              <div key={t} className="li"><span style={{ color: 'var(--green)', display: 'flex', width: 16 }}><Icon name="shield" /></span><span className="grow">{t}</span><span className="mono mute" style={{ fontSize: 11.5 }}>{w}</span></div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
