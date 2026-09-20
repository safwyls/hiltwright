// Build & Install: adopt the connected saber onto Hiltwright firmware.
// Wiring form (the one thing old firmware cannot tell us) → generated config → build → backup → bootloader → write → verify.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ModelBlade, type Prop, type SaberConfigModel } from '@hiltwright/core';
import { draftModel, guessBlades, queuedLookIds } from './saberModel';
import { HardwareEditor } from './Hardware';
import type { BuildResult, JobEvent, ToolchainStatus } from '../../shared/api';
import type { Board } from './board';
import { Icon } from './Icon';

const api = () => window.hiltwright;
const PROPS: { value: Prop; label: string }[] = [
  { value: 'fett263', label: 'Fett263 · edit mode, gestures' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' },
];

type Step = 'idle' | 'building' | 'built' | 'backup' | 'bootloader' | 'driver' | 'writing' | 'verifying' | 'done' | 'failed';
const DRIVER_HELP = 'https://pod.hubbe.net/proffieboard-setup.html';
const fmtGB = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

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
  const [confirmedWiring, setConfirmedWiring] = useState(!!saber?.model);
  const [preview, setPreview] = useState<{ text: string; hash: string; warnings: string[]; errors: string[] } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [log, setLog] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  // Poll USB while disconnected so an install can proceed from a board that is already in its bootloader.
  const [inBootloader, setInBootloader] = useState(false);
  useEffect(() => {
    if (status === 'connected') { setInBootloader(false); return; }
    let live = true;
    const tick = () => { void api().flash.usb().then((u) => { if (live) setInBootloader(u.bootloaderPresent); }); };
    tick();
    const t = setInterval(tick, 2000);
    return () => { live = false; clearInterval(t); };
  }, [status]);
  const canInstall = status === 'connected' || inBootloader;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { void api().toolchain.status().then(setTool); }, []);
  useEffect(() => api().onJobEvent((e) => setLog((l) => [...l, e].slice(-300))), []);
  useEffect(() => {
    if (info && !blades.length) { setBlades(saber?.model?.blades ?? guessBlades(info.pixelBlades.length ? info.pixelBlades : [132])); if (saber?.model) { setProp(saber.model.prop); setConfirmedWiring(true); } }
  }, [info, saber, blades.length]);
  useEffect(() => {
    if (step === 'building' || step === 'writing' || step === 'backup') { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }
  }, [step]);

  const model = useMemo<SaberConfigModel | null>(() => (info && saber && blades.length ? draftModel(info, saber, { blades, prop }) : null), [info, saber, blades, prop]);
  const queuedLooks = queuedLookIds(model ?? undefined, saber?.firmware);

  useEffect(() => { if (model) void api().build.preview(model).then(setPreview); }, [model]);


  const [installError, setInstallError] = useState<string | null>(null);
  const [installStarted, setInstallStarted] = useState<number | null>(null);
  const install = async () => {
    setInstalling(true); setInstallError(null); setInstallStarted(Date.now());
    try { setTool(await api().toolchain.install()); } catch (err) { setInstallError(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')); } finally { setInstalling(false); }
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

  /** From a board sitting in its bootloader with a usable driver: backup, write, wait, reconnect, record. */
  const writeFromBootloader = useCallback(async () => {
    if (!result?.ok || !result.dfuPath || !saber) return;
    try {
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
      if (model && result.manifest) await board.updateSaber({ model, firmware: { ...result.manifest, os: result.os, at: new Date().toISOString() } });
    } catch (err) {
      setStep('failed');
      setNote({ tone: 'red', text: String(err) });
    }
  }, [result, saber, board, model]);

  /** The install sequence. The renderer does the reboot because it owns the serial port. */
  const install2 = useCallback(async () => {
    if (!result?.ok || !result.dfuPath || !saber) return;
    setNote(null); setElapsed(0);
    try {
      setStep('bootloader');
      // A board already sitting in its bootloader (after an earlier failed attempt, or a manual BOOT+RESET) needs no reboot.
      const already = (await api().flash.usb()).bootloaderPresent;
      if (!already) {
        const touched = await board.rebootToBootloader();
        if (!touched) { setStep('failed'); setNote({ tone: 'red', text: 'Could not reboot the saber into bootloader mode. Hold BOOT, tap RESET, release BOOT, then press Install again.' }); return; }
      }
      const boot = await api().flash.waitForBootloader(20000);
      if (!boot.ok) {
        const usb = await api().flash.usb();
        // The board is there but Windows has no WinUSB driver for it: a one-time step, then the install resumes.
        if (usb.bootloaderPresent) { setStep('driver'); setNote(null); return; }
        setStep('failed'); setNote({ tone: 'red', text: boot.text }); return;
      }
      await writeFromBootloader();
    } catch (err) {
      setStep('failed');
      setNote({ tone: 'red', text: String(err) });
    }
  }, [result, saber, board, writeFromBootloader]);

  /** One click: main downloads, verifies and launches the official installer elevated, then the install resumes. */
  const [driverBusy, setDriverBusy] = useState(false);
  const installDriver = async () => {
    setDriverBusy(true); setDriverCheck('Downloading the driver installer, then asking Windows for approval…');
    try {
      const r = await api().flash.installDriver();
      if (r.ok) { setDriverCheck(null); await writeFromBootloader(); } else setDriverCheck(r.text);
    } catch (err) { setDriverCheck(String(err)); } finally { setDriverBusy(false); }
  };

  /** After the owner installed the driver: check the bootloader again and carry on. */
  const [driverCheck, setDriverCheck] = useState<string | null>(null);
  const checkDriver = useCallback(async () => {
    setDriverCheck('Checking…');
    const boot = await api().flash.waitForBootloader(5000);
    if (boot.ok) { setDriverCheck(null); await writeFromBootloader(); return; }
    const usb = await api().flash.usb();
    setDriverCheck(usb.bootloaderPresent ? `Still no driver (Windows reports ${usb.bootloaderDriver ?? 'none'}). Run the installer with the board plugged in, then check again.` : 'The board is no longer in bootloader mode. Hold BOOT, tap RESET, release BOOT, then check again.');
  }, [writeFromBootloader]);

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
  const stepLabel: Record<Step, string> = { idle: 'Ready', building: 'Building firmware…', built: 'Firmware built', backup: 'Backing up the saber…', bootloader: 'Rebooting into bootloader…', driver: 'Windows needs a driver for the bootloader', writing: 'Writing firmware…', verifying: 'Waiting for the saber to come back…', done: 'Installed', failed: 'Stopped' };

  const setupPanel = (
    <section className={`panel ${tool && !tool.ready ? 'amber' : ''}`} aria-label="Toolchain">
      <div className="ph"><h2>{tool?.ready ? 'Toolchain' : 'One-time setup'}</h2>{tool?.ready ? <span className="chip ok"><Icon name="check" />Ready</span> : installing ? <span className="chip warn"><span className="dot" />Installing · {installStarted ? Math.round((Date.now() - installStarted) / 1000) : 0}s</span> : <span className="chip warn"><Icon name="warn" />Not installed</span>}</div>
      <div className="pb col" style={{ gap: 10 }}>
        {tool && !tool.ready && !installing && (
          <>
            <p className="dim" style={{ fontSize: 13, margin: 0 }}>Building firmware needs the ProffieOS sources, the Arduino command line and the ARM compiler. Hiltwright downloads them once from the ProffieOS and Arduino projects and keeps them in its own folder. Nothing else on this computer is touched.</p>
            <div className="list" style={{ border: '1px solid var(--line)' }}>
              {[['Download', 'about 360 MB'], ['On disk', 'about 1.7 GB'], ['Free space here', tool.freeBytes != null ? fmtGB(tool.freeBytes) : 'unknown'], ['Folder', tool.root]].map(([k, v]) => (
                <div key={k} className="li" style={{ minHeight: 34 }}><span className="grow small dim">{k}</span><span className="mono small ellip" style={{ maxWidth: 260 }}>{v}</span></div>
              ))}
            </div>
            {tool.freeBytes != null && tool.freeBytes < 2.5 * 1073741824 && <div className="note red"><Icon name="x" /><span>Not enough free space. Free up at least 2.5 GB, then try again.</span></div>}
            {tool.pathTooLong && <div className="note red"><Icon name="x" /><span>This folder path is too long for the compiler on Windows. Set HILTWRIGHT_TOOLCHAIN_DIR to a short path, or unset it to use the default.</span></div>}
            {installError && <div className="note red"><Icon name="x" /><span>{installError}</span></div>}
            <button type="button" className="btn pri" disabled={installing || tool.pathTooLong || (tool.freeBytes != null && tool.freeBytes < 2.5 * 1073741824)} onClick={() => void install()}><span className="b"><span className="i"><Icon name="import" />{installError ? 'Try again' : 'Download and install'}</span></span></button>
          </>
        )}
        {(installing || tool?.ready) && tool && (
          <div className="list" style={{ border: '1px solid var(--line)' }}>
            {[['arduino-cli', tool.cli ? tool.cliVersion ?? 'present' : 'missing'], ['Proffieboard core + GCC', tool.core && tool.gcc ? 'installed' : 'missing'], ['dfu-util', tool.dfuUtil ? 'present' : 'missing'], ['ProffieOS', tool.proffieOS ? tool.proffieOSVersion ?? 'present' : 'missing']].map(([k, v]) => (
              <div key={k} className="li" style={{ minHeight: 34 }}><span className="grow small dim">{k}</span><span className="mono small">{v}</span></div>
            ))}
          </div>
        )}
        {installing && <div className="console" style={{ maxHeight: 160, minHeight: 60 }}>{log.filter((e) => e.job === 'toolchain').slice(-12).map((e, i) => <div key={i}>{e.line}</div>)}</div>}
        {tool?.ready && <span className="hint mono" style={{ fontSize: 11 }}>{tool.root}</span>}
      </div>
    </section>
  );

  if (!info || !saber) {
    return (
      <>
        <div className="page-head"><div><div className="eyebrow">Build &amp; install</div><h1>Adopt this saber</h1></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 20 }}>
          <section className="panel"><div className="pb dim">Connect a saber first. Adoption reads its presets and blade layout from the board, then builds Hiltwright firmware for it.</div></section>
          {setupPanel}
        </div>
      </>
    );
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <section className="panel amber" aria-label="Wiring">
          <div className="ph"><h2>1 · Wiring</h2>{confirmedWiring ? <span className="chip ok"><Icon name="check" />Confirmed</span> : <span className="chip warn"><Icon name="warn" />Guessed from the board</span>}</div>
          <div className="pb col" style={{ gap: 12 }}>
            <div className="note amber"><Icon name="warn" /><span>The saber reported {info.pixelBlades.length} pixel blade{info.pixelBlades.length === 1 ? '' : 's'} ({info.pixelBlades.join(', ')} px) but old firmware cannot say which pins they use. Check every pin against your installer's diagram. Wrong power pins can damage hardware.</span></div>
            <HardwareEditor blades={blades} board={model?.board ?? 'V2'} detected={info.pixelBlades} locked={busy} onChange={(b) => { setBlades(b); setConfirmedWiring(false); setResult(null); setStep('idle'); }} />
            <div className="row wrap" style={{ gap: 14 }}>
              <label className="field" style={{ width: 300 }}><span className="label">Button behaviour</span><span className="input sans"><span className="ellip">{PROPS.find((p) => p.value === prop)?.label}</span><span className="caret"><Icon name="down" /></span><select value={prop} disabled={busy} aria-label="Button behaviour" onChange={(e) => setProp(e.target.value as Prop)}>{PROPS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></span></label>
              <span className="hint">Board: Proffieboard {model?.board} · {model?.buttons} buttons · {info.presets.length} presets carried over{queuedLooks.length ? ` · ${queuedLooks.length} look${queuedLooks.length === 1 ? '' : 's'} to compile` : ''}</span>
            </div>
            <label className="row" style={{ gap: 10, fontSize: 13, color: 'var(--dim)' }}>
              <button type="button" className={`tog ${confirmedWiring ? 'on' : ''}`} role="switch" aria-checked={confirmedWiring} disabled={busy} onClick={() => setConfirmedWiring(!confirmedWiring)}><i /></button>
              I checked every data pin and power pin against the installer's wiring
            </label>
            {preview?.errors.length ? <div className="note red"><Icon name="x" /><span>{preview.errors.join(' ')}</span></div> : null}
            {preview?.warnings.map((w) => <div key={w} className="note"><Icon name="info" /><span>{w}</span></div>)}
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
            {step === 'driver' && (
              <div className="col" style={{ gap: 10, padding: 14, border: '1px solid var(--amber)', background: 'rgba(255,181,71,.06)' }}>
                <b style={{ fontWeight: 600 }}>One-time Windows step: the bootloader driver</b>
                <p className="dim" style={{ margin: 0, fontSize: 13 }}>The saber is in bootloader mode, but Windows has no driver for it yet, so nothing can be written. This happens once per computer. Nothing has been changed on the saber; the backup has not been taken yet.</p>
                <p className="dim" style={{ margin: 0, fontSize: 13 }}>Hiltwright can do it for you: it downloads the driver installer published by the ProffieOS author (3 MB, from fredrik.hubbe.net), checks the file, and starts it. Windows will ask for administrator approval, because installing a driver needs it. Leave the saber plugged in. The install carries on by itself afterwards.</p>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button type="button" className="btn pri" disabled={driverBusy} onClick={() => void installDriver()}><span className="b"><span className="i"><Icon name="shield" />{driverBusy ? 'Installing the driver…' : 'Install the driver'}</span></span></button>
                  <button type="button" className="btn" disabled={driverBusy} onClick={() => void checkDriver()}><span className="b"><span className="i"><Icon name="usb" />Check again</span></span></button>
                  <button type="button" className="btn ghost" disabled={driverBusy} onClick={() => { setStep('built'); setDriverCheck(null); }}><span className="b"><span className="i">Cancel</span></span></button>
                </div>
                <span className="hint">Prefer to do it by hand? <button type="button" className="holo" onClick={() => void api().app.openHelp(DRIVER_HELP)}>Open the ProffieOS setup page</button>, run <span className="mono">proffie-dfu-setup.exe</span> from its Windows section, then press Check again.</span>
                {driverCheck && <span className="hint">{driverCheck}</span>}
              </div>
            )}
            {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : note.tone === 'red' ? 'x' : 'warn'} /><span>{note.text}</span></div>}
            <div className="row" style={{ gap: 10 }}>
              {!armed
                ? <button type="button" className="btn warn" disabled={busy || step !== 'built' || !confirmedWiring || !canInstall} onClick={() => setArmed(true)}><span className="b"><span className="i"><Icon name="bolt" />Install on {saber.name}</span></span></button>
                : <>
                    <button type="button" className="btn danger" disabled={busy} onClick={() => { setArmed(false); void install2(); }}><span className="b"><span className="i"><Icon name="bolt" />Yes, write the firmware</span></span></button>
                    <button type="button" className="btn ghost" onClick={() => setArmed(false)}><span className="b"><span className="i">Cancel</span></span></button>
                  </>}
              <span className="hint">{step === 'built' && !confirmedWiring ? 'Confirm the wiring above first.' : step === 'built' && !canInstall ? 'Reconnect the saber to install.' : inBootloader ? 'The board is in bootloader mode and ready to write.' : 'Backs up the whole flash before writing. About two minutes.'}</span>
            </div>
          </div>
        </section>

        <div className="col" style={{ gap: 20, minHeight: 0, overflow: "auto" }}>
          {setupPanel}
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
      </div>
    </>
  );
}
