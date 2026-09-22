// Build & Install: adopt the connected saber onto Hiltwright firmware.
// Wiring form (the one thing old firmware cannot tell us) → generated config → build → backup → bootloader → write → verify.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseId, voicePackFromSerial, voicePackVerdict, type BladeVariant, type ModelBlade, type Prop, type SaberConfigModel, type VoicePackStatus } from '@hiltwright/core';
import { draftModel, guessBlades, infoFromRecord, queuedLookIds } from './saberModel';
import { HardwareEditor } from './Hardware';
import type { BackupInfo, BuildResult, JobEvent, ToolchainStatus } from '../../shared/api';
import type { Board } from './board';
import { Icon } from './Icon';
import { readTransfer } from './transfer';

const api = () => window.hiltwright;
const PROPS: { value: Prop; label: string }[] = [
  { value: 'fett263', label: 'Fett263 · edit mode, gestures' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' },
];

type Tab = 'wiring' | 'config' | 'log' | 'backups';
type Step = 'idle' | 'building' | 'built' | 'backup' | 'bootloader' | 'driver' | 'writing' | 'verifying' | 'done' | 'failed';
const DRIVER_HELP = 'https://pod.hubbe.net/proffieboard-setup.html';
const fmtGB = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

export function Build({ board, go }: { board: Board; go?: (page: 'presets' | 'looks' | 'armory') => void }) {
  const { status } = board;
  // Frozen at connect time: the install deliberately drops the port, and the page must keep working through that.
  const [snap, setSnap] = useState<{ info: NonNullable<Board['info']>; saber: NonNullable<Board['saber']> } | null>(null);
  useEffect(() => { if (board.status === 'connected' && board.info && board.saber) setSnap({ info: board.info, saber: board.saber }); }, [board.status, board.info, board.saber]);
  // With nothing plugged in, the most recently seen saber can still be prepared: wiring, looks and a build need no
  // board. Installing does.
  // Which remembered saber to prepare while nothing is plugged in: the last chosen, else the most recent.
  const [offlineId, setOfflineId] = useState<string>(() => { try { return localStorage.getItem('hiltwright.build.saber') ?? ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.build.saber', offlineId); } catch { /* private mode */ } }, [offlineId]);
  const remembered = !snap ? board.library.find((s) => s.id === offlineId) ?? board.library[0] ?? null : null;
  const offline = !!remembered;
  const saber = snap?.saber ?? (remembered ? board.library.find((s) => s.id === remembered.id) ?? remembered : null);
  // Memoised: a fresh object every render would re-run every effect that depends on it.
  const offlineInfo = useMemo<NonNullable<Board['info']> | null>(() => (remembered ? infoFromRecord(remembered) : null), [remembered]);
  const info = snap?.info ?? offlineInfo;
  const [tool, setTool] = useState<ToolchainStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [blades, setBlades] = useState<ModelBlade[]>([]);
  const [prop, setProp] = useState<Prop>('fett263');
  const [variants, setVariants] = useState<BladeVariant[]>([]);
  const [confirmedWiring, setConfirmedWiring] = useState(!!saber?.model && !!saber?.firmware);
  const [preview, setPreview] = useState<{ text: string; hash: string; warnings: string[]; errors: string[] } | null>(null);
  const [log, setLog] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [withBackup, setWithBackup] = useState(true);
  const [tab, setTab] = useState<Tab>('wiring');
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
  // Another remembered saber chosen while offline: start from its own wiring and prop.
  const offlineSaberId = offline ? saber?.id : null;
  useEffect(() => { if (!offlineSaberId || !saber) return; setBlades(saber.model?.blades ?? guessBlades(info?.pixelBlades.length ? info.pixelBlades : [132])); setProp(saber.model?.prop ?? 'fett263'); setVariants(saber.model?.bladeId?.variants ?? []); setConfirmedWiring(!!saber.firmware); setResult(null); setStep('idle'); }, [offlineSaberId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (info && !blades.length) { setBlades(saber?.model?.blades ?? guessBlades(info.pixelBlades.length ? info.pixelBlades : [132])); if (saber?.model) { setProp(saber.model.prop); setVariants(saber.model.bladeId?.variants ?? []); /* a saved model only counts as confirmed wiring once it has actually been installed */ setConfirmedWiring(!!saber.firmware); } }
  }, [info, saber, blades.length]);
  // Work in progress is watched in the log; nobody should have to go and find it.
  useEffect(() => { if (step === 'building' || step === 'bootloader') setTab('log'); }, [step]);
  useEffect(() => {
    if (step === 'building' || step === 'writing' || step === 'backup') { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }
  }, [step]);

  const model = useMemo<SaberConfigModel | null>(() => (info && saber && blades.length ? draftModel(info, saber, { blades, prop, variants }) : null), [info, saber, blades, prop, variants]);
  const queuedLooks = queuedLookIds(model ?? undefined, saber?.firmware);

  useEffect(() => { if (model) void api().build.preview(model).then(setPreview); }, [model]);

  // Blade measurements are work the owner did with hardware in hand: keep them as soon as they exist, not only after
  // a build. Compared by value, so storing them does not loop back through the saber record.
  useEffect(() => {
    if (!model || !saber || !blades.length) return;
    const saved = JSON.stringify(saber.model?.bladeId?.variants ?? []);
    if (JSON.stringify(variants) !== saved && (variants.length || saber.model)) void board.updateSaber({ model }, saber.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);


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

  const plans = board.library.filter((s) => s.planned);
  const adopt = async (plannedId: string) => {
    const rec = await board.adoptPlan(plannedId);
    if (!rec?.model) return;
    setSnap((s) => (s ? { ...s, saber: rec } : s));
    setBlades(rec.model.blades); setProp(rec.model.prop); setVariants(rec.model.bladeId?.variants ?? []); setConfirmedWiring(false); setResult(null); setStep('idle');
  };
  const wiringOk = confirmedWiring && !preview?.errors.length;
  const built = !!result?.ok && step !== 'building';
  const nowStep = !wiringOk ? 1 : !tool?.ready ? 2 : !built ? 3 : step === 'done' ? 0 : 4;
  const verdict = voicePackVerdict(prop, voice);
  const canBuild = !busy && !!tool?.ready && !!model && !preview?.errors.length;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <section className="panel fill" aria-label="Build workspace">
        <div className="tabs" role="tablist">
          {([['wiring', 'Wiring', 'blade'], ['config', 'Config', 'build'], ['log', 'Log', 'diag'], ['backups', 'Backups', 'shield']] as [Tab, string, Parameters<typeof Icon>[0]['name']][]).map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon name={icon} />{label}{id === 'backups' && <span className="count">{backups.length}</span>}{id === 'wiring' && !wiringOk && <span className="count" style={{ color: 'var(--amber)' }}>check</span>}</button>
          ))}
        </div>

        {tab === 'wiring' && (
          <div className="pb col scroll" style={{ gap: 12 }}>
            {offline && board.library.length > 1 && (
              <label className="row" style={{ gap: 10 }}>
                <span className="small dim" style={{ flex: 'none' }}>Preparing</span>
                <span className="input sans" style={{ height: 30, width: 280 }}><span className="ellip">{saber.name}{saber.planned ? ' (planned)' : ''}</span><span className="caret"><Icon name="down" /></span>
                  <select value={saber.id} aria-label="Saber to prepare" onChange={(e) => setOfflineId(e.target.value)}>{board.library.map((s) => <option key={s.id} value={s.id}>{s.name}{s.planned ? ' (planned, not seen yet)' : ''}</option>)}</select></span>
                <span className="hint">Nothing is plugged in; this is set up ahead and installed when the saber appears.</span>
              </label>
            )}
            {saber.planned && (
              <div className="note"><Icon name="info" /><span>{saber.name} is a plan: a saber set up before its hilt was ever connected. Choose its wiring here, load a bank of presets onto it on Presets, pick looks, and build. When the hilt is plugged in, Hiltwright offers to make it this saber and the install goes straight on.{!model?.presets.length && <> It has no presets yet: <button type="button" className="holo" onClick={() => go?.('presets')}>load a bank onto it</button>.</>}</span></div>
            )}
            {!offline && plans.length > 0 && !saber.firmware && !saber.planned && (
              <div className="note amber"><Icon name="info" /><span>Is this a saber you planned ahead? {plans.map((p) => <button key={p.id} type="button" className="holo" style={{ marginRight: 10 }} onClick={() => void adopt(p.id)}>It is "{p.name}"</button>)}The plan's wiring, presets and looks move onto this saber.</span></div>
            )}
            {!confirmedWiring && !saber.planned && <div className="note amber"><Icon name="warn" /><span>The saber reported {info.pixelBlades.length} pixel blade{info.pixelBlades.length === 1 ? '' : 's'} ({info.pixelBlades.join(', ')} px), but old firmware cannot say which pins they use. Check every pin against your installer's diagram: wrong power pins can damage hardware.</span></div>}
            <HardwareEditor blades={blades} board={model?.board ?? 'V2'} detected={info.pixelBlades} locked={busy} onChange={(b) => { setBlades(b); setConfirmedWiring(false); setResult(null); setStep('idle'); }}
              swap={{
                variants,
                onVariants: (v) => { setVariants(v); setResult(null); setStep('idle'); },
                // Readings only count when they come from firmware built with Blade ID scanning on: that firmware powers
                // the blade while it measures, and a reading taken any other way will not match later.
                measureBlocked: board.status !== 'connected' ? 'Connect the saber to measure a blade.' : !saber.firmware?.bladeId ? 'Turn this on, then build and install once. After that the saber can measure each blade, and a second install teaches it all of them.' : null,
                measure: async () => { const r = await board.send('scanid', { idleMs: 1500 }); return parseId([...r.lines, ...r.events]); },
              }} />
          </div>
        )}
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
          <div className="head"><span className="nbox">{wiringOk ? <Icon name="check" /> : 1}</span><b>Wiring</b><span className="what">{blades.length} blade{blades.length === 1 ? '' : 's'}, {model?.presetsFrom ? `${model.presets.length} presets from bank "${model.presetsFrom.name}"` : `${info.presets.length} presets`}{queuedLooks.length ? `, ${queuedLooks.length} new look${queuedLooks.length === 1 ? '' : 's'}` : ''}</span></div>
          {model?.presetsFrom && (
            saber.planned
              ? <div className="note"><Icon name="info" /><span>Bank "{model.presetsFrom.name}" gives this plan its {model.presets.length} preset{model.presets.length === 1 ? '' : 's'}. Change them on Presets; colours chosen there are written after the install.</span></div>
              : <div className="note amber"><Icon name="info" /><span>Bank "{model.presetsFrom.name}" is loaded: its {model.presets.length} preset{model.presets.length === 1 ? '' : 's'} will replace the {info.presets.length} on the saber when this firmware goes on. A snapshot of the saber's presets is kept first; colours chosen in the bank are written after the install. <button type="button" className="holo" onClick={() => { if (saber?.model) { const { presetsFrom: _drop, ...rest } = saber.model; void board.updateSaber({ model: rest }); } }}>Keep the saber's own presets instead</button>.</span></div>
          )}
          <label className="row" style={{ gap: 10 }}>
            <span className="small dim" style={{ flex: 'none' }}>Buttons</span>
            <span className="input sans" style={{ height: 30 }}><span className="ellip">{PROPS.find((p) => p.value === prop)?.label}</span><span className="caret"><Icon name="down" /></span><select value={prop} disabled={busy} aria-label="Button behaviour" onChange={(e) => setProp(e.target.value as Prop)}>{PROPS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></span>
          </label>
          {preview?.errors.length ? <div className="note red"><Icon name="x" /><span>{preview.errors.join(' ')}</span></div> : null}
          <label className="row" style={{ gap: 10, fontSize: 12.5, color: 'var(--dim)', alignItems: 'flex-start' }}>
            <button type="button" className={`tog ${confirmedWiring ? 'on' : ''}`} role="switch" aria-checked={confirmedWiring} disabled={busy} onClick={() => setConfirmedWiring(!confirmedWiring)}><i /></button>
            I checked every data pin and power pin against the installer's wiring
          </label>
          {tab !== 'wiring' && !wiringOk && <button type="button" className="holo small" onClick={() => setTab('wiring')}>Open the wiring</button>}
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
              {tab !== 'wiring' && <button type="button" className="btn sm full" onClick={() => setTab('wiring')}><span className="b"><span className="i"><Icon name="blade" />Look at the wiring</span></span></button>}
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
