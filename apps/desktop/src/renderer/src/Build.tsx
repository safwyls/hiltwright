// Build & Install: the last step. The wiring (Wiring page) and presets (Presets page) live in the saber's model;
// this page shows the config they make, builds it, and installs: backup → bootloader → write → verify.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FETT263_REQUIRED_VOICE_PACK, parseList, presetsWithoutCommon, sdFailureIn, voicePackFromSerial, voicePackVerdict, wiringConfirmed, withWiringConfirmation, type VoicePackStatus } from '@hiltwright/core';
import { firmwareHasStaged, queuedLookIds } from './saberModel';
import { PROPS } from './Wiring';
import { missingFontWarning } from './fontNeeds';
import type { Workspace } from './workspace';
import type { BackupInfo, BuildResult, CardInfo, JobEvent, ToolchainStatus } from '../../shared/api';
import { saberCardIn, type OwnedBy } from './cardOwner';
import { cachedRead, rememberRead } from './cardCache';

/** Where the checks on the saber's SD card were made: its card in a reader, the saber itself, or nowhere (card out). */
type CardCheck = { source: 'reader'; root: string; by: OwnedBy; card: CardInfo; fonts: string[] } | { source: 'saber'; fonts: string[] } | { source: 'out' };
import type { SaberConfigModel } from '@hiltwright/core';
import type { Board } from './board';
import { Icon } from './Icon';
import { SaveDiagnostics } from './SaveDiagnostics';
import { readTransfer } from './transfer';
import { toolchainBlockers } from '../../shared/toolchainChecks';
import { duringWork } from './work';
import { BOOTLOADER_WAIT_MS, STOPPED_HINT, applyStagedPresets, installSequence, restoreSequence, writeFromBootloader as writeFromBootloaderFlow, type InstallDeps, type InstallNote } from './installFlow';

const api = () => window.hiltwright;

type Tab = 'config' | 'log' | 'backups';
type Step = 'idle' | 'building' | 'built' | 'backup' | 'bootloader' | 'driver' | 'writing' | 'verifying' | 'done' | 'failed';
const DRIVER_HELP = 'https://pod.hubbe.net/proffieboard-setup.html';
const fmtGB = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

/**
 * Each saber's last build this session, with the model it was made from. The page is left to change a style or the
 * wiring and comes back to it: kept here, the build is shown again, as current or out of date (FW5).
 */
const lastBuilds = new Map<string, { result: BuildResult; model: SaberConfigModel | null }>();

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
  // The model the build was made from: installed and recorded as built, whatever the setup has become since (FW5).
  const [builtModel, setBuiltModel] = useState<SaberConfigModel | null>(null);
  // A board in its bootloader that Hiltwright cannot place: the owner says whether it is this saber (FW4).
  const [askTarget, setAskTarget] = useState<{ name: string; answer: (yes: boolean) => void } | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  // Further notes under the main one: a record that could not be saved, a blank board with nothing to back up.
  const [notes, setNotes] = useState<InstallNote[]>([]);
  // What met the driver step: once the driver is in, that is what carries on (FW8), never an install in a restore's place.
  const paused = useRef<{ kind: 'install' } | { kind: 'restore'; backup: BackupInfo } | null>(null);
  const [armed, setArmed] = useState(false);
  const [withBackup, setWithBackup] = useState(true);
  const [tab, setTab] = useState<Tab>('config');
  // The fonts the presets name and the Fett263 voice pack are checked on the saber's own SD card, wherever it is: in a
  // card reader on this computer (read directly: the reader flow, which needs no USB sharing), or in the saber (asked
  // over serial), or out of both, when nothing is said about fonts or the voice pack until it is back.
  const [voice, setVoice] = useState<VoicePackStatus | null>(null);
  // Why the card could not be read, when it could not (kept apart from "the pack is not there").
  const [voiceWhy, setVoiceWhy] = useState<string | null>(null);
  const [cardCheck, setCardCheck] = useState<CardCheck | null>(null);
  const cardCheckRef = useRef<CardCheck | null>(null);
  cardCheckRef.current = cardCheck;
  const [lookAgain, setLookAgain] = useState(0);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  useEffect(() => {
    const me = saber;
    if (!me) return;
    let live = true;
    void (async () => {
      // The saber's own view: not while its card is shared, when the saber would be reading a card this computer has
      // (card-safety D2). The font list is read again here: the one from connecting is stale once fonts are copied.
      let own: { fonts: string[]; voice: VoicePackStatus | null; why: string | null; out: boolean } | null = null;
      if (board.status === 'connected' && !board.card.shared) {
        try {
          const lf = await board.send('list_fonts', { idleMs: 700 });
          const cat = await board.send('cat common/voicepack.ini', { idleMs: 700 });
          const dir = await board.send('dir common', { idleMs: 900, until: (l) => /^(Done listing files\.|No such directory\.)/.test(l) });
          const out = sdFailureIn([...lf.lines, ...cat.lines, ...dir.lines]) || !!board.info?.sdMissing;
          const rejected = [...cat.lines, ...dir.lines].some((l) => /^Whut\? :/.test(l));
          own = { fonts: parseList(lf.lines), voice: rejected || out ? null : voicePackFromSerial(cat.lines, dir.lines), why: rejected ? 'this firmware does not answer the card commands (cat and dir)' : null, out };
        } catch { own = { fonts: [], voice: null, why: 'the saber is not answering', out: false }; }
      }
      // Its card in a reader. One known only by its presets gives way to a card the saber is reading itself.
      let reader: ReturnType<typeof saberCardIn> = null;
      try { const look = await api().sd.look(); if (look.answered) reader = saberCardIn(look.cards, me, board.library); } catch { /* no drive list */ }
      if (reader && (reader.by !== 'presets' || !own || own.out || !own.fonts.length)) {
        const root = reader.card.root;
        try {
          // What Fonts & SD read from this card, while it is still what is on it (cardCache.ts); else read it, and keep that.
          let read = cachedRead(reader.card);
          if (!read) {
            const [fonts, tracks, vp] = await Promise.all([api().sd.listFonts(root), api().sd.listTracks(root), api().sd.voicePack(root)]);
            rememberRead(reader.card, { fonts, tracks, voice: vp });
            read = cachedRead(reader.card);
          }
          if (!live || !read) return;
          setCardCheck({ source: 'reader', root, by: reader.by, card: reader.card, fonts: read.fonts.map((f) => f.name) }); setVoice(read.voice); setVoiceWhy(null);
          return;
        } catch (err) { console.log(`[build] reading the card in the reader (${root}) failed: ${String(err)}`); }
      }
      if (!live) return;
      if (own?.out) { setCardCheck({ source: 'out' }); setVoice(null); setVoiceWhy(null); }
      else if (own) { setCardCheck({ source: 'saber', fonts: own.fonts }); setVoice(own.voice); setVoiceWhy(own.why); }
      else { setCardCheck(null); setVoice(null); setVoiceWhy(null); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.status, board.saber?.id, board.card.shared, saber?.id, lookAgain]);
  /** The owner says the card in the reader, known only by its presets, is this saber's: it is known by its serial from now on. */
  const linkReaderCard = async () => {
    const c = cardCheck?.source === 'reader' ? cardCheck.card : null;
    if (!c?.volumeSerial || !saber) return;
    try { await api().library.linkCard(saber.id, { serial: c.volumeSerial, label: c.label }); await board.refreshLibrary(); setLinkNote(null); setLookAgain((n) => n + 1); }
    catch (err) { setLinkNote(`Could not remember the card: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
  };
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
  // A shared card is given back first: an install restarts the saber with this computer still holding its card.
  const cardShared = status === 'connected' && board.card.shared;
  const canInstall = (status === 'connected' || inBootloader) && !cardShared;
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
    if (step === 'building' || step === 'writing' || step === 'backup' || step === 'bootloader' || step === 'verifying') { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }
  }, [step]);

  const queuedLooks = queuedLookIds(model ?? undefined, saber?.firmware);
  useEffect(() => { if (model) void api().build.preview(model).then(setPreview); }, [model]);
  // For the development aids, which are set up once: the preview and model as they are now.
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const modelRef = useRef(model);
  modelRef.current = model;
  const prop = model?.prop ?? 'fett263';
  // One rule for every page: confirmed only while the board and blades are the layout the owner checked.
  const confirmedWiring = wiringConfirmed(model);
  const setConfirmedWiring = (v: boolean) => { if (model) void ws.saveModel(withWiringConfirmation(model, v)); };

  const [installError, setInstallError] = useState<string | null>(null);
  const [installStarted, setInstallStarted] = useState<number | null>(null);
  const install = async () => {
    setInstalling(true); setInstallError(null); setInstallStarted(Date.now());
    try { setTool(await duringWork('setup', () => api().toolchain.install())); } catch (err) { setInstallError(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')); } finally { setInstalling(false); }
  };
  // Locking a toolchain folder other Windows users can change (toolchain-integrity).
  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState<string | null>(null);
  const repair = async () => {
    setRepairing(true); setRepairNote(null);
    try { const r = await api().toolchain.repair(); setTool(r.status); if (!r.ok) setRepairNote(r.text); } catch (err) { setRepairNote(String(err)); } finally { setRepairing(false); }
  };

  const build = useCallback(async (force = false) => {
    if (!model || !saber) return;
    setStep('building'); setElapsed(0); setNote(null); setResult(null); setBuiltModel(null); lastBuilds.delete(saber.id);
    const from = model;
    let r: BuildResult;
    try { r = await duringWork('build', () => api().build.run(saber.id, from, force)); } catch (err) {
      // A build that stops unexpectedly (a file it cannot write, say) ends the step as failed, never left running.
      const reason = String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '');
      setStep('failed'); setNote({ tone: 'red', text: `Could not build: ${reason}` });
      console.log(`[build] threw: ${reason}`);
      return;
    }
    setResult(r); setBuiltModel(from); lastBuilds.set(saber.id, { result: r, model: from });
    setStep(r.ok ? 'built' : 'failed');
    if (!r.ok) setNote({ tone: 'red', text: r.problems[0] ?? 'The build failed.' });
    console.log(`[build] ok=${r.ok} cached=${r.cached} ms=${r.ms} text=${r.textBytes} pct=${r.flashPct} problems=${JSON.stringify(r.problems)}`);
  }, [model, saber]);

  // The install and restore sequences live in installFlow.ts; these wrap them with the real calls and this page's state.
  const flowDeps = useCallback((): InstallDeps => ({
    flash: api().flash, snapshots: api().snapshots, board,
    noteBootloader: async (id, seen) => { const r = await api().library.noteBootloader(id, seen); await board.refreshLibrary(); return r; },
    sabers: board.library,
    confirmTarget: (name) => new Promise<boolean>((resolve) => setAskTarget({ name, answer: (yes) => { setAskTarget(null); resolve(yes); } })),
    report: (r) => { if (r.xfer !== undefined) setXfer(r.xfer); if (r.step) setStep(r.step); if (r.note !== undefined) setNote(r.note); if (r.notes !== undefined) setNotes(r.notes); },
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    // Staged presets need the card's presets file gone, from wherever the card is (installFlow applyStagedPresets).
    card: (() => { const c = cardCheckRef.current; return c?.source === 'reader' ? { where: 'reader' as const, root: c.root, clearPresets: (root: string) => api().sd.clearPresets(root) } : c?.source === 'out' ? { where: 'out' as const } : { where: 'saber' as const }; })(),
  }), [board]);
  const connectedNow = status === 'connected';
  /** From a board sitting in its bootloader with a usable driver: which board, check, backup, write, wait, reconnect, record. */
  const writeFromBootloader = useCallback(async () => {
    if (!result || !saber) return;
    await duringWork('install', () => writeFromBootloaderFlow(flowDeps(), { saber, model: builtModel, result, info, connected: false }));
  }, [result, saber, builtModel, info, flowDeps]);

  /** The install sequence. The renderer does the reboot because it owns the serial port. */
  const install2 = useCallback(async () => {
    if (!result?.ok || !result.dfuPath || !saber) return;
    setWithBackup(true);
    setNote(null); setNotes([]); setElapsed(0);
    paused.current = { kind: 'install' };
    await duringWork('install', () => installSequence(flowDeps(), { saber, model: builtModel, result, info, connected: connectedNow }));
  }, [result, saber, builtModel, info, flowDeps, connectedNow]);

  /** One click: main downloads, verifies and launches the official installer elevated, then the install resumes. */
  const [driverBusy, setDriverBusy] = useState(false);
  const installDriver = async () => {
    setDriverBusy(true); setDriverCheck('Downloading the driver installer, then asking Windows for approval…');
    try {
      const r = await duringWork('driver', () => api().flash.installDriver());
      if (r.ok) { setDriverCheck(null); await resumeAfterDriver(); } else setDriverCheck(r.text);
    } catch (err) { setDriverCheck(String(err)); } finally { setDriverBusy(false); }
  };

  /** After the owner installed the driver: check the bootloader again and carry on. */
  const [driverCheck, setDriverCheck] = useState<string | null>(null);

  // Backups taken before each install, and the way back to any of them.
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [restoreArmed, setRestoreArmed] = useState<string | null>(null);
  const saberId = saber?.id ?? null;
  const saberIdRef = useRef(saberId);
  saberIdRef.current = saberId;
  // Coming back to the page, or to another saber: its last build this session, if any, as it was left.
  useEffect(() => {
    const kept = saberId ? lastBuilds.get(saberId) : undefined;
    setResult(kept?.result ?? null); setBuiltModel(kept?.model ?? null);
    setStep((s) => (s === 'idle' || s === 'built' || s === 'failed' || s === 'done' ? (kept?.result.ok ? 'built' : 'idle') : s));
  }, [saberId]);
  const loadBackups = useCallback(() => { if (saberId) void api().flash.listBackups(saberId).then(setBackups); }, [saberId]);
  useEffect(() => { loadBackups(); }, [loadBackups, step]);
  const restore = useCallback(async (b: BackupInfo) => {
    if (!saber) return;
    // A restore backs up what is on the board first, like an install (FW8), so its bar has a backup phase too.
    setWithBackup(true);
    setRestoreArmed(null); setNote(null); setNotes([]); setElapsed(0);
    paused.current = { kind: 'restore', backup: b };
    await duringWork('restore', () => restoreSequence(flowDeps(), saber, b, connectedNow));
  }, [saber, flowDeps, connectedNow]);
  /** Put staged presets on a saber whose firmware already carries them, with no install (safe-staged-install D3). */
  const [stagedBusy, setStagedBusy] = useState(false);
  const useStaged = useCallback(async () => {
    if (!saber || !model) return;
    setStagedBusy(true); setNote(null); setNotes([]);
    try { setNotes([await duringWork('install', () => applyStagedPresets(flowDeps(), saber, model, saber.identity.usbSerial ?? null))]); } finally { setStagedBusy(false); }
  }, [saber, model, flowDeps]);
  /** After the driver step: carry on with what was paused, the board already in its bootloader. */
  const resumeAfterDriver = useCallback(async () => {
    const p = paused.current;
    if (p?.kind === 'restore') { if (saber) await duringWork('restore', () => restoreSequence(flowDeps(), saber, p.backup, false)); return; }
    await writeFromBootloader();
  }, [saber, flowDeps, writeFromBootloader]);
  const checkDriver = useCallback(async () => {
    setDriverCheck('Checking…');
    const boot = await api().flash.waitForBootloader(5000);
    if (boot.ok) { setDriverCheck(null); await resumeAfterDriver(); return; }
    const usb = await api().flash.usb();
    setDriverCheck(usb.bootloaderPresent ? `Still no driver (Windows reports ${usb.bootloaderDriver ?? 'none'}). Run the installer with the board plugged in, then check again.` : 'The board is no longer in bootloader mode. Hold BOOT, tap RESET, release BOOT, then check again.');
  }, [resumeAfterDriver]);

  // Dev aid: pretend a build finished, to look at the states that follow one without compiling.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { hiltwrightPretendBuilt?: (confirmed: boolean) => void }).hiltwrightPretendBuilt = (confirmed) => {
      // Built from the setup as it is now, so it counts as current until the setup changes.
      const pretend = { ok: true, cached: true, ms: 0, textBytes: 184400, flashBytes: 262144, flashPct: 70, problems: [], output: '', dfuPath: null, configHash: previewRef.current?.hash ?? '', board: modelRef.current?.board ?? 'V2', os: 'v8.10', manifest: { hash: 'pretend', looks: [], presets: [] } } as unknown as BuildResult;
      setResult(pretend);
      setBuiltModel(modelRef.current);
      if (saberIdRef.current) lastBuilds.set(saberIdRef.current, { result: pretend, model: modelRef.current });
      setStep('built'); setConfirmedWiring(confirmed);
    };
    (window as unknown as { hiltwrightPretendWriting?: (pct: number) => void }).hiltwrightPretendWriting = (pct) => { setConfirmedWiring(true); setStep('writing'); setXfer(pct); };
    // Run the real install sequence against pretend flash and board calls, to see the page's words for a normal
    // install, a failed write, a slow return, a record that cannot be saved, or a slow reboot, with no board.
    (window as unknown as { hiltwrightPretendInstall?: (fault?: 'write' | 'return' | 'record' | 'slow' | 'own') => Promise<void> }).hiltwrightPretendInstall = async (fault) => {
      const { saber: s, result: r, builtModel: m, info: i } = liveRef.current;
      if (!s || !r || !m) return;
      const serial = 'PRETEND1';
      const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
      const ok = { ok: true, ms: 1, detail: 'pretend' };
      const flash: InstallDeps['flash'] = {
        usb: async () => ({ runtimePresent: true, bootloaderPresent: false, bootloaderDriver: null, bootloaderProblem: null, bootloaders: [], runtimeSerials: [serial], runtimeNoSerial: 0 }),
        waitForBootloader: async () => { await wait(fault === 'slow' ? 7000 : 800); return { ok: true, text: 'pretend', serials: [serial] }; },
        target: async () => ({ serial, flashBytes: r.board === 'V3' ? 524288 : 262144, board: r.board, found: true }),
        leave: async () => ok,
        backup: async () => { await wait(800); return { ...ok, file: 'C:\\Users\\owner\\AppData\\Roaming\\@hiltwright\\desktop\\sabers\\pretend\\backups\\before-install.bin', kind: 'firmware' as const }; },
        write: async () => { await wait(1500); return fault === 'write' ? { ok: false, ms: 1, detail: 'dfu-util: Error during download (pretend)' } : ok; },
        restore: async () => ok,
        waitForRuntime: async () => { await wait(1000); return fault !== 'return'; },
      };
      let restarted = false;
      const pretendBoard: InstallDeps['board'] = {
        info: null, send: async () => ({}), rebootToBootloader: async () => true, connect: async () => undefined, expectAfterInstall: () => undefined, reachNext: async () => true,
        // The saber's own presets until a restart; then the staged ones, unless it keeps its own ('own').
        restartSaber: async () => { restarted = true; await wait(800); return true; },
        currentPresets: () => (restarted && fault !== 'own' ? m.presets.map((q) => ({ font: q.font, track: q.track, name: q.name, styles: [], variation: 0 })) : [{ font: 'Old;common', track: '', name: 'Old', styles: [], variation: 0 }]),
        currentSaber: () => ({ ...s, lastSeen: new Date(Date.now() + 1000).toISOString(), identity: { ...s.identity, configName: `config/${m.name}.h`, version: `${r.os} hiltwright pretend` } }),
        updateSaber: async () => { if (fault === 'record') throw new Error("Error invoking remote method 'library:update': Error: EPERM: operation not permitted, rename 'C:\\Users\\owner\\AppData\\Roaming\\@hiltwright\\desktop\\library.json.tmp' -> 'C:\\Users\\owner\\AppData\\Roaming\\@hiltwright\\desktop\\library.json'"); },
      };
      setWithBackup(true); setNote(null); setNotes([]); setElapsed(0);
      await installSequence({ ...flowDeps(), flash, board: pretendBoard, noteBootloader: async () => s }, { saber: s, model: m, result: { ...r, ok: true, dfuPath: 'pretend.dfu' }, info: i, connected: true });
    };
    // Change the saved setup while this page stays open, as a change made elsewhere would (to see a build go stale).
    (window as unknown as { hiltwrightChangeSetup?: (fn: (m: SaberConfigModel) => SaberConfigModel) => Promise<void> }).hiltwrightChangeSetup = async (fn) => { if (modelRef.current) await ws.saveModel(fn(modelRef.current)); };
  }, []);

  // Dev aid: main calls this to run a compile-only pass against the connected board.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { hiltwrightBuildE2E?: () => Promise<string> }).hiltwrightBuildE2E = async () => {
      if (!model) return 'no model';
      setConfirmedWiring(true);
      await build(true);
      return 'built';
    };
  }, [model, build]);

  // For the development aids, which are set up once: what an install would use, as it is now.
  const liveRef = useRef({ saber, result, builtModel, info });
  liveRef.current = { saber, result, builtModel, info };
  const pct = result?.flashPct ?? null;
  const busy = step === 'building' || step === 'backup' || step === 'bootloader' || step === 'writing' || step === 'verifying';
  const stepLabel: Record<Step, string> = { idle: 'Ready', building: 'Building firmware…', built: 'Firmware built', backup: 'Backing up the saber…', bootloader: 'Rebooting into bootloader…', driver: 'Windows needs a driver', writing: 'Writing firmware…', verifying: 'Waiting for the saber…', done: 'Installed', failed: 'Stopped' };
  // One bar for the whole job: reboot, read the backup, write, wait for the saber. Transfers move it with real numbers.
  const phasePct = xfer ?? 0;
  const overall = step === 'bootloader' ? 3 : step === 'backup' ? 5 + phasePct * 0.4 : step === 'writing' ? (withBackup ? 45 + phasePct * 0.47 : 5 + phasePct * 0.87) : step === 'verifying' ? 94 : step === 'done' ? 100 : 0;
  const phaseText = step === 'bootloader' ? 'Rebooting into the bootloader' : step === 'backup' ? 'Reading the backup' : step === 'writing' ? 'Writing firmware' : step === 'verifying' ? 'Waiting for the saber to restart' : '';
  const blockers = tool ? toolchainBlockers(tool) : { pathTooLong: null, lowSpace: null };

  const toolStep = (now: boolean) => (
    <div className={`stepc ${tool?.ready ? 'done' : now ? 'now' : ''}`} data-tour="build-compiler">
      <div className="head"><span className="nbox">{tool?.ready ? <Icon name="check" /> : 2}</span><b>Compiler</b><span className="what">{tool?.ready ? `ProffieOS ${tool.proffieOSVersion ?? ''} ready` : installing ? `installing, ${installStarted ? Math.round((Date.now() - installStarted) / 1000) : 0} s` : 'one-time download'}</span></div>
      {tool?.ready && <span className="hint">arduino-cli {tool.versions.cli} · board support {tool.versions.core} · ProffieOS {tool.versions.proffieOS}</span>}
      {tool?.open && (
        <div className="note amber"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
          <span>Other Windows users on this computer could change the compiler Hiltwright uses, in {tool.root}. Repair makes it changeable only by administrators and your account; Windows may ask for approval.</span>
          {repairNote && <span className="red small">{repairNote}</span>}
          <span className="row"><button type="button" className="btn sm" disabled={repairing || installing} onClick={() => void repair()}><span className="b"><span className="i">{repairing ? 'Repairing…' : 'Repair'}</span></span></button></span>
        </span></div>
      )}
      {tool && !tool.ready && !installing && (
        <>
          <span className="hint">Building firmware needs the ProffieOS sources, the Arduino command line and the ARM compiler. Hiltwright downloads them once into its own folder and touches nothing else.</span>
          <div>
            <div className="kv"><span>Download</span><span>about 360 MB</span></div>
            <div className="kv"><span>On disk</span><span>about 1.9 GB</span></div>
            <div className="kv"><span>Free space</span><span>{tool.freeBytes != null ? fmtGB(tool.freeBytes) : 'unknown'}</span></div>
            <div className="kv"><span>Folder</span><span title={tool.root}>{tool.root}</span></div>
          </div>
          {blockers.lowSpace && <div className="note red"><Icon name="x" /><span>{blockers.lowSpace.panel}</span></div>}
          {blockers.pathTooLong && <div className="note red"><Icon name="x" /><span>{blockers.pathTooLong.panel}</span></div>}
          {installError && <div className="note red"><Icon name="x" /><span className="col" style={{ gap: 8 }}><span>{installError}</span><SaveDiagnostics small /></span></div>}
          <button type="button" className={`btn full ${now ? 'pri' : ''}`} disabled={installing || !!blockers.pathTooLong || !!blockers.lowSpace} onClick={() => void install()}><span className="b"><span className="i"><Icon name="import" />{installError ? 'Try again' : 'Download and install'}</span></span></button>
        </>
      )}
      {installing && <div className="console" style={{ maxHeight: 120, minHeight: 48, fontSize: 11 }}>{log.filter((e) => e.job === 'toolchain').slice(-6).map((e, i) => <div key={i}>{e.line}</div>)}</div>}
      {installing && <button type="button" className="btn sm ghost" onClick={() => void api().toolchain.cancel()}><span className="b"><span className="i">Cancel</span></span></button>}
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
  // A build is current only while the setup would still make the same config (FW5); changing it back makes it current again.
  const stale = !!result?.ok && !!preview && preview.hash !== result.configHash;
  const built = !!result?.ok && step !== 'building' && !stale;
  const nowStep = !wiringOk ? 1 : !tool?.ready ? 2 : !built ? 3 : step === 'done' ? 0 : 4;
  // An install armed for a build that has since gone out of date is disarmed.
  if (stale && armed) setArmed(false);
  // The presets that will be on the saber: the staged list when presets are staged, else the saber's own (both are model.presets).
  const willHave = model?.presets ?? [];
  // With the card out of the saber and not in a reader, nothing is said about the voice pack or fonts: not known is not missing.
  const verdict = cardCheck?.source === 'out' ? null : voicePackVerdict(prop, voice, voiceWhy, presetsWithoutCommon(willHave));
  // Fonts are known from the saber's card in a reader, or from a connected saber reading a card with fonts on it.
  const cardFonts = cardCheck?.source === 'reader' ? cardCheck.fonts
    : cardCheck?.source === 'saber' && connectedNow && !cardShared && !saber?.planned && cardCheck.fonts.length ? cardCheck.fonts : null;
  const fontWarn = missingFontWarning(willHave, cardFonts);
  const canBuild = !busy && !!tool?.ready && !!model && !preview?.errors.length;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <section className="panel fill" aria-label="Build workspace" data-tour="build-workspace">
        <div className="tabs" role="tablist">
          {([['config', 'Config', 'build'], ['log', 'Log', 'diag'], ['backups', 'Backups', 'shield']] as [Tab, string, Parameters<typeof Icon>[0]['name']][]).map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} data-tour={`build-tab-${id}`} onClick={() => setTab(id)}><Icon name={icon} />{label}{id === 'backups' && <span className="count">{backups.length}</span>}</button>
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

      <aside className="rail" aria-label="Steps" data-tour="build-steps">
        <div className="row between" style={{ minHeight: 24 }}>
          <b style={{ fontWeight: 600 }} className="ellip">{saber.firmware ? `Rebuild ${saber.name}` : `Adopt ${saber.name}`}</b>
          <span className={`chip ${step === 'done' ? 'ok' : step === 'failed' ? 'err' : busy ? 'warn' : ''}`}><span className="dot" />{stepLabel[step]}{busy ? ` ${elapsed}s` : ''}</span>
        </div>

        <div className={`stepc ${wiringOk ? 'done' : nowStep === 1 ? 'now' : ''} ${preview?.errors.length ? 'bad' : ''}`}>
          <div className="head"><span className="nbox">{wiringOk ? <Icon name="check" /> : 1}</span><b>Set up</b><span className="what">{model?.blades.length ?? 0} blade{model?.blades.length === 1 ? '' : 's'}, {model?.presets.length ?? 0} preset{model?.presets.length === 1 ? '' : 's'}{model?.presetsFrom ? ' (staged)' : ''}{queuedLooks.length ? `, ${queuedLooks.length} new style${queuedLooks.length === 1 ? '' : 's'}` : ''}</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="chip" onClick={() => go('wiring')}><Icon name="blade" />Wiring{confirmedWiring ? '' : ' · confirm'}</button>
            <button type="button" className="chip" onClick={() => go('presets')}><Icon name="presets" />Presets</button>
            <button type="button" className="chip" onClick={() => go('looks')}><Icon name="looks" />Styles</button>
            <button type="button" className="chip" onClick={() => go('fonts')}><Icon name="fonts" />Fonts</button>
          </div>
          <span className="hint">{PROPS.find((p) => p.value === prop)?.label}{saber?.planned ? ' · planned ahead, not connected yet' : ''}</span>
          {!confirmedWiring && <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="warn" /><span>Confirm the wiring on the Wiring page before building.</span></div>}
          {model?.presetsFrom && !saber?.planned && info && !firmwareHasStaged(model, saber?.firmware) && <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="info" /><span>The staged presets replace the {info.presets.length} on the saber once the new firmware is on and checked; a snapshot is kept first.</span></div>}
          {model && firmwareHasStaged(model, saber?.firmware) && (
            <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="info" /><span className="col" style={{ gap: 8 }}>
              <span>This saber's firmware has your staged presets, but the saber still uses its own.{connectedNow ? ' Putting them on restarts the saber once; a snapshot of its own is kept first.' : ' Connect the saber to put them on.'}</span>
              {connectedNow && <span className="row"><button type="button" className="btn sm" disabled={busy || stagedBusy} onClick={() => void useStaged()}><span className="b"><span className="i"><Icon name="presets" />{stagedBusy ? 'Putting them on…' : 'Use the staged presets'}</span></span></button></span>}
            </span></div>
          )}
          {preview?.errors.map((e) => <div key={e} className="note red" style={{ padding: '8px 10px' }}><Icon name="x" /><span>{e}</span></div>)}
        </div>

        {toolStep(nowStep === 2)}

        <div className={`stepc ${built ? 'done' : nowStep === 3 ? 'now' : ''} ${result && !result.ok ? 'bad' : ''}`} data-tour="build-build">
          <div className="head"><span className="nbox">{built ? <Icon name="check" /> : 3}</span><b>Build</b><span className="what">{step === 'building' ? `compiling, ${elapsed} s` : stale ? 'out of date' : result?.ok ? (result.cached ? 'unchanged, reused' : `built in ${(result.ms / 1000).toFixed(0)} s`) : 'about a minute'}</span></div>
          {stale && step !== 'building' && <div className="note amber" style={{ padding: '8px 10px' }}><Icon name="warn" /><span>The setup changed after this build. Build again to install it.</span></div>}
          {result?.ok && (
            <div className="col" style={{ gap: 5 }}>
              <div className="row between" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 18 }}>{pct ?? '?'}%<span className="mute small"> of flash</span></span><span className="mono mute small">{result.textBytes != null ? (result.textBytes / 1024).toFixed(1) : '?'} of {result.flashBytes / 1024} KB</span></div>
              <div style={{ height: 6, background: 'var(--track)' }}><div style={{ height: '100%', width: `${Math.min(100, pct ?? 0)}%`, background: (pct ?? 0) > 90 ? 'var(--red)' : (pct ?? 0) > 70 ? 'var(--amber)' : 'var(--holo)' }} /></div>
            </div>
          )}
          {result?.problems.map((p) => <div key={p} className="note red"><Icon name="x" /><span>{p}</span></div>)}
          <button type="button" className={`btn full ${nowStep === 3 ? 'pri' : ''}`} disabled={!canBuild} onClick={() => void build(true)}><span className="b"><span className="i"><Icon name="build" />{step === 'building' ? 'Building…' : built ? 'Build again' : 'Build firmware'}</span></span></button>
        </div>

        <div className={`stepc ${step === 'done' ? 'done' : nowStep === 4 ? 'now' : ''}`} data-tour="build-install">
          <div className="head"><span className="nbox">{step === 'done' ? <Icon name="check" /> : 4}</span><b>Install</b><span className="what">{step === 'backup' ? `backing up, ${elapsed} s` : step === 'writing' ? `writing, ${elapsed} s` : 'backup first, about two minutes'}</span></div>
          {(step === 'bootloader' || step === 'backup' || step === 'writing' || step === 'verifying') && (
            <div className="col" style={{ gap: 5 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall)} aria-label="Install progress">
              <div className="row between" style={{ alignItems: 'baseline' }}><span className="small">{phaseText}</span><span className="mono mute small">{Math.round(overall)}%</span></div>
              <div style={{ height: 8, background: 'var(--track)' }}><div style={{ height: '100%', width: `${overall}%`, background: 'var(--amber)', transition: 'width .3s linear' }} /></div>
              <span className="hint">Leave the saber plugged in until this finishes.</span>
              {step === 'bootloader' && elapsed >= 5 && <span className="hint">Still waiting for the saber to restart in bootloader mode. This can take up to {BOOTLOADER_WAIT_MS / 1000} seconds.</span>}
            </div>
          )}
          {askTarget ? (
            <div className="col" style={{ gap: 10, padding: 12, border: '1px solid var(--amber)', background: 'color-mix(in srgb,var(--amber) 8%,transparent)' }}>
              <span className="small"><b style={{ fontWeight: 600 }}>Hiltwright cannot tell which saber this board is.</b> A board is in bootloader mode, but its serial number belongs to no saber Hiltwright knows. Is it {askTarget.name}? Nothing has been read or written yet.</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn danger grow" onClick={() => askTarget.answer(true)}><span className="b"><span className="i">Yes, it is {askTarget.name}</span></span></button>
                <button type="button" className="btn ghost" onClick={() => askTarget.answer(false)}><span className="b"><span className="i">Cancel</span></span></button>
              </div>
            </div>
          ) : step === 'driver' ? (
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
            <div className="col" style={{ gap: 10, padding: 12, border: '1px solid var(--amber)', background: 'color-mix(in srgb,var(--amber) 8%,transparent)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className="amber" style={{ display: 'flex', width: 16, flex: 'none', marginTop: 2 }}><Icon name="warn" /></span><span className="small"><b style={{ fontWeight: 600 }}>Confirm the wiring to unlock the install.</b> Wrong power pins can damage hardware, so Hiltwright will not write firmware until you have checked them.</span></div>
              <label className="row" style={{ gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
                <button type="button" className={`tog ${confirmedWiring ? 'on' : ''}`} role="switch" aria-checked={confirmedWiring} disabled={busy} onClick={() => setConfirmedWiring(true)}><i /></button>
                I checked every data pin and power pin against the installer's wiring
              </label>
              <button type="button" className="btn sm full" onClick={() => go('wiring')}><span className="b"><span className="i"><Icon name="blade" />Look at the wiring</span></span></button>
            </div>
          ) : step === 'bootloader' || step === 'backup' || step === 'writing' || step === 'verifying' ? null : !armed ? (
            <button type="button" className={`btn full ${nowStep === 4 ? 'warn' : ''}`} disabled={busy || step !== 'built' || stale || !confirmedWiring || !canInstall} onClick={() => setArmed(true)}><span className="b"><span className="i"><Icon name="bolt" />Install on {saber.name}</span></span></button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn danger grow" disabled={busy || stale} onClick={() => { setArmed(false); void install2(); }}><span className="b"><span className="i"><Icon name="bolt" />Yes, write the firmware</span></span></button>
              <button type="button" className="btn ghost" onClick={() => setArmed(false)}><span className="b"><span className="i">Cancel</span></span></button>
            </div>
          )}
          {cardShared && <div className="note amber"><Icon name="warn" /><span>{saber.name}'s card is shared with this computer. Give it back on Fonts &amp; SD first: installing restarts the saber, and this computer must not be holding its card when it does. Putting back a backup waits for the same.</span></div>}
          {step !== 'driver' && !busy && !(built && !confirmedWiring) && <span className="hint">{stale ? 'The setup changed after this build. Build again to install it.' : !built ? (confirmedWiring ? 'Build first.' : 'Build first. The wiring also needs confirming before anything is written.') : !canInstall ? (offline ? 'Plug the saber in to install. Everything up to here works without it.' : 'Reconnect the saber to install.') : inBootloader ? 'The board is in bootloader mode and ready to write.' : 'The whole flash is read to a backup file before anything is written.'}</span>}
        </div>

        {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : note.tone === 'red' ? 'x' : 'warn'} /><span className="col" style={{ gap: 8 }}><span>{note.text}</span>{(note.tone === 'red' || step === 'failed') && <SaveDiagnostics small />}</span></div>}
        {notes.map((n) => <div key={n.text} className={`note ${n.tone}`}><Icon name={n.tone === 'green' ? 'check' : n.tone === 'red' ? 'x' : 'warn'} /><span>{n.text}</span></div>)}
        {cardCheck?.source === 'reader' && <div className="note"><Icon name="sd" /><span className="col" style={{ gap: 6 }}>
          <span>Fonts and the voice pack were checked on {saber.name}{'’'}s card in the card reader ({cardCheck.root}){cardCheck.by === 'presets' ? ', which Hiltwright knows by its presets' : ''}. Put it back in the saber before you use it.</span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="holo" onClick={() => setLookAgain((n) => n + 1)}>Look again</button>
            {cardCheck.by === 'presets' && cardCheck.card.volumeSerial && <button type="button" className="holo" onClick={() => void linkReaderCard()}>Remember it as {saber.name}{'’'}s card</button>}
          </span>
          {linkNote && <span className="small">{linkNote}</span>}
        </span></div>}
        {cardCheck?.source === 'out' && <div className="note"><Icon name="sd" /><span className="col" style={{ gap: 6 }}>
          <span>{saber.name}{'’'}s SD card is out of the saber. The font and voice pack checks run once it is back in the saber, or in a card reader on this computer.</span>
          <span className="row" style={{ gap: 8 }}><button type="button" className="holo" onClick={() => setLookAgain((n) => n + 1)}>Look again</button></span>
        </span></div>}
        {fontWarn && <div className="note amber"><Icon name="warn" /><span className="col" style={{ gap: 6 }}><span>{fontWarn.text}</span><span className="row" style={{ gap: 8 }}><button type="button" className="holo" onClick={() => go('fonts')}>Fonts &amp; SD</button><button type="button" className="holo" onClick={() => go('presets')}>Presets</button></span></span></div>}
        {verdict && <div className={`note ${verdict.tone}`}><Icon name={verdict.ok ? 'check' : 'warn'} />{verdict.ok || !voice ? <span>{verdict.text}</span> : <span className="col" style={{ gap: 6 }}><span>{verdict.text}</span><span className="row" style={{ gap: 8 }}>
          {/* The pack itself is short: Fonts & SD can put one on the card. Otherwise it is presets leaving common out. */}
          {!voice.menuSounds || (voice.version ?? 0) < FETT263_REQUIRED_VOICE_PACK
            ? <button type="button" className="holo" onClick={() => go('fonts')}>Update it on Fonts &amp; SD</button>
            : <button type="button" className="holo" onClick={() => go('presets')}>Presets</button>}
        </span></span>}</div>}
        {preview?.warnings.map((w) => <div key={w} className="note"><Icon name="info" /><span>{w}</span></div>)}
        {step === 'failed' && <span className="hint">{STOPPED_HINT}</span>}
      </aside>
    </div>
  );
}
