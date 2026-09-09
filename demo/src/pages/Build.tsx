import { useNavigate } from 'react-router-dom';
import { BUILD_STEPS, useActiveSaber, useStore } from '../store';
import { flashEstimate, preflight } from '../model';
import { Icon } from '../components/Icon';
import { Button, Chip, Meter, Note, Panel, PanelHead } from '../components/ui';

function Bar({ label, kb, pct, color }: { label: string; kb: string; pct: number; color: string }) {
  return (
    <div className="row" style={{ gap: 12 }}>
      <span style={{ width: 190, fontSize: 13, color: 'var(--dim)' }} className="ellip">{label}</span>
      <div className="grow" style={{ height: 8, background: '#1b2836' }}><div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color }} /></div>
      <span className="mono" style={{ width: 70, textAlign: 'right', fontSize: 12 }}>{kb}</span>
    </div>
  );
}

export function Build() {
  const nav = useNavigate();
  const saber = useActiveSaber();
  const looks = useStore((s) => s.looks);
  const build = useStore((s) => s.build);
  const connectedId = useStore((s) => s.connectedId);
  const { startBuild, cancelBuild } = useStore();
  const est = flashEstimate(saber, looks);
  const checks = preflight(saber);
  const okCount = checks.filter((c) => c.ok).length;
  const connected = saber.id === connectedId;
  const running = build.status === 'running';
  const canInstall = connected && saber.pending.length > 0 && okCount === checks.length && !running;
  const pendingNames = saber.pending.map((id) => looks.find((l) => l.id === id)?.name ?? id);
  const tone = est.pct > 90 ? 'red' : est.pct > 70 ? 'amber' : '';
  const stepPct = running ? Math.min(100, Math.round((build.stepMs / BUILD_STEPS[build.stepIndex].ms) * 100)) : 0;
  const elapsed = `${String(Math.floor(build.elapsedMs / 60000)).padStart(2, '0')}:${String(Math.floor((build.elapsedMs % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Build &amp; install</div>
          <h1>{saber.pending.length ? 'Install new firmware' : 'Firmware is up to date'}</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            {saber.pending.length
              ? `Adding ${pendingNames.join(' and ')} means a fresh build. Back up, build, write. About two minutes on a real machine, fifteen seconds here.`
              : 'Nothing is waiting. Pick a look that needs a build from Looks, or change the wiring, and it will queue here.'}
          </p>
        </div>
        <div className="row">
          {running && build.stepIndex < 3 && <Button variant="ghost" onClick={cancelBuild}>Cancel</Button>}
          {running && build.stepIndex >= 3 && <Chip tone="warn" icon="warn">Writing · do not unplug</Chip>}
          {!running && <Button variant="pri" icon="bolt" onClick={startBuild} disabled={!canInstall}>{connected ? 'Install' : 'Plug in the saber'}</Button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
        <Panel tone={tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : ''} label="Flash budget">
          <PanelHead right={<Chip tone={tone === 'red' ? 'err' : tone === 'amber' ? 'warn' : 'ok'} icon={tone ? 'warn' : 'check'}>{est.pct}% after this build</Chip>}><h2>Flash budget · Proffieboard {saber.board}</h2></PanelHead>
          <div className="pb col" style={{ gap: 16 }}>
            <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 30, letterSpacing: '-.01em' }}>{est.used.toFixed(1)}</span>
              <span className="mono dim" style={{ fontSize: 14 }}>of {saber.flashKB} KB</span>
              <span className="mono mute" style={{ fontSize: 12, marginLeft: 'auto' }}>{est.free.toFixed(1)} KB free after install</span>
            </div>
            <Meter pct={est.pct} label={`${est.pct} percent of flash after this build`} />
            <div className="col" style={{ gap: 8, paddingTop: 4 }}>
              <Bar label="ProffieOS 8 + edit mode" kb={`${est.base.toFixed(1)} KB`} pct={(est.base / saber.flashKB) * 100} color="var(--holo-dim)" />
              <Bar label={`${saber.compiled.length} looks compiled in`} kb={`${(est.lib - saber.pending.reduce((a, id) => a + (looks.find((l) => l.id === id)?.kb ?? 0), 0)).toFixed(1)} KB`} pct={(est.lib / saber.flashKB) * 100} color="var(--holo)" />
              {saber.pending.length > 0 && <Bar label={`${pendingNames.join(', ')} (new)`} kb={`${saber.pending.reduce((a, id) => a + (looks.find((l) => l.id === id)?.kb ?? 0), 0).toFixed(1)} KB`} pct={(saber.pending.reduce((a, id) => a + (looks.find((l) => l.id === id)?.kb ?? 0), 0) / saber.flashKB) * 100} color="var(--amber)" />}
              <Bar label="Small looks for crystals, accents, motors" kb={`${est.small.toFixed(1)} KB`} pct={(est.small / saber.flashKB) * 100} color="var(--line2)" />
            </div>
            {est.pct > 70
              ? <Note tone={est.pct > 90 ? 'red' : 'amber'}>{est.pct > 90 ? 'This will not fit. Remove a look, or reuse an existing look with different colours instead.' : `Room for roughly ${Math.max(0, Math.floor(est.free / 4.5))} more looks on this board. Presets that reuse a look with different colours are free, so prefer those over new looks.`}</Note>
              : <Note tone="green">Plenty of room. A V3 board has twice the flash of a V2.</Note>}
          </div>
        </Panel>

        <Panel label="Pre-flight checks">
          <PanelHead right={<Chip tone={okCount === checks.length ? 'ok' : 'warn'} icon={okCount === checks.length ? 'check' : 'warn'}>{okCount} of {checks.length}</Chip>}><h2>Pre-flight</h2></PanelHead>
          <div className="list">
            {checks.map((c) => (
              <div key={c.label} className="li" style={{ gap: 14, minHeight: 46 }}>
                <span style={{ color: c.ok ? 'var(--green)' : 'var(--amber)', display: 'flex', width: 18 }}><Icon name={c.ok ? 'check' : 'warn'} /></span>
                <span className="col grow" style={{ gap: 0 }}><span style={{ fontSize: 13.5 }}>{c.label}</span><span className="hint ellip">{c.detail}</span></span>
                {!c.ok && c.label.startsWith('Every preset') && <Button size="sm" variant="ghost" onClick={() => nav('/presets')}>Fix</Button>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
        <Panel label="Install progress">
          <PanelHead right={<span className="mono dim" style={{ fontSize: 12 }}>{running ? `Step ${build.stepIndex + 1} of 6 · ${elapsed} elapsed` : build.status === 'done' ? `Done at ${build.finishedAt}` : build.status === 'cancelled' ? 'Cancelled' : 'Waiting'}</span>}><h2>{running ? 'Installing' : 'Install'}</h2></PanelHead>
          <div className="pb col" style={{ gap: 16 }} aria-live="polite">
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              {BUILD_STEPS.map((s, i) => {
                const st = build.status === 'done' || (running && i < build.stepIndex) ? 'done' : running && i === build.stepIndex ? 'now' : 'todo';
                return (
                  <div key={s.id} className={`step ${st}`}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="box">{st === 'done' ? <Icon name="check" /> : st === 'now' ? <Icon name="spin" /> : i + 1}</span>
                      {i < BUILD_STEPS.length - 1 && <span className="line" />}
                    </div>
                    <div className="col" style={{ gap: 1 }}><span className="t">{s.label}</span><span className="hint mono" style={{ fontSize: 11 }}>{s.sub}</span></div>
                  </div>
                );
              })}
            </div>
            {running && (
              <div className="col" style={{ gap: 6 }}>
                <div className="row between" style={{ fontSize: 12.5, color: 'var(--dim)' }}><span>{BUILD_STEPS[build.stepIndex].label} · hiltwright_{saber.id}.h for Proffieboard {saber.board}</span><span className="mono">{stepPct}%</span></div>
                <div style={{ height: 6, background: '#1b2836' }}><div style={{ height: '100%', width: `${stepPct}%`, background: 'var(--holo)', boxShadow: '0 0 10px var(--holo)', transition: 'width 120ms linear' }} /></div>
              </div>
            )}
            <div className="console" style={{ maxHeight: 150 }}>
              {build.log.length === 0 ? <span className="mute">Output appears here. Nothing is sent to a real board in this demo.</span> : build.log.map((l, i) => <div key={i}>{l}</div>)}
              {running && <span className="holo">▌</span>}
            </div>
            <div className="row between"><span className="hint">{running ? 'Keep the saber plugged in. Do not press its buttons.' : 'Every install starts with a full backup.'}</span></div>
          </div>
        </Panel>

        <div className="col" style={{ gap: 20 }}>
          {build.status === 'done' && (
            <Panel label="Result">
              <PanelHead right={<Chip tone="ok" icon="check">Verified</Chip>}><h2>Installed · {build.finishedAt}</h2></PanelHead>
              <div className="pb col" style={{ gap: 12 }}>
                <p className="dim small">The saber reports ProffieOS 8.10, hiltwright_{saber.id}.h, built {build.finishedAt}. presets.ini was restored from the backup.</p>
                <Button size="sm" variant="pri" icon="presets" onClick={() => nav('/presets')}>Use the new looks</Button>
              </div>
            </Panel>
          )}
          {build.status === 'cancelled' && <Note tone="amber">Cancelled before writing. The saber still runs its previous firmware and the backup is untouched.</Note>}
          <Panel tone="red" label="Previous attempt">
            <PanelHead right={<Chip tone="ok" icon="check">Fixed</Chip>}><h2>Previous attempt · 12:02</h2></PanelHead>
            <div className="pb col" style={{ gap: 14 }}>
              <h3 style={{ color: 'var(--red)' }}>Preset 4 “Crystal focus” needed a second look</h3>
              <p className="dim" style={{ fontSize: 13.5, textWrap: 'pretty' }}>This saber has a crystal chamber, but that preset only had a look for the main blade. You added a crystal look, so the build now passes.</p>
              <div className="row"><Button size="sm" onClick={() => nav('/presets')}>Open preset</Button><Button size="sm" variant="ghost" onClick={() => useStore.getState().showToast('cannot convert const char* to StyleFactory* at config line 214 (preset 4)')}>Compiler output</Button></div>
              <Note tone="amber">If the saber ever fails to show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Retry. Your backup from {saber.lastBackup} can be restored at any time.</Note>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
