import { useStore } from '../store';
import { Button, Chip, Field, Note, Panel, PanelHead, Select, Toggle } from '../components/ui';

export function Settings() {
  const toast = useStore((s) => s.showToast);
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">App</div><h1>Settings</h1></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
        <div className="col" style={{ gap: 20 }}>
          <Panel>
            <PanelHead right={<Chip tone="ok" icon="check">Ready</Chip>}><h2>Toolchain</h2></PanelHead>
            <div className="list">
              {[['arduino-cli', '1.3.1'], ['Proffieboard core', '4.6'], ['arm-none-eabi-gcc', '14.2.1 · xPack'], ['dfu-util', '0.9'], ['On disk', '1.6 GB · C:\\Users\\you\\AppData\\Local\\Hiltwright\\toolchain']].map(([k, v]) => (
                <div key={k} className="li" style={{ minHeight: 40 }}><span className="dim grow small">{k}</span><span className="mono" style={{ fontSize: 12.5 }}>{v}</span></div>
              ))}
            </div>
          </Panel>
          <Panel>
            <PanelHead><h2>ProffieOS</h2></PanelHead>
            <div className="pb col" style={{ gap: 14 }}>
              <div className="grid2">
                <Field label="Version to build with"><Select value="8.10" onChange={() => {}} options={[{ value: '8.10', label: '8.10 · pinned' }, { value: '7.15', label: '7.15' }]} ariaLabel="ProffieOS version" /></Field>
                <Field label="Updates"><Select sans value="notify" onChange={() => {}} options={[{ value: 'notify', label: 'Tell me, do not install' }, { value: 'auto', label: 'Install automatically' }]} ariaLabel="Updates" /></Field>
              </div>
              <Note>New ProffieOS releases are tracked but never applied without a build you start.</Note>
            </div>
          </Panel>
        </div>
        <div className="col" style={{ gap: 20 }}>
          <Panel>
            <PanelHead><h2>Safety</h2></PanelHead>
            <div className="pb col" style={{ gap: 12 }}>
              <Toggle on onChange={() => toast('This cannot be switched off.')} label="Back up before every install" />
              <Toggle on onChange={() => toast('This cannot be switched off.')} label="Snapshot presets.ini before every change" />
              <Toggle on onChange={() => {}} label="Eject the SD card when leaving Fonts" />
            </div>
          </Panel>
          <Panel>
            <PanelHead><h2>Demo</h2></PanelHead>
            <div className="pb col" style={{ gap: 12 }}>
              <p className="hint">Everything in this build is simulated: no board, no toolchain, no SD card. Reload to reset the dummy data.</p>
              <Button size="sm" icon="undo" onClick={() => window.location.reload()}>Reset demo data</Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
