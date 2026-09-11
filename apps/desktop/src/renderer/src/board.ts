// Board session for the renderer: connect, identify, remember the saber, read and edit presets with verification.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardClient, deleteCurrentPreset, diffPreset, duplicateCurrentPreset, editCurrentPreset, formatBuiltin, isEmptyPatch, isPresetBlockEnd, listPresets, parseBuiltin,
  moveCurrentPreset, parseBattery, parseInteger, parseList, parsePresetBlocks, parseScanId, parseVersion, presetCommands, selectPreset, wasRejected,
  type ListResult, type PresetPatch, type PresetRecord, type Response, type VersionInfo,
} from '@hiltwright/core';
import type { SaberIdentity, SaberPatch, SaberRecord, SnapshotMeta } from '../../shared/api';
import { PROFFIE_FILTER, WebSerialTransport, describePort, grantedProffiePorts } from './serial';

export interface BoardInfo {
  version: VersionInfo | null;
  battery: number | null;
  volume: number | null;
  currentPreset: number | null;
  presets: PresetRecord[];
  fonts: string[];
  tracks: string[];
  pixelBlades: number[];
  bladeConfig: number | null;
  rejected: string[];
  timings: Record<string, number>;
}

export interface ConsoleLine { kind: 'in' | 'out' | 'event'; text: string; at: number }
export type Status = 'idle' | 'no-port' | 'connecting' | 'reading' | 'connected' | 'error';
export type SaveState = { kind: 'idle' } | { kind: 'writing'; what: string } | { kind: 'saved'; what: string; ms: number; at: number } | { kind: 'failed'; what: string; error: string };

const api = () => window.hiltwright;

export function useBoard() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [portName, setPortName] = useState<string | null>(null);
  const [info, setInfo] = useState<BoardInfo | null>(null);
  const [saber, setSaber] = useState<SaberRecord | null>(null);
  const [library, setLibrary] = useState<SaberRecord[]>([]);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (v: boolean) => { busyRef.current = v; setBusyState(v); };
  const client = useRef<BoardClient | null>(null);
  const connecting = useRef(false);
  const transport = useRef<WebSerialTransport | null>(null);
  const infoRef = useRef<BoardInfo | null>(null);
  const saberRef = useRef<SaberRecord | null>(null);
  infoRef.current = info;
  saberRef.current = saber;

  const log = useCallback((kind: ConsoleLine['kind'], text: string) => {
    setLines((ls) => [...ls, { kind, text, at: Date.now() }].slice(-400));
  }, []);

  const refreshLibrary = useCallback(async () => {
    try { setLibrary(await api().library.list()); } catch (err) { console.log(`[library] list failed: ${String(err)}`); }
  }, []);

  const refreshSnapshots = useCallback(async (saberId: string) => {
    try { setSnapshots(await api().snapshots.list(saberId)); } catch (err) { console.log(`[snapshots] list failed: ${String(err)}`); }
  }, []);

  const disconnect = useCallback(async (reason?: string) => {
    client.current?.close();
    client.current = null;
    await transport.current?.close();
    transport.current = null;
    setStatus(reason ? 'error' : 'idle');
    if (reason) setError(reason);
    setInfo(null);
    setPortName(null);
  }, []);

  /**
   * Put the board into its DFU bootloader and let go of the port so dfu-util can have the device.
   * Tries the firmware's own RebootDFU command first, then the Arduino 1200-baud touch. Either way the port
   * is closed afterwards; the caller reconnects when the new firmware is up.
   */
  const rebootToBootloader = useCallback(async (): Promise<boolean> => {
    const t = transport.current;
    if (!t) return false;
    const port = t.port;
    try { log('in', 'RebootDFU'); await client.current?.send('RebootDFU', { idleMs: 400 }); } catch { /* the port may vanish mid-reply; that is success */ }
    client.current?.close();
    client.current = null;
    transport.current = null;
    await t.close();
    setStatus('idle');
    setPortName(null);
    // 1200-baud touch as a fallback for firmware that ignored RebootDFU.
    await new Promise((r) => setTimeout(r, 800));
    try {
      await port.open({ baudRate: 1200 });
      await port.setSignals({ dataTerminalReady: false });
      await port.close();
      console.log('[board] 1200-baud touch sent');
    } catch (err) {
      console.log(`[board] 1200-baud touch not needed, the port is already gone (RebootDFU worked): ${String(err)}`);
    }
    return true;
  }, [log]);

  const send = useCallback(async (command: string, opts?: Parameters<BoardClient['send']>[1]): Promise<Response> => {
    if (!client.current) throw new Error('Not connected');
    log('in', command);
    const r = await client.current.send(command, opts);
    for (const l of r.lines) log('out', l);
    return r;
  }, [log]);

  /** Read everything the board can tell us, then match or create the saber in the library. */
  const identify = useCallback(async () => {
    setStatus('reading');
    const timings: Record<string, number> = {};
    const rejected: string[] = [];
    const time = async (cmd: string, opts?: Parameters<BoardClient['send']>[1]) => {
      const r = await send(cmd, opts);
      timings[cmd] = r.ms;
      if (wasRejected(r.lines)) rejected.push(cmd);
      return r;
    };
    const v = await time('version', { until: (l) => /^installed:/.test(l) });
    const b = await time('battery', { until: (l) => /^Battery voltage:/.test(l) });
    const vol = await time('get_volume', { until: (l) => /^-?\d+$/.test(l.trim()) });
    const cur = await time(presetCommands.getCurrent(), { until: (l) => /^-?\d+$/.test(l.trim()) });
    const lp = await time(presetCommands.list(), { idleMs: 700, timeoutMs: 15000 });
    const fonts = await time('list_fonts', { idleMs: 700, timeoutMs: 15000 });
    const tracks = await time('list_tracks', { idleMs: 700, timeoutMs: 15000 });
    const scan = await time('scanid', { idleMs: 1200, timeoutMs: 15000 });
    const scanInfo = parseScanId([...scan.lines, ...scan.events]);
    const next: BoardInfo = {
      version: parseVersion(v.lines),
      battery: parseBattery(b.lines),
      volume: parseInteger(vol.lines),
      currentPreset: parseInteger(cur.lines),
      presets: parsePresetBlocks(lp.lines).presets,
      fonts: parseList(fonts.lines),
      tracks: parseList(tracks.lines),
      pixelBlades: scanInfo.pixelBlades,
      bladeConfig: scanInfo.bladeConfig,
      rejected,
      timings,
    };
    setInfo(next);
    setStatus('connected');
    console.log(`[board] version=${next.version?.version ?? '?'} config=${next.version?.config ?? '?'} prop=${next.version?.prop ?? '?'} buttons=${next.version?.buttons ?? '?'} battery=${next.battery ?? '?'} volume=${next.volume ?? '?'} current=${next.currentPreset ?? '?'} presets=${next.presets.length} fonts=${next.fonts.length} tracks=${next.tracks.length} blades=${JSON.stringify(next.pixelBlades)} timings=${JSON.stringify(timings)}`);

    // Remember the saber.
    let usbSerial: string | null = null;
    try { const serials = await api().usb.proffieSerials(); usbSerial = serials.length === 1 ? serials[0] : null; } catch { /* not available on this platform */ }
    const identity: SaberIdentity = {
      usbSerial, configName: next.version?.config ?? null, version: next.version?.version ?? null, prop: next.version?.prop ?? null,
      buttons: next.version?.buttons ?? null, installed: next.version?.installed ?? null, pixelBlades: next.pixelBlades, bladeConfig: next.bladeConfig,
    };
    try {
      const rec = await api().library.upsert({ identity, presets: next.presets, fonts: next.fonts, tracks: next.tracks });
      setSaber(rec);
      console.log(`[library] saber ${rec.id} "${rec.name}" serial=${rec.identity.usbSerial ?? 'none'} firstSeen=${rec.firstSeen}`);
      await api().snapshots.save(rec.id, 'Connected', next.presets);
      await refreshSnapshots(rec.id);
      await refreshLibrary();
    } catch (err) {
      console.log(`[library] upsert failed: ${String(err)}`);
    }
    return next;
  }, [send, refreshLibrary, refreshSnapshots]);

  const connectTo = useCallback(async (port: SerialPort) => {
    setError(null);
    setStatus('connecting');
    const t = new WebSerialTransport(port, (reason) => { void disconnect(`Port closed: ${reason}`); });
    try {
      await t.open();
    } catch (err) {
      console.log(`[board] open failed: ${String(err)}`);
      setStatus('error');
      setError(`Could not open the port: ${String(err)}`);
      return;
    }
    transport.current = t;
    client.current = new BoardClient(t, { onEvent: (l) => log('event', l) });
    setPortName(describePort(port));
    console.log('[board] port opened', describePort(port));
    try {
      await identify();
    } catch (err) {
      await disconnect(`Board did not answer: ${String(err)}`);
    }
  }, [disconnect, identify, log]);

  const connectOnce = useCallback(async (interactive: boolean) => {
    let ports = await grantedProffiePorts();
    console.log(`[board] granted ports: ${ports.length} (all: ${(await navigator.serial.getPorts()).map(describePort).join(', ') || 'none'})`);
    if (!ports.length) {
      try { ports = [await navigator.serial.requestPort({ filters: [PROFFIE_FILTER] })]; } catch (err) {
        console.log(`[board] requestPort ${interactive ? '(click)' : '(auto)'} failed: ${String(err)}`);
        ports = [];
      }
    }
    if (!ports.length) { setStatus('no-port'); console.log('[board] no Proffieboard port granted'); return; }
    await connectTo(ports[0]);
  }, [connectTo]);

  const connect = useCallback(async (interactive = false) => {
    if (!('serial' in navigator)) { setStatus('error'); setError('Web Serial is not available in this window.'); return; }
    // After a reflash both the install flow and the Web Serial 'connect' event try to open the port; one is enough.
    if (transport.current || connecting.current) { console.log('[board] connect skipped: already connecting'); return; }
    connecting.current = true;
    try { await connectOnce(interactive); } finally { connecting.current = false; }
  }, [connectOnce]);

  useEffect(() => {
    void refreshLibrary();
    (window as unknown as { hiltwrightAutoConnect?: () => Promise<string> }).hiltwrightAutoConnect = async () => {
      if (client.current) return 'already connected';
      await connect(true);
      return 'attempted';
    };
    const onConnect = () => { if (!client.current) void connect(false); };
    navigator.serial?.addEventListener('connect', onConnect);
    return () => navigator.serial?.removeEventListener('connect', onConnect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Presets ----------

  const applyList = useCallback((r: ListResult) => {
    setInfo((i) => (i ? { ...i, presets: r.presets, currentPreset: r.current } : i));
  }, []);

  const replacePreset = useCallback((index: number, preset: PresetRecord) => {
    setInfo((i) => (i ? { ...i, presets: i.presets.map((p, k) => (k === index ? preset : p)) } : i));
  }, []);

  const snapshot = useCallback(async (label: string) => {
    const i = infoRef.current;
    const s = saberRef.current;
    if (!i || !s) return;
    try { await api().snapshots.save(s.id, label, i.presets); await refreshSnapshots(s.id); } catch (err) { console.log(`[snapshots] save failed: ${String(err)}`); }
  }, [refreshSnapshots]);

  /** Run a board operation with busy state, snapshot and save-state bookkeeping. */
  const run = useCallback(async (label: string, op: (c: BoardClient) => Promise<{ ok: boolean; error?: string; ms?: number }>, withSnapshot = true) => {
    if (!client.current || busyRef.current) return;
    setBusy(true);
    setSave({ kind: 'writing', what: label });
    const started = Date.now();
    try {
      if (withSnapshot) await snapshot(`Before: ${label}`);
      log('in', label);
      const r = await op(client.current);
      if (r.ok) {
        setSave({ kind: 'saved', what: label, ms: r.ms ?? Date.now() - started, at: Date.now() });
        log('out', `✓ ${label}`);
        console.log(`[board] ok: ${label} · ${r.ms ?? Date.now() - started} ms`);
      } else {
        setSave({ kind: 'failed', what: label, error: r.error ?? 'unknown' });
        log('out', `✗ ${label}: ${r.error}`);
        console.log(`[board] FAILED: ${label} · ${r.error}`);
      }
    } catch (err) {
      setSave({ kind: 'failed', what: label, error: String(err) });
      console.log(`[board] FAILED: ${label} · ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [log, snapshot]);

  const choosePreset = useCallback((index: number) => run(`Select preset ${index + 1}`, async (c) => {
    const r = await selectPreset(c, index);
    setInfo((i) => (i ? { ...i, currentPreset: r.index ?? index } : i));
    if (r.preset && r.index != null) replacePreset(r.index, r.preset);
    return { ok: r.preset !== null, error: r.preset ? undefined : 'No read-back after selecting.' };
  }, false), [run, replacePreset]);

  const editPreset = useCallback((patch: PresetPatch, label: string) => {
    const i = infoRef.current;
    if (!i || i.currentPreset == null || isEmptyPatch(patch)) return Promise.resolve();
    const index = i.currentPreset;
    return run(label, async (c) => {
      const r = await editCurrentPreset(c, patch);
      if (r.preset) replacePreset(index, r.preset);
      return r;
    });
  }, [run, replacePreset]);

  const movePreset = useCallback((to: number) => run(`Move to position ${to + 1}`, async (c) => { applyList(await moveCurrentPreset(c, to)); return { ok: true }; }), [run, applyList]);
  const duplicatePreset = useCallback(() => {
    const i = infoRef.current;
    const pos = (i?.currentPreset ?? 0) + 1;
    return run('Duplicate preset', async (c) => { applyList(await duplicateCurrentPreset(c, pos)); return { ok: true }; });
  }, [run, applyList]);
  const deletePreset = useCallback(() => run('Delete preset', async (c) => { applyList(await deleteCurrentPreset(c)); return { ok: true }; }), [run, applyList]);

  /** Put the current preset back the way a snapshot had it, with the fewest commands. */
  const restoreSnapshot = useCallback(async (meta: SnapshotMeta) => {
    const i = infoRef.current;
    const s = saberRef.current;
    if (!i || !s || i.currentPreset == null) return;
    const index = i.currentPreset;
    let saved: PresetRecord[];
    try { saved = await api().snapshots.read(s.id, meta.file); } catch (err) { setSave({ kind: 'failed', what: 'Restore', error: String(err) }); return; }
    const from = i.presets[index];
    const to = saved[index];
    if (!from || !to) { setSave({ kind: 'failed', what: 'Restore', error: 'That snapshot has no preset at this position.' }); return; }
    const patch = diffPreset(from, to);
    if (isEmptyPatch(patch)) { setSave({ kind: 'saved', what: 'Nothing to restore', ms: 0, at: Date.now() }); return; }
    await editPreset(patch, `Restore "${meta.label}"`);
  }, [editPreset]);

  /** Store the build model and/or firmware manifest on the current saber's record. */
  const updateSaber = useCallback(async (patch: SaberPatch) => {
    const s = saberRef.current;
    if (!s) return;
    const rec = await api().library.update(s.id, patch);
    setSaber(rec);
    await refreshLibrary();
  }, [refreshLibrary]);

  const renameSaber = useCallback(async (name: string) => {
    const s = saberRef.current;
    if (!s) return;
    const rec = await api().library.rename(s.id, name);
    setSaber(rec);
    await refreshLibrary();
  }, [refreshLibrary]);

  // Dev-only end-to-end check (HILTWRIGHT_E2E=1): edit a preset's font on the real board, verify, restore.
  useEffect(() => {
    (window as unknown as { hiltwrightE2E?: () => Promise<string> }).hiltwrightE2E = async () => {
      const c = client.current;
      const i = infoRef.current;
      if (!c || !i) return 'not connected';
      const steps: string[] = [];
      const original = i.currentPreset ?? 0;
      const sel = await selectPreset(c, 2);
      steps.push(`select 2 → index ${sel.index}, font ${sel.preset?.font}`);
      const before = sel.preset?.font ?? '';
      const e1 = await editCurrentPreset(c, { font: 'TeensySF;common' });
      steps.push(`set_font TeensySF;common → ok=${e1.ok} readbacks=${e1.readbacks} ms=${e1.ms} font=${e1.preset?.font}`);
      const e2 = await editCurrentPreset(c, { font: before });
      steps.push(`restore ${before} → ok=${e2.ok} readbacks=${e2.readbacks} ms=${e2.ms} font=${e2.preset?.font}`);
      // Live colour argument on blade 1: base colour red, then back to the compiled default.
      const style0 = sel.preset?.styles[0] ?? '';
      const b0 = parseBuiltin(style0);
      if (b0) {
        const red = formatBuiltin({ preset: b0.preset, blade: b0.blade, args: '65535,0,0' });
        const e3 = await editCurrentPreset(c, { styles: { 1: red } });
        steps.push(`set_style1 "${red}" → ok=${e3.ok} readback style1=${e3.preset?.styles[0]}`);
        const e4 = await editCurrentPreset(c, { styles: { 1: style0 } });
        steps.push(`restore style1 "${style0}" → ok=${e4.ok} readback style1=${e4.preset?.styles[0]}`);
      } else steps.push(`blade 1 style "${style0}" is not a builtin slot; colour test skipped`);
      const back = await selectPreset(c, original);
      steps.push(`select ${original} → index ${back.index}`);
      const all = await listPresets(c);
      steps.push(`list_presets → ${all.length} presets, preset 3 font ${all[2]?.font}`);
      setInfo((cur) => (cur ? { ...cur, presets: all, currentPreset: back.index ?? original } : cur));
      const lib = await api().library.list();
      const snaps = saberRef.current ? await api().snapshots.list(saberRef.current.id) : [];
      steps.push(`library ${lib.length} saber(s), ${snaps.length} snapshot(s) on disk`);
      return steps.join(' | ');
    };
  }, []);

  return { status, error, portName, info, saber, library, lines, snapshots, save, busy, connect, disconnect, send, identify, choosePreset, editPreset, movePreset, duplicatePreset, deletePreset, restoreSnapshot, renameSaber, updateSaber, refreshLibrary, isPresetBlockEnd, rebootToBootloader };
}

export type Board = ReturnType<typeof useBoard>;
