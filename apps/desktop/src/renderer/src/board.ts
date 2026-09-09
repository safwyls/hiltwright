// Board session for the renderer: connect, identify, read presets, edit them with verification, run raw commands.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardClient, diffPreset, editCurrentPreset, isEmptyPatch, isPresetBlockEnd, listPresets, parseBattery, parseInteger, parseList,
  parsePresetBlocks, parseVersion, presetCommands, selectPreset, wasRejected,
  type PresetPatch, type PresetRecord, type Response, type VersionInfo,
} from '@hiltwright/core';
import { PROFFIE_FILTER, WebSerialTransport, describePort, grantedProffiePorts } from './serial';

export interface BoardInfo {
  version: VersionInfo | null;
  battery: number | null;
  volume: number | null;
  currentPreset: number | null;
  presets: PresetRecord[];
  fonts: string[];
  tracks: string[];
  rejected: string[];
  timings: Record<string, number>;
}

export interface ConsoleLine { kind: 'in' | 'out' | 'event'; text: string; at: number }
export interface Snapshot { at: number; label: string; presets: PresetRecord[] }
export type Status = 'idle' | 'no-port' | 'connecting' | 'reading' | 'connected' | 'error';
export type SaveState = { kind: 'idle' } | { kind: 'writing'; what: string } | { kind: 'saved'; what: string; ms: number; at: number } | { kind: 'failed'; what: string; error: string };

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function useBoard() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [portName, setPortName] = useState<string | null>(null);
  const [info, setInfo] = useState<BoardInfo | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (v: boolean) => { busyRef.current = v; setBusyState(v); };
  const client = useRef<BoardClient | null>(null);
  const transport = useRef<WebSerialTransport | null>(null);
  const infoRef = useRef<BoardInfo | null>(null);
  infoRef.current = info;

  const log = useCallback((kind: ConsoleLine['kind'], text: string) => {
    setLines((ls) => [...ls, { kind, text, at: Date.now() }].slice(-400));
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

  const send = useCallback(async (command: string, opts?: Parameters<BoardClient['send']>[1]): Promise<Response> => {
    if (!client.current) throw new Error('Not connected');
    log('in', command);
    const r = await client.current.send(command, opts);
    for (const l of r.lines) log('out', l);
    return r;
  }, [log]);

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
    console.log(`[board] version lines ${JSON.stringify(v.lines)} events ${JSON.stringify(v.events)}`);
    const b = await time('battery', { until: (l) => /^Battery voltage:/.test(l) });
    const vol = await time('get_volume', { until: (l) => /^-?\d+$/.test(l.trim()) });
    const cur = await time(presetCommands.getCurrent(), { until: (l) => /^-?\d+$/.test(l.trim()) });
    const lp = await time(presetCommands.list(), { idleMs: 700, timeoutMs: 15000 });
    const fonts = await time('list_fonts', { idleMs: 700, timeoutMs: 15000 });
    const tracks = await time('list_tracks', { idleMs: 700, timeoutMs: 15000 });
    const next: BoardInfo = {
      version: parseVersion(v.lines),
      battery: parseBattery(b.lines),
      volume: parseInteger(vol.lines),
      currentPreset: parseInteger(cur.lines),
      presets: parsePresetBlocks(lp.lines).presets,
      fonts: parseList(fonts.lines),
      tracks: parseList(tracks.lines),
      rejected,
      timings,
    };
    setInfo(next);
    setStatus('connected');
    console.log(`[board] version=${next.version?.version ?? '?'} config=${next.version?.config ?? '?'} prop=${next.version?.prop ?? '?'} buttons=${next.version?.buttons ?? '?'} battery=${next.battery ?? '?'} volume=${next.volume ?? '?'} current=${next.currentPreset ?? '?'} presets=${next.presets.length} fonts=${next.fonts.length} tracks=${next.tracks.length} timings=${JSON.stringify(timings)}`);
    return next;
  }, [send]);

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

  /** Try already-granted ports first (no prompt); fall back to asking, which needs a user gesture. */
  const connect = useCallback(async (interactive = false) => {
    if (!('serial' in navigator)) { setStatus('error'); setError('Web Serial is not available in this window.'); return; }
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

  useEffect(() => {
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

  // ---------- Presets: select, edit with verification, snapshots ----------

  const replacePreset = useCallback((index: number, preset: PresetRecord) => {
    setInfo((i) => (i ? { ...i, presets: i.presets.map((p, k) => (k === index ? preset : p)) } : i));
  }, []);

  /** Make a preset current on the saber. The saber switches to it audibly, like pressing the button would. */
  const choosePreset = useCallback(async (index: number) => {
    if (!client.current || busyRef.current) return;
    setBusy(true);
    try {
      log('in', presetCommands.select(index));
      const r = await selectPreset(client.current, index);
      log('out', r.preset ? `→ preset ${r.index ?? '?'}: ${r.preset.name}` : '→ no read-back');
      setInfo((i) => (i ? { ...i, currentPreset: r.index ?? index } : i));
      if (r.preset && r.index != null) replacePreset(r.index, r.preset);
      console.log(`[board] selected preset ${r.index} (${r.preset?.name ?? '?'})`);
    } finally {
      setBusy(false);
    }
  }, [log, replacePreset]);

  /** Apply a patch to the current preset: snapshot first, write, wait for the saber to confirm. */
  const editPreset = useCallback(async (patch: PresetPatch, label: string) => {
    const i = infoRef.current;
    if (!client.current || !i || i.currentPreset == null || isEmptyPatch(patch) || busyRef.current) return;
    const index = i.currentPreset;
    setBusy(true);
    setSave({ kind: 'writing', what: label });
    setSnapshots((s) => [{ at: Date.now(), label: `Before: ${label}`, presets: i.presets }, ...s].slice(0, 20));
    log('in', `${label} → ${JSON.stringify(patch)}`);
    try {
      const r = await editCurrentPreset(client.current, patch);
      if (r.preset) replacePreset(index, r.preset);
      if (r.ok) {
        setSave({ kind: 'saved', what: label, ms: r.ms, at: Date.now() });
        log('out', `✓ ${label} confirmed after ${r.readbacks} read-back${r.readbacks === 1 ? '' : 's'} in ${r.ms} ms`);
        console.log(`[board] edit ok: ${label} · ${r.readbacks} readbacks · ${r.ms} ms · font=${r.preset?.font} track=${r.preset?.track} name=${JSON.stringify(r.preset?.name)}`);
      } else {
        setSave({ kind: 'failed', what: label, error: r.error ?? 'unknown' });
        log('out', `✗ ${label}: ${r.error}`);
        console.log(`[board] edit FAILED: ${label} · ${r.error}`);
      }
    } finally {
      setBusy(false);
    }
  }, [log, replacePreset]);

  /** Put the current preset back the way a snapshot had it, with the fewest commands. */
  const restoreSnapshot = useCallback(async (snap: Snapshot) => {
    const i = infoRef.current;
    if (!i || i.currentPreset == null) return;
    const index = i.currentPreset;
    const from = i.presets[index];
    const to = snap.presets[index];
    if (!from || !to) return;
    const patch = diffPreset(from, to);
    if (isEmptyPatch(patch)) { setSave({ kind: 'saved', what: 'Nothing to restore', ms: 0, at: Date.now() }); return; }
    await editPreset(patch, `Restore ${now()}`);
  }, [editPreset]);

  // Dev-only end-to-end check, triggered by main when HILTWRIGHT_E2E is set: edit a preset's font on the real
  // board, verify, restore. Mirrors the transcript session recorded with PowerShell, now through Electron.
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
      const back = await selectPreset(c, original);
      steps.push(`select ${original} → index ${back.index}`);
      const all = await listPresets(c);
      steps.push(`list_presets → ${all.length} presets, preset 3 font ${all[2]?.font}`);
      setInfo((cur) => (cur ? { ...cur, presets: all, currentPreset: back.index ?? original } : cur));
      return steps.join(' | ');
    };
  }, []);

  return { status, error, portName, info, lines, snapshots, save, busy, connect, disconnect, send, identify, choosePreset, editPreset, restoreSnapshot, isPresetBlockEnd };
}

export type Board = ReturnType<typeof useBoard>;
