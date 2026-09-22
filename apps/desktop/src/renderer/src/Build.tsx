// Build & Install: the last step. The wiring (Wiring page) and presets (Presets page) live in the saber's model;
// this page shows the config they make, builds it, and installs: backup → bootloader → write → verify.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { voicePackFromSerial, voicePackVerdict, type VoicePackStatus } from '@hiltwright/core';
import { queuedLookIds } from './saberModel';
import { PROPS } from './Wiring';
import type { Workspace } from './workspace';
import type { BackupInfo, BuildResult, JobEvent, ToolchainStatus } from '../../shared/api';
import type { Board } from './board';
import { Icon } from './Icon';
import { readTransfer } from './transfer';

const api = () => window.hiltwright;

type Tab = 'config' | 'log' | 'backups';
type Step = 'idle' | 'building' | 'built' | 'backup' | 'bootloader' | 'driver' | 'writing' | 'verifying' | 'done' | 'failed';
const DRIVER_HELP = 'https://pod.hubbe.net/proffieboard-setup.html';
const fmtGB = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

export function Build({ ws, board, go }: { ws: Workspace; board: Board; go: (page: 'presets' | 'looks' | 'armory' | 'wiring' | 'fonts') => void }) {
  const { status } = board;
  // Frozen at connect time: the install deliberately drops the port, and the page must keep working through that.
  const [snap, setSnap] = useState<{ info: NonNullable<Board['info']>; saber: NonNullable<Board['saber']> } | null>(null);
  useEffect(() => { if (board.status === 'connected' && board.info && board.saber) setSnap({ info: board.info, saber: board.saber }); }, [board.status, board.info, board.saber]);
  const offline = !snap;
  const saber = snap ? board.library.find((s) => s.id === snap.saber.id) ?? snap.saber : ws.saber;
  const info = snap?.info ?? ws.info;
  const model = ws.model;
  const [tool, setTool] = useState<ToolchainStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [preview, setPreview] = useState<{ text: string; hash: string; warnings: string[]; errors: string[] } | null>(null);
  const [log, setLog] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [withBackup, setWithBackup] = useState(true);
  const [tab, setTab] = useState<Tab>('config');
  // The Fett263 prop needs a voice pack on the card. The saber can tell us over serial: no card reader needed.
  const [voice, setVoice] = useState<VoicePackStatus | null>(null);
  useEffect(() => {
    if (board.status !== 'connected') return;
    let live = true;
    void (async () => {
      try {
        const cat = await board.send('cat common/voicepack.ini', { idleMs: 700 });
        const dir = await board.send('dir common', { idleMs: 900, until: (l) => /^(Done listing files\.|No such directory\.)/.test(l) });
        const rejected = [...cat.lines, ...dir.lines].some((l) => /^Whut\? :/.test(l));
        if (live) setVoice(rejected ? null : voicePackFromSerial(cat.lines, dir.lines));
      } catch { if (live) setVoice(null); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.status, board.saber?.id]);
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
  // Transfer progress from the flasher: percentage of the current read (backup) or write.
  const [xfer, setXfer] = useState<number | null>(null);
  useEffect(() => api().onJobEvent((e) => {
    if (e.job === 'flash') {
      const t = readTransfer(e.line);
      if (t.pct != null) setXfer(t.pct);
      if (t.fragment) return;
    }
    setLog((l) => [...l, e].slice(-300));
  }), []);
  // The log follows its newest line unless the owner has scrolled up to read something.
  const logBox = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = logBox.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [log, tab]);
  // Work in progress is watched in the log; nobody should have to go and find it.
  useEffect(() => { if (step === 'building' || step === 'bootloader') setTab('log'); }, [step]);
  useEffect(() => {
    if (step === 'building' || step === 'writing' || step === 'backup') { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }
  }, [step]);

  const queuedLooks = queuedLookIds(model ?? undefined, saber?.firmware);
  useEffect(() => { if (model) void api().build.preview(model).then(setPreview); }, [model]);
  const prop = model?.prop ?? 'fett263';
  const confirmedWiring = !!model?.wiringConfirmedAt || !!saber?.firmware;
  const setConfirmedWiring = (v: boolean) => { if (model) void ws.saveModel(v ? { ...model, wiringConfirmedAt: new Date().toISOString() } : (({ wiringConfirmedAt: _x, ...rest }) => rest)(model)); };

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
      setXfer(0); setStep('backup');
      const bak = await api().flash.backup(saber.id, 'before-install');
      if (!bak.ok) { setStep('failed'); setNote({ tone: 'red', text: `Backup failed, so nothing was written. ${bak.detail}` }); return; }
      setXfer(0); setStep('writing');
      const w = await api().flash.write(result.dfuPath);
      if (!w.ok) { setStep('failed'); setNote({ tone: 'red', text: `Writing failed. The backup from just now is at ${bak.file}. ${w.detail}` }); return; }
      setStep('verifying');
      const back = await api().flash.waitForRuntime(25000);
      if (!back) { setStep('failed'); setNote({ tone: 'amber', text: 'The firmware was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' }); return; }
      await new Promise((r) => setTimeout(r, 1500));
      await board.connect(false);
      setStep('done');
      setNote({ tone: 'green', text: `Installed. Backup of the previous firmware: ${bak.file}` });
      // Once installed, the bank's presets are the saber's own; the next draft reads them back from the saber.
      if (model && result.manifest) { const { presetsFrom: _loaded, ...settled } = model; await board.updateSaber({ model: settled, firmware: { ...result.manifest, os: result.os, at: new Date().toISOString() } }); }
    } catch (err) {
      setStep('failed');
      setNote({ tone: 'red', text: String(err) });
    }
  }, [result, saber, board, model]);

  /** The install sequence. The renderer does the reboot because it owns the serial port. */
  const install2 = useCallback(async () => {
    if (!result?.ok || !result.dfuPath || !saber) return;
    setWithBackup(true);
    setNote(null); setElapsed(0);
    try {
      setStep('bootloader');
      // A board already sitting in its bootloader (after an earlier failed attempt, or a manual BOOT+RESET) needs no reboot.
      const already = (await api().flash.usb()).bootloaderPresent;
      if (!already) {
        // Presets loaded from a bank are compiled into this firmware; the saber only adopts compiled presets when it has
        // no presets.ini of its own, so that file goes before the reboot, with a snapshot kept first.
        if (model?.presetsFrom && board.info) {
          try { await api().snapshots.save(saber.id, `Before bank "${model.presetsFrom.name}"`, board.info.presets); } catch { /* the snapshot is a courtesy */ }
          await board.send('del presets.ini', { idleMs: 400 });
          await board.send('del presets.tmp', { idleMs: 400 });
        }
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

  // Backups taken before each install, and the way back to any of them.
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [restoreArmed, setRestoreArmed] = useState<string | null>(null);
  const saberId = saber?.id ?? null;
  const loadBackups = useCallback(() => { if (saberId) void api().flash.listBackups(saberId).then(setBackups); }, [saberId]);
  useEffect(() => { loadBackups(); }, [loadBackups, step]);
  const restore = useCallback(async (b: BackupInfo) => {
    if (!saberId) return;
    setWithBackup(false);
    setRestoreArmed(null); setNote(null); setElapsed(0);
    try {
      setStep('bootloader');
      if (!(await api().flash.usb()).bootloaderPresent) {
        const touched = await board.rebootToBootloader();
        if (!touched) { setStep('failed'); setNote({ tone: 'red', text: 'Could not reboot the saber into bootloader mode. Hold BOOT, tap RESET, release BOOT, then try again.' }); return; }
      }
      const boot = await api().flash.waitForBootloader(20000);
      if (!boot.ok) { setStep('failed'); setNote({ tone: 'red', text: boot.text }); return; }
      setXfer(0); setStep('writing');
      const w = await api().flash.restore(saberId, b.file);
      if (!w.ok) { setStep('failed'); setNote({ tone: 'red', text: `The backup was not written. ${w.detail}` }); return; }
      setStep('verifying');
      const back = await api().flash.waitForRuntime(25000);
      if (!back) { setStep('failed'); setNote({ tone: 'amber', text: 'The backup was written but the saber has not reappeared yet. Unplug and replug it, then press Connect.' }); return; }
      await new Promise((r) => setTimeout(r, 1500));
      // The restored firmware is not the one Hiltwright built: forget the manifest so looks and colours are not mislabelled.
      await board.updateSaber({ firmware: null }, saberId);
      await board.connect(false);
      setStep('done');
      setNote({ tone: 'green', text: `Restored the backup from ${new Date(b.at).toLocaleString()}.` });
    } catch (err) { setStep('failed'); setNote({ tone: 'red', text: String(err) }); }
  }, [saberId, board]);
  const checkDriver = useCallback(async () => {
    setDriverCheck('Checking…');
    const boot = await api().flash.waitForBootloader(5000);
    if (boot.ok) { setDriverCheck(null); await writeFromBootloader(); return; }
    const usb = await api().flash.usb();
    setDriverCheck(usb.bootloaderPresent ? `Still no driver (Windows reports ${usb.bootloaderDriver ?? 'none'}). Run the installer with the board plugged in, then check again.` : 'The board is no longer in bootloader mode. Hold BOOT, tap RESET, release BOOT, then check again.');
  }, [writeFromBootloader]);

  // Dev aid: pretend a build finished, to look at the states that follow one without compiling.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { hiltwrightPretendBuilt?: (confirmed: boolean) => void }).hiltwrightPretendBuilt = (confirmed) => {
      setResult({ ok: true, cached: true, ms: 0, textBytes: 184400, flashBytes: 262144, flashPct: 70, problems: [], output: '', dfuPath: null } as unknown as BuildResult);
      setStep('built'); setConfirmedWiring(confirmed);
    };
    (window as unknown as { hiltwrightPretendWriting?: (pct: number) => void }).hiltwrightPretendWriting = (pct) => { setConfirmedWiring(true); setStep('writing'); setXfer(pct); };
  }, []);

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
  const stepLabel: Record<Step, string> = { idle: 'Ready', building: 'Building firmware…', built: 'Firmware built', backup: 'Backing up the saber…', bootloader: 'Rebooting into bootloader…', driver: 'Windows needs a driver', writing: 'Writing firmware…', verifying: 'Waiting for the saber…', done: 'Installed', failed: 'Stopped' };
  // One bar for the whole job: reboot, read the backup, write, wait for the saber. Transfers move it with real numbers.
  const phasePct = xfer ?? 0;
  const overall = step === 'bootloader' ? 3 : step === 'backup' ? 5 + phasePct * 0.4 : step === 'writing' ? (withBackup ? 45 + phasePct * 0.47 : 5 + phasePct * 0.87) : step === 'verifying' ? 94 : step === 'done' ? 100 : 0;
  const phaseText = step === 'bootloader' ? 'Rebooting into the bootloader' : step === 'backup' ? 'Reading the backup' : step === 'writing' ? 'Writing firmware' : step === 'verifying' ? 'Waiting for the saber to restart' : '';
  const lowSpace = !!tool && tool.freeBytes != null && tool.freeBytes < 2.5 * 1073741824;

  const toolStep = (now: boolean) => (
    <div className={`stepc ${tool?.ready ? 'done' : now ? 'now' : ''}`}>
      <div className="head"><span className="nbox">{tool?.ready ? <Icon name="check" /> : 2}</span><b>Compiler</b><span className="what">{tool?.ready ? `ProffieOS ${tool.proffieOSVersion ?? ''} ready` : installing ? `installing, ${installStarted ? Math.round((Date.now() - installStarted) / 1000) : 0} s` : 'one-time download'}</span></div>
      {tool && !tool.ready && !installing && (
        <>
          <span className="hint">Building firmware needs the ProffieOS sources, the Arduino command line and the ARM compiler. Hiltwright downloads them once into its own folder and touches nothing else.</span>
          <div>
            <div className="kv"><span>Download</span><span>about 360 MB</span></div>
            <div className="kv"><span>On disk</span><span>about 1.7 GB</span></div>
            <div className="kv"><span>Free space</span><span>{tool.freeBytes != null ? fmtGB(tool.freeBytes) : 'unknown'}</span></div>
            <div className="kv"><span>Folder</span><span title={tool.root}>{tool.root}</span></div>
          </div>
          {lowSpace && <div className="note red"><Icon name="x" /><span>Not enough free space. Free up at least 2.5 GB, then try again.</span></div>}
          {tool.pathTooLong && <div className="note red"><Icon name="x" /><span>This folder path is too long for the compiler on Windows. Set HILTWRIGHT_TOOLCHAIN_DIR to a short path, or unset it to use the default.</span></div>}
          {installError && <div className="note red"><Icon name="x" /><span>{installError}</span></div>}
          <button type="button" className={`btn full ${now ? 'pri' : ''}`} disabled={installing || tool.pathTooLong || lowSpace} onClick={() => void install()}><span className="b"><span className="i"><Icon name="import" />{installError ? 'Try again' : 'Download and install'}</span></span></button>
        </>
      )}
      {installing && <div className="console" style={{ maxHeight: 120, minHeight: 48, fontSize: 11 }}>{log.filter((e) => e.job === 'toolchain').slice(-6).map((e, i) => <div key={i}>{e.line}</div>)}</div>}
    </div>
  );

  if (!info || !saber) {
    return (
      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
        <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>Connect a saber to begin</h3><span className="dim small">Hiltwright reads its presets and blade layout, then builds firmware for it. Once a saber has been seen, this page also works with it unplugged. The compiler can be downloaded in the meantime.</span></div></section>
        <aside className="rail">{toolStep(true)}</aside>
      </div>
    );
  }

  const wiringOk = confirmedWiring && !preview?.errors.length;
  const built = !!result?.ok && step !== 'building';
  const nowStep = !wiringOk ? 1 : !tool?.ready ? 2 : !built ? 3 : step === 'done' ? 0 : 4;
  const verdict = voicePackVerdict(prop, voice);
  const canBuild = !busy && !!tool?.ready && !!model && !preview?.errors.length;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <section className="panel fill" aria-label="Build workspace">
        <div className="tabs" role="tablist">
          {([['config', 'Config', 'build'], ['log', 'Log', 'diag'], ['backups', 'Backups', 'shield']] as [Tab, string, Parameters<typeof Icon>[0]['name']][]).map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon name={icon} />{label}{id === 'backups' && <span className="count">{backups.length}</span>}</button>
          ))}
        </div>

        {tab === 'config' && <pre className="console grow scroll" style={{ margin: 0, border: 0 }}>{preview?.text ?? 'The config appears once the wiring is described.'}</pre>}
        {tab === 'log' && (
          <div ref={logBox} className="console grow scroll" style={{ border: 0 }} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
            {log.length === 0 ? <span className="mute">Build and install output appears here.</span> : log.map((e, i) => <div key={i}><span className="mute">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {e.job}</span>  {e.line}</div>)}
          </div>
        )}
        {tab === 'backups' && (
          <>
            <div className="list scroll">
              {backups.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>None yet. Every install reads the saber's whole firmware to a file first.</div>}
              {backups.map((b) => (
                <div key={b.file} className="li" style={{ minHeight: 48, gap: 8 }}>
                  <span className="col grow" style={{ gap: 0 }}><span className="small">{new Date(b.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}, {b.label}</span><span className="hint mono" style={{ fontSize: 11 }}>{Math.round(b.bytes / 1024)} KB{b.valid ? '' : ', not a usable image'}</span></span>
                  {restoreArmed === b.file
                    ? <><button type="button" className="btn sm danger" disabled={busy} onClick={() => void restore(b)}><span className="b"><span className="i">Yes, put it back</span></span></button><button type="button" className="chip" onClick={() => setRestoreArmed(null)}>Cancel</button></>
                    : <button type="button" className="btn sm" disabled={busy || !b.valid || !canInstall} title={!canInstall ? 'Connect the saber first' : undefined} onClick={() => setRestoreArmed(b.file)}><span className="b"><span className="i"><Icon name="undo" />Put back</span></span></button>}
                </div>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>Putting a backup back replaces the saber's firmware with exactly what it had at that moment. Presets and fonts on the SD card are not touched.</div>
          </>
        )}
      </section>

      <aside className="rail" aria-label="Steps">
        <div className="row between" style={{ minHeight: 24 }}>
          <b style={{ fontWeight: 600 }} className="ellip">{saber.firmware ? `Rebuild ${saber.name}` : `Adopt ${saber.name}`}</b>
          <span className={`chip ${step === 'done' ? 'ok' : step === 'failed' ? 'err' : busy ? 'warn' : ''}`}><span className="dot" />{stepLabel[step]}{busy ? ` ${elapsed}s` : ''}</span>
        </div>

        <div className={`stepc ${wiringOk ? 'done' : nowStep === 1 ? 'now' : ''} ${preview?.errors.length ? 'bad' : ''}`}>
          <div className="head"><span className="nbox">{wiringOk ? <Icon name="check" /> : 1}</span><b>Set up</b><span className="what">{model?.blades.length ?? 0} blade{model?.blades.length === 1 ? '' : 's'}, {model?.presets.length ?? 0} preset{model?.presets.length === 1 ? '' : 's'}{model?.presetsFrom ? ' (staged)' : ''}{queuedLooks.length ? `, ${queuedLooks.length} new look${queuedLooks.length === 1 ? '' : 's'}` : ''}</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="chip" onClick={() => go('wiring')}><Icon name="blade" />Wiring{confirmedWiring ? '' : ' · confirm'}</button>
            <button type="button" className="chip" onClick={() => go('presets')}><Icon name="presets" />Presets</button>
            <button type="button" className="chip" onClick={() => go('looks')}><Icon name="looks" />Looks</button>
            <button type="button" className="chip" onClick={() => go('fonts')}><Icon name="fonts" />Fonts</button>
          </div>
          <span className="hint">{PROPS.find((p) => p.value === prop)?.label}{saber?.planned ? ' · planned ahead, not connected yet' : ''}</span>
          {!confirmedWiring && <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="warn" /><span>Confirm the wiring on the Wiring page before building.</span></div>}
          {model?.presetsFrom && !saber?.planned && info && <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="info" /><span>The staged presets replace the {info.presets.length} on the saber when this goes on; a snapshot is kept first.</span></div>}
          {preview?.errors.map((e) => <div key={e} className="note red" style={{ padding: '8px 10px' }}><Icon name="x" /><span>{e}</span></div>)}
        </div>

        {toolStep(nowStep === 2)}

        <div className={`stepc ${built ? 'done' : nowStep === 3 ? 'now' : ''} ${result && !result.ok ? 'bad' : ''}`}>
          <div className="head"><span className="nbox">{built ? <Icon name="check" /> : 3}</span><b>Build</b><span className="what">{step === 'building' ? `compiling, ${elapsed} s` : result?.ok ? (result.cached ? 'unchanged, reused' : `built in ${(result.ms / 1000).toFixed(0)} s`) : 'about a minute'}</span></div>
          {result?.ok && (
            <div className="col" style={{ gap: 5 }}>
              <div className="row between" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 18 }}>{pct ?? '?'}%<span className="mute small"> of flash</span></span><span className="mono mute small">{result.textBytes != null ? (result.textBytes / 1024).toFixed(1) : '?'} of {result.flashBytes / 1024} KB</span></div>
              <div style={{ height: 6, background: '#1b2836' }}><div style={{ height: '100%', width: `${Math.min(100, pct ?? 0)}%`, background: (pct ?? 0) > 90 ? 'var(--red)' : (pct ?? 0) > 70 ? 'var(--amber)' : 'var(--holo)' }} /></div>
            </div>
          )}
          {result?.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
          <button type="button" className={`btn full ${nowStep === 3 ? 'pri' : ''}`} disabled={!canBuild} onClick={() => void build(true)}><span className="b"><span className="i"><Icon name="build" />{step === 'building' ? 'Building…' : built ? 'Build again' : 'Build firmware'}</span></span></button>
        </div>

        <div className={`stepc ${step === 'done' ? 'done' : nowStep === 4 ? 'now' : ''}`}>
          <div className="head"><span className="nbox">{step === 'done' ? <Icon name="check" /> : 4}</span><b>Install</b><span className="what">{step === 'backup' ? `backing up, ${elapsed} s` : step === 'writing' ? `writing, ${elapsed} s` : 'backup first, about two minutes'}</span></div>
          {(step === 'bootloader' || step === 'backup' || step === 'writing' || step === 'verifying') && (
            <div className="col" style={{ gap: 5 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall)} aria-label="Install progress">
              <div className="row between" style={{ alignItems: 'baseline' }}><span className="small">{phaseText}</span><span className="mono mute small">{Math.round(overall)}%</span></div>
              <div style={{ height: 8, background: '#1b2836' }}><div style={{ height: '100%', width: `${overall}%`, background: 'var(--amber)', transition: 'width .3s linear' }} /></div>
              <span className="hint">Leave the saber plugged in until this finishes.</span>
            </div>
          )}
          {step === 'driver' ? (
            <div className="col" style={{ gap: 8 }}>
              <span className="small"><b style={{ fontWeight: 600 }}>Windows has no driver for the bootloader yet.</b> This happens once per computer. Nothing has been changed on the saber.</span>
              <span className="hint">Hiltwright downloads the driver installer published by the ProffieOS author (3 MB, fredrik.hubbe.net), checks the file and starts it. Windows asks for administrator approval. Leave the saber plugged in; the install carries on by itself.</span>
              <button type="button" className="btn full pri" disabled={driverBusy} onClick={() => void installDriver()}><span className="b"><span className="i"><Icon name="shield" />{driverBusy ? 'Installing the driver…' : 'Install the driver'}</span></span></button>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm grow" disabled={driverBusy} onClick={() => void checkDriver()}><span className="b"><span className="i"><Icon name="usb" />Check again</span></span></button>
                <button type="button" className="btn sm ghost" disabled={driverBusy} onClick={() => { setStep('built'); setDriverCheck(null); }}><span className="b"><span className="i">Cancel</span></span></button>
              </div>
              <span className="hint">By hand instead: <button type="button" className="holo" onClick={() => void api().app.openHelp(DRIVER_HELP)}>open the ProffieOS setup page</button>, run <span className="mono">proffie-dfu-setup.exe</span>, then Check again.</span>
              {driverCheck && <span className="hint">{driverCheck}</span>}
            </div>
          ) : built && !confirmedWiring ? (
            // The one thing standing between a finished build and the install: say so here, with the switch itself,
            // instead of a greyed-out button and a line of small print.
            <div className="col" style={{ gap: 10, padding: 12, border: '1px solid var(--amber)', background: 'rgba(255,181,71,.08)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className="amber" style={{ display: 'flex', width: 16, flex: 'none', marginTop: 2 }}><Icon name="warn" /></span><span className="small"><b style={{ fontWeight: 600 }}>Confirm the wiring to unlock the install.</b> Wrong power pins can damage hardware, so Hiltwright will not write firmware until you have checked them.</span></div>
              <label className="row" style={{ gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
                <button type="button" className={`tog ${confirmedWiring ? 'on' : ''}`} role="switch" aria-checked={confirmedWiring} disabled={busy} onClick={() => setConfirmedWiring(true)}><i /></button>
                I checked every data pin and power pin against the installer's wiring
              </label>
              <button type="button" className="btn sm full" onClick={() => go('wiring')}><span className="b"><span className="i"><Icon name="blade" />Look at the wiring</span></span></button>
            </div>
          ) : step === 'bootloader' || step === 'backup' || step === 'writing' || step === 'verifying' ? null : !armed ? (
            <button type="button" className={`btn full ${nowStep === 4 ? 'warn' : ''}`} disabled={busy || step !== 'built' || !confirmedWiring || !canInstall} onClick={() => setArmed(true)}><span className="b"><span className="i"><Icon name="bolt" />Install on {saber.name}</span></span></button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn danger grow" disabled={busy} onClick={() => { setArmed(false); void install2(); }}><span className="b"><span className="i"><Icon name="bolt" />Yes, write the firmware</span></span></button>
              <button type="button" className="btn ghost" onClick={() => setArmed(false)}><span className="b"><span className="i">Cancel</span></span></button>
            </div>
          )}
          {step !== 'driver' && !busy && !(built && !confirmedWiring) && <span className="hint">{!built ? (confirmedWiring ? 'Build first.' : 'Build first. The wiring also needs confirming before anything is written.') : !canInstall ? (offline ? 'Plug the saber in to install. Everything up to here works without it.' : 'Reconnect the saber to install.') : inBootloader ? 'The board is in bootloader mode and ready to write.' : 'The whole flash is read to a backup file before anything is written.'}</span>}
        </div>

        {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : note.tone === 'red' ? 'x' : 'warn'} /><span>{note.text}</span></div>}
        {verdict && <div className={`note ${verdict.tone}`}><Icon name={verdict.ok ? 'check' : 'warn'} /><span>{verdict.text}</span></div>}
        {preview?.warnings.map((w) => <div key={w} className="note"><Icon name="info" /><span>{w}</span></div>)}
        {step === 'failed' && <span className="hint">If the saber does not show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Install again. A backup can always be put back from the Backups tab.</span>}
      </aside>
    </div>
  );
}
