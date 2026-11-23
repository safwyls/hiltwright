// Board session for the renderer: connect, identify, remember the saber, read and edit presets with verification.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardClient, currentPresetIndex, deleteCurrentPreset, duplicateCurrentPreset, editCurrentPreset, formatBuiltin, isEmptyPatch, isPresetBlockEnd, listPresets, parseBuiltin, patchShown,
  moveCurrentPreset, parseInteger, parseList, parsePresetBlocks, parseScanId, parseVersion, planRestore, presetCommands, runRestore, sameList, selectPreset, wasRejected,
  type ListChange, type ListResult, type PresetPatch, type PresetRecord, type Response, type RestorePlan, type VersionInfo,
  type SaberConfigModel,
} from '@hiltwright/core';
import type { SaberIdentity, SaberPatch, SaberRecord, SnapshotMeta } from '../../shared/api';
import { openFailureText } from '../../shared/openFailure';
import { PROFFIE_FILTER, WebSerialTransport, describePort, grantedProffiePorts } from './serial';
import { setConnectionSnapshot } from './support';
import { workNow } from './work';
import { assertMaySend, holdConnect, operationRefusal, tourLocked } from './tourLock';
import { INCOMPLETE_SNAPSHOT, connectGate, createRecovery, deleteShown, duplicateShown, moveShown, parseSdAccess, readBattery, runOperation, sdFailureIn, sendOptionsFor, serialQueue, storedLayout, withNewSnapshot, type SaveState } from './boardOps';

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
  /** The saber said it cannot read its SD card, while being read or since (preset-editor-fixes D6). */
  sdMissing: boolean;
}

export interface ConsoleLine { kind: 'in' | 'out' | 'event'; text: string; at: number }
export type Status = 'idle' | 'no-port' | 'connecting' | 'reading' | 'connected' | 'error';
export type { SaveState } from './boardOps';

/** A saber that answered nothing at all while it was being read (connection-robustness). */
class NotAnswering extends Error {}
const NOT_ANSWERING = 'The saber is not answering. Unplug it and plug it back in.';
const STOPPED_ANSWERING = 'The saber stopped answering. Unplug it and plug it back in.';

const api = () => window.hiltwright;

export function useBoard() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [portName, setPortName] = useState<string | null>(null);
  // The boards plugged in now, by USB serial, with each one's COM port (Windows). Read on start, and again when a board
  // comes or goes and after each connect: the Armory offers each plugged-in saber to connect to, and names its port.
  const [plugged, setPlugged] = useState<{ serial: string; port: string | null }[]>([]);
  const refreshPlugged = useCallback(async () => {
    try { setPlugged(await api().usb.proffieBoards()); } catch { /* not available on this platform */ }
  }, []);
  const [info, setInfo] = useState<BoardInfo | null>(null);
  const [saber, setSaber] = useState<SaberRecord | null>(null);
  const [library, setLibrary] = useState<SaberRecord[]>([]);
  // Whether the saber list has been read once: until then an empty list means "not read yet", not "no sabers".
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (v: boolean) => { busyRef.current = v; setBusyState(v); };
  const client = useRef<BoardClient | null>(null);
  const transport = useRef<WebSerialTransport | null>(null);
  // One connection attempt at a time (boardOps.ts): a second one while connecting, or while a port is open, is skipped.
  const [gate] = useState(() => connectGate(() => !!transport.current));
  const infoRef = useRef<BoardInfo | null>(null);
  // Everything that talks to the board takes its turn here: preset edits, the console, page checks and polls.
  // Writes are serialised, never dropped: a click that lands while the board is busy waits its turn.
  const [enqueue] = useState(serialQueue);
  // While the saber is first read, silence ends the reading (NotAnswering) instead of letting the saber go.
  const identifying = useRef(false);
  // Set by any line the saber sends saying it cannot read its card; a new reading starts it again (design D6).
  const sdSeen = useRef(false);
  const silentWhileIdentifying = useRef(false);
  // The saber just installed and the config its new firmware reports: an identify matches it even without a USB serial
  // (two boards plugged in). Forgotten once it has matched, or after 5 minutes.
  const expected = useRef<{ id: string; configName: string; until: number } | null>(null);
  const saberRef = useRef<SaberRecord | null>(null);
  // The one board to reach next, by USB serial: the saber an install or restore is bringing back. Main lets only that
  // board through meanwhile, so the port opened is it, and the saber read is known by that serial.
  const wanted = useRef<string | null>(null);
  // A stalled link gets one reopen of its port (usb-power-connect D3). `pauses` counts them for this connection.
  const [pauses, setPauses] = useState(0);
  const silentInRecovery = useRef(false);
  const reopenRef = useRef<() => Promise<void>>(async () => { throw new Error('not connected'); });
  const rereadRef = useRef<() => Promise<boolean>>(async () => false);
  const [recovery] = useState(() => createRecovery({ reopen: () => reopenRef.current(), reread: () => rereadRef.current(), log: (l) => console.log(`[board] ${l}`) }));
  // The saber's card shared with this computer (card-safety D1): known on every page, from the app's own share and
  // from asking the saber when it connects. While it is shared nothing that uses the card is sent (D2).
  const [card, setCard] = useState<{ shared: boolean; root: string | null }>({ shared: false, root: null });
  const cardRef = useRef(card);
  const setCardNow = (c: { shared: boolean; root: string | null }) => { cardRef.current = c; setCard(c); };
  // The connection went while the card was shared: the saber may still be holding it until it is reconnected (D4).
  const [cardLostWhileShared, setCardLostWhileShared] = useState(false);
  infoRef.current = info;
  saberRef.current = saber;

  const log = useCallback((kind: ConsoleLine['kind'], text: string) => {
    setLines((ls) => [...ls, { kind, text, at: Date.now() }].slice(-400));
  }, []);

  // Every connection state and its error go into the run log, and into what a diagnostics file reports.
  useEffect(() => {
    console.log(`[board] status ${status}${error ? `: ${error}` : ''}`);
  }, [status, error]);
  useEffect(() => {
    const v = info?.version ?? null;
    setConnectionSnapshot({
      status, error, port: portName,
      board: info ? {
        version: v?.version ?? null, config: v?.config ?? null, prop: v?.prop ?? null, buttons: v?.buttons ?? null,
        battery: info.battery, volume: info.volume, presets: info.presets.length, fonts: info.fonts.length, tracks: info.tracks.length, blades: info.pixelBlades,
      } : null,
      pauses,
    });
  }, [status, error, portName, info, pauses]);

  // The connected saber's own record is refreshed too: main may have changed it (a saved style reaching its plan), and
  // every page works from `saber` while it is plugged in.
  const refreshLibrary = useCallback(async () => {
    try {
      const list = await api().library.list();
      setLibrary(list);
      const fresh = saberRef.current && list.find((s) => s.id === saberRef.current!.id);
      if (fresh) { saberRef.current = fresh; setSaber(fresh); }
    } catch (err) { console.log(`[library] list failed: ${String(err)}`); } finally { setLibraryLoaded(true); }
  }, []);

  // Only the newest list asked for is shown: one asked for before a snapshot was added would hide it.
  const listTurn = useRef(0);
  const refreshSnapshots = useCallback(async (saberId: string) => {
    const turn = ++listTurn.current;
    try {
      const list = await api().snapshots.list(saberId);
      if (turn === listTurn.current) setSnapshots(list);
    } catch (err) { console.log(`[snapshots] list failed: ${String(err)}`); }
  }, []);
  /**
   * A snapshot just saved goes to the top of History at once, and the list is read again in the background (it may have
   * dropped old routine ones). Nothing waits for that read: every live edit used to, before its command was sent (issue #23).
   */
  const showSnapshot = useCallback((saberId: string, meta: SnapshotMeta) => {
    if (saberRef.current?.id !== saberId) return;
    listTurn.current++;
    setSnapshots((list) => withNewSnapshot(list, meta));
    void refreshSnapshots(saberId);
  }, [refreshSnapshots]);
  /** A snapshot saved outside this hook (the card trip, a flash): the History list shows it while that saber is the one plugged in. */
  const snapshotSaved = useCallback(async (saberId: string) => {
    if (saberRef.current?.id === saberId) await refreshSnapshots(saberId);
  }, [refreshSnapshots]);

  const disconnect = useCallback(async (reason?: string) => {
    const c = cardRef.current;
    if (c.shared) {
      console.log(`[board] the connection went while the card was shared${c.root ? `; ejecting ${c.root}` : ''}`);
      if (c.root) void api().sd.eject(c.root).then((r) => console.log(`[sd] eject ${c.root}: ${r.ok ? 'done' : r.detail}`), () => undefined);
      setCardLostWhileShared(true);
      setCardNow({ shared: false, root: null });
    }
    client.current?.close();
    client.current = null;
    // Let go of the transport before waiting on it, so anything still running sees at once that it is gone.
    const t = transport.current;
    transport.current = null;
    await t?.close();
    setStatus(reason ? 'error' : 'idle');
    // A plain disconnect or unplug leaves no stale reason behind.
    setError(reason ?? null);
    setInfo(null);
    setPortName(null);
  }, []);

  /** The port went away (unplugged, or the read ended): back to "Not connected", not an error. */
  const lost = useCallback((reason: string) => {
    console.log(`[board] port lost: ${reason}`);
    void disconnect();
  }, [disconnect]);

  /**
   * Put the board into its DFU bootloader and let go of the port so dfu-util can have the device.
   * Tries the firmware's own RebootDFU command first, then the Arduino 1200-baud touch. Either way the port
   * is closed afterwards; the caller reconnects when the new firmware is up.
   */
  const rebootToBootloader = useCallback(async (): Promise<boolean> => {
    const t = transport.current;
    // Never during the guided tour: nothing reaches a real saber while it runs (tourLock.ts).
    if (!t || tourLocked()) return false;
    const port = t.port;
    try { log('in', 'RebootDFU'); await client.current?.send('RebootDFU', { idleMs: 400, expectSilence: true }); } catch { /* the port may vanish mid-reply; that is success */ }
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

  /**
   * Restart the saber's firmware (ProffieOS `reset`) and let go of the port: it comes back reading its presets files
   * afresh, as after an install. False when there is no saber to send it to. The caller waits and reconnects.
   */
  const restartSaber = useCallback(async (): Promise<boolean> => {
    const t = transport.current;
    if (!t || tourLocked()) return false;
    try { log('in', 'reset'); await client.current?.send('reset', { idleMs: 400, expectSilence: true }); } catch { /* the port vanishes as it restarts; that is success */ }
    client.current?.close();
    client.current = null;
    transport.current = null;
    await t.close();
    setStatus('idle');
    setPortName(null);
    return true;
  }, [log]);
  /** The presets the saber reported at its last reading (read after a connect, before React has re-rendered). */
  const currentPresets = useCallback(() => infoRef.current?.presets ?? null, []);

  /** Send now, outside the queue: only while the saber is first read, before anything else can be queued. */
  const sendNow = useCallback(async (command: string, opts?: Parameters<BoardClient['send']>[1]): Promise<Response> => {
    if (!client.current) throw new Error('Not connected');
    assertMaySend(command);
    log('in', command);
    const stalls = recovery.count;
    // `sd 1` and `sd 0` are allowed a long quiet while the saber lets go of its card or takes it back; nothing else is.
    const r = await client.current.send(command, sendOptionsFor(command, opts, client.current.isTagged));
    for (const l of r.lines) log('out', l);
    // A stall in this turn: the next command in the queue waits for the reopen, and goes to the new client (D3).
    if (r.silent || recovery.count !== stalls) await recovery.since(stalls);
    return r;
  }, [log]);
  /** Send a command in its turn, after any edit already under way (the console, Try it, page checks). */
  const send = useCallback((command: string, opts?: Parameters<BoardClient['send']>[1]): Promise<Response> => enqueue(() => sendNow(command, opts)), [enqueue, sendNow]);

  /** Read everything the board can tell us, then match or create the saber in the library. */
  const identify = useCallback(async () => {
    setStatus('reading');
    sdSeen.current = false;
    const timings: Record<string, number> = {};
    const rejected: string[] = [];
    const time = async (cmd: string, opts?: Parameters<BoardClient['send']>[1], track = true) => {
      const r = await sendNow(cmd, opts);
      if (silentWhileIdentifying.current) throw new NotAnswering(`no answer to ${cmd}`);
      timings[cmd] = r.ms;
      if (track && wasRejected(r.lines)) rejected.push(cmd);
      return r;
    };
    // OS 8 boards frame answers per command (`tag| command`); once detected every later command uses it.
    const t0 = Date.now();
    const tagged = await client.current!.detectTagging();
    timings.tagging = Date.now() - t0;
    if (silentWhileIdentifying.current) throw new NotAnswering('no answer to the tag probe');
    log('event', tagged ? 'Tagged responses: yes (OS 8 framing)' : 'Tagged responses: no (untagged, idle-terminated)');
    console.log(`[board] tagged=${tagged} probe=${timings.tagging} ms`);
    const v = await time('version', { until: (l) => /^installed:/.test(l) });
    // Quietly: `battery` would have the saber say its voltage aloud on every connect (usb-power-connect D1).
    const battery = await readBattery((cmd, opts) => time(cmd, opts, false));
    rejected.push(...battery.rejected);
    const vol = await time('get_volume', { until: (l) => /^-?\d+$/.test(l.trim()) });
    const cur = await time(presetCommands.getCurrent(), { until: (l) => /^-?\d+$/.test(l.trim()) });
    const lp = await time(presetCommands.list(), { idleMs: 700, timeoutMs: 15000 });
    const fonts = await time('list_fonts', { idleMs: 700, timeoutMs: 15000 });
    const tracks = await time('list_tracks', { idleMs: 700, timeoutMs: 15000 });
    // Is the card already shared (from the saber's own menu, or left so by an earlier session)? Firmware without
    // MOUNT_SD_SETTING answers Whut?, which is not a missing command here: it has no card to share (D1).
    const access = parseSdAccess((await time('sd', { idleMs: 500 }, false)).lines);
    const version = parseVersion(v.lines);
    // Which board this is, before the blade step: its stored layout is reused when the build is one already read.
    let usbSerial: string | null = null;
    try { const serials = await api().usb.proffieSerials(); usbSerial = wanted.current && serials.includes(wanted.current) ? wanted.current : serials.length === 1 ? serials[0] : null; } catch { /* not available on this platform */ }
    let records: SaberRecord[] = [];
    try { records = await api().library.list(); } catch { /* read afresh below */ }
    // `scanid` makes the saber detect its blades and rescan its font, so only a build not read before is asked (D2).
    let scanInfo = storedLayout(records, usbSerial, version);
    if (scanInfo) console.log(`[board] blade layout ${JSON.stringify(scanInfo.pixelBlades)}: stored for this build`);
    else {
      const scan = await time('scanid', { idleMs: 1200, timeoutMs: 15000 });
      scanInfo = parseScanId([...scan.lines, ...scan.events]);
    }
    const next: BoardInfo = {
      version,
      battery: battery.volts,
      volume: parseInteger(vol.lines),
      currentPreset: parseInteger(cur.lines),
      presets: parsePresetBlocks(lp.lines).presets,
      fonts: parseList(fonts.lines),
      tracks: parseList(tracks.lines),
      pixelBlades: scanInfo.pixelBlades,
      bladeConfig: scanInfo.bladeConfig,
      rejected,
      timings,
      sdMissing: sdSeen.current,
    };
    infoRef.current = next; setInfo(next);
    setCardLostWhileShared(false);
    setCardNow({ shared: access === true, root: null });
    if (access === true) console.log('[board] the saber says its card is shared with this computer');
    setStatus('connected');
    void refreshPlugged();
    // A new connection starts with a clean save status: a failure from before an unplug no longer describes this saber.
    setSave({ kind: 'idle' });
    console.log(`[board] version=${next.version?.version ?? '?'} config=${next.version?.config ?? '?'} prop=${next.version?.prop ?? '?'} buttons=${next.version?.buttons ?? '?'} battery=${next.battery ?? '?'} volume=${next.volume ?? '?'} current=${next.currentPreset ?? '?'} presets=${next.presets.length} fonts=${next.fonts.length} tracks=${next.tracks.length} blades=${JSON.stringify(next.pixelBlades)} timings=${JSON.stringify(timings)}`);

    // Remember the saber.
    const identity: SaberIdentity = {
      usbSerial, configName: next.version?.config ?? null, version: next.version?.version ?? null, prop: next.version?.prop ?? null,
      buttons: next.version?.buttons ?? null, installed: next.version?.installed ?? null, pixelBlades: next.pixelBlades, bladeConfig: next.bladeConfig,
    };
    try {
      if (expected.current && expected.current.until <= Date.now()) expected.current = null;
      const ex = expected.current ? { id: expected.current.id, configName: expected.current.configName } : null;
      // With its card out the saber reports its firmware's own presets: the record keeps its card's (issue #7).
      const rec = await api().library.upsert({ identity, presets: next.presets, fonts: next.fonts, tracks: next.tracks, ...(next.sdMissing ? { cardMissing: true } : {}), expect: ex });
      // Kept until the saber installed comes back: with two boards plugged in, the other one may reconnect first.
      if (ex && rec.id === ex.id) expected.current = null;
      if (ex) console.log(`[library] expected ${ex.id} (${ex.configName}) after the install; matched ${rec.id}${rec.id === ex.id ? '' : ' instead, still expecting it'}`);
      saberRef.current = rec; setSaber(rec);
      console.log(`[library] saber ${rec.id} "${rec.name}" serial=${rec.identity.usbSerial ?? 'none'} firstSeen=${rec.firstSeen}`);
      // A card found shared: its drive is the one that belongs to this saber's USB connection (D3).
      if (access === true && usbSerial) {
        void api().sd.locate().then((cards) => {
          const mine = cards.find((x) => x.saberSerial === usbSerial);
          if (mine && cardRef.current.shared) { setCardNow({ shared: true, root: mine.root }); console.log(`[board] the shared card is ${mine.root}`); }
        }, () => undefined);
      }
      // The saber wanted has been reached and read: every board may be reached again.
      if (wanted.current) { wanted.current = null; void api().usb.wantSerial(null); }
      // A saber that cannot read its card lists the presets built into its firmware, not its own: no snapshot of those
      // (issue #23). Main skips one that matches the newest snapshot.
      if (!next.sdMissing) await api().snapshots.save(rec.id, 'Connected', next.presets);
      await refreshSnapshots(rec.id);
      await refreshLibrary();
    } catch (err) {
      console.log(`[library] upsert failed: ${String(err)}`);
    }
    return next;
  }, [sendNow, refreshLibrary, refreshSnapshots]);

  const connectTo = useCallback(async (port: SerialPort) => {
    setError(null);
    setStatus('connecting');
    const t = new WebSerialTransport(port, lost);
    try {
      await t.open();
    } catch (err) {
      console.log(`[board] open failed: ${String(err)}`);
      setStatus('error');
      // A serial port opens for one program at a time, and "failed to open" is nearly always that. Where the system
      // can say which program has it, name it.
      const holders = await api().usb.portHolders().catch(() => [] as string[]);
      console.log(`[board] other programs with a USB serial port open: ${holders.join(', ') || 'none found'}`);
      setError(openFailureText(String(err), holders));
      return;
    }
    transport.current = t;
    client.current = makeClient(t);
    setPauses(0);
    setPortName(describePort(port));
    console.log('[board] port opened', describePort(port));
    identifying.current = true;
    silentWhileIdentifying.current = false;
    try {
      await identify();
    } catch (err) {
      console.log(`[board] reading stopped: ${String(err)}`);
      // Unplugged while being read: the port is already gone and the state already says "Not connected".
      if (transport.current !== t) return;
      await disconnect(err instanceof NotAnswering ? NOT_ANSWERING : `Board did not answer: ${String(err)}`);
    } finally {
      identifying.current = false;
    }
  }, [disconnect, identify, log, lost]);

  /** A client on this transport. After a reopen it carries on the old client's tag and kick numbers (D4). */
  function makeClient(t: WebSerialTransport, carry?: { firstSeq: number; firstKick: number }): BoardClient {
    // The run log gets the whole conversation, including the probe, polls and helper commands the console leaves out.
    return new BoardClient(t, {
      ...carry,
      onEvent: (l) => log('event', l),
      onTraffic: (d, text) => {
        console.log(`[board] ${d === 'sent' ? '>' : '<'} ${text}`);
        // A card pulled while connected: the page goes read-only as soon as the saber says so.
        if (d === 'heard' && sdFailureIn([text]) && !sdSeen.current) {
          sdSeen.current = true;
          console.log('[board] the saber cannot read its SD card');
          if (infoRef.current && !identifying.current) { infoRef.current = { ...infoRef.current, sdMissing: true }; setInfo((i) => (i ? { ...i, sdMissing: true } : i)); }
        }
      },
      // Nothing at all back, nudges included: while being read the reading stops. Once connected, the port is opened
      // again once and the saber read again; only if that fails is it let go (usb-power-connect D3).
      onSilent: (r) => {
        console.log(`[board] silent: ${r.command} (${r.ms} ms, nothing heard)`);
        if (identifying.current) { silentWhileIdentifying.current = true; return; }
        if (recovery.active) { silentInRecovery.current = true; return; }
        setPauses((n) => n + 1);
        void recovery.start(r.command).then((outcome) => {
          if (outcome === 'lost') void disconnect(STOPPED_ANSWERING);
        });
      },
    });
  }

  // The reopen: the old client and transport go at once, so the stalled operation's next commands end straight away
  // instead of reaching the board. Then the same port is opened again, as the Connect button does.
  reopenRef.current = async () => {
    const old = client.current;
    const t = transport.current;
    if (!old || !t) throw new Error('not connected');
    const carry = { firstSeq: old.lastSeq + 1, firstKick: old.lastKick + 1 };
    old.close();
    client.current = null;
    transport.current = null;
    await t.close();
    await new Promise((r) => setTimeout(r, 300));
    const next = new WebSerialTransport(t.port, lost);
    await next.open();
    transport.current = next;
    client.current = makeClient(next, carry);
  };
  // The reading again: the tag probe, the current preset and the list, which is what the stalled change is judged by.
  rereadRef.current = async () => {
    const c = client.current;
    if (!c) return false;
    silentInRecovery.current = false;
    const tagged = await c.detectTagging();
    if (silentInRecovery.current || !tagged) return false;
    const current = await currentPresetIndex(c);
    const presets = await listPresets(c);
    if (silentInRecovery.current || !presets.length) return false;
    applyList({ presets, current });
    void rememberPresets();
    return true;
  };

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

  /**
   * Reach only the board with this USB serial next (null: any board again). Returns whether main found that board.
   * `hold`: keep waiting for it even when it is not there yet (it is still in its bootloader). Without it, a board that
   * cannot be found is given up on: reaching any board beats reaching none, and the page then says which one it was.
   */
  const reachNext = useCallback(async (serial: string | null, hold = true): Promise<boolean> => {
    wanted.current = serial;
    const found = (await api().usb.wantSerial(serial)) > 0;
    if (serial && !found && !hold) { wanted.current = null; await api().usb.wantSerial(null); }
    return found;
  }, []);

  /** Connect. `serial`: the saber an install is bringing back; only that board is opened, when main can tell which it is. */
  const connect = useCallback(async (interactive = false, opts: { serial?: string | null } = {}) => {
    // During the guided tour no port is opened; a saber plugged in meanwhile is connected when it ends (App.tsx).
    if (holdConnect()) return;
    if (!('serial' in navigator)) { setStatus('error'); setError('Web Serial is not available in this window.'); return; }
    if (!(await api().app.boardAccess())) { setStatus('error'); setError('Board access is off for this run (HILTWRIGHT_NO_BOARD).'); return; }
    // The owner's own Connect reaches whichever board is there.
    if (interactive && wanted.current) await reachNext(null);
    if (opts.serial) {
      // Already reached (the Web Serial connect event came first, through main's filter): nothing more to open.
      if (client.current) { if (wanted.current) await reachNext(null); return; }
      await reachNext(opts.serial, false);
    }
    // After a reflash both the install flow and the Web Serial 'connect' event try to open the port; one is enough.
    if (!(await gate(() => connectOnce(interactive)))) console.log('[board] connect skipped: already connecting');
  }, [connectOnce, gate, reachNext]);
  /**
   * Connect to this plugged-in saber instead of the one connected now: the owner picked it in the Armory. Only that
   * board is opened (main grants its port alone, as after an install). Refused while a job or a change is running, so a
   * switch never cuts an install, a copy or a write short. Returns why it did not switch, or null.
   */
  const switching = useRef(false);
  // The saber a switch is reaching, from the moment it is picked: finding its port takes Windows a second or two, and
  // the Armory shows it is under way at once rather than look as if nothing happened.
  const [switchingTo, setSwitchingTo] = useState<{ serial: string; name: string } | null>(null);
  const switchTo = useCallback(async (serial: string, name = 'that saber'): Promise<string | null> => {
    if (holdConnect()) return 'Not while the tour is running.';
    if (busyRef.current || workNow().length) return 'Wait for the current job to finish, then pick the saber again.';
    if (client.current && saberRef.current?.identity.usbSerial === serial) return null;
    // One switch at a time: picks made while one runs (a second click while Windows is slow to answer) are ignored.
    // Overlapping switches each asked main again, and a lookup that came back empty let any board be reached.
    if (switching.current) return null;
    switching.current = true;
    setSwitchingTo({ serial, name });
    try {
      // By name: the serial is masked in the log to its last four characters, which two boards can share.
      console.log(`[board] switching to ${name}`);
      await disconnect();
      if (!(await reachNext(serial, true))) {
        await reachNext(null);
        void refreshPlugged();
        return 'That saber was not found on USB. Check it is plugged in, then pick it again.';
      }
      // Main now grants only that board's port. If more than one is still offered, the boards could not be told apart,
      // and opening either might reach the other saber: stop rather than guess.
      const offered = (await grantedProffiePorts()).length;
      if (offered !== 1) {
        console.log(`[board] switch to ${name} stopped: ${offered} ports offered instead of 1`);
        await reachNext(null);
        return offered === 0 ? `${name}'s port did not open to Hiltwright. Pick it again.` : `Hiltwright could not tell the plugged-in sabers apart. Unplug the other saber, or pick ${name} again.`;
      }
      // Opened here, not through connect(), which would ask main for the board again and could undo the choice.
      if (!(await gate(() => connectOnce(false)))) return 'Already connecting. Pick the saber again in a moment.';
      return null;
    } finally {
      switching.current = false;
      setSwitchingTo(null);
    }
  }, [connectOnce, disconnect, gate, reachNext, refreshPlugged]);
  /** The saber on the other end right now (read after a connect, before React has re-rendered). */
  const currentSaber = useCallback(() => saberRef.current, []);

  useEffect(() => {
    void refreshLibrary();
    (window as unknown as { hiltwrightAutoConnect?: () => Promise<string> }).hiltwrightAutoConnect = async () => {
      if (client.current) return 'already connected';
      await connect(true);
      return 'attempted';
    };
    // Windows lists a board's port a moment after Web Serial says it came or went: read the list once it has settled.
    const replug = () => { setTimeout(() => void refreshPlugged(), 1200); };
    void refreshPlugged();
    const onConnect = () => { replug(); if (!client.current) void connect(false); };
    // The system says a port went away: if it is ours, the saber was unplugged.
    const onDisconnect = (e: Event) => { replug(); const t = transport.current; if (t && e.target === t.port) t.lost('the saber was unplugged'); };
    navigator.serial?.addEventListener('connect', onConnect);
    navigator.serial?.addEventListener('disconnect', onDisconnect);
    // Development aid: hiltwrightMuteBoard() makes the app hear nothing from the saber, to check the silent-saber handling.
    if (import.meta.env.DEV) (window as unknown as { hiltwrightMuteBoard?: (on?: boolean) => string }).hiltwrightMuteBoard = (on = true) => { WebSerialTransport.muted = on; console.log(`[board] muted: ${on}`); return on ? 'muted' : 'unmuted'; };
    // Development aid: hiltwrightStallBoard() makes the app hear nothing until the port is next opened, as a stalled
    // link behaves, to check the reopen (usb-power-connect 3.3).
    if (import.meta.env.DEV) (window as unknown as { hiltwrightStallBoard?: () => string }).hiltwrightStallBoard = () => { WebSerialTransport.stalled = true; console.log('[board] stalled until the next open'); return 'stalled'; };
    return () => { navigator.serial?.removeEventListener('connect', onConnect); navigator.serial?.removeEventListener('disconnect', onDisconnect); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Presets ----------

  // The ref is updated in the same breath as the state: queued writes that follow each other (duplicate, then edit)
  // read it between renders, and editPreset must act on the preset the board has just made current.
  const applyList = useCallback((r: ListResult) => {
    if (infoRef.current) infoRef.current = { ...infoRef.current, presets: r.presets, currentPreset: r.current };
    setInfo((i) => (i ? { ...i, presets: r.presets, currentPreset: r.current } : i));
  }, []);

  const replacePreset = useCallback((index: number, preset: PresetRecord) => {
    if (infoRef.current) infoRef.current = { ...infoRef.current, presets: infoRef.current.presets.map((p, k) => (k === index ? preset : p)) };
    setInfo((i) => (i ? { ...i, presets: i.presets.map((p, k) => (k === index ? preset : p)) } : i));
  }, []);

  const snapshot = useCallback(async (label: string) => {
    const i = infoRef.current;
    const s = saberRef.current;
    if (!i || !s) return;
    try { showSnapshot(s.id, await api().snapshots.save(s.id, label, i.presets)); } catch (err) { console.log(`[snapshots] save failed: ${String(err)}`); }
  }, [showSnapshot]);

  /**
   * The saber's presets as just confirmed become its presets as last read, so a rename or font change made live is
   * what the saber shows once unplugged (preset-editor-fixes D5, F38).
   */
  const rememberPresets = useCallback(async () => {
    const i = infoRef.current;
    const s = saberRef.current;
    if (!i || !s) return;
    try {
      const rec = await api().library.update(s.id, { presets: i.presets });
      if (saberRef.current?.id === rec.id) { saberRef.current = rec; setSaber(rec); }
      await refreshLibrary();
    } catch (err) { console.log(`[library] presets not remembered: ${String(err)}`); }
  }, [refreshLibrary]);

  /**
   * Run a board operation in its turn, with busy state, snapshot and save-state bookkeeping (boardOps.ts). Resolves to
   * whether the saber confirmed it; with `remember`, a confirmed operation's presets are stored on the saber's record.
   */
  const run = useCallback((label: string, op: (c: BoardClient) => Promise<{ ok: boolean; error?: string; ms?: number; note?: string }>, withSnapshot = true, remember = false, confirm?: () => boolean): Promise<boolean> => {
    // `confirm`: whether the saber, read again after a stall, shows this change (usb-power-connect D5).
    // The guided tour, or the saber's card shared with this computer: nothing is sent (tourLock.ts).
    const refuse = () => operationRefusal(cardRef.current.shared, saberRef.current?.name ?? null);
    return enqueue(() => runOperation({ client: () => client.current, setBusy, setSave, log, snapshot, recovery, refuse }, label, op, withSnapshot, confirm)).then((ok) => {
      if (ok && remember) void rememberPresets();
      return ok;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choosePreset = useCallback((index: number) => run(`Select preset ${index + 1}`, async (c) => {
    const r = await selectPreset(c, index);
    if (infoRef.current) infoRef.current = { ...infoRef.current, currentPreset: r.index ?? index };
    setInfo((i) => (i ? { ...i, currentPreset: r.index ?? index } : i));
    if (r.preset && r.index != null) replacePreset(r.index, r.preset);
    return { ok: r.preset !== null, error: r.preset ? undefined : 'No read-back after selecting.' };
  }, false, false, () => infoRef.current?.currentPreset === index), [run, replacePreset]);

  // A style write made while the blade was on is applied (preset re-selected) once the blade is off, so the owner
  // never has to switch presets to see a colour. Polled every 3 s while something is pending.
  const [pendingApply, setPendingApply] = useState<number | null>(null);
  useEffect(() => {
    if (pendingApply == null || status !== 'connected') return;
    const t = setInterval(() => {
      if (!client.current || busyRef.current || tourLocked()) return;
      // A port that drops between polls makes this send reject (#34): the colours stay pending for the next poll or
      // the reconnect, and the failure is logged rather than left as an unhandled rejection.
      void send('get_on', { idleMs: 400, timeoutMs: 6000 }).then((r) => {
        if (!r.lines.some((l) => l.trim() === '0')) return;
        const index = pendingApply;
        setPendingApply(null);
        void run('Apply colours', async (cl) => { const s = await selectPreset(cl, index); return { ok: s.preset !== null, error: s.preset ? undefined : 'No read-back after re-selecting.' }; }, false, false, () => infoRef.current?.currentPreset === index);
      }).catch((err: unknown) => { console.log(`[board] get_on poll failed: ${String(err)}`); });
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingApply, status]);

  const editPreset = useCallback((patch: PresetPatch, label: string) => {
    const i = infoRef.current;
    if (!i || i.currentPreset == null || isEmptyPatch(patch)) return Promise.resolve(false);
    const index = i.currentPreset;
    return run(label, async (c) => {
      // Style writes are re-applied by re-selecting the preset, otherwise the blade keeps the old colours until
      // the next preset change.
      const r = await editCurrentPreset(c, patch, undefined, patch.styles ? { applyIndex: index } : {});
      if (r.preset) replacePreset(index, r.preset);
      if (r.applied === false) setPendingApply(index);
      return { ...r, note: r.applied === false ? 'applies when you retract the blade' : undefined };
    }, true, true, () => { const p = infoRef.current?.presets[index]; return !!p && patchShown(p, patch); });
  }, [run, replacePreset]);

  // A list change is reported as made only when the list read back is the one it should have made (F34); whatever the
  // saber read back is shown either way. The list as it was when the turn came also judges it after a stall (D5).
  const applyReadBack = useCallback((r: ListChange) => {
    if (r.presets.length) applyList({ presets: r.presets, current: r.current ?? infoRef.current?.currentPreset ?? null });
  }, [applyList]);
  const NO_CURRENT = 'The saber has not said which preset is in use. Choose one, then try again.';
  const movePreset = useCallback((to: number) => {
    let before: PresetRecord[] = []; let from = -1;
    return run(`Move to position ${to + 1}`, async (c) => {
      before = infoRef.current?.presets ?? []; from = infoRef.current?.currentPreset ?? -1;
      if (from < 0) return { ok: false, error: NO_CURRENT };
      const r = await moveCurrentPreset(c, before, from, to);
      applyReadBack(r);
      return { ok: r.ok, error: r.error };
    }, true, true, () => moveShown(before, infoRef.current?.presets ?? [], from, to));
  }, [run, applyReadBack]);
  const duplicatePreset = useCallback(() => {
    const i = infoRef.current;
    const pos = (i?.currentPreset ?? 0) + 1;
    let before: PresetRecord[] = [];
    return run('Duplicate preset', async (c) => {
      before = infoRef.current?.presets ?? [];
      const r = await duplicateCurrentPreset(c, before, pos - 1, pos);
      applyReadBack(r);
      return { ok: r.ok, error: r.error };
    }, true, true, () => duplicateShown(before, infoRef.current?.presets ?? [], pos));
  }, [run, applyReadBack]);
  const deletePreset = useCallback(() => {
    let before: PresetRecord[] = [];
    return run('Delete preset', async (c) => {
      before = infoRef.current?.presets ?? [];
      const at = infoRef.current?.currentPreset ?? -1;
      if (at < 0) return { ok: false, error: NO_CURRENT };
      const r = await deleteCurrentPreset(c, before, at);
      applyReadBack(r);
      return { ok: r.ok, error: r.error };
    }, true, true, () => deleteShown(before, infoRef.current?.presets ?? []));
  }, [run, applyReadBack]);

  /** A snapshot's presets, to show what restoring it would change before anything is sent. */
  const readSnapshot = useCallback(async (meta: SnapshotMeta): Promise<PresetRecord[]> => {
    const s = saberRef.current;
    if (!s) throw new Error('No saber connected.');
    if (!meta.complete) throw new Error(INCOMPLETE_SNAPSHOT);
    return api().snapshots.read(s.id, meta.file);
  }, []);

  /**
   * Restore a snapshot: one preset (`preset`) or the whole list (`list`), as planRestore works it out (F33). `shown` is
   * the plan the owner read; it is worked out again from the list as it is when the restore's turn comes, and if that
   * is not what was shown, nothing is sent. Goes through `run` like every write: snapshot first, the shared-card
   * refusal, stall recovery, and a read-back of the whole list at the end.
   */
  const restoreSnapshot = useCallback(async (meta: SnapshotMeta, kind: 'preset' | 'list', shown: RestorePlan): Promise<boolean> => {
    const s = saberRef.current;
    if (!s) return false;
    // A snapshot cut short reads as a shorter list: restoring it would delete the presets it lost (issue #28).
    if (!meta.complete) { setSave({ kind: 'failed', what: 'Restore', error: INCOMPLETE_SNAPSHOT }); return false; }
    let saved: PresetRecord[];
    try { saved = await api().snapshots.read(s.id, meta.file); } catch (err) { setSave({ kind: 'failed', what: 'Restore', error: String(err) }); return false; }
    let expected: PresetRecord[] = saved;
    const what = kind === 'preset' && shown.single ? `Restore "${shown.single.name.replace(/\s*\n\s*/g, ' ')}" from "${meta.label}"` : `Restore "${meta.label}"`;
    return run(what, async (c) => {
      const now = infoRef.current?.presets ?? [];
      const plan = planRestore(saved, now);
      const refused = kind === 'list' ? plan.wholeRefused : plan.single ? null : plan.singleRefused ?? 'Nothing to restore.';
      if (refused) return { ok: false, error: `Not sent: ${refused}` };
      const steps = kind === 'preset' ? [plan.single!.step] : plan.steps;
      const shownSteps = kind === 'preset' ? (shown.single ? [shown.single.step] : []) : shown.steps;
      if (JSON.stringify(steps) !== JSON.stringify(shownSteps)) return { ok: false, error: 'Not sent: the saber\'s presets changed since this restore was shown. Look at it again.' };
      if (!steps.length) return { ok: true, note: 'nothing to change' };
      expected = kind === 'preset' ? plan.single!.expected : plan.expected;
      const r = await runRestore(c, now, steps, expected);
      applyReadBack(r);
      return { ok: r.ok, error: r.error };
    }, true, true, () => sameList(infoRef.current?.presets ?? [], expected));
  }, [run, applyReadBack]);

  /** The current preset as of this instant (state in closures can be a render behind after a queued write). */
  /** Write blade styles to preset `index`, selecting it first when it is not the current one. Resolves to whether the saber confirmed. */
  const setPresetStyles = useCallback((index: number, styles: Record<number, string>, label: string): Promise<boolean> => {
    return run(label, async (c) => {
      if (infoRef.current?.currentPreset !== index) {
        const s = await selectPreset(c, index);
        if (!s.preset) return { ok: false, error: 'The saber did not switch to that preset.' };
        if (infoRef.current) infoRef.current = { ...infoRef.current, currentPreset: s.index ?? index };
        setInfo((i) => (i ? { ...i, currentPreset: s.index ?? index } : i));
      }
      const r = await editCurrentPreset(c, { styles }, undefined, { applyIndex: index });
      if (r.preset) replacePreset(index, r.preset);
      if (r.applied === false) setPendingApply(index);
      return { ...r, note: r.applied === false ? 'applies when you retract the blade' : undefined };
    }, true, true, () => { const p = infoRef.current?.presets[index]; return !!p && patchShown(p, { styles }); });
  }, [run, replacePreset]);

  const currentPresetNow = useCallback((): PresetRecord | null => {
    const i = infoRef.current;
    return i && i.currentPreset != null ? i.presets[i.currentPreset] ?? null : null;
  }, []);

  /** Store the build model and/or firmware manifest on the current saber's record. */
  /** A saber set up ahead of its hilt. */
  const planSaber = useCallback(async (name: string, model: SaberConfigModel): Promise<SaberRecord> => {
    const rec = await api().library.plan(name, model);
    await refreshLibrary();
    return rec;
  }, [refreshLibrary]);
  /** The connected saber takes over a plan. */
  const adoptPlan = useCallback(async (plannedId: string): Promise<SaberRecord | null> => {
    const s = saberRef.current;
    if (!s) return null;
    const rec = await api().library.adopt(plannedId, s.id);
    saberRef.current = rec; setSaber(rec);
    await refreshLibrary();
    return rec;
  }, [refreshLibrary]);
  /** Say which saber is being installed and the config its new firmware will report (see `expected`). */
  const expectAfterInstall = useCallback((id: string, configName: string) => {
    expected.current = { id, configName, until: Date.now() + 5 * 60_000 };
  }, []);
  const updateSaber = useCallback(async (patch: SaberPatch, id?: string) => {
    const target = id ?? saberRef.current?.id;
    if (!target) return;
    const rec = await api().library.update(target, patch);
    if (saberRef.current?.id === target) setSaber(rec);
    await refreshLibrary();
  }, [refreshLibrary]);

  /** The card is now shared with this computer, at this drive if known (Fonts & SD's share, card-safety D1). */
  const cardShared = useCallback((root: string | null) => { setCardLostWhileShared(false); setCardNow({ shared: true, root }); }, []);
  /** The saber said its card access is off: it has its card back. */
  const cardGivenBack = useCallback(() => { setCardLostWhileShared(false); setCardNow({ shared: false, root: null }); }, []);

  const renameSaber = useCallback(async (name: string) => {
    const s = saberRef.current;
    if (!s) return;
    const rec = await api().library.rename(s.id, name);
    setSaber(rec);
    await refreshLibrary();
  }, [refreshLibrary]);

  // Dev-only end-to-end check (HILTWRIGHT_E2E=1): edit a preset's font on the real board, verify, restore.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { hiltwrightE2E?: (mode?: string) => Promise<string> }).hiltwrightE2E = async (mode?: string) => {
      // A board running behind can take half a minute to identify; wait for it.
      for (let n = 0; n < 180 && !(client.current && infoRef.current); n++) await new Promise((r) => setTimeout(r, 500));
      const c = client.current;
      const i = infoRef.current;
      if (!c || !i) return 'not connected';
      const steps: string[] = [];
      if (mode === 'stall') {
        // usb-power-connect 3.3: select a preset while the link is stalled (the app hears nothing until the port is
        // opened again), then go back. Both should be saved, the first after a pause, with no error.
        const start = i.currentPreset ?? 0;
        const target = start === 0 ? 1 : 0;
        WebSerialTransport.stalled = true;
        const t0 = Date.now();
        const ok = await choosePreset(target);
        steps.push(`select ${target + 1} while stalled → ${ok ? 'saved' : 'FAILED'} in ${Date.now() - t0} ms, current ${infoRef.current?.currentPreset}, pauses so far ${recovery.count}, port ${transport.current ? 'open' : 'closed'}`);
        const back = await choosePreset(start);
        steps.push(`back to ${start + 1} → ${back ? 'saved' : 'FAILED'}, current ${infoRef.current?.currentPreset}`);
        return steps.join(' | ');
      }
      const stressCount = /^stress(?:-on)?-(\d+)$/.exec(mode ?? '')?.[1];
      if (stressCount) mode = mode!.startsWith('stress-on') ? 'stress-on' : 'stress';
      if (mode === 'stress' || mode === 'stress-on') {
        // Twelve colour writes in a row on the Ember preset, each re-applied, logging what the board says when one fails.
        // "stress-on" does it with the blade ignited, which is how an owner actually tries colours.
        const sel0 = await selectPreset(c, 2);
        const style0 = sel0.preset?.styles[0] ?? 'builtin 2 1';
        const b0 = parseBuiltin(style0)!;
        if (mode === 'stress-on') { await c.send('on', { idleMs: 1500, timeoutMs: 8000 }); steps.push('blade on'); }
        for (let n = 0; n < (stressCount ? Number(stressCount) : 12); n++) {
          const hue = (n * 30) % 360;
          const rgb = [Math.round(65535 * (0.5 + 0.5 * Math.cos((hue * Math.PI) / 180))), Math.round(65535 * (0.5 + 0.5 * Math.cos(((hue - 120) * Math.PI) / 180))), Math.round(65535 * (0.5 + 0.5 * Math.cos(((hue - 240) * Math.PI) / 180)))].join(',');
          const style = formatBuiltin({ preset: b0.preset, blade: b0.blade, args: rgb });
          const t0 = Date.now();
          const e = await editCurrentPreset(c, { styles: { 1: style } }, undefined, { applyIndex: 2 });
          steps.push(`#${n + 1} ${rgb} → ${e.ok ? 'ok' : 'FAIL'} readbacks=${e.readbacks} ms=${Date.now() - t0}${e.ok ? '' : ` err=${e.error} got=${e.preset?.styles[0] ?? 'null'}`}`);
          console.log(`[stress] ${steps[steps.length - 1]}`);
        }
        await editCurrentPreset(c, { styles: { 1: style0 } }, undefined, { applyIndex: 2 });
        if (mode === 'stress-on') await c.send('off', { idleMs: 1500, timeoutMs: 8000 });
        return steps.join(' | ');
      }
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
        const e3 = await editCurrentPreset(c, { styles: { 1: red } }, undefined, { applyIndex: 2 });
        steps.push(`set_style1 "${red}" → ok=${e3.ok} readback style1=${e3.preset?.styles[0]} (re-applied with set_preset 2)`);
        const e4 = await editCurrentPreset(c, { styles: { 1: style0 } }, undefined, { applyIndex: 2 });
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

  return { card, cardShared, cardGivenBack, cardLostWhileShared, status, error, portName, info, saber, library, libraryLoaded, lines, snapshots, save, busy, connect, disconnect, send, identify, choosePreset, editPreset, setPresetStyles, movePreset, duplicatePreset, deletePreset, readSnapshot, restoreSnapshot, renameSaber, updateSaber, expectAfterInstall, reachNext, currentSaber, restartSaber, currentPresets, planSaber, adoptPlan, currentPresetNow, refreshLibrary, snapshotSaved, isPresetBlockEnd, rebootToBootloader, plugged, refreshPlugged, switchTo, switchingTo };
}

export type Board = ReturnType<typeof useBoard>;
