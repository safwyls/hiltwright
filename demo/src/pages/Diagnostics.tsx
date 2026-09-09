import { useEffect, useRef, useState } from 'react';
import { useActiveSaber, useStore } from '../store';
import { Button, Chip, Note, Panel, PanelHead } from '../components/ui';

export function Diagnostics() {
  const saber = useActiveSaber();
  const lines = useStore((s) => s.console);
  const connectedId = useStore((s) => s.connectedId);
  const send = useStore((s) => s.sendCommand);
  const [cmd, setCmd] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const connected = saber.id === connectedId;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lines]);

  const quick = ['version', 'battery', 'list_presets', 'id', 'scanid', 'sdtest'];

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Diagnostics</div><h1>{saber.name}</h1></div>
        {connected ? <Chip tone="live">Connected · COM7 · 115200</Chip> : <Chip tone="warn" icon="warn">Not connected</Chip>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 20, flex: 1, minHeight: 0 }}>
        <div className="col" style={{ gap: 20 }}>
          <Panel label="Board facts">
            <PanelHead><h2>From the board</h2></PanelHead>
            <div className="list">
              {[['Firmware', 'ProffieOS 8.10'], ['Config', `hiltwright_${saber.id}.h`], ['Prop', 'Fett263 · 2 buttons'], ['Battery', '3.92 V · 78%'], ['Blade ID', saber.activeVariant ? `${((saber.variants!.find((v) => v.id === saber.activeVariant)!.ohms ?? 0) / 1000).toFixed(1)} kΩ` : 'not configured'], ['SD card', 'present · 1.9 MB/s']].map(([k, v]) => (
                <div key={k} className="li" style={{ minHeight: 40 }}><span className="dim grow small">{k}</span><span className="mono" style={{ fontSize: 12.5 }}>{v}</span></div>
              ))}
            </div>
          </Panel>
          <Panel label="Effects">
            <PanelHead><h2>Effects</h2></PanelHead>
            <div className="pb grid3" style={{ gap: 8 }}>
              {['on', 'clash', 'blast', 'lock', 'force', 'off'].map((c) => <Button key={c} size="sm" full onClick={() => send(c)} disabled={!connected}>{c}</Button>)}
            </div>
          </Panel>
          <Note>Guided checks and the raw console share one connection. Nothing here needs the toolchain or the Windows driver.</Note>
        </div>
        <Panel label="Serial console" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead right={<div className="row wrap" style={{ gap: 6 }}>{quick.map((q) => <Chip key={q} onClick={() => send(q)}>{q}</Chip>)}</div>}><h2>Console</h2></PanelHead>
          <div className="console grow" style={{ border: 0, minHeight: 0 }}>
            {lines.map((l, i) => <div key={i} className={l.dir}>{l.text}</div>)}
            <div ref={end} />
          </div>
          <form className="row" style={{ padding: 12, borderTop: '1px solid var(--line)', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) { send(cmd); setCmd(''); } }}>
            <span className="input grow"><input type="text" value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Serial command" placeholder="Type a command. Try help." disabled={!connected} /></span>
            <Button type="submit" size="sm" variant="pri" disabled={!connected}>Send</Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
