import { useActiveSaber, useStore } from '../store';
import { CONVERTER_MAP } from '../data';
import { Icon } from '../components/Icon';
import { Button, Chip, Note, Panel, PanelHead } from '../components/ui';

export function Fonts() {
  const saber = useActiveSaber();
  const fonts = useStore((s) => s.fonts);
  const mounted = useStore((s) => s.sdMounted);
  const { fixFont, toggleMount, convertAndCopy, showToast } = useStore();
  const issues = fonts.filter((f) => f.issue);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Fonts &amp; SD card</div><h1>Sound fonts</h1></div>
        <div className="row">
          <Button icon="sd" onClick={() => showToast(mounted ? 'Opened the card in Explorer (simulated).' : 'Mount the card first.')}>Open card in Explorer</Button>
          <Button variant="pri" icon="plus" onClick={() => showToast('Choose a font folder (simulated). Names are checked and converted before copying.')}>Add font folder</Button>
        </div>
      </div>

      <Panel label="SD card status">
        <div className="row" style={{ padding: '14px 18px', gap: 18 }}>
          <span style={{ color: mounted ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 26, height: 26 }}><Icon name="sd" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{saber.name}'s card · {mounted ? 'mounted through the saber' : 'ejected'}</h3>
            <div className="dim small">29.1 GB free of 32 GB · {fonts.length} fonts · 7 tracks · presets.ini present</div>
          </div>
          {mounted && <Chip tone="warn" icon="clock">Slow link · use a card reader for big fonts</Chip>}
          <Button size="sm" icon={mounted ? 'eject' : 'sd'} onClick={toggleMount}>{mounted ? 'Eject' : 'Mount'}</Button>
        </div>
        {mounted && <div style={{ padding: '0 18px 16px' }}><Note tone="amber">While the card is mounted the saber cannot play sound. Eject before you ignite. Hiltwright ejects automatically when you leave this page.</Note></div>}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
        <Panel label="Fonts on the card" style={{ minHeight: 0, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Font</th><th>Type</th><th>Sample rate</th><th>Size</th><th>Status</th></tr></thead>
            <tbody>
              {fonts.map((f) => (
                <tr key={f.id}>
                  <td><div className="row" style={{ gap: 10 }}><button type="button" className="row" style={{ width: 32, height: 32, justifyContent: 'center', border: '1px solid var(--line2)', color: 'var(--holo)' }} aria-label={`Preview ${f.name}`} onClick={() => showToast(`Playing ${f.name} · hum01.wav (simulated)`)}><Icon name="play" size={14} /></button><span className="nowrap" style={{ fontWeight: 600 }}>{f.name}</span></div></td>
                  <td className="dim">{f.type}</td>
                  <td className="mono dim" style={{ fontSize: 12.5 }}>{f.rate}</td>
                  <td className="mono dim" style={{ fontSize: 12.5 }}>{f.size}</td>
                  <td>{f.issue ? <Chip tone={f.issue.kind === 'mix' ? 'err' : 'warn'} icon={f.issue.kind === 'mix' ? 'x' : 'warn'}>{f.issue.kind === 'mix' ? 'Mono and poly mixed' : 'Wrong sample rate'}</Chip> : <Chip tone="ok" icon="check">Ready</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues.length > 0 && (
            <div className="col" style={{ padding: '16px 18px', gap: 12, borderTop: '1px solid var(--line)' }}>
              {issues.map((f) => (
                <Note key={f.id} tone={f.issue!.kind === 'mix' ? 'red' : 'amber'} action={<button type="button" className="holo nowrap" style={{ fontWeight: 600, marginLeft: 12 }} onClick={() => fixFont(f.id)}>{f.issue!.fix}</button>}>
                  <b style={{ fontWeight: 600 }}>{f.name}:</b> {f.issue!.text}
                </Note>
              ))}
            </div>
          )}
        </Panel>

        <aside className="col" style={{ gap: 20, minHeight: 0 }}>
          <button type="button" className="panel plain col" style={{ borderStyle: 'dashed', padding: '26px 18px', alignItems: 'center', gap: 10, textAlign: 'center', width: '100%' }} onClick={() => showToast('Choose a font folder (simulated).')}>
            <span style={{ color: 'var(--holo)', display: 'flex', width: 26, height: 26 }}><Icon name="import" /></span>
            <b style={{ fontWeight: 600 }}>Drop a font folder here</b>
            <span className="hint" style={{ maxWidth: 280 }}>Any board's naming works. We check the files and convert names before copying.</span>
          </button>

          <Panel label="Naming converter" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <PanelHead right={<Chip tone="warn" icon="warn">Convert</Chip>}><div className="col" style={{ gap: 2 }}><h2>Jedi Temple</h2><span className="hint">Xenopixel naming detected · 41 files</span></div></PanelHead>
            <div className="pb col" style={{ gap: 0, paddingTop: 8 }}>
              {CONVERTER_MAP.map(([a, b]) => (
                <div key={a} className="row between" style={{ minHeight: 30, borderBottom: '1px solid var(--line)' }}><span className="mono dim" style={{ fontSize: 12 }}>{a}</span><span className="mute" style={{ display: 'flex', width: 14 }}><Icon name="chev" /></span><span className="mono" style={{ fontSize: 12 }}>{b}</span></div>
              ))}
              <div className="hint" style={{ paddingTop: 10 }}>+ 35 more · nothing is renamed on your computer, only on the copy.</div>
            </div>
            <div className="row between" style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--line)' }}>
              <span className="mono mute" style={{ fontSize: 11.5 }}>36 MB · about 2 min over the saber</span>
              <Button size="sm" variant="pri" icon="check" onClick={convertAndCopy} disabled={!mounted}>Convert and copy</Button>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
