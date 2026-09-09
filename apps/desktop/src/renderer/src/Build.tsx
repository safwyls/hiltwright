// Build & Install: adopt the connected saber onto Hiltwright firmware.
// Wiring form (the one thing old firmware cannot tell us) → generated config → build → backup → bootloader → write → verify.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type BladeRole, type ModelBlade, type Prop, type SaberConfigModel } from '@hiltwright/core';
import type { BuildResult, JobEvent, ToolchainStatus } from '../../shared/api';
import type { Board } from './board';
import { Icon } from './Icon';

const api = () => window.hiltwright;
const DATA_PINS = ['bladePin', 'blade2Pin', 'blade3Pin', 'blade4Pin'];
const POWER_PINS = ['bladePowerPin1', 'bladePowerPin2', 'bladePowerPin3', 'bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'];
const ROLES: { value: BladeRole; label: string }[] = [
  { value: 'main', label: 'Main blade' }, { value: 'crystal', label: 'Crystal chamber' }, { value: 'accent', label: 'Accent' }, { value: 'side', label: 'Side blade' }, { value: 'motor', label: 'Motor' },
];
const PROPS: { value: Prop; label: string }[] = [
  { value: 'fett263', label: 'Fett263 · edit mode, gestures' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' },
];

type Step = 'idle' | 'building' | 'built' | 'backup' | 'bootloader' | 'writing' | 'verifying' | 'done' | 'failed';

/** First guess at wiring from what the board reported. Every pin here is a guess the owner must confirm. */
function guessBlades(pixelBlades: number[]): ModelBlade[] {
  return pixelBlades.map((px, i) => ({
    id: `b${i + 1}`,
    role: i === 0 ? 'main' : px <= 8 ? (i === 1 ? 'crystal' : 'accent') : 'side',
    type: 'pixel', pixels: px, order: 'GRB', extra: [], leds: [], parallel: 1,
    wiring: { kind: 'own', dataPin: DATA_PINS[Math.min(i, 3)], powerPins: i === 0 ? ['bladePowerPin2', 'bladePowerPin3'] : [POWER_PINS[Math.min(3 + i, 5)]] },
  }));
}

export function Build({ board }: { board: Board }) {
  const { status } = board;
  // Frozen at connect time: the install deliberately drops the port, and the page must keep working through that.
  const [snap, setSnap] = useState<{ info: NonNullable<Board['info']>; saber: NonNullable<Board['saber']> } | null>(null);
  useEffect(() => { if (board.status === 'connected' && board.info && board.saber) setSnap({ info: board.info, saber: board.saber }); }, [board.status, board.info, board.saber]);
  const info = snap?.info ?? null;
  const saber = snap?.saber ?? null;
  const [tool, setTool] = useState<ToolchainStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [blades, setBlades] = useState<ModelBlade[]>([]);
  const [prop, setProp] = useState<Prop>('fett263');
  const [confirmedWiring, setConfirmedWiring] = useState(false);
  const [preview, setPreview] = useState<{ text: string; hash: string; warnings: string[]; errors: string[] } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [log, setLog] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { void api().toolchain.status().then(setTool); }, []);
  useEffect(() => api().onJobEvent((e) => setLog((l) => [...l, e].slice(-300))), []);
  useEffect(() => {
    if (info && !blades.length) setBlades(guessBlades(info.pixelBlades.length ? info.pixelBlades : [132]));
  }, [info, blades.length]);
  useEffect(() => {
    if (step === 'building' || step === 'writing' || step === 'backup') { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }
  }, [step]);

  const model = useMemo<SaberConfigModel | null>(() => {
    if (!info || !saber || !blades.length) return null;
    return {
      name: `hiltwright_${saber.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'saber'}`,
      board: /v3/i.test(saber.identity.version ?? '') ? 'V3' : 'V2',
      buttons: (info.version?.buttons === 1 || info.version?.buttons === 3 ? info.version.buttons : 2) as 1 | 2 | 3,
      prop,
      blades,
      presets: info.presets.map((p) => ({ font: p.font, track: p.track, name: p.name })),
      generator: `hiltwright ${window.hiltwright.appVersion}`,
    };
  }, [info, saber, blades, prop]);

  useEffect(() => { if (model) void api().build.preview(model).then(setPreview); }, [model]);

  const update = (i: number, patch: Partial<ModelBlade>) => { setBlades((b) => b.map((x, k) => (k === i ? { ...x, ...patch } : x))); setConfirmedWiring(false); setResult(null); setStep('idle'); };
  const setWiring = (i: number, w: ModelBlade['wiring']) => update(i, { wiring: w });

  const install = async () => {
    setInstalling(true);
    try { setTool(await api().toolchain.install()); } finally { setInstalling(false); }
  };

  const build = useCallback(async (force = false) => {
    if (!model || !saber) return;
    setStep('building'); setElapsed(0); setNote(null); setResult(null);
    const r = await api().build.run(saber.id, model, force);
    setResult(r);
    setStep(r.ok ? 'built' : 'failed');
    if (!r.ok) setNote({ tone: 'red', text: r.problems[0] ?? 'The build failed.' });
    console.log(`[build] ok=${r.ok} cached=${r.cached} ms=${r.ms} text=${r.textBytes} pct=${r.flashPct} problems=${JSON.stringify(r.problems)}`);
  }, [model, saber]);

  /** The install sequence. The renderer does the 1200-baud touch because it owns the serial port. */
  const install2 = useCallback(async () => {
    if (!result?.ok || !result.dfuPath || !saber) return;
    setNote(null); setElapsed(0);
    try {
      setStep('bootloader');
      const touched = await board.rebootToBootloader();
      if (!touched) { setStep('failed'); setNote({ tone: 'red', text: 'Could not reboot the saber into bootloader mode.' }); return; }
      const boot = await api().flash.waitForBootloader(20000);
      if (!boot.ok) { setStep('failed'); setNote({ tone: 'red', text: boot.text }); return; }
      setStep('backup');
      const bak = await api().flash.backup(saber.id, 'before-install');
      if (!bak.ok) { setStep('failed'); setNote({ tone: 'red', text: `Backup failed, so nothing was written. ${bak.detail}` }); return; }
      setStep('writing');
      const w = await api().flash.write(result.dfuPath);
      if (!w.ok) { setStep('failed'); setNote({ tone: 'red', text: `Writing failed. The backup from just now is at ${bak.file}. ${w.detail}` }); return; }
      setStep('verifying');
      const back = await api().flash.waitForRuntime(25000);
      if (!back) { setStep('failed'); setNote({ tone: 'amber', text: 'The firmware was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' }); return; }
      await new Promise((r) => setTimeout(r, 1500));
      await board.connect(false);
      setStep('done');
      setNote({ tone: 'green', text: `Installed. Backup of the previous firmware: ${bak.file}` });
    } catch (err) {
      setStep('failed');
      setNote({ tone: 'red', text: String(err) });
    }
  }, [result, saber, board]);

  // Dev aid: main calls this to run a compile-only pass against the connected board.
  useEffect(() => {
    (window as unknown as { hiltwrightBuildE2E?: () => Promise<string> }).hiltwrightBuildE2E = async () => {
      if (!model) return 'no model';
      setConfirmedWiring(true);
      await build(true);
      return 'built';
    };
  }, [model, build]);

  const pct = result?.flashPct ?? null;
  const busy = step === 'building' || step === 'backup' || step === 'bootloader' || step === 'writing' || step === 'verifying';
  const stepLabel: Record<Step, string> = { idle: 'Ready', building: 'Building firmware…', built: 'Firmware built', backup: 'Backing up the saber…', bootloader: 'Rebooting into bootloader…', writing: 'Writing firmware…', verifying: 'Waiting for the saber to come back…', done: 'Installed', failed: 'Stopped' };

  if (!info || !saber) {
    return (<><div className="page-head"><div><div className="eyebrow">Build &amp; install</div><h1>Adopt this saber</h1></div></div><section className="panel"><div className="pb dim">Connect a saber first. Adoption reads its presets and blade layout from the board, then builds Hiltwright firmware for it.</div></section></>);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Build &amp; install</div>
          <h1>Adopt {saber.name} onto Hiltwright firmware</h1>
          <p className="lead" style={{ marginTop: 8 }}>Keeps every preset's font, track and name. Blade looks become Hiltwright starter looks with colours you can change live. The saber is backed up first and the backup can always be put back.</p>
        </div>
        <div className="row">
          <span className={`chip ${step === 'done' ? 'ok' : step === 'failed' ? 'err' : busy ? 'warn' : ''}`}><span className="dot" />{stepLabel[step]}{busy ? ` · ${elapsed}s` : ''}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 20 }}>
        <section className="panel amber" aria-label="Wiring">
          <div className="ph"><h2>1 · Wiring</h2>{confirmedWiring ? <span className="chip ok"><Icon name="check" />Confirmed</span> : <span className="chip warn"><Icon name="warn" />Guessed from the board</span>}</div>
          <div className="pb col" style={{ gap: 12 }}>
            <div className="note amber"><Icon name="warn" /><span>The saber reported {info.pixelBlades.length} pixel blade{info.pixelBlades.length === 1 ? '' : 's'} ({info.pixelBlades.join(', ')} px) but old firmware cannot say which pins they use. Check every pin against your installer's diagram. Wrong power pins can damage hardware.</span></div>
            {blades.map((b, i) => (
              <div key={b.id} className="row wrap" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--line)', background: '#0b1016' }}>
                <span className="mono mute" style={{ fontSize: 11, width: 14 }}>{i + 1}</span>
                <span className="input sans" style={{ width: 170, height: 34 }}><span className="ellip">{ROLES.find((r) => r.value === b.role)?.label}</span><span className="caret"><Icon name="down" /></span>
                  <select value={b.role} disabled={busy} aria-label={`Blade ${i + 1} role`} onChange={(e) => update(i, { role: e.target.value as BladeRole })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></span>
                <span className="mono small" style={{ width: 60 }}>{b.pixels} px</span>
                <span className="input" style={{ width: 130, height: 34 }}><span className="ellip">{b.wiring.kind === 'own' ? b.wiring.dataPin : 'chained'}</span><span className="caret"><Icon name="down" /></span>
                  <select value={b.wiring.kind === 'own' ? b.wiring.dataPin : ''} disabled={busy} aria-label={`Blade ${i + 1} data pin`} onChange={(e) => setWiring(i, { kind: 'own', dataPin: e.target.value, powerPins: b.wiring.kind === 'own' ? b.wiring.powerPins : ['bladePowerPin4'] })}>{DATA_PINS.map((p) => <option key={p} value={p}>{p}</option>)}</select></span>
                <span className="row wrap" style={{ gap: 4 }}>{POWER_PINS.map((p, k) => {
                  const on = b.wiring.kind === 'own' && b.wiring.powerPins.includes(p);
                  return <button key={p} type="button" className={`chip ${on ? 'sel' : ''}`} disabled={busy} aria-pressed={on} onClick={() => { if (b.wiring.kind !== 'own') return; const cur = b.wiring.powerPins; const next = on ? cur.filter((x) => x !== p) : [...cur, p].sort(); if (next.length) setWiring(i, { ...b.wiring, powerPins: next }); }}>LED {k + 1}</button>;
                })}</span>
              </div>
            ))}
            <div className="row wrap" style={{ gap: 14 }}>
              <label className="field" style={{ width: 300 }}><span className="label">Button behaviour</span><span className="input sans"><span className="ellip">{PROPS.find((p) => p.value === prop)?.label}</span><span className="caret"><Icon name="down" /></span><select value={prop} disabled={busy} aria-label="Button behaviour" onChange={(e) => setProp(e.target.value as Prop)}>{PROPS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></span></label>
              <span className="hint">Board: Proffieboard {model?.board} · {model?.buttons} buttons · {info.presets.length} presets carried over</span>
            </div>
            <label className="row" style={{ gap: 10, fontSize: 13, color: 'var(--dim)' }}>
              <button type="button" className={`tog ${confirmedWiring ? 'on' : ''}`} role="switch" aria-checked={confirmedWiring} disabled={busy} onClick={() => setConfirmedWiring(!confirmedWiring)}><i /></button>
              I checked every data pin and power pin against the installer's wiring
            </label>
            {preview?.errors.length ? <div className="note red"><Icon name="x" /><span>{preview.errors.join(' ')}</span></div> : null}
            {preview?.warnings.map((w) => <div key={w} className="note"><Icon name="info" /><span>{w}</span></div>)}
          </div>
        </section>

        <section className="panel" aria-label="Toolchain">
          <div className="ph"><h2>Toolchain</h2>{tool?.ready ? <span className="chip ok"><Icon name="check" />Ready</span> : <span className="chip warn"><Icon name="warn" />Not installed</span>}</div>
          <div className="pb col" style={{ gap: 10 }}>
            {tool && (
              <div className="list" style={{ border: '1px solid var(--line)' }}>
                {[['arduino-cli', tool.cli ? tool.cliVersion ?? 'present' : 'missing'], ['Proffieboard core + GCC', tool.core && tool.gcc ? 'installed' : 'missing'], ['dfu-util', tool.dfuUtil ? 'present' : 'missing'], ['ProffieOS', tool.proffieOS ? tool.proffieOSVersion ?? 'present' : 'missing']].map(([k, v]) => (
                  <div key={k} className="li" style={{ minHeight: 34 }}><span className="grow small dim">{k}</span><span className="mono small">{v}</span></div>
                ))}
              </div>
            )}
            {!tool?.ready && <button type="button" className="btn pri" disabled={installing} onClick={() => void install()}><span className="b"><span className="i"><Icon name="import" />{installing ? 'Installing…' : 'Install toolchain (360 MB)'}</span></span></button>}
            <span className="hint mono" style={{ fontSize: 11 }}>{tool?.root}</span>
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 20, flex: 1, minHeight: 0 }}>
        <section className="panel" aria-label="Build and install">
          <div className="ph">
            <h2>2 · Build, then 3 · Install</h2>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm ghost" onClick={() => setShowConfig((s) => !s)}><span className="b"><span className="i">{showConfig ? 'Hide config' : 'Show config'}</span></span></button>
              <button type="button" className="btn sm" disabled={busy || !tool?.ready || !model || !!preview?.errors.length} onClick={() => void build(true)}><span className="b"><span className="i"><Icon name="build" />Build firmware</span></span></button>
            </div>
          </div>
          <div className="pb col" style={{ gap: 14 }}>
            {showConfig && preview && <pre className="console" style={{ maxHeight: 260, margin: 0 }}>{preview.text}</pre>}
            {result && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 26 }}>{result.textBytes != null ? (result.textBytes / 1024).toFixed(1) : '?'}</span>
                  <span className="mono dim">of {result.flashBytes / 1024} KB · {pct ?? '?'}%{result.cached ? ' · cached build' : ` · built in ${(result.ms / 1000).toFixed(0)} s`}</span>
                </div>
                <div style={{ height: 10, background: '#1b2836' }}><div style={{ height: '100%', width: `${Math.min(100, pct ?? 0)}%`, background: (pct ?? 0) > 90 ? 'var(--red)' : (pct ?? 0) > 70 ? 'var(--amber)' : 'var(--holo)' }} /></div>
                {result.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
              </div>
            )}
            <div className="console" style={{ maxHeight: 220, minHeight: 90 }}>
              {log.length === 0 ? <span className="mute">Build and install output appears here.</span> : log.map((e, i) => <div key={i}><span className="mute">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {e.job}</span>  {e.line}</div>)}
            </div>
            {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : note.tone === 'red' ? 'x' : 'warn'} /><span>{note.text}</span></div>}
            <div className="row" style={{ gap: 10 }}>
              {!armed
                ? <button type="button" className="btn warn" disabled={busy || step !== 'built' || !confirmedWiring || status !== 'connected'} onClick={() => setArmed(true)}><span className="b"><span className="i"><Icon name="bolt" />Install on {saber.name}</span></span></button>
                : <>
                    <button type="button" className="btn danger" disabled={busy} onClick={() => { setArmed(false); void install2(); }}><span className="b"><span className="i"><Icon name="bolt" />Yes, write the firmware</span></span></button>
                    <button type="button" className="btn ghost" onClick={() => setArmed(false)}><span className="b"><span className="i">Cancel</span></span></button>
                  </>}
              <span className="hint">{step === 'built' && !confirmedWiring ? 'Confirm the wiring above first.' : step === 'built' && status !== 'connected' ? 'Reconnect the saber to install.' : 'Backs up the whole flash before writing. About two minutes.'}</span>
            </div>
          </div>
        </section>

        <section className="panel" aria-label="What happens">
          <div className="ph"><h2>What happens</h2></div>
          <div className="list">
            {[
              ['Build', 'Hiltwright writes a config from the wiring and your presets, then compiles ProffieOS 8.10 for it.'],
              ['Back up', 'The saber reboots into its bootloader and the whole flash is read to a file first.'],
              ['Write', 'dfu-util writes the new firmware. About a minute.'],
              ['Verify', 'The saber restarts, Hiltwright reconnects and checks the version it reports.'],
              ['Presets', 'Fonts, tracks and names carry over. Looks become Hiltwright starter looks; change colours live afterwards.'],
            ].map(([t, d]) => <div key={t} className="li" style={{ gap: 12, minHeight: 48, alignItems: 'flex-start', padding: '8px 14px' }}><span style={{ width: 70, flex: 'none', fontWeight: 600 }}>{t}</span><span className="hint">{d}</span></div>)}
          </div>
          <div className="pb"><div className="note amber"><Icon name="warn" /><span>If the saber ever fails to show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Install again. The backup can always be restored.</span></div></div>
        </section>
      </div>
    </>
  );
}
